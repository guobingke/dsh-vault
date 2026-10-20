import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ConflictStrategy, DiffItem, RestorePreview, RestoreResult, SnapshotInfo, StorageTargetConfig } from '../../core/types.js'
import { useT, type Translate } from '../i18n.js'
import { formatBytes, formatDateTime, relativeLabel } from '../lib/format.js'
import { newestFirst } from '../lib/targets.js'
const ROLLBACK_TARGET_ID = 'local-rollback'
import { localizeNotice, pluginRawDetail, pluginReasonText } from '../notices.js'
import { PathPicker, type FsBrowser } from './PathPicker.js'
import { DiffGroups } from './DiffGroups.js'
import { RestoreSummary } from './ResultSummary.js'
import {
  Banner,
  Button,
  Card,
  CardHead,
  Checkbox,
  Collapsible,
  ConfirmDialog,
  EmptyState,
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
  TextInput,
} from './ui.js'

type SourceMode = 'target' | 'import'

export interface RestorePanelProps {
  targets: StorageTargetConfig[]
  snapshots: SnapshotInfo[]
  preview: RestorePreview | null
  busy: boolean
  message: string | null
  error: string | null
  /** `conflict` / `conflicts` annotate the preview so the diff shows per-item `resolution`. */
  onPreview: (input: {
    targetId?: string
    snapshotId?: string
    importPath?: string
    password?: string
    conflict?: ConflictStrategy
    conflicts?: Record<string, ConflictStrategy>
  }) => void
  onRestore: (input: {
    targetId?: string
    snapshotId?: string
    importPath?: string
    password?: string
    conflict: ConflictStrategy
    /** Optional per-path decisions; unspecified paths fall back to `conflict`. */
    conflicts?: Record<string, ConflictStrategy>
    createRollbackSnapshot?: boolean
    reinstallPlugins?: boolean
    /** Write credential files from an encrypted snapshot that carries them (explicit opt-in). */
    includeSecrets?: boolean
    /** `profile:name` of git / tarball / URL plugin sources the user allowed to be fetched. */
    approvedPluginSources?: string[]
  }) => void
  loading?: boolean
  /** Re-attempt only the failed plugins of the shown result (no config rewrite). */
  onRetryFailed?: () => void
  retrying?: boolean
  /** Preselect a snapshot (e.g. from the Snapshots tab). */
  initialTargetId?: string
  initialSnapshotId?: string
  /** M-05: largest uncompressed snapshot the host unpacks. */
  archiveLimitBytes?: number
  onNavigateStorage?: () => void
  /** Filesystem access for the Browse… dialog (in-app browser + optional native chooser). */
  fs?: FsBrowser
  /** Last restore outcome: per-plugin install results are listed under the banner. */
  result?: RestoreResult | null
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
  archiveLimitBytes,
  busy,
  message,
  error,
  onPreview,
  onRestore,
  loading,
  initialTargetId,
  initialSnapshotId,
  onNavigateStorage,
  fs,
  result,
  onRetryFailed,
  retrying,
}: RestorePanelProps) {
  const tr = useT()
  const groupId = useId()
  const [pickerOpen, setPickerOpen] = useState(false)
  const topRef = useRef<HTMLParagraphElement | null>(null)
  // The restore button sits far below the banners; bring the outcome into view.
  useEffect(() => {
    if (result || message || error) topRef.current?.scrollIntoView?.({ block: 'start' })
  }, [result, message, error])

  const [sourceMode, setSourceMode] = useState<SourceMode>(
    initialTargetId || initialSnapshotId || snapshots.length ? 'target' : 'import',
  )
  const [targetId, setTargetId] = useState(initialTargetId ?? '')
  const [snapshotId, setSnapshotId] = useState(initialSnapshotId ?? '')
  const [importPath, setImportPath] = useState('')
  const [search, setSearch] = useState('')
  const [password, setPassword] = useState('')
  const [showPasswordError, setShowPasswordError] = useState(false)
  const [ack, setAck] = useState(false)
  const [rollback, setRollback] = useState(true)
  const [reinstall, setReinstall] = useState(true)
  const [withSecrets, setWithSecrets] = useState(true)
  /** Non-registry plugin sources the user allowed (H-06); reset per preview. */
  const [approvedSources, setApprovedSources] = useState<Record<string, boolean>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all')

  const targetLabel = (id: string): string => targets.find((t) => t.id === id)?.label ?? id
  const usingImport = sourceMode === 'import'

  // Keep the target filter valid. "" (all locations) is a valid user choice; only the
  // first default skips rollback snapshots so the newest real backup is preselected.
  const filterInit = useRef(false)
  useEffect(() => {
    if (usingImport || !snapshots.length) return
    if (filterInit.current && (targetId === '' || snapshots.some((s) => s.targetId === targetId))) return
    filterInit.current = true
    const has = (id?: string) => Boolean(id) && snapshots.some((s) => s.targetId === id)
    const realFirst = [...snapshots].sort(newestFirst).find((s) => s.targetId !== ROLLBACK_TARGET_ID)
    setTargetId(has(initialTargetId) ? initialTargetId! : realFirst?.targetId ?? '')
  }, [snapshots, targetId, initialTargetId, usingImport])
  const extraTargetIds = useMemo(
    () => [...new Set(snapshots.map((s) => s.targetId))].filter((id) => !targets.some((t) => t.id === id)),
    [snapshots, targets],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return snapshots
      .filter((s) => !targetId || s.targetId === targetId)
      .filter((s) => !q || s.id.toLowerCase().includes(q) || (s.notes ?? '').toLowerCase().includes(q))
      .sort(newestFirst)
  }, [snapshots, targetId, search])

  useEffect(() => {
    if (usingImport) return
    if (snapshotId && filtered.some((s) => s.id === snapshotId)) return
    setSnapshotId(filtered[0]?.id ?? '')
  }, [filtered, snapshotId, usingImport])

  const selected = usingImport
    ? null
    : snapshots.find((s) => s.id === snapshotId && (!targetId || s.targetId === targetId))
      ?? snapshots.find((s) => s.id === snapshotId)
  /** Target snapshots declare encryption; import paths always offer an optional password field. */
  const needsPassword = usingImport ? false : Boolean(selected?.encrypted)
  const showPasswordField = usingImport || needsPassword
  const canStartPreview = usingImport ? Boolean(importPath.trim()) : Boolean(selected)

  // Reset per-path choices whenever a new preview arrives.
  const previewKey = preview ? `${preview.snapshotId}:${preview.added}:${preview.changed}:${preview.removed}` : null
  useEffect(() => {
    setChoices({})
    setAck(false)
    setDiffFilter('all')
    // Imported files are untrusted: their git/URL plugin sources start unchecked.
    const next: Record<string, boolean> = {}
    for (const r of preview?.remotePluginSources ?? []) next[r.key] = !usingImport && r.trusted !== false
    setApprovedSources(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        targetId: usingImport ? undefined : selected?.targetId,
        snapshotId: usingImport ? undefined : preview.snapshotId,
        importPath: usingImport ? importPath.trim() : undefined,
        password: password || undefined,
        conflict: requestedConflict,
        conflicts: choices,
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [preview, busy, choices, requestedConflicts, onPreview, selected, password, requestedConflict, usingImport, importPath])

  const applyCount = changes.filter((c) => outcomeOf(c, c.resolution ?? choiceFor(c.path)) === 'apply').length

  function startPreview() {
    setAck(false)
    setShowPasswordError(false)
    if (!canStartPreview) return
    if (needsPassword && !password) {
      setShowPasswordError(true)
      return
    }
    onPreview({
      targetId: usingImport ? undefined : selected?.targetId,
      snapshotId: usingImport ? undefined : selected?.id,
      importPath: usingImport ? importPath.trim() : undefined,
      password: password || undefined,
      conflict: DEFAULT_CONFLICT,
      conflicts: choices,
    })
  }

  function submitRestore() {
    if (!preview) return
    if (!ack) return
    onRestore({
      targetId: usingImport ? undefined : selected?.targetId,
      snapshotId: usingImport ? undefined : preview.snapshotId,
      importPath: usingImport ? importPath.trim() : undefined,
      password: password || undefined,
      conflict: requestedConflict,
      conflicts: choices,
      createRollbackSnapshot: rollback,
      reinstallPlugins: reinstall,
      includeSecrets: Boolean(preview.secretsAvailable && withSecrets),
      approvedPluginSources: Object.entries(approvedSources).filter(([, v]) => v).map(([k]) => k),
    })
  }

  return (
    <>
      <p className="dv-section-desc" ref={topRef}>{tr('restore.desc')}</p>
      {error ? <Banner tone="error" title={tr('restore.failedTitle')}>{error}</Banner> : null}
      {result ? (
        <RestoreSummary result={result} onRetry={onRetryFailed} retrying={retrying} />
      ) : message ? (
        <Banner tone="ok" title={tr('restore.successTitle')}>
          <div>{message}</div>
          <div className="dv-hint">{tr('restore.restartHint')}</div>
        </Banner>
      ) : null}

      {result?.pluginResults?.length ? (
        <Collapsible summary={tr('restore.resultTitle')} defaultOpen={false}>
          <PluginResults result={result} />
        </Collapsible>
      ) : null}

      <Card>
        <CardHead title={tr('restore.sourceTitle')} sub={tr('restore.sourceDesc')} />
        <div className="dv-card-sep" aria-hidden="true" />
        <Rows>
          <SettingRow title={tr('restore.sourceMode')} description={tr('restore.sourceModeDesc')}>
            <select
              className="dv-input"
              value={sourceMode}
              onChange={(e) => {
                setSourceMode(e.target.value as SourceMode)
                setAck(false)
              }}
              aria-label={tr('restore.sourceMode')}
            >
              <option value="target">{tr('restore.source.target')}</option>
              <option value="import">{tr('restore.source.import')}</option>
            </select>
          </SettingRow>
        </Rows>
        {usingImport ? (
          <Field label={tr('restore.importPath')} htmlFor="dv-restore-import" hint={tr('restore.importPathHint') + (archiveLimitBytes ? ' ' + tr('restore.archiveLimit', { size: formatBytes(archiveLimitBytes) }) : '')}>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput
                id="dv-restore-import"
                value={importPath}
                onChange={(e) => setImportPath(e.target.value)}
                placeholder={tr('restore.importPathPlaceholder')}
                mono
              />
              {fs ? (
                <Button variant="quiet" onClick={() => setPickerOpen(true)}>
                  {tr('restore.browse')}
                </Button>
              ) : null}
            </div>
            {fs ? (
              <PathPicker
                open={pickerOpen}
                mode="open"
                fs={fs}
                initialPath={importPath}
                onClose={() => setPickerOpen(false)}
                onSelect={(p) => { setImportPath(p); setAck(false); setPickerOpen(false) }}
              />
            ) : null}
          </Field>
        ) : targets.length === 0 && snapshots.length === 0 ? (
          <EmptyState
            title={tr('restore.noTargetsTitle')}
            body={tr('restore.noTargetsBody')}
            actions={onNavigateStorage ? <Button variant="primary" onClick={onNavigateStorage}>{tr('backup.goStorage')}</Button> : null}
          />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <Select
                aria-label={tr('restore.filterTarget')}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">{tr('common.allTargets')}</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
                {extraTargetIds.map((id) => (
                  <option key={id} value={id}>{id === ROLLBACK_TARGET_ID ? tr('restore.rollbackTarget') : id}</option>
                ))}
              </Select>
              <div style={{ width: 180 }}>
                <SearchInput value={search} onChange={setSearch} placeholder={tr('restore.search')} label={tr('restore.search')} />
              </div>
            </div>
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
          </>
        )}
        {showPasswordField ? (
          <Field
            label={tr('restore.password')}
            htmlFor="dv-restore-password"
            hint={usingImport ? tr('restore.importPasswordHint') : tr('restore.passwordHint')}
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
          <Button variant="primary" onClick={startPreview} disabled={!canStartPreview || busy} loading={busy && !preview}>
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
          />
          <div className="dv-card-sep" aria-hidden="true" />
          <span className="dv-card-sub dv-mono">{preview.snapshotId}</span>
          {preview.items.length === 0 ? (
            <span className="dv-hint">{tr('restore.diffEmpty')}</span>
          ) : (
            <DiffGroups
              items={preview.items}
              renderOutcome={(i) => {
                if (i.change !== 'add' && i.change !== 'change') return <span className="dv-muted">{tr('restore.noChange')}</span>
                const strategy = i.resolution ?? choiceFor(i.path)
                const outcome = outcomeOf(i, strategy)
                return (
                  <span className={outcome === 'skip' ? 'dv-muted' : undefined}>
                    {strategyLabel(tr, strategy)} · {outcome === 'skip' ? tr('restore.willSkip') : tr('restore.willApply')}
                  </span>
                )
              }}
            />
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
            {preview.manualActions.map((m) => <li key={m}>{localizeNotice(m, tr)}</li>)}
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
            {preview.secretsAvailable ? (
              <SettingRow
                title={tr('restore.withSecrets')}
                description={tr('restore.withSecretsDesc')}
                htmlFor="dv-restore-secrets"
                control={
                  <Switch id="dv-restore-secrets" checked={withSecrets} onChange={() => setWithSecrets((v) => !v)} />
                }
              />
            ) : null}
          </Rows>
          {reinstall && preview.remotePluginSources?.length ? (
            <div className="dv-plugin-sources" role="group" aria-label={tr('restore.remoteSourcesTitle')}>
              <div className="dv-check-title">{tr('restore.remoteSourcesTitle')}</div>
              <div className="dv-hint">{tr(usingImport ? 'restore.remoteSourcesImportHint' : 'restore.remoteSourcesHint')}</div>
              {preview.remotePluginSources.map((r) => (
                <Checkbox
                  key={r.key}
                  title={`${r.name} (${r.profile})`}
                  description={r.trusted === false ? `${r.source} — ${tr('restore.untrustedSource')}` : r.source}
                  checked={Boolean(approvedSources[r.key])}
                  onChange={() => setApprovedSources((prev) => ({ ...prev, [r.key]: !prev[r.key] }))}
                />
              ))}
            </div>
          ) : null}
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


const STATUS_TONE = { installed: 'ok', 'installed-from-backup': 'warn', 'already-present': 'ok', failed: 'danger', skipped: 'neutral' } as const

/** Per-plugin outcome of the last restore — a failure is never folded into "success". */
function PluginResults({
  result,
  onRetry,
  retrying,
}: {
  result: RestoreResult
  onRetry?: () => void
  retrying?: boolean
}) {
  const tr = useT()
  const rows = result.pluginResults ?? []
  const failed = rows.filter((r) => r.status === 'failed').length
  return (
    <Card>
      <CardHead
        title={tr('restore.resultTitle')}
        sub={tr('restore.resultDesc', { ok: rows.length - failed, failed })}
        actions={failed && onRetry ? (
          <Button size="sm" onClick={onRetry} loading={retrying} disabled={retrying} title={tr('restore.retryDesc')}>
            {retrying ? tr('restore.retrying') : tr('restore.retryFailed')}
          </Button>
        ) : undefined}
      />
      <div className="dv-card-sep" aria-hidden="true" />
      {rows.some((r) => r.status === 'installed-from-backup') ? (
        <p className="dv-small dv-muted" style={{ margin: '0 0 8px', padding: '0 4px' }}>{tr('restore.legend.fromBackup')}</p>
      ) : null}
      <ul className="dv-list" aria-label={tr('restore.resultTitle')}>
        {rows.map((r) => {
          const raw = pluginRawDetail(r, tr)
          return (
          <li key={`${r.profile}:${r.name}`} className="dv-list-item">
            <div className="dv-list-main">
              <span className="dv-list-title dv-mono">{r.name}</span>
              <span
                className={r.status === 'failed' ? 'dv-small dv-error-text' : 'dv-small dv-muted'}
                style={{ overflowWrap: 'anywhere' }}
              >
                {pluginReasonText(r, tr)}
              </span>
              {raw ? (
                <details className="dv-details">
                  <summary>{tr('restore.details')}</summary>
                  <pre className="dv-log">{raw}</pre>
                </details>
              ) : null}
            </div>
            <div className="dv-list-meta">
              <Tag>{r.profile}</Tag>
              <Tag tone={STATUS_TONE[r.status]}>{tr(`restore.status.${r.status}` as 'restore.status.failed')}</Tag>
            </div>
          </li>
          )
        })}
      </ul>
    </Card>
  )
}
