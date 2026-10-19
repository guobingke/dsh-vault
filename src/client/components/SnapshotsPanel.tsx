import { useId, useMemo, useState } from 'react'
import type { SnapshotInfo, RetentionPolicy, StorageTargetConfig } from '../../core/types.js'
import { useT, type Translate } from '../i18n.js'
import { formatBytes, formatDateTime, relativeLabel } from '../lib/targets.js'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  CopyButton,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  LoadingInline,
  PageHeader,
  PasswordInput,
  SearchInput,
  Segmented,
  SkeletonCard,
  SelectField,
  Stat,
  StatusDot,
  Tag,
} from './ui.js'
import {
  IconArchive,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconDatabase,
  IconKey,
  IconLock,
  IconRefresh,
  IconRestore,
  IconSearch,
  IconShieldCheck,
  IconTrash,
  IconX,
} from './Icons.js'

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
  /** Optional: used for target labels and the retention editor. */
  targets?: StorageTargetConfig[]
  /** Optional: initial fetch in flight. */
  loading?: boolean
  /** Optional: apply a new retention policy (VaultSettings.retention). */
  onSaveRetention?: (policy: RetentionPolicy) => void
  /** Optional: jump to Restore with this snapshot preselected. */
  onRestoreRequest?: (targetId: string, snapshotId: string) => void
  onNavigateBackup?: () => void
  /** Optional: current global retention (pre-fills the retention editor). */
  currentRetention?: RetentionPolicy
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
  onSaveRetention,
  onRestoreRequest,
  onNavigateBackup,
  currentRetention,
}: SnapshotsPanelProps) {
  const tr = useT()
  const ids = useId()
  const [targetFilter, setTargetFilter] = useState('')
  const [mode, setMode] = useState<ModeFilter>('all')
  const [query, setQuery] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [verifyTarget, setVerifyTarget] = useState<SnapshotInfo | null>(null)
  const [verifyPassword, setVerifyPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [results, setResults] = useState<Record<string, VerifyState>>({})
  const [retentionDraft, setRetentionDraft] = useState<string>(() =>
    currentRetention ? String(currentRetention.keepLast) : '',
  )

  const targetLabel = (id: string): string => targets.find((t) => t.id === id)?.label ?? id

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [snapshots],
  )

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

  const totals = useMemo(() => {
    let bytes = 0
    let enc = 0
    let secrets = 0
    for (const s of snapshots) {
      bytes += s.bytes || 0
      if (s.encrypted) enc += 1
      if (s.includeSecrets) secrets += 1
    }
    return { bytes, enc, secrets }
  }, [snapshots])

  const deleteTarget = snapshots.find((s) => `${s.targetId}:${s.id}` === deleteId) ?? null
  const hasFilters = Boolean(query || targetFilter || mode !== 'all')

  async function runVerify(s: SnapshotInfo, password?: string) {
    const key = `${s.targetId}:${s.id}`
    setResults((prev) => ({ ...prev, [key]: { status: 'running' } }))
    try {
      const r = await onVerify(s.targetId, s.id, password)
      if (r && typeof r === 'object' && 'ok' in r && !r.ok) {
        setResults((prev) => ({ ...prev, [key]: { status: 'fail', error: r.error ?? 'unknown error' } }))
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

  const retentionValue = retentionDraft === '' ? '' : retentionDraft
  const perTargetPrune = useMemo(() => {
    if (!retentionValue) return 0
    const keep = Math.max(1, Number(retentionValue) || 0)
    const groups = new Map<string, number>()
    for (const s of snapshots) groups.set(s.targetId, (groups.get(s.targetId) ?? 0) + 1)
    let prune = 0
    for (const n of groups.values()) prune += Math.max(0, n - keep)
    return prune
  }, [snapshots, retentionValue])

  return (
    <div className="dv-page">
      <PageHeader
        title={tr('snapshots.title')}
        subtitle={tr('snapshots.subtitle')}
        actions={
          <Button icon={<IconRefresh size={15} />} onClick={onRefresh} loading={busy && !snapshots.length}>
            {tr('app.refresh')}
          </Button>
        }
      />

      {error ? <ErrorState compact error={error} onRetry={onRefresh} /> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      <div className="dv-kpi dv-kpi-3">
        <Stat icon={<IconDatabase size={14} />} label={tr('nav.snapshots')} value={snapshots.length} valueSize="sm" foot={formatBytes(totals.bytes)} />
        <Stat icon={<IconLock size={14} />} label={tr('snapshots.filter.encrypted')} value={totals.enc} valueSize="sm" foot={`${tr('snapshots.filter.plain')} ${snapshots.length - totals.enc}`} />
        <Stat icon={<IconKey size={14} />} label={tr('snapshots.filter.secrets')} value={totals.secrets} valueSize="sm" />
      </div>

      <Card>
        <CardHeader
          icon={<IconArchive size={18} />}
          title={tr('snapshots.total', { count: snapshots.length })}
          actions={
            <Badge tone={filtered.length === snapshots.length ? 'neutral' : 'brand'}>
              {filtered.length} / {snapshots.length}
            </Badge>
          }
        />
        <CardBody>
          <div className="dv-row dv-gap-2">
            <div style={{ flex: '1 1 220px', minWidth: 180 }}>
              <SearchInput id={`${ids}-search`} value={query} onChange={setQuery} placeholder={tr('snapshots.search')} label={tr('snapshots.search')} />
            </div>
            <SelectField aria-label={tr('snapshots.filterTarget')} value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)} fieldClassName="dv-grow">
              <option value="">{tr('common.allTargets')}</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </SelectField>
            <Segmented
              label={tr('snapshots.filterMode')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'all', label: tr('snapshots.filter.all') },
                { value: 'encrypted', label: tr('snapshots.filter.encrypted') },
                { value: 'plaintext', label: tr('snapshots.filter.plain') },
                { value: 'secrets', label: tr('snapshots.filter.secrets') },
              ]}
            />
            {hasFilters ? (
              <Button variant="ghost" size="sm" icon={<IconX size={13} />} onClick={() => { setQuery(''); setTargetFilter(''); setMode('all') }}>
                {tr('snapshots.clearFilters')}
              </Button>
            ) : null}
          </div>

          {loading && snapshots.length === 0 ? (
            <SkeletonCard />
          ) : snapshots.length === 0 ? (
            <EmptyState
              icon={<IconArchive size={22} />}
              title={tr('snapshots.emptyTitle')}
              body={tr('snapshots.emptyBody')}
              actions={
                onNavigateBackup ? (
                  <Button variant="primary" size="sm" onClick={onNavigateBackup}>{tr('nav.backup')}</Button>
                ) : null
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              compact
              icon={<IconSearch size={22} />}
              title={tr('snapshots.noMatch')}
              actions={
                <Button size="sm" variant="outline" onClick={() => { setQuery(''); setTargetFilter(''); setMode('all') }}>
                  {tr('snapshots.clearFilters')}
                </Button>
              }
            />
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="dv-table" style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th scope="col">{tr('snapshots.colId')}</th>
                      <th scope="col">{tr('snapshots.colTarget')}</th>
                      <th scope="col">{tr('snapshots.colCreated')}</th>
                      <th scope="col" className="dv-th-right">{tr('snapshots.colSize')}</th>
                      <th scope="col">{tr('snapshots.colFlags')}</th>
                      <th scope="col" className="dv-th-right">{tr('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, MAX_RENDER).map((s) => {
                      const key = `${s.targetId}:${s.id}`
                      const state = results[key] ?? { status: 'idle' }
                      return (
                        <tr key={key}>
                          <td>
                            <div className="dv-row dv-gap-1" style={{ flexWrap: 'nowrap' }}>
                              <StatusDot tone={state.status === 'ok' ? 'ok' : state.status === 'fail' ? 'danger' : 'neutral'} pulse={state.status === 'running'} />
                              <span className="dv-mono" style={{ fontWeight: 550 }}>{s.id}</span>
                              <CopyButton text={s.id} />
                            </div>
                            {s.notes ? <div className="dv-hint dv-truncate" title={s.notes} style={{ maxWidth: 240 }}>{s.notes}</div> : null}
                          </td>
                          <td><Tag tone="brand">{targetLabel(s.targetId)}</Tag></td>
                          <td>
                            <div className="dv-small">{formatDateTime(s.createdAt)}</div>
                            <div className="dv-hint">{relativeLabel(tr, s.createdAt)}</div>
                          </td>
                          <td className="dv-td-right dv-num">{formatBytes(s.bytes)}</td>
                          <td>
                            <span className="dv-tag-list">
                              {s.encrypted ? <span className="dv-tag" data-tone="ok">{tr('common.encrypted')}</span> : <span className="dv-tag">{tr('common.plaintext')}</span>}
                              {s.includeSecrets ? <span className="dv-tag" data-tone="brand">{tr('common.secrets')}</span> : null}
                              {state.status === 'ok' ? <span className="dv-tag" data-tone="ok">{tr('snapshots.verifiedPrefix')}</span> : null}
                            </span>
                          </td>
                          <td className="dv-td-right">
                            <div className="dv-row dv-gap-1" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              {onRestoreRequest ? (
                                <Button size="sm" variant="ghost" icon={<IconRestore size={13} />} onClick={() => onRestoreRequest(s.targetId, s.id)}>
                                  {tr('snapshots.restoreAction')}
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                icon={state.status === 'ok' ? <IconCheck size={13} /> : <IconShieldCheck size={13} />}
                                onClick={() => requestVerify(s)}
                                loading={state.status === 'running'}
                                aria-label={`${tr('common.verify')} ${s.id}`}
                              >
                                {tr('common.verify')}
                              </Button>
                              <IconButton
                                label={`${tr('common.delete')} ${s.id}`}
                                variant="danger"
                                onClick={() => setDeleteId(key)}
                                disabled={busy}
                              >
                                <IconTrash size={14} />
                              </IconButton>
                            </div>
                            {state.status === 'fail' ? (
                              <div className="dv-hint" data-tone="error" style={{ maxWidth: 260, marginLeft: 'auto' }}>
                                {tr('snapshots.verifyFail', { id: s.id, error: state.error })}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length > MAX_RENDER ? (
                <span className="dv-hint">{tr('restore.diffTruncated', { shown: MAX_RENDER })}</span>
              ) : null}
              <span className="dv-hint">{tr('snapshots.mobileHint')}</span>
            </>
          )}
        </CardBody>
      </Card>

      {onSaveRetention ? (
        <Card>
          <CardHeader icon={<IconClock size={18} />} title={tr('snapshots.retentionTitle')} subtitle={tr('snapshots.retentionSubtitle')} />
          <CardBody>
            <div className="dv-row dv-gap-3">
              <Field label={tr('snapshots.retentionKeep')} htmlFor={`${ids}-keep`} className="dv-grow">
                <div className="dv-row" style={{ flexWrap: 'nowrap' }}>
                  <input
                    id={`${ids}-keep`}
                    type="number"
                    min={1}
                    max={200}
                    className="dv-input dv-num"
                    style={{ width: 120 }}
                    placeholder="10"
                    value={retentionDraft}
                    onChange={(e) => setRetentionDraft(e.target.value)}
                  />
                  <span className="dv-small dv-muted">{tr('snapshots.retentionUnit')}</span>
                </div>
              </Field>
              <Button
                variant="primary"
                disabled={!retentionDraft || Number(retentionDraft) < 1}
                onClick={() => onSaveRetention({ keepLast: Math.min(200, Math.max(1, Number(retentionDraft))) })}
              >
                {tr('snapshots.retentionSave')}
              </Button>
            </div>
            {retentionDraft && Number(retentionDraft) >= 1 ? (
              <p className="dv-hint">
                {perTargetPrune > 0 ? tr('snapshots.retentionWillDelete', { count: perTargetPrune }) : tr('snapshots.retentionSafe')}
                {' · '}
                {tr('snapshots.retentionRecent')}
              </p>
            ) : (
              <p className="dv-hint">{tr('snapshots.retentionMin')}</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteId(null)}
        title={tr('snapshots.deleteTitle')}
        description={
          deleteTarget
            ? tr('snapshots.deleteDesc', { id: deleteTarget.id, target: targetLabel(deleteTarget.targetId) })
            : undefined
        }
        confirmLabel={tr('snapshots.deleteConfirm')}
        busy={busy}
        onConfirm={() => {
          if (!deleteTarget) return
          onDelete(deleteTarget.targetId, deleteTarget.id)
          setDeleteId(null)
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
        title={tr('common.verify')}
        description={tr('snapshots.verifyPasswordHint')}
        icon={<IconCheckCircle size={18} />}
        actions={
          <>
            <Button variant="outline" onClick={() => setVerifyTarget(null)} disabled={verifying}>{tr('app.cancel')}</Button>
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
              {tr('common.verify')}
            </Button>
          </>
        }
      >
        <Field label={tr('snapshots.verifyPassword')} htmlFor={`${ids}-verify-pass`} required>
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
        {verifying ? <LoadingInline label={tr('snapshots.verifying', { id: verifyTarget?.id ?? '' })} /> : null}
      </Dialog>
    </div>
  )
}
