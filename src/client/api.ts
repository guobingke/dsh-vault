import type {
  BackupResult,
  RestorePreview,
  RestoreResult,
  ScheduleConfig,
  SnapshotInfo,
  StorageTargetConfig,
  VaultSettings,
} from '../core/types.js'

const BASE = '/api/dsh-vault'

export class VaultApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'VaultApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new VaultApiError(text || `HTTP ${res.status}`, res.status)
  }
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`
    throw new VaultApiError(msg, res.status)
  }
  return body as T
}

export interface VaultStatusResponse {
  dshHome: string
  dataDir: string
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
    targetId: string
    encrypt?: boolean
    password?: string
    includeSecrets?: boolean
    notes?: string
  }): Promise<BackupResult> {
    return request('/backup', { method: 'POST', body: JSON.stringify(body) })
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

  previewRestore(targetId: string, snapshotId: string, password?: string): Promise<RestorePreview> {
    return request('/restore/preview', { method: 'POST', body: JSON.stringify({ targetId, snapshotId, password }) })
  }

  restore(body: {
    targetId: string
    snapshotId: string
    conflict: 'keep-current' | 'use-backup'
    password?: string
  }): Promise<RestoreResult> {
    return request('/restore', { method: 'POST', body: JSON.stringify(body) })
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
