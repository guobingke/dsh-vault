import { targetName } from '../lib/format.js'
import { useId, useMemo, useRef, useState } from 'react'
import type { SnapshotInfo, StorageKind, StorageTargetConfig } from '../../core/types.js'
import { VaultApiError } from '../api.js'
import { useLocale, useT, type Translate } from '../i18n.js'
import { formatDateTime, relativeLabel } from '../lib/format.js'
import { hasStoredSecret, summarizeSnapshotsByTarget, targetKindLabel, targetLocation } from '../lib/targets.js'
import {
  Banner,
  Button,
  Card,
  CardHead,
  CardList,
  ConfirmDialog,
  DotText,
  EmptyState,
  Field,
  OptionTile,
  PasswordInput,
  Rows,
  SettingRow,
  Switch,
  Tag,
  TextInput,
} from './ui.js'
import { PathPicker, type FsBrowser } from './PathPicker.js'

export interface StoragePanelProps {
  targets: StorageTargetConfig[]
  busy: boolean
  error: string | null
  message: string | null
  onUpsert: (target: StorageTargetConfig) => void
  onDelete: (id: string) => void
  snapshots?: SnapshotInfo[]
  loading?: boolean
  /** Read-only connection probe (GET /snapshots?targetId=). Must never throw raw secrets. */
  testConnection?: (target: StorageTargetConfig) => Promise<{ ok: boolean; count?: number; error?: string }>
  /** Filesystem access for the local-directory Browse… dialog. */
  fs?: FsBrowser
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

const KINDS: StorageKind[] = ['local', 'github', 'webdav', 's3']
const KIND_LABEL: Record<StorageKind, 'storage.kind.local' | 'storage.kind.github' | 'storage.kind.webdav' | 'storage.kind.s3'> = {
  local: 'storage.kind.local',
  github: 'storage.kind.github',
  webdav: 'storage.kind.webdav',
  s3: 'storage.kind.s3',
}

/** Button labels use the shorter kind names ("添加 GitHub"), not "GitHub 仓库". */
const KIND_ADD: Record<StorageKind, 'kind.github' | 'kind.webdav' | 'kind.s3' | 'kind.local'> = {
  local: 'kind.local',
  github: 'kind.github',
  webdav: 'kind.webdav',
  s3: 'kind.s3',
}

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
  // Secrets (password / token / secret key) are never loaded back into the form.
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

export function StoragePanel({ targets, busy, error, message, onUpsert, onDelete, snapshots, loading, testConnection, fs }: StoragePanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const tr = useT()
  const locale = useLocale()
  const ids = useId()
  const [form, setForm] = useState<FormState | null>(null)
  const [editing, setEditing] = useState(false)
  const [touched, setTouched] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const editorRef = useRef<HTMLDivElement | null>(null)

  const summaries = useMemo(() => summarizeSnapshotsByTarget(targets, snapshots ?? []), [targets, snapshots])
  const deleteTarget = targets.find((t) => t.id === deleteId) ?? null
  const missing = form ? requiredFields(form, tr) : []
  const duplicate = Boolean(form && targets.some((t) => t.id === form.id.trim()) && !editing)

  function openNew(kind: StorageKind = 'local') {
    setForm({ ...EMPTY_FORM, kind, id: blankIdFor(kind, targets) })
    setEditing(false)
    setTouched(false)
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest' }))
  }

  function openEdit(t: StorageTargetConfig) {
    setForm(formFromTarget(t))
    setEditing(true)
    setTouched(false)
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest' }))
  }

  function patch(part: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...part } : prev))
  }

  function save() {
    setTouched(true)
    if (!form) return
    if (requiredFields(form, tr).length > 0) return
    onUpsert(buildTarget(form, targets.find((t) => t.id === form.id.trim())))
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
          : { status: 'fail', error: redactError(r.error ?? tr('app.error'), t) },
      }))
    } catch (err) {
      setTests((prev) => ({ ...prev, [t.id]: { status: 'fail', error: redactError(errorText(err), t) } }))
    }
  }

  return (
    <>
      <p className="dv-section-desc">{tr('storage.desc')}</p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      {loading && targets.length === 0 ? (
        <span className="dv-loading-inline" role="status">
          <span className="dv-spinner" aria-hidden="true" />
          {tr('app.loading')}
        </span>
      ) : targets.length === 0 ? (
        <EmptyState
          title={tr('storage.emptyTitle')}
          body={tr('storage.emptyBody')}
          actions={<Button variant="primary" onClick={() => openNew('local')}>{tr('storage.addTitle')}</Button>}
        />
      ) : (
        <CardList label={tr('storage.targetsLabel')}>
          {summaries.map(({ target, count, latest }) => {
            const test = tests[target.id] ?? { status: 'idle' }
            return (
              <Card key={target.id}>
                <CardHead
                  title={
                    <span className="dv-inline">
                      <DotText tone={test.status === 'fail' ? 'danger' : count > 0 ? 'ok' : 'neutral'}>{targetName(target, tr)}</DotText>
                      <span className="dv-card-sub dv-mono">{target.id}</span>
                    </span>
                  }
                  sub={targetKindLabel(target, tr)}
                  actions={
                    <>
                      <Tag tone={target.encryptByDefault ? 'ok' : 'neutral'}>
                        {target.encryptByDefault ? tr('storage.encDefault') : tr('common.plaintext')}
                      </Tag>
                      {hasStoredSecret(target) ? <Tag>{tr('storage.storedCredentials')}</Tag> : null}
                    </>
                  }
                />
                <span className="dv-card-sub dv-mono" style={{ overflowWrap: 'anywhere' }}>{targetLocation(target)}</span>
                <span className="dv-card-sub">
                  {tr('storage.snapshots', { count })}
                  {' · '}
                  {latest
                    ? tr('storage.lastBackup', { time: `${formatDateTime(latest.createdAt, locale)}（${relativeLabel(tr, latest.createdAt)}）` })
                    : tr('storage.noSnapshots')}
                </span>
                {test.status === 'ok' ? <span className="dv-small" style={{ color: 'var(--dv-ok-label)' }}>{tr('storage.testOk', { count: test.count })}</span> : null}
                {test.status === 'fail' ? <span className="dv-error-text">{tr('storage.testFail', { error: test.error })}</span> : null}
                <div className="dv-card-actions">
                  {testConnection ? (
                    <Button size="sm" onClick={() => void runTest(target)} loading={test.status === 'testing'}>
                      {test.status === 'testing' ? tr('storage.testing') : tr('storage.test')}
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => openEdit(target)} disabled={busy}>{tr('storage.edit')}</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(target.id)} disabled={busy}>
                    {tr('storage.delete')}
                  </Button>
                </div>
              </Card>
            )
          })}
        </CardList>
      )}

      {!form ? (
        <div className="dv-add-row">
          {KINDS.map((k) => (
            <Button key={k} variant="dashed" onClick={() => openNew(k)} disabled={busy}>
              + {tr('storage.addKind', { kind: tr(KIND_ADD[k]) })}
            </Button>
          ))}
        </div>
      ) : null}

      {form ? (
        <div ref={editorRef}>
          <Card>
            <CardHead
              title={editing ? tr('storage.editTitle') : tr('storage.addTitle')}
              sub={tr('storage.addDesc')}
              actions={
                <Button size="sm" variant="quiet" onClick={() => setForm(null)}>{tr('storage.cancel')}</Button>
              }
            />
            <div className="dv-card-sep" aria-hidden="true" />
            <div className="dv-chip-row" role="radiogroup" aria-label={tr('storage.kind')}>
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  className="dv-chip"
                  aria-checked={form.kind === k}
                  disabled={editing && form.kind !== k}
                  onClick={() => patch({ kind: k, id: editing ? form.id : blankIdFor(k, targets) })}
                >
                  {tr(KIND_LABEL[k])}
                </button>
              ))}
            </div>

            <div className="dv-grid-2">
              <Field label={tr('storage.id')} htmlFor={`${ids}-id`} hint={tr('storage.idHint')}>
                <TextInput
                  id={`${ids}-id`}
                  mono
                  value={form.id}
                  placeholder="local-default"
                  maxLength={64}
                  onChange={(e) => patch({ id: e.target.value.replace(/\s+/g, '-').toLowerCase() })}
                  disabled={editing}
                  invalid={touched && !form.id.trim()}
                />
              </Field>
              <Field label={tr('storage.label')} htmlFor={`${ids}-label`}>
                <TextInput
                  id={`${ids}-label`}
                  value={form.label}
                  maxLength={80}
                  placeholder={targetLabelPlaceholder(form.kind, tr)}
                  onChange={(e) => patch({ label: e.target.value })}
                  invalid={touched && !form.label.trim()}
                />
              </Field>
            </div>
            {duplicate ? <span className="dv-hint" style={{ color: 'var(--dv-warn)' }}>{tr('storage.idExists')}</span> : null}

            {form.kind === 'local' ? (
              <Field label={tr('storage.directory')} htmlFor={`${ids}-dir`} hint={tr('storage.directoryHint')}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <TextInput
                    id={`${ids}-dir`}
                    mono
                    value={form.directory}
                    placeholder="~/dsh-vault-backups"
                    onChange={(e) => patch({ directory: e.target.value })}
                    invalid={touched && !form.directory.trim()}
                  />
                  {fs ? <Button variant="quiet" onClick={() => setPickerOpen(true)}>{tr('backup.browse')}</Button> : null}
                </div>
                {fs ? (
                  <PathPicker
                    open={pickerOpen}
                    mode="directory"
                    fs={fs}
                    initialPath={form.directory}
                    onClose={() => setPickerOpen(false)}
                    onSelect={(p) => { patch({ directory: p }); setPickerOpen(false) }}
                  />
                ) : null}
              </Field>
            ) : null}

            {form.kind === 'github' ? (
              <>
                <div className="dv-grid-2">
                  <Field label={tr('storage.owner')} htmlFor={`${ids}-owner`}>
                    <TextInput id={`${ids}-owner`} mono value={form.owner} onChange={(e) => patch({ owner: e.target.value })} placeholder="octocat" />
                  </Field>
                  <Field label={tr('storage.repo')} htmlFor={`${ids}-repo`}>
                    <TextInput id={`${ids}-repo`} mono value={form.repo} onChange={(e) => patch({ repo: e.target.value })} placeholder="dsh-backups" />
                  </Field>
                  <Field label={tr('storage.branch')} htmlFor={`${ids}-branch`} optional>
                    <TextInput id={`${ids}-branch`} mono value={form.branch} onChange={(e) => patch({ branch: e.target.value })} placeholder="main" />
                  </Field>
                  <Field label={tr('storage.pathPrefix')} htmlFor={`${ids}-prefix`} optional>
                    <TextInput id={`${ids}-prefix`} mono value={form.pathPrefix} onChange={(e) => patch({ pathPrefix: e.target.value })} />
                  </Field>
                  <Field label={tr('storage.tokenCredential')} htmlFor={`${ids}-cred`} optional>
                    <TextInput id={`${ids}-cred`} mono value={form.tokenCredential} onChange={(e) => patch({ tokenCredential: e.target.value })} />
                  </Field>
                  <Field label={tr('storage.token')} htmlFor={`${ids}-token`} hint={tr('storage.tokenHint')} optional>
                    <PasswordInput id={`${ids}-token`} value={form.token} onChange={(e) => patch({ token: e.target.value })} autoComplete="off" />
                  </Field>
                </div>
              </>
            ) : null}

            {form.kind === 'webdav' ? (
              <>
                <Field label={tr('storage.url')} htmlFor={`${ids}-url`}>
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
                <Field label={tr('storage.pathPrefix')} htmlFor={`${ids}-wprefix`} optional>
                  <TextInput id={`${ids}-wprefix`} mono value={form.pathPrefix} onChange={(e) => patch({ pathPrefix: e.target.value })} />
                </Field>
              </>
            ) : null}

            {form.kind === 's3' ? (
              <>
                <div className="dv-grid-2">
                  <Field label={tr('storage.endpoint')} htmlFor={`${ids}-s3e`}>
                    <TextInput id={`${ids}-s3e`} mono value={form.endpoint} onChange={(e) => patch({ endpoint: e.target.value })} placeholder="https://s3.example.com" />
                  </Field>
                  <Field label={tr('storage.bucket')} htmlFor={`${ids}-bucket`}>
                    <TextInput id={`${ids}-bucket`} mono value={form.bucket} onChange={(e) => patch({ bucket: e.target.value })} placeholder="dsh-vault" />
                  </Field>
                  <Field label={tr('storage.region')} htmlFor={`${ids}-region`} optional>
                    <TextInput id={`${ids}-region`} mono value={form.region} onChange={(e) => patch({ region: e.target.value })} placeholder="auto" />
                  </Field>
                  <Field label={tr('storage.pathPrefix')} htmlFor={`${ids}-sprefix`} optional>
                    <TextInput id={`${ids}-sprefix`} mono value={form.pathPrefix} onChange={(e) => patch({ pathPrefix: e.target.value })} />
                  </Field>
                  <Field label={tr('storage.accessKey')} htmlFor={`${ids}-ak`}>
                    <TextInput id={`${ids}-ak`} mono value={form.accessKeyId} onChange={(e) => patch({ accessKeyId: e.target.value })} autoComplete="off" />
                  </Field>
                  <Field label={tr('storage.secretKey')} htmlFor={`${ids}-sk`} hint={editing ? tr('storage.secretKeep') : undefined}>
                    <PasswordInput id={`${ids}-sk`} value={form.secretAccessKey} onChange={(e) => patch({ secretAccessKey: e.target.value })} autoComplete="new-password" />
                  </Field>
                </div>
              </>
            ) : null}

            <Rows>
              {form.kind === 's3' ? (
                <SettingRow
                  title={tr('storage.forcePathStyle')}
                  description={tr('storage.forcePathStyleDesc')}
                  htmlFor={`${ids}-pathstyle`}
                  control={
                    <Switch
                      id={`${ids}-pathstyle`}
                      checked={form.forcePathStyle}
                      onChange={() => patch({ forcePathStyle: !form.forcePathStyle })}
                    />
                  }
                />
              ) : null}
              <SettingRow
                title={tr('storage.encDefault')}
                description={tr('storage.encDefaultDesc')}
                htmlFor={`${ids}-enc`}
                control={
                  <Switch
                    id={`${ids}-enc`}
                    checked={form.encryptByDefault}
                    onChange={() => patch({ encryptByDefault: !form.encryptByDefault })}
                  />
                }
              />
            </Rows>

            {touched && missing.length > 0 ? (
              <span className="dv-error-text">{tr('storage.missing', { fields: missing.join(' / ') })}</span>
            ) : null}

            <div className="dv-card-foot">
              <Button onClick={() => setForm(null)}>{tr('storage.cancel')}</Button>
              <Button variant="primary" onClick={save} loading={busy}>
                {editing ? tr('storage.saveEdit') : tr('storage.saveNew')}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteId(null)}
        title={tr('storage.deleteTitle', { label: deleteTarget?.label ?? '' })}
        description={tr('storage.deleteBody')}
        confirmLabel={tr('storage.deleteConfirm')}
        busy={busy}
        onConfirm={() => {
          if (!deleteTarget) return
          onDelete(deleteTarget.id)
          setDeleteId(null)
        }}
      />
    </>
  )
}

function targetLabelPlaceholder(kind: StorageKind, tr: Translate): string {
  switch (kind) {
    case 'local': return tr('storage.kind.local')
    case 'github': return tr('storage.kind.github')
    case 'webdav': return tr('storage.kind.webdav')
    default: return tr('storage.kind.s3')
  }
}
