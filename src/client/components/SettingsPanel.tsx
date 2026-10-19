import { useEffect, useState } from 'react'
import type { ScheduleConfig, VaultSettings } from '../../core/types.js'

export interface SettingsPanelProps {
  settings: VaultSettings | null
  busy: boolean
  error: string | null
  message: string | null
  onSave: (patch: Partial<VaultSettings>) => void
  onRunSchedule: () => void
}

export function SettingsPanel({ settings, busy, error, message, onSave, onRunSchedule }: SettingsPanelProps) {
  const [keepLast, setKeepLast] = useState(10)
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null)

  useEffect(() => {
    if (!settings) return
    setKeepLast(settings.retention.keepLast)
    setSchedule(settings.schedule)
  }, [settings])

  if (!settings || !schedule) {
    return <div className="dv-empty">Loading settings…</div>
  }

  return (
    <div className="dv-stack">
      <div>
        <h2 className="dv-h1">Settings</h2>
        <p className="dv-muted">Retention policy and optional scheduled backups.</p>
      </div>
      <div className="dv-field">
        <label htmlFor="dv-keep">Keep last N snapshots</label>
        <input
          id="dv-keep"
          type="number"
          min={1}
          value={keepLast}
          onChange={(e) => setKeepLast(Number(e.target.value))}
        />
      </div>
      <label className="dv-row">
        <input
          type="checkbox"
          checked={schedule.enabled}
          onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
        />
        Enable scheduled backups
      </label>
      <div className="dv-field">
        <label htmlFor="dv-interval">Interval (minutes)</label>
        <input
          id="dv-interval"
          type="number"
          min={15}
          value={schedule.intervalMinutes}
          onChange={(e) => setSchedule({ ...schedule, intervalMinutes: Number(e.target.value) })}
        />
      </div>
      <div className="dv-field">
        <label htmlFor="dv-sched-target">Schedule target id</label>
        <input
          id="dv-sched-target"
          value={schedule.targetId}
          onChange={(e) => setSchedule({ ...schedule, targetId: e.target.value })}
        />
      </div>
      <label className="dv-row">
        <input
          type="checkbox"
          checked={schedule.encrypt}
          onChange={(e) => setSchedule({ ...schedule, encrypt: e.target.checked })}
        />
        Encrypt scheduled backups
      </label>
      {error ? <div className="dv-banner" data-tone="error">{error}</div> : null}
      {message ? <div className="dv-banner" data-tone="ok">{message}</div> : null}
      <div className="dv-row">
        <button
          type="button"
          className="dv-btn dv-btn-primary"
          disabled={busy}
          onClick={() => onSave({
            retention: { keepLast },
            schedule: { ...schedule, retention: { keepLast } },
          })}
        >
          Save settings
        </button>
        <button type="button" className="dv-btn" disabled={busy || !schedule.enabled} onClick={onRunSchedule}>
          Run schedule now
        </button>
      </div>
    </div>
  )
}
