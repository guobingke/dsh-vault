import { useState } from 'react'
import type { RestorePreview, SnapshotInfo, StorageTargetConfig } from '../../core/types.js'

export interface RestorePanelProps {
  targets: StorageTargetConfig[]
  snapshots: SnapshotInfo[]
  preview: RestorePreview | null
  busy: boolean
  message: string | null
  error: string | null
  onPreview: (input: { targetId: string; snapshotId: string; password?: string }) => void
  onRestore: (input: {
    targetId: string
    snapshotId: string
    password?: string
    conflict: 'keep-current' | 'use-backup'
  }) => void
}

export function RestorePanel({
  targets,
  snapshots,
  preview,
  busy,
  message,
  error,
  onPreview,
  onRestore,
}: RestorePanelProps) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [snapshotId, setSnapshotId] = useState(snapshots[0]?.id ?? '')
  const [password, setPassword] = useState('')
  const [conflict, setConflict] = useState<'keep-current' | 'use-backup'>('use-backup')

  const filtered = snapshots.filter((s) => !targetId || s.targetId === targetId)

  return (
    <div className="dv-stack">
      <div>
        <h2 className="dv-h1">Restore</h2>
        <p className="dv-muted">Preview the diff, choose conflicts, then one-click import.</p>
      </div>
      <div className="dv-field">
        <label htmlFor="dv-restore-target">Target</label>
        <select id="dv-restore-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="dv-field">
        <label htmlFor="dv-restore-snap">Snapshot</label>
        <select id="dv-restore-snap" value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)}>
          {filtered.length === 0 ? <option value="">No snapshots</option> : null}
          {filtered.map((s) => (
            <option key={s.id} value={s.id}>{s.id}{s.encrypted ? ' (encrypted)' : ''}</option>
          ))}
        </select>
      </div>
      <div className="dv-field">
        <label htmlFor="dv-restore-pass">Password (if encrypted)</label>
        <input
          id="dv-restore-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="dv-field">
        <label htmlFor="dv-restore-conflict">On conflict</label>
        <select
          id="dv-restore-conflict"
          value={conflict}
          onChange={(e) => setConflict(e.target.value as 'keep-current' | 'use-backup')}
        >
          <option value="use-backup">Use backup</option>
          <option value="keep-current">Keep current</option>
        </select>
      </div>
      <div className="dv-row">
        <button
          type="button"
          className="dv-btn"
          disabled={busy || !snapshotId}
          onClick={() => onPreview({ targetId, snapshotId, password: password || undefined })}
        >
          Preview diff
        </button>
        <button
          type="button"
          className="dv-btn dv-btn-primary"
          disabled={busy || !snapshotId || !preview}
          onClick={() => onRestore({ targetId, snapshotId, password: password || undefined, conflict })}
        >
          {busy ? 'Restoring…' : 'Restore'}
        </button>
      </div>
      {error ? <div className="dv-banner" data-tone="error">{error}</div> : null}
      {message ? <div className="dv-banner" data-tone="ok">{message}</div> : null}
      {preview ? (
        <div className="dv-stack">
          <div className="dv-kpi">
            <div><span className="dv-muted">Add</span><strong>{preview.added}</strong></div>
            <div><span className="dv-muted">Change</span><strong>{preview.changed}</strong></div>
            <div><span className="dv-muted">Remove*</span><strong>{preview.removed}</strong></div>
          </div>
          <p className="dv-muted">* Removals are reported but not auto-deleted in this version.</p>
          {preview.manualActions.length > 0 ? (
            <div className="dv-banner" data-tone="warn">
              {preview.manualActions.map((m) => <div key={m}>{m}</div>)}
            </div>
          ) : null}
          <table className="dv-table">
            <thead>
              <tr><th>Path</th><th>Change</th></tr>
            </thead>
            <tbody>
              {preview.items.filter((i) => i.change !== 'unchanged').slice(0, 40).map((i) => (
                <tr key={i.path}>
                  <td className="dv-mono">{i.path}</td>
                  <td>{i.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
