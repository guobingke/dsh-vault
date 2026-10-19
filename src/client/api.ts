import type {
  BackupCategory,
  BackupResult,
  ConflictStrategy,
  KdfAlgorithm,
  RestorePreview,
  RestoreResult,
  ScheduleConfig,
  SnapshotInfo,
  StorageTargetConfig,
  VaultSettings,
} from '../core/types.js'

import type { FsListingView } from './components/PathPicker.js'

const BASE = '/api/dsh-vault'

/** Per-path overrides for the global conflict strategy (keys are snapshot-relative paths). */
export type RestoreConflicts = Record<string, ConflictStrategy>

export class VaultApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'VaultApiError'
  }
}

async function request<T>(path: string, init?: RequestInit & { acceptConflictBody?: boolean }): Promise<T> {
  const { acceptConflictBody, ...fetchInit } = init ?? {}
  const res = await fetch(`${BASE}${path}`, {
    ...fetchInit,
    headers: {
      accept: 'application/json',
      ...(fetchInit.body ? { 'content-type': 'application/json' } : {}),
      ...fetchInit.headers,
    },
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new VaultApiError(text || `HTTP ${res.status}`, res.status)
  }
  // Restore returns 409 with a full RestoreResult when plugins failed.
  if (res.status === 409 && acceptConflictBody && body && typeof body === 'object' && 'snapshotId' in body) {
    return body as T
  }
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`
    throw new VaultApiError(msg, res.status)
  }
  return body as T
}

function hasConflicts(conflicts: RestoreConflicts | undefined): conflicts is RestoreConflicts {
  return Boolean(conflicts) && Object.keys(conflicts!).length > 0
}

export interface VaultStatusResponse {
  dshHome: string
  dataDir: string
  /** Host process profile (`web`, `desktop`, …) — optional on older hosts. */
  activeProfile?: string
  /** Derived surface: `desktop` | `web` | `other` — optional on older hosts. */
  surface?: 'desktop' | 'web' | 'other'
  guiProfiles?: string[]
  targets: StorageTargetConfig[]
  settings: VaultSettings
  recentSnapshots: SnapshotInfo[]
  /** Plugin data folders/files under $DSH_HOME included in backups (newer hosts). */
  pluginDataEntries?: string[]
}

export interface DetectedPluginView {
  key: string
  name: string
  profile: string
  kind: 'npm' | 'github' | 'local'
  version?: string
  cordisOnly: boolean
  installed: boolean
  registry: 'present' | 'missing' | 'unknown' | 'not-applicable'
  recommended: boolean
  copy: boolean
}

export interface PluginListResponse {
  plugins: DetectedPluginView[]
  settings: VaultSettings['pluginCopies']
  restoreOrder: VaultSettings['pluginRestoreOrder']
}

export interface JobView<R = unknown> {
  id: string
  kind: 'backup' | 'restore' | 'retry-plugins'
  status: 'running' | 'done' | 'error'
  progress: { stage: string; percent: number; current?: number; total?: number; item?: string; message: string }
  startedAt: string
  finishedAt?: string
  elapsedMs: number
  result?: R
  error?: { message: string; code?: string; status?: number }
}

export class VaultApi {
  startBackupJob(body: Parameters<VaultApi['backup']>[0]): Promise<JobView<BackupResult>> {
    return request('/jobs/backup', { method: 'POST', body: JSON.stringify(body) })
  }

  startRestoreJob(body: Parameters<VaultApi['restore']>[0]): Promise<JobView<RestoreResult>> {
    return request('/jobs/restore', { method: 'POST', body: JSON.stringify(body) })
  }

  startRetryPluginsJob(plugins?: Array<{ name: string; profile: string }>): Promise<JobView<RestoreResult>> {
    return request('/jobs/retry-plugins', { method: 'POST', body: JSON.stringify(plugins ? { plugins } : {}) })
  }

  /** A job by id, or the running / most recent one. */
  getJob(id?: string): Promise<{ job: JobView | null }> {
    return request(id ? `/jobs?id=${encodeURIComponent(id)}` : '/jobs')
  }

  listPlugins(checkRegistry = true): Promise<PluginListResponse> {
    return request(`/plugins?registry=${checkRegistry ? '1' : '0'}`)
  }

  status(): Promise<VaultStatusResponse> {
    return request('/status')
  }

  getSettings(): Promise<VaultSettings> {
    return request('/settings')
  }

  updateSettings(patch: Partial<VaultSettings>): Promise<VaultSettings> {
    return request('/settings', { method: 'PUT', body: JSON.stringify(patch) })
  }

  listTargets(): Promise<{ targets: StorageTargetConfig[] }> {
    return request('/targets')
  }

  upsertTarget(target: StorageTargetConfig): Promise<{ targets: StorageTargetConfig[] }> {
    return request('/targets', { method: 'POST', body: JSON.stringify(target) })
  }

  deleteTarget(id: string): Promise<{ targets: StorageTargetConfig[] }> {
    return request('/targets/delete', { method: 'POST', body: JSON.stringify({ id }) })
  }

  backup(body: {
    targetId?: string
    directory?: string
    exportFile?: string
    encrypt?: boolean
    password?: string
    includeSecrets?: boolean
    notes?: string
    categories?: BackupCategory[]
    kdf?: KdfAlgorithm
    bundleLocalPlugins?: boolean
    bundlePluginCopies?: boolean
    pluginCopyExclude?: string[]
  }): Promise<BackupResult> {
    return request('/backup', { method: 'POST', body: JSON.stringify(body) })
  }

  listFs(path: string): Promise<FsListingView> {
    return request(`/fs/list?path=${encodeURIComponent(path)}`)
  }

  mkdir(path: string, name: string): Promise<{ path: string }> {
    return request('/fs/mkdir', { method: 'POST', body: JSON.stringify({ path, name }) })
  }

  pickDirectory(): Promise<{ path: string | null }> {
    return request('/fs/pick-directory', { method: 'POST', body: '{}' })
  }

  listSnapshots(targetId?: string): Promise<{ snapshots: SnapshotInfo[] }> {
    const q = targetId ? `?targetId=${encodeURIComponent(targetId)}` : ''
    return request(`/snapshots${q}`)
  }

  deleteSnapshot(targetId: string, snapshotId: string): Promise<{ ok: true }> {
    return request('/snapshots/delete', { method: 'POST', body: JSON.stringify({ targetId, snapshotId }) })
  }

  verify(targetId: string, snapshotId: string, password?: string): Promise<{ ok: true; manifestId: string }> {
    return request('/verify', { method: 'POST', body: JSON.stringify({ targetId, snapshotId, password }) })
  }

  /**
   * Preview a restore diff. When `conflict` is set, every item in the response
   * carries a `resolution` for that path (global default + optional overrides).
   */
  previewRestore(
    targetId: string | undefined,
    snapshotId: string | undefined,
    password?: string,
    conflict?: ConflictStrategy,
    conflicts?: RestoreConflicts,
    importPath?: string,
  ): Promise<RestorePreview> {
    return request('/restore/preview', {
      method: 'POST',
      body: JSON.stringify({
        targetId,
        snapshotId,
        importPath,
        password,
        ...(conflict ? { conflict } : {}),
        ...(hasConflicts(conflicts) ? { conflicts } : {}),
      }),
    })
  }

  restore(body: {
    targetId?: string
    snapshotId?: string
    importPath?: string
    conflict: ConflictStrategy
    conflicts?: RestoreConflicts
    password?: string
    createRollbackSnapshot?: boolean
    reinstallPlugins?: boolean
    includeSecrets?: boolean
  }): Promise<RestoreResult> {
    return request('/restore', { method: 'POST', body: JSON.stringify(body), acceptConflictBody: true })
  }

  /** Re-attempt only the given failed plugins (or all failed ones of the last restore). */
  retryPlugins(plugins?: Array<{ name: string; profile: string }>): Promise<RestoreResult> {
    return request('/restore/retry-plugins', { method: 'POST', body: JSON.stringify(plugins ? { plugins } : {}), acceptConflictBody: true })
  }

  getSchedule(): Promise<ScheduleConfig> {
    return request('/schedule')
  }

  updateSchedule(patch: Partial<ScheduleConfig>): Promise<ScheduleConfig> {
    return request('/schedule', { method: 'PUT', body: JSON.stringify(patch) })
  }

  runSchedule(): Promise<{ result: BackupResult | null }> {
    return request('/schedule/run', { method: 'POST', body: '{}' })
  }
}
