import type { SnapshotInfo } from '../../core/types.js'

export interface SnapshotsPanelProps {
  snapshots: SnapshotInfo[]
  busy: boolean
  error: string | null
  onRefresh: () => void
  onDelete: (targetId: string, snapshotId: string) => void
  onVerify: (targetId: string, snapshotId: string) => void
}

export function SnapshotsPanel({ snapshots, busy, error, onRefresh, onDelete, onVerify }: SnapshotsPanelProps) {
  return (
    <div className="dv-stack">
      <div className="dv-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 className="dv-h1">Snapshots</h2>
          <p className="dv-muted">List, verify, and delete snapshots across targets.</p>
        </div>
        <button type="button" className="dv-btn" onClick={onRefresh} disabled={busy}>Refresh</button>
      </div>
      {error ? <div className="dv-banner" data-tone="error">{error}</div> : null}
      {snapshots.length === 0 ? (
        <div className="dv-empty">No snapshots found.</div>
      ) : (
        <table className="dv-table">
          <thead>
            <tr>
              <th>Id</th>
              <th>Target</th>
              <th>Created</th>
              <th>Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={`${s.targetId}:${s.id}`}>
                <td className="dv-mono">{s.id}</td>
                <td>{s.targetId}</td>
                <td>{s.createdAt}</td>
                <td>{s.bytes}{s.encrypted ? ' · enc' : ''}</td>
                <td className="dv-row">
                  <button type="button" className="dv-btn" disabled={busy} onClick={() => onVerify(s.targetId, s.id)}>Verify</button>
                  <button type="button" className="dv-btn dv-btn-danger" disabled={busy} onClick={() => onDelete(s.targetId, s.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
