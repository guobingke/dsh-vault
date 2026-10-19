import { useEffect, useId, useMemo, useState } from 'react'
import type { ConflictStrategy, DiffItem, RestorePreview, SnapshotInfo, StorageTargetConfig } from '../../core/types.js'
import { useT, type Translate } from '../i18n.js'
import { formatBytes, formatDateTime, relativeLabel } from '../lib/targets.js'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Collapsible,
  ConfirmDialog,
  CtaButton,
  EmptyState,
  ErrorState,
  Field,
  LoadingInline,
  LoadingState,
  OptionTile,
  PageHeader,
  PasswordInput,
  SearchInput,
  Segmented,
  SelectField,
  StatusDot,
  TextInput,
} from './ui.js'
import type { ReactNode } from 'react'
import {
  IconAlert,
  IconArchive,
  IconCheck,
  IconFileEdit,
  IconFileMinus,
  IconFilePlus,
  IconInbox,
  IconKey,
  IconLock,
  IconRestore,
  IconShieldCheck,
  IconTerminal,
} from './Icons.js'

export interface RestorePanelProps {
  targets: StorageTargetConfig[]
  snapshots: SnapshotInfo[]
  preview: RestorePreview | null
  busy: boolean
  message: string | null
  error: string | null
  /**
   * `conflict` / `conflicts` annotate the preview so the diff list can show the
   * per-item `resolution`.
   */
  onPreview: (input: {
    targetId: string
    snapshotId: string
    password?: string
    conflict?: ConflictStrategy
    conflicts?: Record<string, ConflictStrategy>
  }) => void
  onRestore: (input: {
    targetId: string
    snapshotId: string
    password?: string
    conflict: ConflictStrategy
    /** Optional per-path decisions; unspecified paths fall back to `conflict`. */
    conflicts?: Record<string, ConflictStrategy>
  }) => void
  /** Optional: loading state while the parent fetches snapshots. */
  loading?: boolean
  /** Optional: preselect a snapshot (e.g. from the Snapshots page). */
  initialTargetId?: string
  initialSnapshotId?: string
  onNavigateStorage?: () => void
}

type ConflictChoice = ConflictStrategy
type DiffFilter = 'all' | DiffItem['change']

const MAX_ROWS = 200
/** Global default sent with preview/restore; per-path choices override it. */
const DEFAULT_CONFLICT: ConflictChoice = 'use-backup'

function sameConflicts(a: Record<string, ConflictStrategy>, b: Record<string, ConflictStrategy>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => a[k] === b[k])
}

type Outcome = 'apply' | 'skip' | 'noop'

/** How a diff row will be handled by restore, mirroring the backend rules. */
function outcomeOf(item: DiffItem, strategy: ConflictChoice): Outcome {
  if (item.change === 'add') return 'apply'
  if (item.change === 'change') return strategy === 'use-backup' ? 'apply' : 'skip'
  return 'noop'
}

function strategyLabel(tr: Translate, strategy: ConflictChoice): string {
  return strategy === 'use-backup' ? tr('restore.conflictUseBackup') : tr('restore.conflictKeepCurrent')
}

function outcomeMeta(tr: Translate, item: DiffItem, strategy: ConflictChoice): { tone: 'ok' | 'warn' | 'neutral'; label: string; title: string } {
  const outcome = outcomeOf(item, strategy)
  if (outcome === 'apply') {
    return { tone: 'ok', label: tr('restore.resolutionApply'), title: tr('restore.resolutionApplyTitle') }
  }
  if (outcome === 'skip') {
    return { tone: 'warn', label: tr('restore.resolutionSkip'), title: tr('restore.resolutionSkipTitle') }
  }
  return {
    tone: 'neutral',
    label: tr('restore.resolutionNoop'),
    title: item.change === 'remove' ? tr('restore.resolutionRemoveTitle') : tr('restore.resolutionNoopTitle'),
  }
}

function changeMeta(tr: Translate, change: DiffItem['change']): { label: string; tone: 'add' | 'change' | 'remove' | 'neutral'; icon: ReactNode } {
  switch (change) {
    case 'add':
      return { label: tr('restore.diffAdded'), tone: 'add', icon: <IconFilePlus size={12} /> }
    case 'change':
      return { label: tr('restore.diffChanged'), tone: 'change', icon: <IconFileEdit size={12} /> }
    case 'remove':
      return { label: tr('restore.diffRemoved'), tone: 'remove', icon: <IconFileMinus size={12} /> }
    default:
      return { label: tr('restore.diffUnchanged'), tone: 'neutral', icon: <IconCheck size={12} /> }
  }
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
  loading,
  initialTargetId,
  initialSnapshotId,
  onNavigateStorage,
}: RestorePanelProps) {
  const tr = useT()
  const groupId = useId()

  const [targetId, setTargetId] = useState(initialTargetId ?? '')
  const [snapshotId, setSnapshotId] = useState(initialSnapshotId ?? '')
  const [search, setSearch] = useState('')
  const [password, setPassword] = useState('')
  const [showPreviewPassword, setShowPreviewPassword] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [ack, setAck] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all')
  const [enterPasswordOpen, setEnterPasswordOpen] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const targetLabel = (id: string): string => targets.find((t) => t.id === id)?.label ?? id

  // Keep the target filter valid.
  useEffect(() => {
    if (!targetId || !snapshots.some((s) => s.targetId === targetId)) {
      const preferred = initialTargetId && snapshots.some((s) => s.targetId === initialTargetId)
        ? initialTargetId
        : snapshots[0]?.targetId ?? ''
      setTargetId(preferred)
    }
  }, [snapshots, targetId, initialTargetId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return snapshots
      .filter((s) => !targetId || s.targetId === targetId)
      .filter((s) => !q || s.id.toLowerCase().includes(q) || (s.notes ?? '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  }, [snapshots, targetId, search])

  useEffect(() => {
    if (snapshotId && filtered.some((s) => s.id === snapshotId)) return
    setSnapshotId(filtered[0]?.id ?? '')
  }, [filtered, snapshotId])

  const selected = snapshots.find((s) => s.id === snapshotId && (!targetId || s.targetId === targetId))
    ?? snapshots.find((s) => s.id === snapshotId)
  const selectedTarget = selected ? targets.find((t) => t.id === selected.targetId) : undefined
  const needsPassword = Boolean(selected?.encrypted)

  // Reset per-path choices whenever a new preview arrives.
  const previewKey = preview ? `${preview.snapshotId}:${preview.added}:${preview.changed}:${preview.removed}` : null
  useEffect(() => {
    setChoices({})
    setAck(false)
    setConfirmed(false)
    setDiffFilter('all')
  }, [previewKey])

  const changes = useMemo(
    () => (preview ? preview.items.filter((i) => i.change === 'add' || i.change === 'change') : []),
    [preview],
  )
  const removals = useMemo(
    () => (preview ? preview.items.filter((i) => i.change === 'remove') : []),
    [preview],
  )

  const choiceFor = (path: string): ConflictChoice => choices[path] ?? DEFAULT_CONFLICT
  const setChoice = (path: string, value: ConflictChoice) => setChoices((prev) => ({ ...prev, [path]: value }))
  const setAll = (value: ConflictChoice) => {
    const next: Record<string, ConflictChoice> = {}
    for (const c of changes) next[c.path] = value
    setChoices(next)
  }

  const keepCount = changes.filter((c) => choiceFor(c.path) === 'keep-current').length
  const useCount = changes.length - keepCount
  const allKeep = changes.length > 0 && keepCount === changes.length

  // Effective decisions forwarded to the API: the per-path map plus the global
  // default (used for any path not listed, e.g. removals / unchanged rows).
  const requestedConflict: ConflictChoice = preview?.conflict ?? DEFAULT_CONFLICT
  const requestedConflicts = useMemo(() => preview?.conflicts ?? {}, [preview])

  /**
   * Re-fetch the preview whenever a per-path decision differs from what the
   * current preview was computed with, so `items[].resolution` (and the
   * badges in the diff list) stay in sync with the conflict panel.
   */
  useEffect(() => {
    if (!preview || busy) return
    if (sameConflicts(choices, requestedConflicts)) return
    const timer = setTimeout(() => {
      onPreview({
        targetId: selectedTarget?.id ?? selected?.targetId ?? '',
        snapshotId: preview.snapshotId,
        password: needsPassword ? password : undefined,
        conflict: requestedConflict,
        conflicts: choices,
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [preview, busy, choices, requestedConflicts, onPreview, selectedTarget, selected, needsPassword, password, requestedConflict])

  const resolutionCounts = useMemo(() => {
    let apply = 0
    let skip = 0
    for (const item of changes) {
      if (outcomeOf(item, item.resolution ?? choiceFor(item.path)) === 'apply') apply++
      else skip++
    }
    return { apply, skip }
  }, [changes, choices])

  const currentStep: 1 | 2 | 3 | 4 = !preview ? 1 : ack && confirmed ? 4 : 3
  const steps = [
    { n: 1, label: tr('restore.step1') },
    { n: 2, label: tr('restore.step2') },
    { n: 3, label: tr('restore.step3') },
    { n: 4, label: tr('restore.step4') },
  ]

  const visibleItems = useMemo(() => {
    if (!preview) return []
    const base = diffFilter === 'all'
      ? [...preview.items].sort((a, b) => {
          const rank = { add: 0, change: 1, remove: 2, unchanged: 3 } as const
          return rank[a.change] - rank[b.change]
        })
      : preview.items.filter((i) => i.change === diffFilter)
    return base.slice(0, MAX_ROWS)
  }, [preview, diffFilter])

  const diffVisibleCount = useMemo(() => {
    if (!preview) return 0
    return diffFilter === 'all' ? preview.items.length : preview.items.filter((i) => i.change === diffFilter).length
  }, [preview, diffFilter])

  function startPreview() {
    setConfirmed(false)
    setAck(false)
    setPreviewError(null)
    if (!selected) return
    if (needsPassword && !password) {
      setPreviewError(tr('restore.passwordRequired'))
      setShowPreviewPassword(true)
      return
    }
    onPreview({
      targetId: selected.targetId,
      snapshotId: selected.id,
      password: needsPassword ? password : undefined,
      conflict: DEFAULT_CONFLICT,
      conflicts: choices,
    })
  }

  function submitRestore() {
    if (!preview) return
    if (!confirmed || !ack) return
    setDialogOpen(true)
    onRestore({
      targetId: selectedTarget?.id ?? selected?.targetId ?? '',
      snapshotId: preview.snapshotId,
      password: needsPassword ? password : undefined,
      conflict: requestedConflict,
      conflicts: choices,
    })
  }

  const restoreDisabled = !preview || busy || !confirmed || !ack

  if (targets.length === 0) {
    return (
      <div className="dv-page">
        <PageHeader title={tr('restore.title')} subtitle={tr('restore.subtitle')} />
        {error ? <ErrorState error={error} /> : null}
        <EmptyState
          icon={<IconInbox size={22} />}
          title={tr('backup.noTargetsTitle')}
          body={tr('backup.noTargetsBody')}
          actions={
            onNavigateStorage ? (
              <Button variant="primary" onClick={onNavigateStorage}>{tr('backup.goStorage')}</Button>
            ) : null
          }
        />
      </div>
    )
  }

  return (
    <div className="dv-page">
      <PageHeader
        title={tr('restore.title')}
        subtitle={tr('restore.subtitle')}
        actions={
          <div className="dv-steps" aria-label={tr('restore.title')}>
            {steps.map((s) => (
              <span key={s.n} className="dv-step" data-state={currentStep === s.n ? 'active' : currentStep > s.n ? 'done' : 'idle'}>
                <span className="dv-step-num">{currentStep > s.n ? '✓' : s.n}</span>
                {s.label}
              </span>
            ))}
          </div>
        }
      />

      {error ? <Banner tone="error" title={tr('restore.failedTitle')}>{error}</Banner> : null}
      {previewError ? <Banner tone="error" onDismiss={() => setPreviewError(null)}>{previewError}</Banner> : null}
      {message ? (
        <Banner tone="ok" title={tr('restore.successTitle')}>
          <div>{message}</div>
          <p className="dv-hint dv-mt-1">{tr('restore.restartHint')}</p>
        </Banner>
      ) : null}

      <Card>
        <CardHeader
          icon={<IconArchive size={18} />}
          title={tr('restore.pickTitle')}
          subtitle={tr('restore.pickSubtitle')}
          actions={
            <>
              <SelectField
                aria-label={tr('restore.filterTarget')}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                style={{ width: 180 }}
              >
                <option value="">{tr('common.allTargets')}</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </SelectField>
              <div style={{ width: 220 }}>
                <SearchInput value={search} onChange={setSearch} placeholder={tr('restore.searchPlaceholder')} label={tr('restore.searchPlaceholder')} />
              </div>
            </>
          }
        />
        <CardBody>
          {busy && !preview ? (
            <LoadingState label={tr('restore.previewing')} />
          ) : loading ? (
            <LoadingInline label={tr('app.loading')} />
          ) : filtered.length === 0 ? (
            snapshots.length === 0 ? (
              <EmptyState
                compact
                icon={<IconArchive size={22} />}
                title={tr('restore.noSnapshotsTitle')}
                body={tr('restore.noSnapshotsBody')}
              />
            ) : (
              <EmptyState
                compact
                icon={<IconArchive size={22} />}
                title={tr('snapshots.noMatch')}
                body={tr('restore.noSearchMatch')}
              />
            )
          ) : (
            <div className="dv-options" role="radiogroup" aria-label={tr('restore.pickTitle')} style={{ maxHeight: 340, overflow: 'auto' }}>
              {filtered.slice(0, 50).map((s) => (
                <OptionTile
                  key={`${s.targetId}:${s.id}`}
                  name={`${groupId}-snapshot`}
                  checked={s.id === snapshotId && (!targetId || s.targetId === targetId)}
                  onChange={() => {
                    setSnapshotId(s.id)
                    setConfirmed(false)
                    setAck(false)
                  }}
                  icon={s.encrypted ? <IconLock size={15} /> : <IconArchive size={15} />}
                  title={
                    <span className="dv-row dv-gap-2">
                      <span className="dv-mono">{s.id}</span>
                      {s.encrypted ? <Badge tone="ok">{tr('common.encrypted')}</Badge> : <Badge>{tr('common.plaintext')}</Badge>}
                      {s.includeSecrets ? <Badge tone="warn" icon={<IconKey size={10} />}>{tr('common.secrets')}</Badge> : null}
                    </span>
                  }
                  description={
                    <span className="dv-row dv-gap-2">
                      <Badge tone="brand">{targetLabel(s.targetId)}</Badge>
                      <span>{formatDateTime(s.createdAt)}（{relativeLabel(tr, s.createdAt)}）</span>
                      <span className="dv-num">{formatBytes(s.bytes)}</span>
                      {s.notes ? <span className="dv-truncate">· {s.notes}</span> : null}
                    </span>
                  }
                />
              ))}
            </div>
          )}

          {needsPassword ? (
            <Field
              label={tr('restore.passwordLabel')}
              htmlFor="dv-restore-password"
              hint={tr('restore.passwordHint')}
              error={showPreviewPassword && !password ? tr('restore.passwordRequired') : null}
            >
              <PasswordInput
                id="dv-restore-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') startPreview()
                }}
              />
            </Field>
          ) : null}

          <div className="dv-row-between">
            <span className="dv-hint">
              {selected ? `${tr('restore.selected')}: ` : null}
              {selected ? <code className="dv-mono">{selected.id}</code> : null}
            </span>
            <Button
              variant="primary"
              icon={<IconShieldCheck size={15} />}
              onClick={startPreview}
              disabled={!selected || busy}
              loading={busy && !preview}
            >
              {busy && !preview ? tr('restore.previewing') : tr('restore.previewBtn')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {preview ? (
        <>
          <div className="dv-kpi">
            <DiffStat label={tr('restore.diffAdded')} value={preview.added} tone="add" icon={<IconFilePlus size={14} />} />
            <DiffStat label={tr('restore.diffChanged')} value={preview.changed} tone="change" icon={<IconFileEdit size={14} />} />
            <DiffStat label={tr('restore.diffRemoved')} value={preview.removed} tone="remove" icon={<IconFileMinus size={14} />} />
            <DiffStat label={tr('restore.diffUnchanged')} value={preview.unchanged} tone="neutral" icon={<IconCheck size={14} />} />
          </div>

          <Card>
            <CardHeader
              icon={<IconRestore size={18} />}
              title={tr('restore.diffTitle')}
              subtitle={<span className="dv-mono">{preview.snapshotId}</span>}
              actions={
                <Segmented
                  label={tr('restore.diffTitle')}
                  value={diffFilter}
                  onChange={setDiffFilter}
                  options={[
                    { value: 'all', label: tr('restore.filterAll'), count: preview.items.length },
                    { value: 'add', label: tr('restore.filter.add'), count: preview.added },
                    { value: 'change', label: tr('restore.filter.change'), count: preview.changed },
                    { value: 'remove', label: tr('restore.filter.remove'), count: preview.removed },
                    { value: 'unchanged', label: tr('restore.filter.unchanged'), count: preview.unchanged },
                  ]}
                />
              }
            />
            <CardBody>
              {preview.items.length === 0 ? (
                <EmptyState compact icon={<IconCheck size={22} />} title={tr('restore.diffEmpty')} />
              ) : (
                <>
                  <div className="dv-scroll">
                    <table className="dv-table dv-diff-table">
                      <thead>
                        <tr>
                          <th>{tr('restore.path')}</th>
                          <th>{tr('restore.category')}</th>
                          <th className="dv-th-right">{tr('restore.change')}</th>
                          <th className="dv-th-right">{tr('restore.resolution')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleItems.map((i) => {
                          const meta = changeMeta(tr, i.change)
                          const strategy = i.resolution ?? choiceFor(i.path)
                          const outcome = outcomeMeta(tr, i, strategy)
                          return (
                            <tr key={`${i.change}:${i.path}`} data-change={i.change}>
                              <td data-change={i.change} style={{ maxWidth: 420 }}>
                                <span className="dv-path dv-mono" style={{ overflowWrap: 'anywhere' }}>{i.path}</span>
                              </td>
                              <td><span className="dv-tag">{i.category}</span></td>
                              <td className="dv-td-right">
                                <Badge tone={meta.tone}>{meta.icon}{meta.label}</Badge>
                              </td>
                              <td className="dv-td-right">
                                <span className="dv-row dv-gap-1" style={{ justifyContent: 'flex-end' }}>
                                  <Badge tone={strategy === 'use-backup' ? 'brand' : 'neutral'} title={tr('restore.resolutionHint')}>
                                    {strategyLabel(tr, strategy)}
                                  </Badge>
                                  <Badge tone={outcome.tone} title={outcome.title}>{outcome.label}</Badge>
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="dv-row-between dv-hint">
                    <span className="dv-num">{visibleItems.length} / {diffVisibleCount}</span>
                    {diffVisibleCount > MAX_ROWS ? <span>{tr('restore.diffTruncated', { shown: MAX_ROWS })}</span> : null}
                  </div>
                </>
              )}
              {preview.removed > 0 ? (
                <Banner tone="warn" icon={<IconAlert size={16} />}>{tr('restore.removedNote')}</Banner>
              ) : null}
            </CardBody>
          </Card>

          {changes.length > 0 ? (
            <Card>
              <CardHeader
                icon={<IconAlert size={18} />}
                title={tr('restore.conflictTitle')}
                subtitle={tr('restore.conflictSubtitle')}
                actions={
                  <span className="dv-row dv-gap-2">
                    <span className="dv-small dv-muted">{tr('restore.bulk')}</span>
                    <Button size="sm" variant="ghost" onClick={() => setAll('use-backup')}>{tr('restore.conflictUseBackup')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAll('keep-current')}>{tr('restore.conflictKeepCurrent')}</Button>
                  </span>
                }
              />
              <CardBody>
                <div className="dv-row-between dv-small">
                  <span className="dv-hint">{tr('restore.onlyChanged')}</span>
                  <span className="dv-row dv-gap-2">
                    <Badge tone="ok">{tr('restore.resolutionApplyCount', { count: resolutionCounts.apply })}</Badge>
                    <Badge tone="warn">{tr('restore.resolutionSkipCount', { count: resolutionCounts.skip })}</Badge>
                  </span>
                </div>
                <div className="dv-conflict-list" style={{ maxHeight: 360, overflow: 'auto' }}>
                  {changes.slice(0, 200).map((c) => (
                    <ConflictRow key={c.path} item={c} value={choiceFor(c.path)} onChange={(v) => setChoice(c.path, v)} tr={tr} groupId={groupId} />
                  ))}
                </div>
                {changes.length > 200 ? <span className="dv-hint">{tr('restore.diffTruncated', { shown: 200 })}</span> : null}
              </CardBody>
            </Card>
          ) : null}

          {preview.pluginsToReinstall.length > 0 ? (
            <Collapsible summary={<>{tr('restore.pluginsTitle')} <Badge tone="info">{preview.pluginsToReinstall.length}</Badge></>} defaultOpen>
              <div className="dv-stack dv-mt-2">
                <div className="dv-row dv-gap-2">
                  <StatusDot tone="brand" />
                  <span className="dv-small">{tr('restore.pluginsReinstall')}</span>
                </div>
                <ul className="dv-list-plain dv-small">
                  {preview.pluginsToReinstall.map((p) => (
                    <li key={`${p.profile ?? ''}:${p.name}`}>
                      <span className="dv-mono">{p.name}</span>
                      {p.version ? <span className="dv-muted">@{p.version}</span> : null}
                      {p.profile ? <span className="dv-faint"> · {p.profile}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </Collapsible>
          ) : null}

          {preview.manualActions.length > 0 ? (
            <Banner tone="warn" title={tr('restore.manualTitle')} icon={<IconTerminal size={16} />}>
              <ul className="dv-list-plain">
                {preview.manualActions.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </Banner>
          ) : null}

          <Card>
            <CardHeader icon={<IconShieldCheck size={18} />} title={tr('restore.confirmTitle')} />
            <CardBody>
              <Banner tone="warn" title={tr('restore.dangerTitle')} icon={<IconAlert size={16} />}>
                {tr('restore.dangerBody')}
              </Banner>
              <p className="dv-small">
                {allKeep ? tr('restore.confirmSummaryKeepAll') : tr('restore.confirmSummary', {
                  apply: useCount,
                  skip: keepCount,
                  removed: preview.removed,
                })}
              </p>
              <div className="dv-stack">
                <Checkbox
                  title={tr('restore.rollback')}
                  description={tr('restore.rollbackDesc')}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <Checkbox
                  title={tr('restore.dangerAck', { id: preview.snapshotId })}
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
              </div>
              <div className="dv-row">
                <CtaButton
                  icon={<IconRestore size={18} />}
                  disabled={restoreDisabled}
                  onClick={submitRestore}
                >
                  {tr('restore.submit')}
                </CtaButton>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirmed(false)
                    setAck(false)
                  }}
                >
                  {tr('app.cancel')}
                </Button>
              </div>
              {!confirmed || !ack ? <p className="dv-hint">{tr('restore.needAck')}</p> : null}
            </CardBody>
          </Card>
        </>
      ) : null}

      <ConfirmDialog
        open={dialogOpen}
        title={tr('restore.submit')}
        description={tr('restore.dangerBody')}
        confirmLabel={busy ? tr('restore.submitting') : tr('restore.submit')}
        busy={busy}
        onConfirm={submitRestore}
        onClose={() => { if (!busy) setDialogOpen(false) }}
      >
        <dl className="dv-kv">
          <dt>{tr('common.snapshot')}</dt>
          <dd className="dv-mono">{preview?.snapshotId}</dd>
          <dt>{tr('common.target')}</dt>
          <dd>{selectedTarget?.label ?? selected?.targetId}</dd>
          <dt>{tr('restore.conflictUseBackup')}</dt>
          <dd className="dv-num">{useCount}</dd>
          <dt>{tr('restore.conflictKeepCurrent')}</dt>
          <dd className="dv-num">{keepCount}</dd>
          <dt>{tr('restore.diffRemoved')}</dt>
          <dd className="dv-num">{preview?.removed ?? 0}</dd>
        </dl>
        {busy ? (
          <div className="dv-stack dv-mt-2">
            <p className="dv-small dv-muted">{tr('restore.rollbackDesc')}</p>
            <div className="dv-loading-inline" role="status" aria-live="polite">
              <span className="dv-spinner" aria-hidden="true" />
              {tr('restore.submitting')}
            </div>
            <div className="dv-progress" data-indeterminate="true" role="progressbar" aria-label={tr('restore.submitting')}>
              <span />
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

function DiffStat({ label, value, tone, icon }: { label: string; value: number; tone: 'add' | 'change' | 'remove' | 'neutral'; icon: ReactNode }) {
  return (
    <div className="dv-stat" data-tone={tone}>
      <div className="dv-stat-head">
        <span aria-hidden="true" style={{ color: `var(--dv-${tone === 'neutral' ? 'text-faint' : tone})` }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="dv-stat-value" style={{ color: tone === 'neutral' ? 'var(--dv-text-faint)' : `var(--dv-${tone})` }}>{value}</div>
    </div>
  )
}

function ConflictRow({
  item,
  value,
  onChange,
  tr,
  groupId,
}: {
  item: DiffItem
  value: ConflictChoice
  onChange: (v: ConflictChoice) => void
  tr: Translate
  groupId: string
}) {
  const meta = changeMeta(tr, item.change)
  return (
    <div className="dv-conflict">
      <Badge tone={meta.tone}>{meta.icon}{meta.label}</Badge>
      <span className="dv-conflict-path" title={item.path}>{item.path}</span>
      <div className="dv-radio-pair" role="radiogroup" aria-label={item.path}>
        <label>
          <input type="radio" name={`${groupId}-${item.path}`} value="use-backup" checked={value === 'use-backup'} onChange={() => onChange('use-backup')} />
          {tr('restore.conflictUseBackup')}
        </label>
        <label>
          <input type="radio" name={`${groupId}-${item.path}`} value="keep-current" checked={value === 'keep-current'} onChange={() => onChange('keep-current')} />
          {tr('restore.conflictKeepCurrent')}
        </label>
      </div>
    </div>
  )
}
