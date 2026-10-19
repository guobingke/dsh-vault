import { useEffect, useMemo, useState } from 'react'
import type { BackupCategory, StorageTargetConfig } from '../../core/types.js'
import { useT, type MessageKey } from '../i18n.js'
import { passwordStrength } from '../lib/format.js'
import { formatBytes, targetKindLabel, targetLocation } from '../lib/targets.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CtaButton,
  ErrorState,
  Field,
  IconHelp,
  LoadingInline,
  Meter,
  Banner,
  OptionTile,
  PageHeader,
  PasswordInput,
  ProgressBar,
  StatusDot,
  Switch,
  TextArea,
  EmptyState,
} from './ui.js'
import {
  IconArchive,
  IconFolder,
  IconHardDrive,
  IconKey,
  IconLock,
  IconShield,
  IconShieldCheck,
  IconUnlock,
  IconZap,
  storageIcon,
} from './Icons.js'
import type { Translate } from '../i18n.js'

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
  /** Optional: pre-select a target (e.g. “Back up here” on Overview). */
  defaultTargetId?: string
  /** Optional: current progress stage, one of collect | pack | encrypt | upload | done. */
  stage?: string
  /** Optional: raw result message detail is not required; panels stay presentational. */
  onNavigateStorage?: () => void
}

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
  { id: 'credentials', label: 'backup.cat.credentials', desc: 'backup.cat.credentials.desc', secret: true },
]

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
}: BackupPanelProps) {
  const tr = useT()
  const [targetId, setTargetId] = useState(defaultTargetId ?? targets[0]?.id ?? '')
  const [encrypt, setEncrypt] = useState(false)
  const [includeSecrets, setIncludeSecrets] = useState(false)
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')
  const [scope, setScope] = useState<Set<BackupCategory>>(() => new Set(CATEGORIES.map((c) => c.id)))
  const [touched, setTouched] = useState(false)

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
  const secretsAllowed = encrypt && selectedCats.some((c) => c.secret)
  const noScope = selectedCats.length === 0
  const passwordMissing = encrypt && password.length === 0
  const canSubmit = Boolean(targetId) && !noScope && !passwordMissing && !busy

  const progressValue = useMemo(() => {
    if (!busy) return typeof progress === 'number' ? progress : undefined
    return typeof progress === 'number' ? progress : undefined
  }, [busy, progress])

  const toggleCategory = (id: BackupCategory) => {
    setScope((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stages = [
    { key: 'collect', label: tr('backup.progress.collect') },
    { key: 'pack', label: tr('backup.progress.pack') },
    ...(encrypt ? [{ key: 'encrypt', label: tr('backup.progress.encrypt') }] : []),
    { key: 'upload', label: tr('backup.progress.upload') },
  ]

  if (targets.length === 0) {
    return (
      <div className="dv-page">
        <PageHeader title={tr('backup.title')} subtitle={tr('backup.subtitle')} />
        {error ? <ErrorState error={error} /> : null}
        <EmptyState
          icon={<IconFolder size={22} />}
          title={tr('backup.noTargetsTitle')}
          body={tr('backup.noTargetsBody')}
          actions={
            onNavigateStorage ? (
              <Button variant="primary" icon={<IconHardDrive size={15} />} onClick={onNavigateStorage}>
                {tr('backup.goStorage')}
              </Button>
            ) : null
          }
        />
      </div>
    )
  }

  return (
    <div className="dv-page">
      <PageHeader title={tr('backup.title')} subtitle={tr('backup.subtitle')} />

      {error ? (
        <Banner tone="error" title={tr('backup.failedTitle')}>{error}</Banner>
      ) : null}
      {message ? (
        <Banner tone="ok" title={tr('backup.successTitleShort')}>{message}</Banner>
      ) : null}

      <div className="dv-grid-2" style={{ alignItems: 'start' }}>
        <div className="dv-stack-4">
          <Card>
            <CardHeader icon={<IconHardDrive size={18} />} title={tr('backup.targetTitle')} subtitle={tr('backup.targetSubtitle')} />
            <CardBody>
              <div className="dv-options" role="radiogroup" aria-label={tr('backup.targetTitle')}>
                {targets.map((tg) => {
                  const KindIcon = storageIcon(tg.kind)
                  return (
                    <OptionTile
                      key={tg.id}
                      name="dv-backup-target"
                      checked={tg.id === targetId}
                      onChange={() => setTargetId(tg.id)}
                      icon={<KindIcon size={15} />}
                      title={
                        <span className="dv-row dv-gap-2">
                          {tg.label}
                          {tg.encryptByDefault ? <Badge tone="ok">{tr('backup.targetEncryptedBadge')}</Badge> : null}
                        </span>
                      }
                      description={
                        <span className="dv-stack" style={{ gap: 2 }}>
                          <span>{targetKindLabel(tg, tr)} · {tg.id}</span>
                          <span className="dv-mono dv-faint dv-truncate" title={targetLocation(tg)}>{targetLocation(tg)}</span>
                        </span>
                      }
                    />
                  )
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={encrypt ? <IconLock size={18} /> : <IconUnlock size={18} />}
              title={tr('backup.encTitle')}
              subtitle={tr('backup.encSubtitle')}
              actions={
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
            <CardBody>
              <p className="dv-hint">{tr('backup.encToggleDesc')}</p>
              {encrypt ? (
                <div className="dv-stack-3">
                  <Field
                    label={tr('backup.password')}
                    htmlFor="dv-backup-password"
                    required
                    hint={password ? tr('backup.strength', { level: strengthLabel(tr, strength.level) }) : tr('backup.passwordHint')}
                    error={touched && passwordMissing ? tr('backup.passwordRequired') : null}
                  >
                    <PasswordInput
                      id="dv-backup-password"
                      value={password}
                      autoComplete="new-password"
                      placeholder={tr('backup.passwordPlaceholder')}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-describedby="dv-backup-strength"
                    />
                  </Field>
                  <div id="dv-backup-strength" className="dv-stack" style={{ gap: 6 }}>
                    <Meter level={strength.level} label={tr('backup.strength', { level: strengthLabel(tr, strength.level) })} />
                    <span className="dv-hint">{tr('backup.strengthHint')}</span>
                  </div>
                  <OptionTile
                    shape="square"
                    checked={includeSecrets}
                    onChange={() => {
                      const next = !includeSecrets
                      setIncludeSecrets(next)
                      if (next) setScope((prev) => new Set(prev).add('credentials'))
                    }}
                    title={tr('backup.secrets')}
                    description={tr('backup.secretsDesc')}
                    icon={<IconKey size={15} />}
                  />
                </div>
              ) : (
                <p className="dv-hint">{tr('backup.secretsBlocked')}</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="dv-stack-4">
          <Card hero>
            <CardHeader icon={<IconShieldCheck size={18} />} title={tr('backup.summary')} />
            <CardBody>
              <dl className="dv-kv">
                <dt>{tr('common.target')}</dt>
                <dd>{target ? `${target.label}（${target.id}）` : '—'}</dd>
                <dt>{tr('backup.scopeTitle')}</dt>
                <dd>{tr('backup.scopeCount', { count: selectedCats.length, total: CATEGORIES.length })}</dd>
                <dt>{tr('backup.encTitle')}</dt>
                <dd>
                  <span className="dv-row dv-gap-1">
                    <StatusDot tone={encrypt ? 'ok' : 'neutral'} />
                    {encrypt ? tr('common.encrypted') : tr('common.plaintext')}
                  </span>
                </dd>
                <dt>{tr('backup.secrets')}</dt>
                <dd>{includeSecrets && encrypt ? tr('backup.summaryYes') : tr('backup.summaryNo')}</dd>
              </dl>

              {busy ? (
                <ProgressBar
                  value={progressValue}
                  label={tr('backup.progressTitle')}
                  detail={tr('backup.progressIndeterminate')}
                  stages={stages}
                  activeStage={stage}
                />
              ) : null}

              <CtaButton
                block
                onClick={() => {
                  setTouched(true)
                  if (!canSubmit) return
                  onBackup({
                    targetId,
                    encrypt,
                    password: encrypt ? password : undefined,
                    includeSecrets: includeSecrets && encrypt,
                    notes: notes.trim() || undefined,
                  })
                }}
                disabled={busy}
                loading={busy}
                icon={<IconZap size={18} />}
              >
                {busy ? tr('backup.submitting') : tr('backup.submit')}
              </CtaButton>
              {!busy && (passwordMissing || noScope) ? (
                <p className="dv-hint" data-tone="error">
                  {passwordMissing ? tr('backup.passwordRequired') : tr('backup.noScope')}
                </p>
              ) : null}
              <p className="dv-hint">
                <IconHelp size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                {tr('dashboard.secretsNote')}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
