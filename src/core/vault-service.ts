import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { collectBackupFiles, extractPluginsFromProfilePackage } from './collect.js'
import { normalizeConflicts, resolveItemConflict, shouldApplyChange } from './conflict.js'
import {
  DEFAULT_SETTINGS,
  defaultLocalTarget,
  loadSettings,
  loadTargets,
  saveSettings,
  saveTargets,
} from './config-store.js'
import { previewRestoreDiff } from './diff.js'
import { VaultUserError } from './errors.js'
import { createDirectory, isSnapshotArchiveName, listDirectory } from './fs-browse.js'
import {
  resolveAgentsHome,
  resolveDshHome,
  isSecretRelPath,
  vaultDataDir,
  vaultRollbackDir,
  vaultTempDir,
} from './paths.js'
import {
  DESKTOP_PROFILE,
  listInitializedGuiProfiles,
  multiProfileInstallPlan,
  resolveActiveProfile,
  WEB_PROFILE,
} from './profiles.js'
import {
  reinstallMissingPlugins,
  type PluginInstallDeps,
  type PluginManagerLike,
  type PnpmInvocationLike,
} from './plugin-install.js'
import { snapshotsToDelete } from './retention.js'
import { applyRestore } from './restore-apply.js'
import { packSnapshot, unpackSnapshot } from './snapshot-io.js'
import { maskTargetSecrets, mergeTargetSecrets } from './target-secrets.js'
import { expandUserPath } from './win-paths.js'
import type {
  BackupRequest,
  BackupResult,
  ConflictStrategy,
  ProgressCallback,
  RestorePreview,
  RestoreRequest,
  RestoreResult,
  ScheduleConfig,
  SnapshotInfo,
  StorageTargetConfig,
  VaultManifest,
  VaultSettings,
} from './types.js'
import { ARCHIVE_EXTENSION, ENCRYPTED_EXTENSION } from './types.js'
import { LocalStorageAdapter } from '../storage/local.js'
import { StorageRegistry } from '../storage/index.js'
import type { StorageAdapter } from '../storage/types.js'

/** Native directory chooser; dsh's implementation requires a signal. */
export type PickDirectoryFn = (signal: AbortSignal) => Promise<string | null>

export interface VaultServiceOptions {
  dshHome?: string
  agentsHome?: string
  dataDir?: string
  dshVersion?: string
  /** Override active profile (defaults to $DSH_PROFILE / desktop|web). */
  activeProfile?: string
  resolveSecret?: (ref: string) => Promise<string | undefined>
  /** In-process dsh pluginManager (preferred on Desktop / web hosts). */
  pluginManager?: PluginManagerLike | null
  /** Preferred pnpm binary for profile materialization. */
  pnpmCommand?: string
  /** Host package manager (dsh profileContext.packageManager — Desktop's bundled pnpm). */
  pnpm?: PnpmInvocationLike
  /** Preferred npm registry (China mainland mirror by default when unset). */
  preferredRegistry?: string | null
  /** Native OS directory picker from host directoryPicker (optional). */
  pickDirectory?: PickDirectoryFn
  /** Override plugin install runner (tests). */
  runPluginInstall?: PluginInstallDeps['runCommand']
}

export class VaultService {
  readonly dshHome: string
  readonly agentsHome: string
  readonly dataDir: string
  /** Profile this Host process is running as (`web`, `desktop`, …). */
  readonly activeProfile: string
  private settings: VaultSettings = DEFAULT_SETTINGS
  private registry: StorageRegistry
  private rollbackAdapter: LocalStorageAdapter | null = null
  private scheduleTimer: NodeJS.Timeout | null = null
  private readonly dshVersion?: string
  private pluginManager: PluginManagerLike | null
  private readonly pnpmCommand?: string
  private readonly pnpm?: PnpmInvocationLike
  private preferredRegistry: string | null | undefined
  private pickDirectoryFn?: PickDirectoryFn
  private readonly runCommand?: PluginInstallDeps['runCommand']

  constructor(private readonly options: VaultServiceOptions = {}) {
    this.dshHome = options.dshHome ?? resolveDshHome()
    this.agentsHome = options.agentsHome ?? resolveAgentsHome()
    this.dataDir = vaultDataDir(this.dshHome, options.dataDir)
    this.activeProfile = options.activeProfile ?? resolveActiveProfile()
    this.dshVersion = options.dshVersion
    this.registry = new StorageRegistry([], { resolveSecret: options.resolveSecret })
    this.pluginManager = options.pluginManager ?? null
    this.pnpmCommand = options.pnpmCommand
    this.pnpm = options.pnpm
    this.preferredRegistry = options.preferredRegistry
    this.pickDirectoryFn = options.pickDirectory
    this.runCommand = options.runPluginInstall
  }

  /** Hot-bind host services that may activate after the vault plugin. */
  setPluginManager(manager: PluginManagerLike | null): void {
    this.pluginManager = manager
  }

  setPickDirectory(fn: PickDirectoryFn | undefined): void {
    this.pickDirectoryFn = fn
  }

  /** Whether dsh exposes a native OS folder chooser on this host. */
  hasNativePicker(): boolean {
    return Boolean(this.pickDirectoryFn)
  }

  async listFs(path: string) {
    return { ...(await listDirectory(path)), nativePicker: this.hasNativePicker() }
  }

  async createFsDirectory(parent: string, name: string): Promise<string> {
    return createDirectory(parent, name)
  }

  /**
   * Open dsh's native OS folder chooser. dsh's picker requires an AbortSignal
   * (it dereferences `signal.aborted`), so one is always passed.
   * Returns null when the user cancels; throws NO_NATIVE_PICKER when unavailable.
   */
  async pickDirectory(signal: AbortSignal = new AbortController().signal): Promise<string | null> {
    if (!this.pickDirectoryFn) {
      throw new VaultUserError('native folder picker is not available on this host', 501, 'NO_NATIVE_PICKER')
    }
    return this.pickDirectoryFn(signal)
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 })
    await mkdir(vaultTempDir(this.dataDir), { recursive: true, mode: 0o700 })
    await this.ensureRollbackDir()
    this.settings = await loadSettings(this.dataDir)
    let targets = await loadTargets(this.dataDir)
    // Drop a previously-persisted rollback target from user targets.json (now private).
    targets = targets.filter((t) => t.id !== ROLLBACK_TARGET_ID)
    if (targets.length === 0) {
      const localDir = join(this.dataDir, 'snapshots')
      targets = [defaultLocalTarget(localDir)]
      await saveTargets(this.dataDir, targets)
    } else {
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

  /** Stored targets with secrets masked for browser/API responses. */
  listTargets(): StorageTargetConfig[] {
    return this.registry.list().map(maskTargetSecrets)
  }

  /** Unmasked configs (internal / CLI that already has filesystem access). */
  listTargetsRaw(): StorageTargetConfig[] {
    return this.registry.list()
  }

  async upsertTarget(config: StorageTargetConfig): Promise<StorageTargetConfig[]> {
    if (config.id === ROLLBACK_TARGET_ID) {
      throw new VaultUserError('local-rollback is a reserved private target', 400, 'BAD_CONFIG')
    }
    const existing = this.registry.list().find((t) => t.id === config.id)
    const merged = mergeTargetSecrets(config, existing)
    this.registry.upsert(merged)
    const targets = this.registry.list()
    await saveTargets(this.dataDir, targets)
    return targets.map(maskTargetSecrets)
  }

  async removeTarget(id: string): Promise<StorageTargetConfig[]> {
    if (id === ROLLBACK_TARGET_ID) {
      throw new VaultUserError('local-rollback is a reserved private target', 400, 'BAD_CONFIG')
    }
    this.registry.remove(id)
    const targets = this.registry.list()
    await saveTargets(this.dataDir, targets)
    return targets.map(maskTargetSecrets)
  }

  async backup(req: BackupRequest, onProgress?: ProgressCallback): Promise<BackupResult> {
    if (req.targetId === ROLLBACK_TARGET_ID) {
      throw new VaultUserError('cannot backup to the private rollback folder; use a normal storage target', 400, 'BAD_CONFIG')
    }
    const exportFile = req.exportFile?.trim() ? expandUserPath(req.exportFile.trim()) : undefined
    const directory = req.directory?.trim() ? expandUserPath(req.directory.trim()) : undefined
    if (!req.targetId && !exportFile && !directory) {
      throw new VaultUserError('targetId, directory, or exportFile is required', 400, 'BAD_CONFIG')
    }

    let encrypt = Boolean(req.encrypt)
    if (req.targetId) {
      const targetConfig = this.registry.list().find((t) => t.id === req.targetId)
      if (!targetConfig) throw new VaultUserError(`storage target not found: ${req.targetId}`, 404, 'TARGET_NOT_FOUND')
      encrypt = Boolean(req.encrypt ?? targetConfig.encryptByDefault)
    }
    const includeSecrets = Boolean(req.includeSecrets)
    if (includeSecrets && !encrypt) {
      throw new VaultUserError('secrets may only be included when encryption is enabled', 400, 'SECRETS_REQUIRE_ENCRYPT')
    }
    onProgress?.({ phase: 'collect', message: 'Collecting dsh setup', percent: 5 })
    const { files, plugins } = await collectBackupFiles({
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      includeSecrets,
      categories: req.categories,
      bundleLocalPlugins: req.bundleLocalPlugins,
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
    onProgress?.({ phase: 'upload', message: 'Saving snapshot', percent: 85 })

    let targetId = req.targetId ?? (directory ? 'local-oneshot' : 'export-file')
    let remoteKey = packed.snapshotId
    let exportPath: string | undefined

    if (exportFile) {
      const ext = packed.encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION
      const out = exportFile.toLowerCase().endsWith('.tar.gz') || exportFile.toLowerCase().endsWith('.dshvault')
        ? exportFile
        : `${exportFile}${ext}`
      await mkdir(dirname(out), { recursive: true })
      await writeFile(out, packed.bytes, { mode: 0o600 })
      remoteKey = basename(out)
      exportPath = out
      targetId = 'export-file'
    } else if (directory) {
      await mkdir(directory, { recursive: true })
      const adapter = new LocalStorageAdapter({
        kind: 'local',
        id: 'local-oneshot',
        label: 'One-shot folder',
        directory,
      })
      const put = await adapter.put(packed.snapshotId, packed.bytes)
      remoteKey = put.remoteKey
      exportPath = join(directory, put.remoteKey)
      targetId = 'local-oneshot'
    } else if (req.targetId) {
      const adapter = this.adapterFor(req.targetId)
      const put = await adapter.put(packed.snapshotId, packed.bytes)
      remoteKey = put.remoteKey
      await this.applyRetention(req.targetId)
      targetId = req.targetId
    }

    onProgress?.({ phase: 'done', message: 'Backup complete', percent: 100 })
    return {
      snapshotId: packed.snapshotId,
      targetId,
      remoteKey,
      bytes: packed.bytes.length,
      encrypted: packed.encrypted,
      includeSecrets,
      manifest: packed.manifest,
      exportPath,
    }
  }

  async listSnapshots(targetId?: string): Promise<SnapshotInfo[]> {
    if (targetId === ROLLBACK_TARGET_ID) {
      return this.ensureRollbackAdapter().list()
    }
    const ids = targetId ? [targetId] : this.registry.list().map((t) => t.id)
    const all: SnapshotInfo[] = []
    for (const id of ids) {
      const adapter = this.adapterFor(id)
      const list = await adapter.list()
      all.push(...list)
    }
    if (!targetId) {
      // Include private rollback snapshots when listing everything.
      all.push(...(await this.ensureRollbackAdapter().list()))
    }
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  async deleteSnapshot(targetId: string, snapshotId: string): Promise<void> {
    await this.adapterFor(targetId).delete(snapshotId)
  }

  async verify(targetId: string, snapshotId: string, password?: string): Promise<{ ok: true; manifestId: string }> {
    const bytes = await this.adapterFor(targetId).get(snapshotId)
    const unpacked = await unpackSnapshot(bytes, password)
    return { ok: true, manifestId: unpacked.manifest.id }
  }

  async previewRestore(
    req: Pick<RestoreRequest, 'targetId' | 'snapshotId' | 'importPath' | 'password' | 'conflicts'> & {
      conflict?: RestoreRequest['conflict']
    },
  ): Promise<RestorePreview> {
    const { bytes } = await this.resolveSnapshotBytes(req)
    const unpacked = await unpackSnapshot(bytes, req.password)
    const conflicts = normalizeConflicts(req.conflicts)
    const { files: liveFiles } = await collectBackupFiles({
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      includeSecrets: unpacked.manifest.includeSecrets,
      bundleLocalPlugins: false,
    })
    return previewRestoreDiff({
      manifest: unpacked.manifest,
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      currentScopedPaths: liveFiles.map((f) => f.relPath),
      conflict: req.conflict,
      conflicts,
    })
  }

  async restore(req: RestoreRequest, onProgress?: ProgressCallback): Promise<RestoreResult> {
    onProgress?.({ phase: 'download', message: 'Loading snapshot', percent: 5 })
    const resolved = await this.resolveSnapshotBytes(req)
    const unpacked = await unpackSnapshot(resolved.bytes, req.password, onProgress)
    const conflicts = normalizeConflicts(req.conflicts)
    const includeSecrets = req.includeSecrets ?? unpacked.manifest.includeSecrets
    const snapshotId = unpacked.manifest.id

    let rollbackSnapshotId: string | undefined
    let rollbackTargetId: string | undefined
    if (req.createRollbackSnapshot !== false) {
      const willTouchSecrets = await this.restoreWillApplySecrets(
        unpacked.manifest,
        req.conflict,
        conflicts,
        includeSecrets,
      )
      onProgress?.({ phase: 'pack', message: 'Creating pre-restore rollback snapshot', percent: 25 })
      if (willTouchSecrets) {
        if (!req.password) {
          throw new VaultUserError(
            'password required to create an encrypted pre-restore rollback that includes credentials (reuse the restore password)',
            400,
            'PASSWORD_REQUIRED',
          )
        }
        rollbackSnapshotId = await this.createPrivateRollbackSnapshot({
          includeSecrets: true,
          encrypt: true,
          password: req.password,
          notes: `pre-restore rollback for ${snapshotId}`,
          onProgress,
        })
      } else {
        rollbackSnapshotId = await this.createPrivateRollbackSnapshot({
          includeSecrets: false,
          encrypt: false,
          notes: `pre-restore rollback for ${snapshotId}`,
          onProgress,
        })
      }
      rollbackTargetId = ROLLBACK_TARGET_ID
    }

    const result = await applyRestore({
      manifest: unpacked.manifest,
      files: unpacked.files,
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      conflict: req.conflict,
      conflicts,
      includeSecrets,
      rollbackSnapshotId,
      onProgress,
    })
    result.rollbackTargetId = rollbackTargetId

    if (req.reinstallPlugins !== false) {
      onProgress?.({ phase: 'reinstall', message: 'Installing plugins into profile', percent: 90 })
      await this.installPlugins(unpacked.manifest.plugins, result)
      await this.saveLastRestore({ snapshotId, plugins: unpacked.manifest.plugins, pluginResults: result.pluginResults ?? [] })
    }
    this.finishPluginSummary(result)

    onProgress?.({ phase: 'done', message: result.ok ? 'Restore complete' : 'Restore incomplete (plugin failures)', percent: 100 })
    return result
  }

  private installDeps(): PluginInstallDeps {
    return {
      dshHome: this.dshHome,
      activeProfile: this.activeProfile,
      pluginManager: this.pluginManager,
      pnpmCommand: this.pnpmCommand,
      pnpm: this.pnpm,
      preferredRegistry: this.preferredRegistry,
      runCommand: this.runCommand,
    }
  }

  private async installPlugins(
    records: VaultManifest['plugins'],
    result: RestoreResult,
    only?: Set<string>,
  ): Promise<void> {
    const { results, restartRequired } = await reinstallMissingPlugins(records, this.installDeps(), { only })
    result.pluginResults = results
    result.pluginsReinstalled = results.filter((r) => r.status === 'installed').map((r) => r.name)
    result.pluginsFailed = results.filter((r) => r.status === 'failed').map((r) => r.name)
    result.restartRequired = restartRequired || results.some((r) => r.status === 'installed')
  }

  /** ok flag + the (deduplicated) manual actions that follow from plugin results. */
  private finishPluginSummary(result: RestoreResult): void {
    if (result.restartRequired) {
      result.manualActions.push(
        this.activeProfile === DESKTOP_PROFILE
          ? 'Restart DeepSeek Harness Desktop so newly installed plugins load.'
          : 'Restart dsh web / the host so newly installed plugins load.',
      )
    }
    result.ok = (result.pluginsFailed?.length ?? 0) === 0
    if (!result.ok) {
      result.manualActions.push('Restore finished with plugin failures — not a full success. Fix the failed plugins and retry or install them from Desktop → Plugins.')
    }
    result.manualActions = [...new Set(result.manualActions)]
  }

  private lastRestorePath(): string {
    return join(this.dataDir, 'last-restore.json')
  }

  private async saveLastRestore(data: {
    snapshotId: string
    plugins: VaultManifest['plugins']
    pluginResults: NonNullable<RestoreResult['pluginResults']>
  }): Promise<void> {
    try {
      await mkdir(this.dataDir, { recursive: true })
      // Logs can be long; a retry only needs the records and statuses.
      const slim = data.pluginResults.map(({ log: _log, ...row }) => row)
      await writeFile(
        this.lastRestorePath(),
        JSON.stringify({ ...data, pluginResults: slim, savedAt: new Date().toISOString() }, null, 2),
        { mode: 0o600 },
      )
    } catch {
      // best effort
    }
  }

  private async loadLastRestore(): Promise<{
    snapshotId?: string
    plugins: VaultManifest['plugins']
    pluginResults: NonNullable<RestoreResult['pluginResults']>
  } | null> {
    try {
      return JSON.parse(await readFile(this.lastRestorePath(), 'utf8'))
    } catch {
      return null
    }
  }

  /**
   * Re-attempt only the failed plugins of the last restore, without rewriting config.
   * Also works after a restore made by an older dsh-vault: plugin records then come
   * from the profile manifests on disk.
   */
  async retryFailedPlugins(req: { plugins?: Array<{ name: string; profile: string }> } = {}): Promise<RestoreResult> {
    const last = await this.loadLastRestore()
    const records: VaultManifest['plugins'] = [...(last?.plugins ?? [])]
    if (!records.length) {
      const profilesDir = join(this.dshHome, 'profiles')
      for (const profile of await listProfiles(profilesDir)) {
        try {
          const text = await readFile(join(profilesDir, profile, 'package.json'), 'utf8')
          records.push(...extractPluginsFromProfilePackage(text, profile))
        } catch {
          // no manifest
        }
      }
    }
    const wanted = req.plugins?.length
      ? req.plugins
      : (last?.pluginResults ?? []).filter((r) => r.status === 'failed').map((r) => ({ name: r.name, profile: r.profile }))
    const only = wanted.length ? new Set(wanted.map((p) => `${p.profile}:${p.name}`)) : undefined
    const result: RestoreResult = {
      snapshotId: last?.snapshotId ?? '',
      applied: [],
      skipped: [],
      pluginsReinstalled: [],
      pluginsFailed: [],
      manualActions: [],
    }
    await this.installPlugins(records, result, only)
    if (last) {
      // Merge into the saved results so a second retry still knows what is left.
      const rows = new Map(last.pluginResults.map((r) => [`${r.profile}:${r.name}`, r]))
      for (const r of result.pluginResults ?? []) rows.set(`${r.profile}:${r.name}`, r)
      await this.saveLastRestore({ snapshotId: last.snapshotId ?? '', plugins: last.plugins, pluginResults: [...rows.values()] })
    }
    this.finishPluginSummary(result)
    return result
  }

  /** Load snapshot bytes from a configured target or an import path (file/folder). */
  private async resolveSnapshotBytes(req: {
    targetId?: string
    snapshotId?: string
    importPath?: string
  }): Promise<{ bytes: Buffer; targetId: string; snapshotId: string }> {
    if (req.importPath?.trim()) {
      const path = expandUserPath(req.importPath.trim())
      let info
      try {
        info = await stat(path)
      } catch {
        throw new VaultUserError(`import path not found: ${path}`, 404, 'SNAPSHOT_NOT_FOUND')
      }
      if (info.isFile()) {
        if (!isSnapshotArchiveName(path)) {
          throw new VaultUserError('import file must be a .tar.gz or .dshvault archive', 400, 'BAD_CONFIG')
        }
        const bytes = await readFile(path)
        return { bytes, targetId: 'import-file', snapshotId: req.snapshotId ?? basename(path).replace(/\.(tar\.gz|dshvault)$/i, '') }
      }
      if (info.isDirectory()) {
        const adapter = new LocalStorageAdapter({
          kind: 'local',
          id: 'import-folder',
          label: 'Import folder',
          directory: path,
        })
        const list = await adapter.list()
        const snapshotId = req.snapshotId ?? list[0]?.id
        if (!snapshotId) throw new VaultUserError(`no snapshots in folder: ${path}`, 404, 'SNAPSHOT_NOT_FOUND')
        const bytes = await adapter.get(snapshotId)
        return { bytes, targetId: 'import-folder', snapshotId }
      }
      throw new VaultUserError(`import path is neither file nor directory: ${path}`, 400, 'BAD_CONFIG')
    }
    if (!req.targetId || !req.snapshotId) {
      throw new VaultUserError('targetId+snapshotId or importPath is required', 400, 'BAD_CONFIG')
    }
    const bytes = await this.adapterFor(req.targetId).get(req.snapshotId)
    return { bytes, targetId: req.targetId, snapshotId: req.snapshotId }
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
    // Schedule retention applies to the schedule's target only; do not clobber
    // the global retention policy.
    await this.updateSettings({ schedule })
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
    const next = new Date(Date.now() + effectiveIntervalMs(schedule.intervalMinutes)).toISOString()
    await this.updateSchedule({ lastRunAt: new Date().toISOString(), nextRunAt: next })
    return result
  }

  stopSchedule(): void {
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer)
      this.scheduleTimer = null
    }
  }

  private armSchedule(): void {
    this.stopSchedule()
    const schedule = this.settings.schedule
    if (!schedule.enabled) return
    // Honor a persisted nextRunAt so restarts don't keep pushing the run out;
    // overdue runs fire shortly after startup. Each run persists the next
    // nextRunAt via updateSchedule → updateSettings → armSchedule.
    const intervalMs = effectiveIntervalMs(schedule.intervalMinutes)
    const due = schedule.nextRunAt ? Date.parse(schedule.nextRunAt) : NaN
    const delay = Number.isFinite(due)
      ? Math.min(Math.max(due - Date.now(), SCHEDULE_CATCHUP_DELAY_MS), intervalMs)
      : intervalMs
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null
      void this.runScheduledBackup().catch(() => {
        // never log secrets; retry on the next interval
        this.armScheduleAfterFailure(intervalMs)
      })
    }, delay)
    // unref so CLI/tests can exit
    this.scheduleTimer.unref?.()
  }

  private armScheduleAfterFailure(intervalMs: number): void {
    if (this.scheduleTimer || !this.settings.schedule.enabled) return
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null
      this.armSchedule()
    }, intervalMs)
    this.scheduleTimer.unref?.()
  }

  private async applyRetention(targetId: string): Promise<void> {
    if (targetId === ROLLBACK_TARGET_ID) return
    const policy = this.settings.schedule.targetId === targetId
      ? this.settings.schedule.retention
      : this.settings.retention
    const list = await this.adapterFor(targetId).list()
    const toDelete = snapshotsToDelete(list, policy)
    for (const id of toDelete) {
      try {
        await this.adapterFor(targetId).delete(id)
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

  private adapterFor(targetId: string): StorageAdapter {
    if (targetId === ROLLBACK_TARGET_ID) return this.ensureRollbackAdapter()
    try {
      return this.registry.get(targetId)
    } catch {
      throw new VaultUserError(`storage target not found: ${targetId}`, 404, 'TARGET_NOT_FOUND')
    }
  }

  private async ensureRollbackDir(): Promise<string> {
    const dir = vaultRollbackDir(this.dataDir)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    try {
      await chmod(dir, 0o700)
    } catch {
      // Windows may ignore mode; best-effort.
    }
    return dir
  }

  private ensureRollbackAdapter(): LocalStorageAdapter {
    if (!this.rollbackAdapter) {
      const directory = vaultRollbackDir(this.dataDir)
      this.rollbackAdapter = new LocalStorageAdapter({
        kind: 'local',
        id: ROLLBACK_TARGET_ID,
        label: 'Private rollback',
        directory,
      })
    }
    return this.rollbackAdapter
  }

  /**
   * Write a pre-restore snapshot into the private 0700 rollback folder under DSH_HOME.
   * Never uses a user-configured local target (USB/sync folders).
   */
  private async createPrivateRollbackSnapshot(input: {
    includeSecrets: boolean
    encrypt: boolean
    password?: string
    notes: string
    onProgress?: ProgressCallback
  }): Promise<string> {
    await this.ensureRollbackDir()
    if (input.includeSecrets && !input.encrypt) {
      throw new VaultUserError('rollback secrets require encryption', 400, 'SECRETS_REQUIRE_ENCRYPT')
    }
    if (input.encrypt && !input.password) {
      throw new VaultUserError('password required for encrypted rollback', 400, 'PASSWORD_REQUIRED')
    }
    const { files, plugins } = await collectBackupFiles({
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      includeSecrets: input.includeSecrets,
      bundleLocalPlugins: false,
    })
    const packed = await packSnapshot({
      files,
      plugins,
      includeSecrets: input.includeSecrets,
      encrypt: input.encrypt,
      password: input.password,
      kdf: this.settings.preferredKdf,
      dshVersion: this.dshVersion,
      notes: input.notes,
      onProgress: input.onProgress,
    })
    await this.ensureRollbackAdapter().put(packed.snapshotId, packed.bytes)
    return packed.snapshotId
  }

  private async restoreWillApplySecrets(
    manifest: VaultManifest,
    conflict: ConflictStrategy,
    conflicts: ReturnType<typeof normalizeConflicts>,
    includeSecrets: boolean,
  ): Promise<boolean> {
    if (!includeSecrets && !manifest.includeSecrets) return false
    const allowSecrets = includeSecrets || manifest.includeSecrets
    if (!allowSecrets) return false
    const preview = await previewRestoreDiff({
      manifest,
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
      conflict,
      conflicts,
    })
    for (const item of preview.items) {
      const meta = manifest.files.find((f) => f.path === item.path)
      const secret = Boolean(meta?.secret) || isSecretRelPath(item.path)
      if (!secret) continue
      const strategy = item.resolution ?? resolveItemConflict(item.path, conflict, conflicts)
      if (shouldApplyChange(item.change, strategy)) return true
    }
    return false
  }
}

/** Minimum schedule interval enforced by the timer (and reflected in nextRunAt). */
export const MIN_SCHEDULE_MINUTES = 15
const SCHEDULE_CATCHUP_DELAY_MS = 5_000

export function effectiveIntervalMs(intervalMinutes: number): number {
  return Math.max(MIN_SCHEDULE_MINUTES, Number(intervalMinutes) || 0) * 60_000
}

/** Id of the private local rollback folder (not a user-editable storage target). */
export const ROLLBACK_TARGET_ID = 'local-rollback'

/** Write a sidecard meta file next to a local snapshot (optional helper for CLI). */
export async function writeSidecarMeta(dir: string, snapshotId: string, meta: Record<string, unknown>): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${snapshotId}.meta.json`), JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 })
}

export { isBuiltinDshBundle } from './diff.js'

async function listProfiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}
