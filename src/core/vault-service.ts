import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { collectBackupFiles } from './collect.js'
import { normalizeConflicts } from './conflict.js'
import {
  DEFAULT_SETTINGS,
  defaultLocalTarget,
  loadSettings,
  loadTargets,
  saveSettings,
  saveTargets,
} from './config-store.js'
import { previewRestoreDiff } from './diff.js'
import {
  resolveAgentsHome,
  resolveDshHome,
  vaultDataDir,
  vaultRollbackDir,
  vaultTempDir,
} from './paths.js'
import {
  DESKTOP_PROFILE,
  installCommandForProfile,
  listInitializedGuiProfiles,
  multiProfileInstallPlan,
  resolveActiveProfile,
  WEB_PROFILE,
} from './profiles.js'
import { snapshotsToDelete } from './retention.js'
import { applyRestore } from './restore-apply.js'
import { packSnapshot, unpackSnapshot } from './snapshot-io.js'
import type {
  BackupRequest,
  BackupResult,
  ProgressCallback,
  RestorePreview,
  RestoreRequest,
  RestoreResult,
  ScheduleConfig,
  SnapshotInfo,
  StorageTargetConfig,
  VaultSettings,
} from './types.js'
import { StorageRegistry } from '../storage/index.js'

export interface VaultServiceOptions {
  dshHome?: string
  agentsHome?: string
  dataDir?: string
  dshVersion?: string
  /** Override active profile (defaults to $DSH_PROFILE / desktop|web). */
  activeProfile?: string
  resolveSecret?: (ref: string) => Promise<string | undefined>
  /** Override plugin install command runner (for tests). */
  runPluginInstall?: (spec: string, profile: string) => Promise<{ ok: boolean; detail: string }>
}

export class VaultService {
  readonly dshHome: string
  readonly agentsHome: string
  readonly dataDir: string
  /** Profile this Host process is running as (`web`, `desktop`, …). */
  readonly activeProfile: string
  private settings: VaultSettings = DEFAULT_SETTINGS
  private registry: StorageRegistry
  private scheduleTimer: NodeJS.Timeout | null = null
  private readonly dshVersion?: string
  private readonly runPluginInstall: NonNullable<VaultServiceOptions['runPluginInstall']>

  constructor(private readonly options: VaultServiceOptions = {}) {
    this.dshHome = options.dshHome ?? resolveDshHome()
    this.agentsHome = options.agentsHome ?? resolveAgentsHome()
    this.dataDir = vaultDataDir(this.dshHome, options.dataDir)
    this.activeProfile = options.activeProfile ?? resolveActiveProfile()
    this.dshVersion = options.dshVersion
    this.registry = new StorageRegistry([], { resolveSecret: options.resolveSecret })
    this.runPluginInstall = options.runPluginInstall ?? defaultPluginInstall
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    await mkdir(vaultTempDir(this.dataDir), { recursive: true })
    await mkdir(vaultRollbackDir(this.dataDir), { recursive: true })
    this.settings = await loadSettings(this.dataDir)
    let targets = await loadTargets(this.dataDir)
    if (targets.length === 0) {
      const localDir = join(this.dataDir, 'snapshots')
      targets = [defaultLocalTarget(localDir)]
      await saveTargets(this.dataDir, targets)
    }
    this.registry = new StorageRegistry(targets, { resolveSecret: this.options.resolveSecret })
    this.armSchedule()
  }

  getSettings(): VaultSettings {
    return this.settings
  }

  async updateSettings(patch: Partial<VaultSettings>): Promise<VaultSettings> {
    this.settings = {
      ...this.settings,
      ...patch,
      retention: { ...this.settings.retention, ...patch.retention },
      schedule: { ...this.settings.schedule, ...patch.schedule, retention: { ...this.settings.schedule.retention, ...patch.schedule?.retention } },
    }
    await saveSettings(this.dataDir, this.settings)
    this.armSchedule()
    return this.settings
  }

  listTargets(): StorageTargetConfig[] {
    return this.registry.list()
  }

  async upsertTarget(config: StorageTargetConfig): Promise<StorageTargetConfig[]> {
    this.registry.upsert(config)
    const targets = this.registry.list()
    await saveTargets(this.dataDir, targets)
    return targets
  }

  async removeTarget(id: string): Promise<StorageTargetConfig[]> {
    this.registry.remove(id)
    const targets = this.registry.list()
    await saveTargets(this.dataDir, targets)
    return targets
  }

  async backup(req: BackupRequest, onProgress?: ProgressCallback): Promise<BackupResult> {
    const targetConfig = this.registry.list().find((t) => t.id === req.targetId)
    if (!targetConfig) throw new Error(`storage target not found: ${req.targetId}`)
    const encrypt = Boolean(req.encrypt ?? targetConfig.encryptByDefault)
    const includeSecrets = Boolean(req.includeSecrets)
    if (includeSecrets && !encrypt) {
      throw new Error('secrets may only be included when encryption is enabled')
    }
    onProgress?.({ phase: 'collect', message: 'Collecting dsh setup', percent: 5 })
    const { files, plugins } = await collectBackupFiles({
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      includeSecrets,
      categories: req.categories,
    })
    const packed = await packSnapshot({
      files,
      plugins,
      includeSecrets,
      encrypt,
      password: req.password,
      kdf: req.kdf ?? this.settings.preferredKdf,
      dshVersion: req.dshVersion ?? this.dshVersion,
      notes: req.notes,
      onProgress,
    })
    onProgress?.({ phase: 'upload', message: 'Uploading snapshot', percent: 85 })
    const adapter = this.registry.get(req.targetId)
    const { remoteKey } = await adapter.put(packed.snapshotId, packed.bytes)
    await this.applyRetention(req.targetId)
    onProgress?.({ phase: 'done', message: 'Backup complete', percent: 100 })
    return {
      snapshotId: packed.snapshotId,
      targetId: req.targetId,
      remoteKey,
      bytes: packed.bytes.length,
      encrypted: packed.encrypted,
      includeSecrets,
      manifest: packed.manifest,
    }
  }

  async listSnapshots(targetId?: string): Promise<SnapshotInfo[]> {
    const ids = targetId ? [targetId] : this.registry.list().map((t) => t.id)
    const all: SnapshotInfo[] = []
    for (const id of ids) {
      const adapter = this.registry.get(id)
      const list = await adapter.list()
      all.push(...list)
    }
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  async deleteSnapshot(targetId: string, snapshotId: string): Promise<void> {
    await this.registry.get(targetId).delete(snapshotId)
  }

  async verify(targetId: string, snapshotId: string, password?: string): Promise<{ ok: true; manifestId: string }> {
    const bytes = await this.registry.get(targetId).get(snapshotId)
    const unpacked = await unpackSnapshot(bytes, password)
    return { ok: true, manifestId: unpacked.manifest.id }
  }

  async previewRestore(
    req: Pick<RestoreRequest, 'targetId' | 'snapshotId' | 'password' | 'conflicts'> & {
      conflict?: RestoreRequest['conflict']
    },
  ): Promise<RestorePreview> {
    const bytes = await this.registry.get(req.targetId).get(req.snapshotId)
    const unpacked = await unpackSnapshot(bytes, req.password)
    const conflicts = normalizeConflicts(req.conflicts)
    return previewRestoreDiff({
      manifest: unpacked.manifest,
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      conflict: req.conflict,
      conflicts,
    })
  }

  async restore(req: RestoreRequest, onProgress?: ProgressCallback): Promise<RestoreResult> {
    onProgress?.({ phase: 'download', message: 'Downloading snapshot', percent: 5 })
    const bytes = await this.registry.get(req.targetId).get(req.snapshotId)
    const unpacked = await unpackSnapshot(bytes, req.password, onProgress)
    const conflicts = normalizeConflicts(req.conflicts)

    let rollbackSnapshotId: string | undefined
    if (req.createRollbackSnapshot !== false) {
      // Rollback always captures the pre-restore live tree (independent of conflict choices).
      // Applying that rollback later uses the same conflict resolution rules.
      onProgress?.({ phase: 'pack', message: 'Creating pre-restore rollback snapshot', percent: 25 })
      const rb = await this.backup({
        targetId: ensureLocalRollbackTarget(this),
        encrypt: false,
        includeSecrets: false,
        notes: `pre-restore rollback for ${req.snapshotId}`,
      })
      rollbackSnapshotId = rb.snapshotId
    }

    const result = await applyRestore({
      manifest: unpacked.manifest,
      files: unpacked.files,
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      conflict: req.conflict,
      conflicts,
      includeSecrets: req.includeSecrets ?? unpacked.manifest.includeSecrets,
      rollbackSnapshotId,
      onProgress,
    })

    if (req.reinstallPlugins !== false) {
      onProgress?.({ phase: 'reinstall', message: 'Reinstalling missing plugins', percent: 90 })
      const preview = await previewRestoreDiff({
        manifest: unpacked.manifest,
        dshHome: this.dshHome,
        agentsHome: this.agentsHome,
      })
      for (const plugin of preview.pluginsToReinstall) {
        if (plugin.source.startsWith('link:') || plugin.source.startsWith('file:')) {
          result.pluginsFailed.push(plugin.name)
          continue
        }
        const profile = plugin.profile ?? this.activeProfile
        const spec = plugin.version ? `${plugin.name}@${plugin.version}` : plugin.name
        const install = await this.runPluginInstall(spec, profile)
        if (install.ok) result.pluginsReinstalled.push(plugin.name)
        else result.pluginsFailed.push(plugin.name)
      }
      if (result.pluginsFailed.length) {
        const hintProfile = this.activeProfile === DESKTOP_PROFILE ? DESKTOP_PROFILE : WEB_PROFILE
        const hint = installCommandForProfile(hintProfile, '<pkg>')
        result.manualActions.push(
          `Manually reinstall plugins: ${result.pluginsFailed.join(', ')} (e.g. ${hint.command})`,
        )
        if (hintProfile === DESKTOP_PROFILE) {
          result.manualActions.push(...hint.notes)
        }
      }
    }

    onProgress?.({ phase: 'done', message: 'Restore complete', percent: 100 })
    return result
  }

  getSchedule(): ScheduleConfig {
    return this.settings.schedule
  }

  async updateSchedule(patch: Partial<ScheduleConfig>): Promise<ScheduleConfig> {
    const schedule = {
      ...this.settings.schedule,
      ...patch,
      retention: { ...this.settings.schedule.retention, ...patch.retention },
    }
    await this.updateSettings({ schedule, retention: schedule.retention })
    return this.settings.schedule
  }

  async runScheduledBackup(onProgress?: ProgressCallback): Promise<BackupResult | null> {
    const schedule = this.settings.schedule
    if (!schedule.enabled) return null
    const result = await this.backup(
      {
        targetId: schedule.targetId,
        encrypt: schedule.encrypt,
        includeSecrets: schedule.includeSecrets && schedule.encrypt,
        notes: 'scheduled backup',
      },
      onProgress,
    )
    const next = new Date(Date.now() + schedule.intervalMinutes * 60_000).toISOString()
    await this.updateSchedule({ lastRunAt: new Date().toISOString(), nextRunAt: next })
    return result
  }

  stopSchedule(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer)
      this.scheduleTimer = null
    }
  }

  private armSchedule(): void {
    this.stopSchedule()
    const schedule = this.settings.schedule
    if (!schedule.enabled) return
    const intervalMs = Math.max(15, schedule.intervalMinutes) * 60_000
    this.scheduleTimer = setInterval(() => {
      void this.runScheduledBackup().catch(() => {
        // never log secrets; swallow and retry next interval
      })
    }, intervalMs)
    // unref so CLI/tests can exit
    this.scheduleTimer.unref?.()
  }

  private async applyRetention(targetId: string): Promise<void> {
    const policy = this.settings.schedule.targetId === targetId
      ? this.settings.schedule.retention
      : this.settings.retention
    const list = await this.registry.get(targetId).list()
    const toDelete = snapshotsToDelete(list, policy)
    for (const id of toDelete) {
      try {
        await this.registry.get(targetId).delete(id)
      } catch {
        // ignore individual delete failures
      }
    }
  }

  /** Status summary for dashboard / tools. */
  async status(): Promise<{
    dshHome: string
    dataDir: string
    activeProfile: string
    guiProfiles: string[]
    surface: 'desktop' | 'web' | 'other'
    installPlan: Array<{ profile: string; command: string; notes: string[] }>
    targets: StorageTargetConfig[]
    settings: VaultSettings
    recentSnapshots: SnapshotInfo[]
  }> {
    const recentSnapshots = (await this.listSnapshots()).slice(0, 10)
    const surface =
      this.activeProfile === DESKTOP_PROFILE
        ? 'desktop'
        : this.activeProfile === WEB_PROFILE
          ? 'web'
          : 'other'
    return {
      dshHome: this.dshHome,
      dataDir: this.dataDir,
      activeProfile: this.activeProfile,
      guiProfiles: listInitializedGuiProfiles(this.dshHome),
      surface,
      installPlan: multiProfileInstallPlan('dsh-vault', this.dshHome),
      targets: this.listTargets(),
      settings: this.settings,
      recentSnapshots,
    }
  }
}

function ensureLocalRollbackTarget(service: VaultService): string {
  const existing = service.listTargets().find((t) => t.kind === 'local')
  if (existing) return existing.id
  throw new Error('no local storage target available for rollback snapshot')
}

async function defaultPluginInstall(spec: string, profile: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    // Prefer whatever `dsh` is on PATH (Desktop tray terminal = bundled carrier).
    const child = spawn('dsh', ['plugin', '--profile', profile, 'add', spec], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      shell: process.platform === 'win32',
    })
    let detail = ''
    child.stdout?.on('data', (c: Buffer) => {
      detail += c.toString('utf8')
    })
    child.stderr?.on('data', (c: Buffer) => {
      detail += c.toString('utf8')
    })
    child.on('error', (err) => resolve({ ok: false, detail: err.message }))
    child.on('close', (code) => {
      let text = detail.slice(0, 800)
      if (code !== 0 && profile === DESKTOP_PROFILE) {
        text += '\n' + installCommandForProfile(DESKTOP_PROFILE, spec).notes.join('\n')
      }
      resolve({ ok: code === 0, detail: text })
    })
  })
}

/** Write a sidecard meta file next to a local snapshot (optional helper for CLI). */
export async function writeSidecarMeta(dir: string, snapshotId: string, meta: Record<string, unknown>): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${snapshotId}.meta.json`), JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 })
}
