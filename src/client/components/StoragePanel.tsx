import { useId, useMemo, useRef, useState } from 'react'
import type { SnapshotInfo, StorageKind, StorageTargetConfig } from '../../core/types.js'
import { VaultApiError } from '../api.js'
import { useT, type Translate } from '../i18n.js'
import {
  formatBytes,
  formatDateTime,
  hasStoredSecret,
  relativeLabel,
  summarizeSnapshotsByTarget,
  targetKindLabel,
  targetLocation,
} from '../lib/targets.js'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  LoadingInline,
  OptionTile,
  PageHeader,
  PasswordInput,
  SelectField,
  SkeletonCard,
  StatusDot,
  TextInput,
  cx,
} from './ui.js'
import {
  IconAlert,
  IconCheck,
  IconGithub,
  IconHardDrive,
  IconPencil,
  IconPlus,
  IconServer,
  IconTrash,
  IconWifiOff,
  IconX,
  IconCloud,
  IconFolder,
  IconZap,
} from './Icons.js'

export interface StoragePanelProps {
  targets: StorageTargetConfig[]
  busy: boolean
  error: string | null
  message: string | null
  onUpsert: (target: StorageTargetConfig) => void
  onDelete: (id: string) => void
  /** Optional: all known snapshots, used for per-target counters. */
  snapshots?: SnapshotInfo[]
  /** Optional: initial fetch in flight. */
  loading?: boolean
  /**
   * Optional connection probe. Performs a read-only snapshot listing for the
   * target (existing GET /snapshots?targetId=). Must never throw raw secrets.
   */
  testConnection?: (target: StorageTargetConfig) => Promise<{ ok: boolean; count?: number; error?: string }>
  /** Optional: called after a successful save so the parent can reload. */
  onSaved?: (target: StorageTargetConfig) => void
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; count: number }
  | { status: 'fail'; error: string }

interface FormState {
  kind: StorageKind
  id: string
  label: string
  directory: string
  owner: string
  repo: string
  branch: string
  pathPrefix: string
  tokenCredential: string
  token: string
  url: string
  username: string
  password: string
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
  encryptByDefault: boolean
}

const EMPTY_FORM: FormState = {
  kind: 'local',
  id: '',
  label: '',
  directory: '',
  owner: '',
  repo: '',
  branch: '',
  pathPrefix: '',
  tokenCredential: 'GITHUB_TOKEN',
  token: '',
  url: '',
  username: '',
  password: '',
  endpoint: '',
  region: '',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: true,
  encryptByDefault: false,
}

const KIND_OPTIONS: Array<{ kind: StorageKind; labelKey: 'kind.localPlain' | 'kind.github' | 'kind.webdav' | 'kind.s3'; icon: JSX.Element }> = [
  { kind: 'local', labelKey: 'kind.localPlain', icon: <IconFolder size={15} /> },
  { kind: 'github', labelKey: 'kind.github', icon: <IconGithub size={15} /> },
  { kind: 'webdav', labelKey: 'kind.webdav', icon: <IconCloud size={15} /> },
  { kind: 's3', labelKey: 'kind.s3', icon: <IconServer size={15} /> },
]

function blankIdFor(kind: StorageKind, existing: StorageTargetConfig[]): string {
  const base = kind === 'local' ? 'local' : kind
  let n = 1
  let id = `${base}-${n}`
  while (existing.some((t) => t.id === id)) {
    n += 1
    id = `${base}-${n}`
  }
  return id
}

function formFromTarget(t: StorageTargetConfig): FormState {
  // Secrets (password / token / secret key) are never loaded back into the
  // form — the user must re-enter them to rotate or change credentials.
  const base: FormState = {
    ...EMPTY_FORM,
    kind: t.kind,
    id: t.id,
    label: t.label,
    encryptByDefault: Boolean(t.encryptByDefault),
  }
  if (t.kind === 'local') {
    return { ...base, directory: t.directory, encryptByDefault: t.encryptByDefault ?? base.encryptByDefault }
  }
  if (t.kind === 'github') {
    return {
      ...base,
      owner: t.owner,
      repo: t.repo,
      branch: t.branch ?? '',
      pathPrefix: t.pathPrefix ?? '',
      tokenCredential: t.tokenCredential ?? 'GITHUB_TOKEN',
    }
  }
  if (t.kind === 'webdav') {
    return { ...base, url: t.url, username: t.username ?? '', pathPrefix: t.pathPrefix ?? '' }
  }
  return {
    ...base,
    endpoint: t.endpoint,
    region: t.region ?? '',
    bucket: t.bucket,
    accessKeyId: t.accessKeyId,
    pathPrefix: t.pathPrefix ?? '',
    forcePathStyle: t.forcePathStyle ?? true,
  }
}

function buildTarget(form: FormState, existing?: StorageTargetConfig): StorageTargetConfig {
  const id = form.id.trim()
  const label = form.label.trim() || id
  const trimOr = (v: string): string | undefined => (v.trim() ? v.trim() : undefined)
  const encryptByDefault = form.encryptByDefault
  switch (form.kind) {
    case 'local':
      return { kind: 'local', id, label, directory: form.directory.trim(), encryptByDefault }
    case 'github':
      return {
        kind: 'github',
        id,
        label,
        owner: form.owner.trim(),
        repo: form.repo.trim(),
        branch: trimOr(form.branch),
        pathPrefix: trimOr(form.pathPrefix),
        tokenCredential: trimOr(form.tokenCredential),
        token: trimOr(form.token) ?? (existing?.kind === 'github' ? existing.token : undefined),
        encryptByDefault,
      }
    case 'webdav':
      return {
        kind: 'webdav',
        id,
        label,
        url: form.url.trim(),
        username: trimOr(form.username),
        // Empty secret fields keep the previously saved value (write-only inputs).
        password: trimOr(form.password) ?? (existing?.kind === 'webdav' ? existing.password : undefined),
        pathPrefix: trimOr(form.pathPrefix),
        encryptByDefault,
      }
    default:
      return {
        kind: 's3',
        id,
        label,
        endpoint: form.endpoint.trim(),
        region: trimOr(form.region),
        bucket: form.bucket.trim(),
        accessKeyId: form.accessKeyId.trim(),
        secretAccessKey: form.secretAccessKey.trim() || (existing?.kind === 's3' ? existing.secretAccessKey : ''),
        pathPrefix: trimOr(form.pathPrefix),
        forcePathStyle: form.forcePathStyle,
        encryptByDefault,
      }
  }
}

function requiredFields(form: FormState, tr: Translate): string[] {
  const out: string[] = []
  if (!form.id.trim()) out.push(tr('storage.id'))
  if (!form.label.trim()) out.push(tr('storage.label'))
  switch (form.kind) {
    case 'local':
      if (!form.directory.trim()) out.push(tr('storage.directory'))
      break
    case 'github':
      if (!form.owner.trim()) out.push(tr('storage.owner'))
      if (!form.repo.trim()) out.push(tr('storage.repo'))
      break
    case 'webdav':
      if (!form.url.trim()) out.push(tr('storage.url'))
      break
    case 's3':
      if (!form.endpoint.trim()) out.push(tr('storage.endpoint'))
      if (!form.bucket.trim()) out.push(tr('storage.bucket'))
      if (!form.accessKeyId.trim()) out.push(tr('storage.accessKey'))
      break
  }
  return out
}

export function StoragePanel({ targets, busy, error, message, onUpsert, onDelete, snapshots, loading, testConnection, onSaved }: StoragePanelProps) {
  const tr = useT()
  const ids = useId()
  const [form, setForm] = useState<FormState | null>(null)
  const [editing, setEditing] = useState(false)
  const [touched, setTouched] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const editorRef = useRef<HTMLDivElement | null>(null)

  const summaries = useMemo(
    () => summarizeSnapshotsByTarget(targets, snapshots ?? []),
    [targets, snapshots],
  )
  const deleteTarget = targets.find((t) => t.id === deleteId) ?? null
  const missing = form ? requiredFields(form, tr) : []
  const duplicate = Boolean(form && targets.some((t) => t.id === form.id.trim()) && !editing)

  function openNew(kind: StorageKind = 'local') {
    setForm({ ...EMPTY_FORM, kind, id: blankIdFor(kind, targets) })
    setEditing(false)
    setTouched(false)
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  function openEdit(t: StorageTargetConfig) {
    setForm(formFromTarget(t))
    setEditing(true)
    setTouched(false)
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  function patch(part: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...part } : prev))
  }

  function save() {
    setTouched(true)
    if (!form) return
    if (requiredFields(form, tr).length > 0) return
    const target = buildTarget(form, targets.find((t) => t.id === form.id.trim()))
    onUpsert(target)
    onSaved?.(target)
  }

  async function runTest(t: StorageTargetConfig) {
    if (!testConnection) return
    setTests((prev) => ({ ...prev, [t.id]: { status: 'testing' } }))
    try {
      const r = await testConnection(t)
      setTests((prev) => ({
        ...prev,
        [t.id]: r.ok
          ? { status: 'ok', count: r.count ?? 0 }
          : { status: 'fail', error: redactError(r.error ?? 'unknown error', t) },
      }))
    } catch (err) {
      setTests((prev) => ({ ...prev, [t.id]: { status: 'fail', error: redactError(errorText(err), t) } }))
    }
  }

  return (
    <div className="dv-page">
      <PageHeader
        title={tr('storage.title')}
        subtitle={tr('storage.subtitle')}
        actions={
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => openNew('local')} disabled={busy}>
            {tr('storage.add')}
          </Button>
        }
      />

      {error ? <ErrorState compact error={error} /> : null}
      {message ? <Banner tone="ok" onDismiss={undefined}>{message}</Banner> : null}

      {loading && targets.length === 0 ? (
        <div className="dv-grid-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : targets.length === 0 ? (
        <Card hero>
          <CardHeader
            icon={<IconHardDrive size={18} />}
            title={tr('storage.emptyTitle')}
            subtitle={tr('storage.emptyBody')}
          />
          <CardBody>
            <div className="dv-options" data-cols="2" role="group" aria-label={tr('storage.chooseKind')}>
              {KIND_OPTIONS.map((k) => (
                <OptionTile
                  key={k.kind}
                  name={`${ids}-new-kind`}
                  checked={false}
                  onChange={() => openNew(k.kind)}
                  icon={k.icon}
                  title={k.labelKey === 'kind.localPlain' ? tr('kind.localPlain') : tr(k.labelKey)}
                  description={tr(`storage.kindCards.${k.kind}` as 'storage.kindCards.local' | 'storage.kindCards.github' | 'storage.kindCards.webdav' | 'storage.kindCards.s3')}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="dv-grid-2">
          {summaries.map(({ target, count, bytes, latest }) => (
            <TargetCard
              key={target.id}
              target={target}
              count={count}
              bytes={bytes}
              latest={latest}
              test={tests[target.id] ?? { status: 'idle' }}
              canTest={Boolean(testConnection)}
              busy={busy}
              tr={tr}
              onTest={() => void runTest(target)}
              onEdit={() => openEdit(target)}
              onDelete={() => setDeleteId(target.id)}
            />
          ))}
        </div>
      )}

      {form ? (
        <div ref={editorRef}>
          <Card hero className={cx('dv-editor')}>
            <CardHeader
              icon={editing ? <IconPencil size={18} /> : <IconPlus size={18} />}
              title={editing ? tr('storage.editorEdit') : tr('storage.editorNew')}
              subtitle={tr('storage.editorHint')}
              actions={
                <IconButton label={tr('storage.cancelEdit')} onClick={() => setForm(null)}>
                  <IconX size={15} />
                </IconButton>
              }
            />
            <CardBody>
              <div role="radiogroup" aria-label={tr('storage.kindLabel')} className="dv-options" data-cols="3">
                {KIND_OPTIONS.map((k) => (
                  <OptionTile
                    key={k.kind}
                    name={`${ids}-kind`}
                    checked={form.kind === k.kind}
                    disabled={editing}
                    onChange={() => patch({ kind: k.kind, id: editing ? form.id : blankIdFor(k.kind, targets) })}
                    icon={k.icon}
                    title={tr(k.labelKey)}
                  />
                ))}
              </div>

              <div className="dv-grid-2">
                <Field label={tr('storage.id')} htmlFor={`${ids}-id`} required hint={tr('storage.idHint')}>
                  <TextInput
                    id={`${ids}-id`}
                    mono
                    value={form.id}
                    placeholder="local-default"
                    maxLength={64}
                    onChange={(e) => patch({ id: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
                    disabled={editing}
                    aria-invalid={touched && !form.id.trim() ? true : undefined}
                  />
                </Field>
                <Field label={tr('storage.label')} htmlFor={`${ids}-label`} required hint={tr('storage.labelHint')}>
                  <TextInput
                    id={`${ids}-label`}
                    value={form.label}
                    maxLength={80}
                    onChange={(e) => patch({ label: e.target.value })}
                    aria-invalid={touched && !form.label.trim() ? true : undefined}
                  />
                </Field>
              </div>
              {duplicate ? <Banner tone="warn" icon={<IconAlert size={16} />}>{tr('storage.idExists')}</Banner> : null}

              {form.kind === 'local' ? (
                <Field label={tr('storage.directory')} htmlFor={`${ids}-dir`} required hint={tr('storage.directoryHint')}>
                  <TextInput
                    id={`${ids}-dir`}
                    mono
                    value={form.directory}
                    placeholder="~/dsh-vault-backups"
                    onChange={(e) => patch({ directory: e.target.value })}
                    aria-invalid={touched && !form.directory.trim() ? true : undefined}
                  />
                </Field>
              ) : null}

              {form.kind === 'github' ? (
                <>
                  <div className="dv-grid-3">
                    <Field label={tr('storage.owner')} htmlFor={`${ids}-owner`} required>
                      <TextInput id={`${ids}-owner`} mono value={form.owner} onChange={(e) => patch({ owner: e.target.value })} placeholder="octocat" />
                    </Field>
                    <Field label={tr('storage.repo')} htmlFor={`${ids}-repo`} required>
                      <TextInput id={`${ids}-repo`} mono value={form.repo} onChange={(e) => patch({ repo: e.target.value })} placeholder="dsh-backups" />
                    </Field>
                    <Field label={tr('storage.branch')} htmlFor={`${ids}-branch`} hint={tr('storage.branchHint')} optional>
                      <TextInput id={`${ids}-branch`} mono value={form.branch} onChange={(e) => patch({ branch: e.target.value })} placeholder="main" />
                    </Field>
                  </div>
                  <div className="dv-grid-2">
                    <Field label={tr('storage.tokenCredential')} htmlFor={`${ids}-cred`} hint={tr('storage.tokenCredentialHint')} optional>
                      <TextInput id={`${ids}-cred`} mono value={form.tokenCredential} onChange={(e) => patch({ tokenCredential: e.target.value })} />
                    </Field>
                    <Field label={tr('storage.token')} htmlFor={`${ids}-token`} hint={tr('storage.tokenHint')} optional>
                      <PasswordInput id={`${ids}-token`} value={form.token} onChange={(e) => patch({ token: e.target.value })} autoComplete="off" />
                    </Field>
                  </div>
                  <Field label={tr('storage.pathPrefix')} htmlFor={`${ids}-prefix`} hint={tr('storage.pathPrefixHint')} optional>
                    <TextInput id={`${ids}-prefix`} mono value={form.pathPrefix} onChange={(e) => patch({ pathPrefix: e.target.value })} placeholder="snapshots" />
                  </Field>
                </>
              ) : null}

              {form.kind === 'webdav' ? (
                <>
                  <Field label={tr('storage.url')} htmlFor={`${ids}-url`} required>
                    <TextInput id={`${ids}-url`} mono value={form.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://dav.example.com/dsh" />
                  </Field>
                  <div className="dv-grid-2">
                    <Field label={tr('storage.username')} htmlFor={`${ids}-user`} optional>
                      <TextInput id={`${ids}-user`} value={form.username} onChange={(e) => patch({ username: e.target.value })} autoComplete="username" />
                    </Field>
                    <Field
                      label={tr('storage.password')}
                      htmlFor={`${ids}-pass`}
                      hint={editing ? tr('storage.passwordKeep') : undefined}
                      optional
                    >
                      <PasswordInput id={`${ids}-pass`} value={form.password} onChange={(e) => patch({ password: e.target.value })} autoComplete="new-password" />
                    </Field>
                  </div>
                  <Field label={tr('storage.pathPrefix')} htmlFor={`${ids}-wprefix`} hint={tr('storage.pathPrefixHint')} optional>
                    <TextInput id={`${ids}-wprefix`} mono value={form.pathPrefix} onChange={(e) => patch({ pathPrefix: e.target.value })} />
                  </Field>
                </>
              ) : null}

              {form.kind === 's3' ? (
                <>
                  <div className="dv-grid-2">
                    <Field label={tr('storage.endpoint')} htmlFor={`${ids}-s3e`} required>
                      <TextInput id={`${ids}-s3e`} mono value={form.endpoint} onChange={(e) => patch({ endpoint: e.target.value })} placeholder="https://s3.example.com" />
                    </Field>
                    <Field label={tr('storage.bucket')} htmlFor={`${ids}-bucket`} required>
                      <TextInput id={`${ids}-bucket`} mono value={form.bucket} onChange={(e) => patch({ bucket: e.target.value })} placeholder="dsh-vault" />
                    </Field>
                  </div>
                  <div className="dv-grid-3">
                    <Field label={tr('storage.region')} htmlFor={`${ids}-region`} hint={tr('storage.regionHint')} optional>
                      <TextInput id={`${ids}-region`} mono value={form.region} onChange={(e) => patch({ region: e.target.value })} placeholder="auto" />
                    </Field>
                    <Field label={tr('storage.accessKey')} htmlFor={`${ids}-ak`} required>
                      <TextInput id={`${ids}-ak`} mono value={form.accessKeyId} onChange={(e) => patch({ accessKeyId: e.target.value })} autoComplete="off" />
                    </Field>
                    <Field label={tr('storage.secretKey')} htmlFor={`${ids}-sk`} required hint={editing ? tr('storage.secretKeep') : undefined}>
                      <PasswordInput id={`${ids}-sk`} value={form.secretAccessKey} onChange={(e) => patch({ secretAccessKey: e.target.value })} autoComplete="new-password" />
                    </Field>
                  </div>
                  <Field label={tr('storage.pathPrefix')} htmlFor={`${ids}-sprefix`} hint={tr('storage.pathPrefixHint')} optional>
                    <TextInput id={`${ids}-sprefix`} mono value={form.pathPrefix} onChange={(e) => patch({ pathPrefix: e.target.value })} />
                  </Field>
                  <Checkbox
                    title={tr('storage.forcePathStyle')}
                    description={tr('storage.forcePathStyleDesc')}
                    checked={form.forcePathStyle}
                    onChange={(e) => patch({ forcePathStyle: e.target.checked })}
                  />
                </>
              ) : null}

              <Checkbox
                title={tr('storage.encDefault')}
                description={tr('storage.encDefaultDesc')}
                checked={form.encryptByDefault}
                onChange={(e) => patch({ encryptByDefault: e.target.checked })}
              />

              {touched && missing.length > 0 ? (
                <Banner tone="error" icon={<IconAlert size={16} />}>{tr('storage.missing', { fields: missing.join(' / ') })}</Banner>
              ) : null}

              <div className="dv-row">
                <Button variant="primary" onClick={save} loading={busy}>
                  {editing ? tr('storage.saveEdit') : tr('storage.saveNew')}
                </Button>
                <Button variant="ghost" onClick={() => setForm(null)}>{tr('app.cancel')}</Button>
                {busy ? <LoadingInline label={tr('app.busy')} /> : null}
              </div>
            </CardBody>
          </Card>
        </div>
      ) : targets.length > 0 ? (
        <div className="dv-card" style={{ boxShadow: 'none' }}>
          <div className="dv-card-body">
            <div className="dv-row-between">
              <div className="dv-stack" style={{ gap: 2 }}>
                <span className="dv-card-title">{tr('storage.add')}</span>
                <span className="dv-card-sub">{tr('storage.kindHint')}</span>
              </div>
              <div className="dv-row dv-gap-2">
                {KIND_OPTIONS.map((k) => (
                  <Button key={k.kind} size="sm" icon={k.icon} onClick={() => openNew(k.kind)}>
                    {tr(k.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteId(null)}
        title={tr('storage.deleteTitle')}
        description={
          deleteTarget
            ? tr('storage.deleteDesc', { label: deleteTarget.label })
            : undefined
        }
        confirmLabel={tr('storage.deleteConfirm')}
        busy={busy}
        onConfirm={() => {
          if (!deleteTarget) return
          onDelete(deleteTarget.id)
          setDeleteId(null)
        }}
      />
    </div>
  )
}

function TargetCard({
  target,
  count,
  bytes,
  latest,
  test,
  canTest,
  busy,
  tr,
  onTest,
  onEdit,
  onDelete,
}: {
  target: StorageTargetConfig
  count: number
  bytes: number
  latest?: SnapshotInfo
  test: TestState
  canTest: boolean
  busy: boolean
  tr: Translate
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const KindIcon = target.kind === 'github' ? IconGithub : target.kind === 'webdav' ? IconCloud : target.kind === 's3' ? IconServer : IconHardDrive
  return (
    <Card interactive className="dv-target-card">
      <CardBody>
        <div className="dv-row-between" style={{ alignItems: 'flex-start' }}>
          <div className="dv-row dv-gap-3" style={{ minWidth: 0, flex: 1, flexWrap: 'nowrap' }}>
            <span className="dv-icon-tile" data-kind={target.kind} aria-hidden="true">
              <KindIcon size={18} />
            </span>
            <div className="dv-stack" style={{ gap: 3, minWidth: 0 }}>
              <span className="dv-card-title dv-truncate" title={target.label}>{target.label}</span>
              <span className="dv-row dv-gap-1">
                <Badge tone="brand">{targetKindLabel(target, tr)}</Badge>
                <Badge>{target.id}</Badge>
              </span>
            </div>
          </div>
          <span className="dv-row dv-gap-1" style={{ flex: 'none' }}>
            <StatusDot tone={test.status === 'fail' ? 'danger' : test.status === 'ok' ? 'ok' : count > 0 ? 'ok' : 'neutral'} pulse={test.status === 'testing'} />
          </span>
        </div>

        <div className="dv-mono dv-small dv-muted" style={{ overflowWrap: 'anywhere' }}>{targetLocation(target)}</div>

        <div className="dv-grid-2" style={{ gap: 8 }}>
          <MiniStat label={tr('storage.card.snapshots')} value={String(count)} />
          <MiniStat label={tr('storage.card.lastBackup')} value={latest ? relativeLabel(tr, latest.createdAt) : tr('common.never')} title={latest ? formatDateTime(latest.createdAt) : undefined} />
        </div>

        <div className="dv-tag-list">
          {target.encryptByDefault ? <span className="dv-tag" data-tone="ok">{tr('storage.card.encDefault')}</span> : <span className="dv-tag">{tr('storage.card.encNone')}</span>}
          {hasStoredSecret(target) ? <span className="dv-tag" data-tone="brand">{tr('storage.card.secretsStored')}</span> : null}
          {count > 0 ? <span className="dv-tag">{formatBytes(bytes)}</span> : null}
        </div>

        {test.status === 'ok' ? (
          <Banner tone="ok" icon={<IconCheck size={16} />}>{tr('storage.testOk', { count: test.count })}</Banner>
        ) : null}
        {test.status === 'fail' ? (
          <Banner tone="error" icon={<IconWifiOff size={16} />}>{tr('storage.testFail', { error: test.error })}</Banner>
        ) : null}

        <div className="dv-row dv-gap-2 dv-mt-1">
          {canTest ? (
            <Button size="sm" variant="outline" icon={<IconZap size={13} />} onClick={onTest} loading={test.status === 'testing'}>
              {test.status === 'testing' ? tr('storage.testing') : tr('storage.test')}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon={<IconPencil size={13} />} onClick={onEdit} disabled={busy}>
            {tr('storage.edit')}
          </Button>
          <span className="dv-grow" />
          <IconButton label={`${tr('common.delete')} ${target.label}`} variant="danger" onClick={onDelete} disabled={busy}>
            <IconTrash size={14} />
          </IconButton>
        </div>
      </CardBody>
    </Card>
  )
}

function MiniStat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="dv-stack" style={{ gap: 1, padding: '8px 10px', border: '1px solid var(--dv-border)', borderRadius: 'var(--dv-radius)', minWidth: 0 }}>
      <span className="dv-hint">{label}</span>
      <span className="dv-small" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>{value}</span>
    </div>
  )
}

function errorText(err: unknown): string {
  if (err instanceof VaultApiError) return `${err.message} (HTTP ${err.status})`
  return err instanceof Error ? err.message : String(err)
}

/** Strip any configured secret value that might leak into adapter error text. */
function redactError(message: string, target: StorageTargetConfig): string {
  let out = message
  const secrets: string[] = []
  if (target.kind === 'webdav') {
    if (target.password) secrets.push(target.password)
  } else if (target.kind === 's3') {
    if (target.secretAccessKey) secrets.push(target.secretAccessKey)
  } else if (target.kind === 'github') {
    if (target.token) secrets.push(target.token)
  }
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join('***')
  }
  return out.length > 300 ? `${out.slice(0, 300)}…` : out
}

