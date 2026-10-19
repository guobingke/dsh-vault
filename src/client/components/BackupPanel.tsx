import { useState } from 'react'
import type { StorageTargetConfig } from '../../core/types.js'

export interface BackupPanelProps {
  targets: StorageTargetConfig[]
  busy: boolean
  message: string | null
  error: string | null
  progress?: number
  onBackup: (input: {
    targetId: string
    encrypt: boolean
    password?: string
    includeSecrets: boolean
    notes?: string
  }) => void
}

export function BackupPanel({ targets, busy, message, error, progress, onBackup }: BackupPanelProps) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [encrypt, setEncrypt] = useState(false)
  const [includeSecrets, setIncludeSecrets] = useState(false)
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')

  if (targets.length === 0) {
    return <div className="dv-empty">Add a storage target before backing up.</div>
  }

  return (
    <div className="dv-stack">
      <div>
        <h2 className="dv-h1">Backup</h2>
        <p className="dv-muted">Capture plugins, MCP, skills, settings, presets, and profile patches.</p>
      </div>
      <div className="dv-field">
        <label htmlFor="dv-backup-target">Target</label>
        <select
          id="dv-backup-target"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>{t.label} ({t.kind})</option>
          ))}
        </select>
      </div>
      <label className="dv-row">
        <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
        Encrypt snapshot (scrypt + AES-256-GCM)
      </label>
      <label className="dv-row">
        <input
          type="checkbox"
          checked={includeSecrets}
          disabled={!encrypt}
          onChange={(e) => setIncludeSecrets(e.target.checked)}
        />
        Include secrets (requires encryption)
      </label>
      {encrypt ? (
        <div className="dv-field">
          <label htmlFor="dv-backup-pass">Password</label>
          <input
            id="dv-backup-pass"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      ) : null}
      <div className="dv-field">
        <label htmlFor="dv-backup-notes">Notes</label>
        <input id="dv-backup-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {typeof progress === 'number' ? (
        <div className="dv-progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {error ? <div className="dv-banner" data-tone="error">{error}</div> : null}
      {message ? <div className="dv-banner" data-tone="ok">{message}</div> : null}
      <div className="dv-row">
        <button
          type="button"
          className="dv-btn dv-btn-primary"
          disabled={busy || !targetId || (encrypt && !password) || (includeSecrets && !encrypt)}
          onClick={() => onBackup({
            targetId,
            encrypt,
            password: encrypt ? password : undefined,
            includeSecrets: includeSecrets && encrypt,
            notes: notes || undefined,
          })}
        >
          {busy ? 'Backing up…' : 'Create snapshot'}
        </button>
      </div>
    </div>
  )
}
