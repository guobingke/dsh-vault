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
}

export class VaultApi {
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
  }): Promise<BackupResult> {
    return request('/backup', { method: 'POST', body: JSON.stringify(body) })
  }

  listFs(path: string): Promise<{ path: string; parent: string | null; entries: Array<{ name: string; path: string; kind: 'file' | 'directory'; bytes?: number }> }> {
    return request(`/fs/list?path=${encodeURIComponent(path)}`)
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
