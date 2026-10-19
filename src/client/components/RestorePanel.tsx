import { useEffect, useId, useMemo, useState } from 'react'
import type { ConflictStrategy, DiffItem, RestorePreview, SnapshotInfo, StorageTargetConfig } from '../../core/types.js'
import { useT, type Translate } from '../i18n.js'
import { formatBytes, formatDateTime, relativeLabel } from '../lib/format.js'
import { newestFirst } from '../lib/targets.js'
import {
  Banner,
  Button,
  Card,
  CardHead,
  Collapsible,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingInline,
  OptionTile,
  PasswordInput,
  Rows,
  SearchInput,
  Segmented,
  Select,
  SettingRow,
  Switch,
  Tag,
} from './ui.js'

export interface RestorePanelProps {
  targets: StorageTargetConfig[]
  snapshots: SnapshotInfo[]
  preview: RestorePreview | null
  busy: boolean
  message: string | null
  error: string | null
  /** `conflict` / `conflicts` annotate the preview so the diff shows per-item `resolution`. */
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
    createRollbackSnapshot?: boolean
    reinstallPlugins?: boolean
  }) => void
  loading?: boolean
  /** Preselect a snapshot (e.g. from the Snapshots tab). */
  initialTargetId?: string
  initialSnapshotId?: string
  onNavigateStorage?: () => void
}

type ConflictChoice = ConflictStrategy
type DiffFilter = 'all' | DiffItem['change']
type Outcome = 'apply' | 'skip' | 'noop'

const MAX_ROWS = 200
/** Global default sent with preview/restore; per-path choices override it. */
const DEFAULT_CONFLICT: ConflictChoice = 'use-backup'

function sameConflicts(a: Record<string, ConflictStrategy>, b: Record<string, ConflictStrategy>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => a[k] === b[k])
}

/** How a diff row will be handled by restore, mirroring the backend rules. */
function outcomeOf(item: DiffItem, strategy: ConflictChoice): Outcome {
  if (item.change === 'add') return 'apply'
  if (item.change === 'change') return strategy === 'use-backup' ? 'apply' : 'skip'
  return 'noop'
}

function changeLabel(tr: Translate, change: DiffItem['change']): string {
  switch (change) {
    case 'add': return tr('restore.added')
    case 'change': return tr('restore.changed')
    case 'remove': return tr('restore.removed')
    default: return tr('restore.unchanged')
  }
}

function strategyLabel(tr: Translate, strategy: ConflictChoice): string {
  return strategy === 'use-backup' ? tr('restore.useBackup') : tr('restore.keepCurrent')
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
  const [showPasswordError, setShowPasswordError] = useState(false)
  const [ack, setAck] = useState(false)
  const [rollback, setRollback] = useState(true)
  const [reinstall, setReinstall] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all')

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
      .sort(newestFirst)
  }, [snapshots, targetId, search])

  useEffect(() => {
    if (snapshotId && filtered.some((s) => s.id === snapshotId)) return
    setSnapshotId(filtered[0]?.id ?? '')
  }, [filtered, snapshotId])

  const selected = snapshots.find((s) => s.id === snapshotId && (!targetId || s.targetId === targetId))
    ?? snapshots.find((s) => s.id === snapshotId)
  const needsPassword = Boolean(selected?.encrypted)

  // Reset per-path choices whenever a new preview arrives.
  const previewKey = preview ? `${preview.snapshotId}:${preview.added}:${preview.changed}:${preview.removed}` : null
  useEffect(() => {
    setChoices({})
    setAck(false)
    setDiffFilter('all')
  }, [previewKey])

  const changes = useMemo(
    () => (preview ? preview.items.filter((i) => i.change === 'add' || i.change === 'change') : []),
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

  // Global default (as last sent) + per-path map for the next request.
  const requestedConflict: ConflictChoice = preview?.conflict ?? DEFAULT_CONFLICT
  const requestedConflicts = useMemo(() => preview?.conflicts ?? {}, [preview])

  /**
   * Re-fetch the preview when a per-path decision differs from what the current
   * preview was computed with, so `items[].resolution` stays in sync with what
   * `POST /restore` would do. Debounced.
   */
  useEffect(() => {
    if (!preview || busy) return
    if (sameConflicts(choices, requestedConflicts)) return
    const timer = setTimeout(() => {
      onPreview({
        targetId: selected?.targetId ?? '',
        snapshotId: preview.snapshotId,
        password: needsPassword ? password : undefined,
        conflict: requestedConflict,
        conflicts: choices,
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [preview, busy, choices, requestedConflicts, onPreview, selected, needsPassword, password, requestedConflict])

  const applyCount = changes.filter((c) => outcomeOf(c, c.resolution ?? choiceFor(c.path)) === 'apply').length

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
    setAck(false)
    setShowPasswordError(false)
    if (!selected) return
    if (needsPassword && !password) {
      setShowPasswordError(true)
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
    if (!ack) return
    onRestore({
      targetId: selected?.targetId ?? '',
      snapshotId: preview.snapshotId,
      password: needsPassword ? password : undefined,
      conflict: requestedConflict,
      conflicts: choices,
      createRollbackSnapshot: rollback,
      reinstallPlugins: reinstall,
    })
  }

  if (targets.length === 0) {
    return (
      <>
        <p className="dv-section-desc">{tr('restore.desc')}</p>
        {error ? <Banner tone="error" title={tr('restore.failedTitle')}>{error}</Banner> : null}
        <EmptyState
          title={tr('restore.noTargetsTitle')}
          body={tr('restore.noTargetsBody')}
          actions={onNavigateStorage ? <Button variant="primary" onClick={onNavigateStorage}>{tr('backup.goStorage')}</Button> : null}
        />
      </>
    )
  }

  return (
    <>
      <p className="dv-section-desc">{tr('restore.desc')}</p>
      {error ? <Banner tone="error" title={tr('restore.failedTitle')}>{error}</Banner> : null}
      {message ? (
        <Banner tone="ok" title={tr('restore.successTitle')}>
          <div>{message}</div>
          <div className="dv-hint">{tr('restore.restartHint')}</div>
        </Banner>
      ) : null}

      <Card>
        <CardHead
          title={tr('restore.snapshotTitle')}
          sub={tr('restore.snapshotDesc', { count: snapshots.length })}
          actions={
            <>
              <Select
                aria-label={tr('restore.filterTarget')}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">{tr('common.allTargets')}</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </Select>
              <div style={{ width: 180 }}>
                <SearchInput value={search} onChange={setSearch} placeholder={tr('restore.search')} label={tr('restore.search')} />
              </div>
            </>
          }
        />
        <div className="dv-card-sep" aria-hidden="true" />
        {loading && snapshots.length === 0 ? (
          <LoadingInline label={tr('app.loading')} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={snapshots.length === 0 ? tr('restore.emptyTitle') : tr('restore.noMatch')}
            body={snapshots.length === 0 ? tr('restore.emptyBody') : undefined}
          />
        ) : (
          <div className="dv-options" role="radiogroup" aria-label={tr('restore.select')} style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.slice(0, 50).map((s) => (
              <OptionTile
                key={`${s.targetId}:${s.id}`}
                name={`${groupId}-snapshot`}
                checked={s.id === snapshotId && (!targetId || s.targetId === targetId)}
                onChange={() => {
                  setSnapshotId(s.id)
                  setAck(false)
                }}
                title={
                  <>
                    <span className="dv-mono">{s.id}</span>
                    <Tag tone={s.encrypted ? 'ok' : 'neutral'}>{s.encrypted ? tr('common.encrypted') : tr('common.plaintext')}</Tag>
                    {s.includeSecrets ? <Tag tone="warn">{tr('common.secrets')}</Tag> : null}
                  </>
                }
                description={
                  <>
                    {targetLabel(s.targetId)} · {formatDateTime(s.createdAt)}（{relativeLabel(tr, s.createdAt)}） · {formatBytes(s.bytes)}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </>
                }
              />
            ))}
          </div>
        )}
        {needsPassword ? (
          <Field
            label={tr('restore.password')}
            htmlFor="dv-restore-password"
            hint={tr('restore.passwordHint')}
            error={showPasswordError && !password ? tr('restore.passwordRequired') : null}
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
        <div className="dv-card-foot">
          <Button variant="primary" onClick={startPreview} disabled={!selected || busy} loading={busy && !preview}>
            {busy && !preview ? tr('restore.previewing') : tr('restore.preview')}
          </Button>
        </div>
      </Card>

      {preview ? (
        <Card>
          <CardHead
            title={tr('restore.diffTitle')}
            sub={tr('restore.diffDesc', {
              added: preview.added,
              changed: preview.changed,
              removed: preview.removed,
              unchanged: preview.unchanged,
            })}
            actions={
              <Segmented
                label={tr('restore.diffTitle')}
                value={diffFilter}
                onChange={setDiffFilter}
                options={[
                  { value: 'all', label: tr('restore.filter.all'), count: preview.items.length },
                  { value: 'add', label: tr('restore.filter.add'), count: preview.added },
                  { value: 'change', label: tr('restore.filter.change'), count: preview.changed },
                  { value: 'remove', label: tr('restore.filter.remove'), count: preview.removed },
                  { value: 'unchanged', label: tr('restore.filter.unchanged'), count: preview.unchanged },
                ]}
              />
            }
          />
          <div className="dv-card-sep" aria-hidden="true" />
          <span className="dv-card-sub dv-mono">{preview.snapshotId}</span>
          {preview.items.length === 0 ? (
            <span className="dv-hint">{tr('restore.diffEmpty')}</span>
          ) : (
            <>
              <div className="dv-scroll">
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th scope="col">{tr('restore.path')}</th>
                      <th scope="col">{tr('restore.category')}</th>
                      <th scope="col">{tr('restore.change')}</th>
                      <th scope="col">{tr('restore.resolution')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((i) => {
                      const strategy = i.resolution ?? choiceFor(i.path)
                      const outcome = outcomeOf(i, strategy)
                      return (
                        <tr key={`${i.change}:${i.path}`}>
                          <td><span className="dv-path dv-mono">{i.path}</span></td>
                          <td className="dv-muted">{i.category}</td>
                          <td className="dv-muted">{changeLabel(tr, i.change)}</td>
                          <td>
                            {i.change === 'add' || i.change === 'change'
                              ? <span className={outcome === 'skip' ? 'dv-muted' : undefined}>
                                  {strategyLabel(tr, strategy)} · {outcome === 'skip' ? tr('restore.willSkip') : tr('restore.willApply')}
                                </span>
                              : <span className="dv-muted">{tr('restore.noChange')}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <span className="dv-hint dv-num">
                {visibleItems.length} / {diffVisibleCount}
                {diffVisibleCount > MAX_ROWS ? ` · ${tr('restore.truncated', { shown: MAX_ROWS })}` : ''}
              </span>
            </>
          )}
          {preview.removed > 0 ? <span className="dv-hint">{tr('restore.removedNote')}</span> : null}
        </Card>
      ) : null}

      {preview && changes.length > 0 ? (
        <Card>
          <CardHead
            title={tr('restore.conflictTitle')}
            sub={tr('restore.conflictDesc')}
            actions={
              <>
                <span className="dv-hint dv-num">{tr('restore.conflictsSummary', { use: useCount, keep: keepCount })}</span>
                <Button size="sm" variant="quiet" onClick={() => setAll('use-backup')}>{tr('restore.useBackup')}</Button>
                <Button size="sm" variant="quiet" onClick={() => setAll('keep-current')}>{tr('restore.keepCurrent')}</Button>
              </>
            }
          />
          <div className="dv-card-sep" aria-hidden="true" />
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {changes.slice(0, MAX_ROWS).map((c) => (
              <div className="dv-conflict-row" key={c.path}>
                <span className="dv-conflict-main">
                  <Tag>{changeLabel(tr, c.change)}</Tag>
                  <span className="dv-conflict-path" title={c.path}>{c.path}</span>
                </span>
                <fieldset className="dv-segment" style={{ border: 0, margin: 0, padding: 2, flex: 'none' }}>
                  <legend className="dv-sr-only">{tr('restore.perItem', { path: c.path })}</legend>
                  <button
                    type="button"
                    aria-pressed={choiceFor(c.path) === 'use-backup'}
                    onClick={() => setChoice(c.path, 'use-backup')}
                  >
                    {tr('restore.useBackup')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={choiceFor(c.path) === 'keep-current'}
                    onClick={() => setChoice(c.path, 'keep-current')}
                  >
                    {tr('restore.keepCurrent')}
                  </button>
                </fieldset>
              </div>
            ))}
          </div>
          {changes.length > MAX_ROWS ? <span className="dv-hint">{tr('restore.truncated', { shown: MAX_ROWS })}</span> : null}
        </Card>
      ) : null}

      {preview && preview.pluginsToReinstall.length > 0 ? (
        <Collapsible summary={tr('restore.pluginsTitle', { count: preview.pluginsToReinstall.length })} defaultOpen>
          <div>{tr('restore.pluginsDesc')}</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {preview.pluginsToReinstall.map((p) => (
              <li key={`${p.profile ?? ''}:${p.name}`}>
                <span className="dv-mono">{p.name}</span>
                {p.version ? <span className="dv-muted">@{p.version}</span> : null}
                {p.profile ? <span className="dv-muted"> · {p.profile}</span> : null}
              </li>
            ))}
          </ul>
        </Collapsible>
      ) : null}

      {preview && preview.manualActions.length > 0 ? (
        <Banner tone="warn" title={tr('restore.manualTitle')}>
          <ul>
            {preview.manualActions.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </Banner>
      ) : null}

      {preview ? (
        <>
          <Rows label={tr('restore.confirmTitle')}>
            <SettingRow
              title={tr('restore.confirmTitle')}
              description={tr('restore.confirmDesc')}
              htmlFor="dv-restore-ack"
              control={
                <Switch id="dv-restore-ack" checked={ack} onChange={() => setAck((v) => !v)} />
              }
            />
            <SettingRow
              title={tr('restore.rollback')}
              htmlFor="dv-restore-rollback"
              control={
                <Switch id="dv-restore-rollback" checked={rollback} onChange={() => setRollback((v) => !v)} />
              }
            />
            <SettingRow
              title={tr('restore.managePlugins')}
              htmlFor="dv-restore-reinstall"
              control={
                <Switch id="dv-restore-reinstall" checked={reinstall} onChange={() => setReinstall((v) => !v)} />
              }
            />
          </Rows>
          <div className="dv-card-foot">
            <Button
              variant="danger"
              disabled={!ack || busy}
              onClick={() => {
                if (preview.removed > 0 || preview.changed > 0) setDialogOpen(true)
                else submitRestore()
              }}
            >
              {tr('restore.submit')}
            </Button>
          </div>
          {!ack ? <span className="dv-hint">{tr('restore.needConfirm')}</span> : null}
        </>
      ) : null}

      <ConfirmDialog
        open={dialogOpen}
        title={tr('restore.dialogTitle', { id: preview?.snapshotId ?? '' })}
        description={tr('restore.dialogBody', { apply: applyCount, keep: keepCount, removed: preview?.removed ?? 0 })}
        confirmLabel={busy ? tr('restore.submitting') : tr('restore.dialogConfirm')}
        busy={busy}
        onConfirm={() => {
          setDialogOpen(false)
          submitRestore()
        }}
        onClose={() => { if (!busy) setDialogOpen(false) }}
      >
        {busy ? <LoadingInline label={tr('restore.submitting')} /> : null}
      </ConfirmDialog>
    </>
  )
}

