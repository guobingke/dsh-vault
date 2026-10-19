import { useEffect, useMemo, useState } from 'react'
import type { BackupCategory, BackupResult, StorageTargetConfig } from '../../core/types.js'
import { useT, type MessageKey, type Translate } from '../i18n.js'
import { passwordStrength } from '../lib/format.js'
import { targetKindLabel, targetLocation } from '../lib/targets.js'
import {
  Banner,
  Button,
  Card,
  CardHead,
  EmptyState,
  Field,
  OptionTile,
  PasswordInput,
  ProgressBar,
  Rows,
  SettingRow,
  Switch,
  Tag,
  TextArea,
  TextInput,
} from './ui.js'
import { PathPicker, type FsBrowser } from './PathPicker.js'
import { BackupSummary } from './ResultSummary.js'
import { PluginCopiesCard, type PluginCopiesApi } from './PluginCopiesCard.js'

export interface BackupPanelProps {
  targets: StorageTargetConfig[]
  busy: boolean
  message: string | null
  error: string | null
  progress?: number
  onBackup: (input: {
    targetId?: string
    directory?: string
    exportFile?: string
    encrypt: boolean
    password?: string
    includeSecrets: boolean
    notes?: string
    categories?: BackupCategory[]
  }) => void
  /** Optional: pre-select a target (default target from settings). */
  defaultTargetId?: string
  /** Optional: current progress stage: collect | pack | encrypt | upload. */
  stage?: string
  onNavigateStorage?: () => void
  /** Filesystem access for the Browse… dialog (in-app browser + optional native chooser). */
  fs?: FsBrowser
  /** Detected plugin data entries under $DSH_HOME (shown under 插件数据). */
  pluginDataEntries?: string[]
  /** Plugin copy selection (保存插件副本); hidden when absent. */
  copiesApi?: PluginCopiesApi
  /** Last finished backup (completion summary). */
  result?: BackupResult | null
  resultLocation?: string
}

type DestMode = 'target' | 'directory' | 'file'

const CATEGORIES: Array<{ id: BackupCategory; label: MessageKey; desc: MessageKey; secret?: boolean }> = [
  { id: 'plugins', label: 'backup.cat.plugins', desc: 'backup.cat.plugins.desc' },
  { id: 'plugin-config', label: 'backup.cat.plugin-config', desc: 'backup.cat.plugin-config.desc' },
  { id: 'mcp', label: 'backup.cat.mcp', desc: 'backup.cat.mcp.desc' },
  { id: 'skills', label: 'backup.cat.skills', desc: 'backup.cat.skills.desc' },
  { id: 'settings', label: 'backup.cat.settings', desc: 'backup.cat.settings.desc' },
  { id: 'providers', label: 'backup.cat.providers', desc: 'backup.cat.providers.desc' },
  { id: 'agent-presets', label: 'backup.cat.agent-presets', desc: 'backup.cat.agent-presets.desc' },
  { id: 'profiles', label: 'backup.cat.profiles', desc: 'backup.cat.profiles.desc' },
  { id: 'instructions', label: 'backup.cat.instructions', desc: 'backup.cat.instructions.desc' },
  { id: 'plugin-data', label: 'backup.cat.plugin-data', desc: 'backup.cat.plugin-data.desc' },
  { id: 'credentials', label: 'backup.cat.credentials', desc: 'backup.cat.credentials.desc', secret: true },
]

const ALL_IDS = CATEGORIES.map((c) => c.id)

/** Suggested export file name: dsh-vault-YYYYMMDD-HHMM.(dshvault|tar.gz). */
export function defaultExportName(encrypt: boolean, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `dsh-vault-${stamp}.${encrypt ? 'dshvault' : 'tar.gz'}`
}

function strengthLabel(tr: Translate, level: 0 | 1 | 2 | 3 | 4): string {
  return tr(`backup.strength.${level}` as `backup.strength.${0 | 1 | 2 | 3 | 4}`)
}

export function BackupPanel({
  targets,
  busy,
  message,
  error,
  progress,
  onBackup,
  defaultTargetId,
  stage,
  onNavigateStorage,
  fs,
  pluginDataEntries,
  copiesApi,
  result,
  resultLocation,
}: BackupPanelProps) {
  const tr = useT()
  const [destMode, setDestMode] = useState<DestMode>(targets.length ? 'target' : 'directory')
  const [targetId, setTargetId] = useState(defaultTargetId ?? targets[0]?.id ?? '')
  const [directory, setDirectory] = useState('')
  const [exportFile, setExportFile] = useState('')
  const [encrypt, setEncrypt] = useState(false)
  const [includeSecrets, setIncludeSecrets] = useState(false)
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')
  const [scope, setScope] = useState<Set<BackupCategory>>(() => new Set(ALL_IDS))
  const [touched, setTouched] = useState(false)
  const [picker, setPicker] = useState<'directory' | 'save' | null>(null)

  // Keep the selection valid when targets load asynchronously or change.
  useEffect(() => {
    if (!targetId || !targets.some((t) => t.id === targetId)) {
      const next = (defaultTargetId && targets.some((t) => t.id === defaultTargetId) ? defaultTargetId : targets[0]?.id) ?? ''
      setTargetId(next)
    }
  }, [targets, targetId, defaultTargetId])

  const target = targets.find((t) => t.id === targetId)
  useEffect(() => {
    if (target?.encryptByDefault) setEncrypt(true)
  }, [target?.id, target?.encryptByDefault])

  const strength = passwordStrength(password)
  const selectedCats = CATEGORIES.filter((c) => scope.has(c.id))
  const noScope = selectedCats.length === 0
  const passwordMissing = encrypt && password.length === 0
  const destOk = destMode === 'target'
    ? Boolean(targetId)
    : destMode === 'directory'
      ? Boolean(directory.trim())
      : Boolean(exportFile.trim())
  const canSubmit = destOk && !noScope && !passwordMissing && !busy

  const toggleCategory = (id: BackupCategory) => {
    setScope((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const progressLabel = useMemo(
    () => (stage ? tr('backup.progressStage', { stage: tr(`backup.progress.${stage}` as MessageKey) }) : tr('backup.progress')),
    [tr, stage],
  )

  const submit = () => {
    setTouched(true)
    if (!canSubmit) return
    onBackup({
      targetId: destMode === 'target' ? targetId : undefined,
      directory: destMode === 'directory' ? directory.trim() : undefined,
      exportFile: destMode === 'file' ? exportFile.trim() : undefined,
      encrypt,
      password: encrypt ? password : undefined,
      includeSecrets: includeSecrets && encrypt,
      notes: notes.trim() || undefined,
      categories: selectedCats.length === CATEGORIES.length ? undefined : selectedCats.map((c) => c.id),
    })
  }

  return (
    <>
      <p className="dv-section-desc">{tr('backup.desc')}</p>
      {error ? <Banner tone="error" title={tr('backup.failedTitle')}>{error}</Banner> : null}
      {result ? <BackupSummary result={result} location={resultLocation ?? ''} /> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      <Card>
        <CardHead title={tr('backup.targetTitle')} sub={tr('backup.targetDesc')} />
        <div className="dv-card-sep" aria-hidden="true" />
        <Rows>
          <SettingRow title={tr('backup.destMode')} description={tr('backup.destModeDesc')}>
            <select className="dv-input" value={destMode} onChange={(e) => setDestMode(e.target.value as DestMode)} aria-label={tr('backup.destMode')}>
              <option value="target">{tr('backup.dest.target')}</option>
              <option value="directory">{tr('backup.dest.directory')}</option>
              <option value="file">{tr('backup.dest.file')}</option>
            </select>
          </SettingRow>
        </Rows>
        {destMode === 'target' ? (
          targets.length === 0 ? (
            <EmptyState
              title={tr('backup.noTargetsTitle')}
              body={tr('backup.noTargetsBody')}
              actions={onNavigateStorage ? <Button variant="primary" onClick={onNavigateStorage}>{tr('backup.goStorage')}</Button> : null}
            />
          ) : (
            <div className="dv-options" role="radiogroup" aria-label={tr('backup.targetTitle')}>
              {targets.map((tg) => (
                <OptionTile
                  key={tg.id}
                  name="dv-backup-target"
                  checked={tg.id === targetId}
                  onChange={() => setTargetId(tg.id)}
                  title={
                    <>
                      {tg.label}
                      {tg.encryptByDefault ? <Tag tone="ok">{tr('backup.targetEncBadge')}</Tag> : null}
                    </>
                  }
                  description={
                    <>
                      {targetKindLabel(tg, tr)}
                      <br />
                      <span className="dv-mono">{targetLocation(tg)}</span>
                    </>
                  }
                />
              ))}
            </div>
          )
        ) : null}
        {destMode === 'directory' ? (
          <Field label={tr('backup.directory')} htmlFor="dv-backup-dir" hint={tr('backup.directoryHint')}>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput id="dv-backup-dir" value={directory} onChange={(e) => setDirectory(e.target.value)} placeholder={tr('backup.directoryPlaceholder')} mono />
              {fs ? (
                <Button variant="quiet" onClick={() => setPicker('directory')}>{tr('backup.browse')}</Button>
              ) : null}
            </div>
          </Field>
        ) : null}
        {destMode === 'file' ? (
          <Field label={tr('backup.exportFile')} htmlFor="dv-backup-file" hint={tr('backup.exportFileHint')}>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput id="dv-backup-file" value={exportFile} onChange={(e) => setExportFile(e.target.value)} placeholder={tr('backup.exportFilePlaceholder')} mono />
              {fs ? (
                <Button variant="quiet" onClick={() => setPicker('save')}>{tr('backup.browse')}</Button>
              ) : null}
            </div>
          </Field>
        ) : null}
        {fs ? (
          <PathPicker
            open={picker !== null}
            mode={picker ?? 'directory'}
            fs={fs}
            initialPath={picker === 'save' ? exportFile : directory}
            defaultFileName={defaultExportName(encrypt)}
            onClose={() => setPicker(null)}
            onSelect={(p) => {
              if (picker === 'save') setExportFile(p)
              else setDirectory(p)
              setPicker(null)
            }}
          />
        ) : null}
      </Card>

      <Card>
        <CardHead
          title={tr('backup.scopeTitle')}
          sub={tr('backup.scopeDesc')}
          actions={
            <>
              <span className="dv-small dv-muted dv-num">{tr('backup.scopeSummary', { selected: selectedCats.length, total: CATEGORIES.length })}</span>
              <Button size="sm" variant="quiet" onClick={() => setScope(new Set(ALL_IDS))}>{tr('backup.scopeAll')}</Button>
              <Button size="sm" variant="quiet" onClick={() => setScope(new Set())}>{tr('backup.scopeNone')}</Button>
            </>
          }
        />
        <div className="dv-card-sep" aria-hidden="true" />
        <div className="dv-card-list" style={{ gap: 6 }}>
          {CATEGORIES.map((c) => (
            <OptionTile
              key={c.id}
              shape="square"
              checked={scope.has(c.id)}
              onChange={() => toggleCategory(c.id)}
              title={tr(c.label)}
              description={
                c.id === 'plugin-data' && pluginDataEntries
                  ? pluginDataEntries.length
                    ? tr('backup.cat.plugin-data.found', { list: pluginDataEntries.join('  ') })
                    : tr('backup.cat.plugin-data.none')
                  : tr(c.desc)
              }
            />
          ))}
        </div>
      </Card>

      {copiesApi && (scope.has('plugins') || scope.has('profiles')) ? <PluginCopiesCard api={copiesApi} /> : null}

      <Rows label={tr('backup.encTitle')}>
        <SettingRow
          title={tr('backup.encTitle')}
          description={tr('backup.encDesc')}
          htmlFor="dv-backup-encrypt"
          control={
            <Switch
              id="dv-backup-encrypt"
              checked={encrypt}
              onChange={() => {
                const next = !encrypt
                setEncrypt(next)
                if (!next) {
                  setIncludeSecrets(false)
                  setScope((prev) => {
                    const copy = new Set(prev)
                    copy.delete('credentials')
                    return copy
                  })
                }
              }}
            />
          }
        />
        {encrypt ? (
          <SettingRow
            stacked
            title={tr('backup.password')}
            description={touched && passwordMissing ? tr('backup.passwordRequired') : tr('backup.passwordHint')}
            htmlFor="dv-backup-password"
          >
            <Field
              label={<span className="dv-sr-only">{tr('backup.password')}</span>}
              htmlFor="dv-backup-password"
              hint={password ? tr('backup.strength', { level: strengthLabel(tr, strength.level) }) : undefined}
            >
              <PasswordInput
                id="dv-backup-password"
                value={password}
                autoComplete="new-password"
                placeholder={tr('backup.passwordPlaceholder')}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </SettingRow>
        ) : null}
        <SettingRow
          title={tr('backup.secretsTitle')}
          description={encrypt ? tr('backup.secretsDesc') : tr('backup.secretsBlocked')}
          htmlFor="dv-backup-secrets"
          control={
            <Switch
              id="dv-backup-secrets"
              checked={includeSecrets && encrypt}
              disabled={!encrypt}
              onChange={() => {
                const next = !includeSecrets
                setIncludeSecrets(next)
                if (next) setScope((prev) => new Set(prev).add('credentials'))
              }}
            />
          }
        />
        <SettingRow title={tr('backup.notes')} htmlFor="dv-backup-notes" control={
          <div style={{ width: 220, maxWidth: '100%' }}>
            <TextInput
              id="dv-backup-notes"
              value={notes}
              maxLength={200}
              placeholder={tr('backup.notesPlaceholder')}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        } />
      </Rows>

      {busy ? <ProgressBar value={progress} label={progressLabel} /> : null}

      <div className="dv-card-foot" style={{ justifyContent: 'space-between' }}>
        <span className="dv-hint" style={{ color: noScope ? 'var(--dv-danger)' : undefined }}>
          {noScope ? tr('backup.noScope') : ''}
        </span>
        <Button variant="primary" onClick={submit} loading={busy}>
          {busy ? tr('backup.submitting') : tr('backup.submit')}
        </Button>
      </div>
    </>
  )
}
