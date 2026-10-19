import type { VaultStatusResponse } from '../api.js'

export interface DashboardProps {
  status: VaultStatusResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onBackup: () => void
}

export function Dashboard({ status, loading, error, onRefresh, onBackup }: DashboardProps) {
  if (loading && !status) {
    return <div className="dv-empty">Loading vault status…</div>
  }
  if (error && !status) {
    return (
      <div className="dv-banner" data-tone="error">
        {error}
        <div className="dv-row" style={{ marginTop: 8 }}>
          <button type="button" className="dv-btn" onClick={onRefresh}>Retry</button>
        </div>
      </div>
    )
  }
  if (!status) {
    return <div className="dv-empty">No status yet.</div>
  }

  const schedule = status.settings.schedule
  return (
    <div className="dv-stack">
      <div>
        <h2 className="dv-h1">Dashboard</h2>
        <p className="dv-muted">Backup and restore your full dsh setup from one place.</p>
      </div>
      <div className="dv-kpi">
        <div>
          <span className="dv-muted">Targets</span>
          <strong>{status.targets.length}</strong>
        </div>
        <div>
          <span className="dv-muted">Snapshots</span>
          <strong>{status.recentSnapshots.length}</strong>
        </div>
        <div>
          <span className="dv-muted">Schedule</span>
          <strong>{schedule.enabled ? 'On' : 'Off'}</strong>
        </div>
      </div>
      <div className="dv-banner">
        <div className="dv-mono">{status.dshHome}</div>
        <p className="dv-muted" style={{ marginTop: 4 }}>
          Secrets excluded by default. Enable encrypted mode to include credentials.
        </p>
      </div>
      <div className="dv-row">
        <button type="button" className="dv-btn dv-btn-primary" onClick={onBackup}>Back up now</button>
        <button type="button" className="dv-btn" onClick={onRefresh}>Refresh</button>
      </div>
      <div>
        <h3 className="dv-h1" style={{ fontSize: 13 }}>Recent snapshots</h3>
        {status.recentSnapshots.length === 0 ? (
          <div className="dv-empty">No snapshots yet. Run a backup to get started.</div>
        ) : (
          <table className="dv-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Target</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {status.recentSnapshots.slice(0, 5).map((s) => (
                <tr key={`${s.targetId}:${s.id}`}>
                  <td className="dv-mono">{s.id}</td>
                  <td>{s.targetId}</td>
                  <td>{s.bytes} B{s.encrypted ? ' · enc' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
