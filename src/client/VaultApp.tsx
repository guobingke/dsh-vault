import { useCallback, useEffect, useMemo, useState } from 'react'
import { VaultApi, type VaultStatusResponse } from './api.js'
import { Dashboard } from './components/Dashboard.js'
import { BackupPanel } from './components/BackupPanel.js'
import { RestorePanel } from './components/RestorePanel.js'
import { StoragePanel } from './components/StoragePanel.js'
import { SnapshotsPanel } from './components/SnapshotsPanel.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import type { RestorePreview, SnapshotInfo, StorageTargetConfig, VaultSettings } from '../core/types.js'
import './theme.css'

export type VaultTab = 'dashboard' | 'backup' | 'restore' | 'storage' | 'snapshots' | 'settings'

const TABS: Array<{ id: VaultTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'backup', label: 'Backup' },
  { id: 'restore', label: 'Restore' },
  { id: 'storage', label: 'Storage' },
  { id: 'snapshots', label: 'Snapshots' },
  { id: 'settings', label: 'Settings' },
]

export interface VaultAppProps {
  api?: VaultApi
}

export function VaultApp({ api: apiProp }: VaultAppProps) {
  const api = useMemo(() => apiProp ?? new VaultApi(), [apiProp])
  const [tab, setTab] = useState<VaultTab>('dashboard')
  const [status, setStatus] = useState<VaultStatusResponse | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await api.status()
      setStatus(s)
      const snap = await api.listSnapshots()
      setSnapshots(snap.snapshots)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const targets: StorageTargetConfig[] = status?.targets ?? []
  const settings: VaultSettings | null = status?.settings ?? null

  return (
    <div className="dsh-vault-root">
      <nav className="dv-nav" aria-label="dsh-vault sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-active={tab === t.id}
            onClick={() => {
              setTab(t.id)
              setMessage(null)
              setError(null)
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="dv-panel">
        {tab === 'dashboard' ? (
          <Dashboard
            status={status}
            loading={loading}
            error={error}
            onRefresh={() => void refresh()}
            onBackup={() => setTab('backup')}
          />
        ) : null}
        {tab === 'backup' ? (
          <BackupPanel
            targets={targets}
            busy={busy}
            message={message}
            error={error}
            onBackup={(input) => {
              setBusy(true)
              setError(null)
              setMessage(null)
              void api.backup(input)
                .then((r) => {
                  setMessage(`Created ${r.snapshotId} (${r.bytes} bytes)`)
                  return refresh()
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
          />
        ) : null}
        {tab === 'restore' ? (
          <RestorePanel
            targets={targets}
            snapshots={snapshots}
            preview={preview}
            busy={busy}
            message={message}
            error={error}
            onPreview={(input) => {
              setBusy(true)
              setError(null)
              void api.previewRestore(input.targetId, input.snapshotId, input.password)
                .then(setPreview)
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
            onRestore={(input) => {
              setBusy(true)
              setError(null)
              setMessage(null)
              void api.restore(input)
                .then((r) => {
                  setMessage(`Restored ${r.applied.length} files` + (r.rollbackSnapshotId ? `; rollback=${r.rollbackSnapshotId}` : ''))
                  return refresh()
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
          />
        ) : null}
        {tab === 'storage' ? (
          <StoragePanel
            targets={targets}
            busy={busy}
            error={error}
            message={message}
            onUpsert={(target) => {
              setBusy(true)
              setError(null)
              void api.upsertTarget(target)
                .then(() => {
                  setMessage(`Saved target ${target.id}`)
                  return refresh()
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
            onDelete={(id) => {
              setBusy(true)
              void api.deleteTarget(id)
                .then(() => refresh())
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
          />
        ) : null}
        {tab === 'snapshots' ? (
          <SnapshotsPanel
            snapshots={snapshots}
            busy={busy}
            error={error}
            onRefresh={() => void refresh()}
            onDelete={(targetId, snapshotId) => {
              setBusy(true)
              void api.deleteSnapshot(targetId, snapshotId)
                .then(() => refresh())
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
            onVerify={(targetId, snapshotId) => {
              setBusy(true)
              setMessage(null)
              void api.verify(targetId, snapshotId)
                .then((r) => setMessage(`Verified ${r.manifestId}`))
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
          />
        ) : null}
        {tab === 'settings' ? (
          <SettingsPanel
            settings={settings}
            busy={busy}
            error={error}
            message={message}
            onSave={(patch) => {
              setBusy(true)
              void api.updateSettings(patch)
                .then(() => {
                  setMessage('Settings saved')
                  return refresh()
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
            onRunSchedule={() => {
              setBusy(true)
              void api.runSchedule()
                .then((r) => {
                  setMessage(r.result ? `Scheduled backup ${r.result.snapshotId}` : 'Schedule disabled')
                  return refresh()
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false))
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
