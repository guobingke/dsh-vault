import { useId, useMemo, useState } from 'react'
import type { SnapshotInfo, StorageTargetConfig } from '../../core/types.js'
import { useT } from '../i18n.js'
import { formatBytes, formatDateTime, relativeLabel } from '../lib/format.js'
import { newestFirst } from '../lib/targets.js'
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  LoadingInline,
  PasswordInput,
  SearchInput,
  Segmented,
  Select,
  Tag,
} from './ui.js'

export interface VerifyResult {
  ok: boolean
  manifestId?: string
  error?: string
}

export interface SnapshotsPanelProps {
  snapshots: SnapshotInfo[]
  busy: boolean
  error: string | null
  message?: string | null
  onRefresh: () => void
  onDelete: (targetId: string, snapshotId: string) => void
  onVerify: (targetId: string, snapshotId: string, password?: string) => void | Promise<VerifyResult | void>
  targets?: StorageTargetConfig[]
  loading?: boolean
  onRestoreRequest?: (targetId: string, snapshotId: string) => void
  onNavigateBackup?: () => void
}

type ModeFilter = 'all' | 'encrypted' | 'plaintext' | 'secrets'
type VerifyState = { status: 'idle' } | { status: 'running' } | { status: 'ok' } | { status: 'fail'; error: string }

const MAX_RENDER = 300

export function SnapshotsPanel({
  snapshots,
  busy,
  error,
  message,
  onRefresh,
  onDelete,
  onVerify,
  targets = [],
  loading,
  onRestoreRequest,
  onNavigateBackup,
}: SnapshotsPanelProps) {
  const tr = useT()
  const ids = useId()
  const [targetFilter, setTargetFilter] = useState('')
  const [mode, setMode] = useState<ModeFilter>('all')
  const [query, setQuery] = useState('')
  const [deleteKey, setDeleteKey] = useState<string | null>(null)
  const [verifyTarget, setVerifyTarget] = useState<SnapshotInfo | null>(null)
  const [verifyPassword, setVerifyPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [results, setResults] = useState<Record<string, VerifyState>>({})

  const targetLabel = (id: string): string => targets.find((t) => t.id === id)?.label ?? id

  const sorted = useMemo(() => [...snapshots].sort(newestFirst), [snapshots])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sorted.filter((s) => {
      if (targetFilter && s.targetId !== targetFilter) return false
      if (mode === 'encrypted' && !s.encrypted) return false
      if (mode === 'plaintext' && s.encrypted) return false
      if (mode === 'secrets' && !s.includeSecrets) return false
      if (q && !s.id.toLowerCase().includes(q) && !(s.notes ?? '').toLowerCase().includes(q) && !s.targetId.toLowerCase().includes(q)) return false
      return true
    })
  }, [sorted, targetFilter, mode, query])

  const deleteTarget = snapshots.find((s) => `${s.targetId}:${s.id}` === deleteKey) ?? null
  const hasFilters = Boolean(query || targetFilter || mode !== 'all')

  async function runVerify(s: SnapshotInfo, password?: string) {
    const key = `${s.targetId}:${s.id}`
    setResults((prev) => ({ ...prev, [key]: { status: 'running' } }))
    try {
      const r = await onVerify(s.targetId, s.id, password)
      if (r && typeof r === 'object' && 'ok' in r && !r.ok) {
        setResults((prev) => ({ ...prev, [key]: { status: 'fail', error: r.error ?? tr('app.error') } }))
        return false
      }
      setResults((prev) => ({ ...prev, [key]: { status: 'ok' } }))
      return true
    } catch (err) {
      setResults((prev) => ({ ...prev, [key]: { status: 'fail', error: err instanceof Error ? err.message : String(err) } }))
      return false
    }
  }

  function requestVerify(s: SnapshotInfo) {
    if (s.encrypted) {
      setVerifyTarget(s)
      setVerifyPassword('')
      return
    }
    void runVerify(s)
  }

  return (
    <>
      <p className="dv-section-desc">{tr('snapshots.desc')}</p>
      {error ? <span className="dv-error-text" role="alert">{error}</span> : null}
      {message ? <span className="dv-hint">{message}</span> : null}

      <div className="dv-wrap">
        <div style={{ flex: '1 1 200px', minWidth: 160 }}>
          <SearchInput
            id={`${ids}-search`}
            value={query}
            onChange={setQuery}
            placeholder={tr('snapshots.search')}
            label={tr('snapshots.search')}
          />
        </div>
        <Select aria-label={tr('snapshots.filterTarget')} value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)}>
          <option value="">{tr('common.allTargets')}</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </Select>
        <Segmented
          label={tr('snapshots.filterMode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'all', label: tr('snapshots.mode.all') },
            { value: 'encrypted', label: tr('snapshots.mode.encrypted') },
            { value: 'plaintext', label: tr('snapshots.mode.plaintext') },
            { value: 'secrets', label: tr('snapshots.mode.secrets') },
          ]}
        />
        {hasFilters ? (
          <Button size="sm" variant="quiet" onClick={() => { setQuery(''); setTargetFilter(''); setMode('all') }}>
            {tr('snapshots.clear')}
          </Button>
        ) : null}
        <span className="dv-hint dv-num" style={{ marginLeft: 'auto' }}>
          {tr('snapshots.count', { shown: filtered.length, total: snapshots.length })}
        </span>
        <Button size="sm" variant="quiet" onClick={onRefresh} disabled={busy}>{tr('app.refresh')}</Button>
      </div>

      {loading && snapshots.length === 0 ? (
        <LoadingInline label={tr('app.loading')} />
      ) : snapshots.length === 0 ? (
        <EmptyState
          title={tr('snapshots.emptyTitle')}
          body={tr('snapshots.emptyBody')}
          actions={onNavigateBackup ? <Button variant="primary" onClick={onNavigateBackup}>{tr('snapshots.goBackup')}</Button> : null}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={tr('snapshots.noMatch')}
          actions={<Button size="sm" onClick={() => { setQuery(''); setTargetFilter(''); setMode('all') }}>{tr('snapshots.clear')}</Button>}
        />
      ) : (
        <Card>
          <ul className="dv-list">
            {filtered.slice(0, MAX_RENDER).map((s) => {
              const key = `${s.targetId}:${s.id}`
              const state = results[key] ?? { status: 'idle' }
              return (
                <li key={key} className="dv-list-item">
                  <div className="dv-list-main">
                    <span className="dv-list-title dv-mono" title={s.id}>{s.id}</span>
                    <span className="dv-card-sub">
                      {targetLabel(s.targetId)} · {formatDateTime(s.createdAt)}（{relativeLabel(tr, s.createdAt)}） · {formatBytes(s.bytes)}
                    </span>
                    <span className="dv-tag-list" style={{ marginTop: 4 }}>
                      <Tag tone={s.encrypted ? 'ok' : 'neutral'}>{s.encrypted ? tr('common.encrypted') : tr('common.plaintext')}</Tag>
                      {s.includeSecrets ? <Tag tone="warn">{tr('common.secrets')}</Tag> : null}
                      {state.status === 'ok' ? <Tag tone="ok">{tr('snapshots.verified')}</Tag> : null}
                      {s.notes ? <span className="dv-hint dv-truncate" style={{ maxWidth: 200 }} title={s.notes}>{s.notes}</span> : null}
                    </span>
                    {state.status === 'fail' ? (
                      <span className="dv-error-text">{tr('snapshots.verifyFail', { error: state.error })}</span>
                    ) : null}
                  </div>
                  <div className="dv-list-meta">
                    {onRestoreRequest ? (
                      <Button size="sm" variant="quiet" onClick={() => onRestoreRequest(s.targetId, s.id)}>
                        {tr('snapshots.restoreAction')}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => requestVerify(s)}
                      loading={state.status === 'running'}
                      aria-label={`${tr('snapshots.verify')} ${s.id}`}
                    >
                      {state.status === 'running' ? tr('snapshots.verifying') : tr('snapshots.verify')}
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => setDeleteKey(key)}
                      disabled={busy}
                      aria-label={`${tr('common.delete')} ${s.id}`}
                      style={{ color: 'var(--dv-danger)' }}
                    >
                      {tr('common.delete')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
          {filtered.length > MAX_RENDER ? <span className="dv-hint">{tr('snapshots.truncated', { shown: MAX_RENDER })}</span> : null}
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteKey(null)}
        title={tr('snapshots.deleteTitle', { id: deleteTarget?.id ?? '' })}
        description={deleteTarget ? tr('snapshots.deleteBody', { target: targetLabel(deleteTarget.targetId) }) : undefined}
        confirmLabel={tr('snapshots.deleteConfirm')}
        busy={busy}
        onConfirm={() => {
          if (!deleteTarget) return
          onDelete(deleteTarget.targetId, deleteTarget.id)
          setDeleteKey(null)
        }}
      >
        {deleteTarget ? (
          <dl className="dv-kv">
            <dt>{tr('common.size')}</dt>
            <dd>{formatBytes(deleteTarget.bytes)}</dd>
            <dt>{tr('common.createdAt')}</dt>
            <dd>{formatDateTime(deleteTarget.createdAt)}</dd>
            {deleteTarget.notes ? (
              <>
                <dt>{tr('common.notes')}</dt>
                <dd>{deleteTarget.notes}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </ConfirmDialog>

      <Dialog
        open={Boolean(verifyTarget)}
        onClose={() => { if (!verifying) setVerifyTarget(null) }}
        title={tr('snapshots.verify')}
        description={tr('snapshots.verifyPasswordHint')}
        actions={
          <>
            <Button onClick={() => setVerifyTarget(null)} disabled={verifying}>{tr('app.cancel')}</Button>
            <Button
              variant="primary"
              loading={verifying}
              disabled={!verifyPassword}
              onClick={async () => {
                if (!verifyTarget) return
                setVerifying(true)
                const ok = await runVerify(verifyTarget, verifyPassword)
                setVerifying(false)
                if (ok) {
                  setVerifyTarget(null)
                  setVerifyPassword('')
                }
              }}
            >
              {tr('snapshots.verify')}
            </Button>
          </>
        }
      >
        <Field label={tr('snapshots.verifyPassword')} htmlFor={`${ids}-verify-pass`}>
          <PasswordInput
            id={`${ids}-verify-pass`}
            value={verifyPassword}
            onChange={(e) => setVerifyPassword(e.target.value)}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && verifyPassword && verifyTarget && !verifying) {
                setVerifying(true)
                void runVerify(verifyTarget, verifyPassword).then((ok) => {
                  setVerifying(false)
                  if (ok) { setVerifyTarget(null); setVerifyPassword('') }
                })
              }
            }}
          />
        </Field>
        {verifying ? <LoadingInline label={tr('snapshots.verifying')} /> : null}
      </Dialog>
    </>
  )
}
