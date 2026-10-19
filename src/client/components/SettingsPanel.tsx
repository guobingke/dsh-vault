import { useEffect, useId, useMemo, useState } from 'react'
import type { KdfAlgorithm, ScheduleConfig, StorageTargetConfig, VaultSettings } from '../../core/types.js'
/** Mirrors core DEFAULT_SCHEDULE; kept local so the browser bundle never pulls node-only core modules. */
const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  intervalMinutes: 1440,
  targetId: 'local-default',
  encrypt: false,
  includeSecrets: false,
  retention: { keepLast: 10 },
}
import { useLocale, useT } from '../i18n.js'
import { formatDateTime, formatInterval } from '../lib/format.js'
import { relativeLabel, targetKindLabel } from '../lib/targets.js'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  CopyButton,
  ErrorState,
  Field,
  LoadingState,
  OptionTile,
  PageHeader,
  Segmented,
  SelectField,
  StatusDot,
  Switch,
  TextInput,
} from './ui.js'
import {
  IconAlert,
  IconCalendar,
  IconClock,
  IconGlobe,
  IconKey,
  IconLanguages,
  IconLock,
  IconMonitor,
  IconMoon,
  IconPlay,
  IconSave,
  IconShield,
  IconSparkles,
  IconSun,
  IconTerminal,
} from './Icons.js'

export type ThemePreference = 'auto' | 'dark' | 'light'

export interface SettingsPanelProps {
  settings: VaultSettings | null
  busy: boolean
  error: string | null
  message: string | null
  onSave: (patch: Partial<VaultSettings>) => void
  onRunSchedule: () => void
  /** Optional: known targets for the schedule/default-target pickers. */
  targets?: StorageTargetConfig[]
  /** Optional: initial fetch in flight. */
  loading?: boolean
  /** Optional: retry the initial fetch. */
  onRetry?: () => void
  /** Optional: language switch (owned by VaultApp). */
  locale?: 'zh' | 'en'
  onLocaleChange?: (locale: 'zh' | 'en') => void
  /** Optional: theme switch (owned by VaultApp). */
  theme?: ThemePreference
  resolvedTheme?: 'dark' | 'light'
  onThemeChange?: (theme: ThemePreference) => void
  /** Optional: data directories for the About card. */
  dshHome?: string
  dataDir?: string
}

const INTERVAL_PRESETS = [15, 30, 60, 360, 720, 1440, 10080] as const

type IntervalKey = 'settings.interval.every15' | 'settings.interval.every30' | 'settings.interval.every60' | 'settings.interval.every360' | 'settings.interval.every720' | 'settings.interval.every1440' | 'settings.interval.every10080'

function intervalLabel(tr: ReturnType<typeof useT>, minutes: number, locale: 'zh' | 'en'): string {
  const map: Record<number, IntervalKey> = {
    15: 'settings.interval.every15',
    30: 'settings.interval.every30',
    60: 'settings.interval.every60',
    360: 'settings.interval.every360',
    720: 'settings.interval.every720',
    1440: 'settings.interval.every1440',
    10080: 'settings.interval.every10080',
  }
  const key = map[minutes]
  return key ? tr(key) : formatInterval(minutes, locale)
}

/** Merge a partial schedule patch without dropping nested retention. */
function mergeSchedule(base: ScheduleConfig, patch: Partial<ScheduleConfig>): ScheduleConfig {
  return {
    ...base,
    ...patch,
    retention: { ...base.retention, ...(patch.retention ?? {}) },
  }
}

export function SettingsPanel({
  settings,
  busy,
  error,
  message,
  onSave,
  onRunSchedule,
  targets = [],
  loading,
  onRetry,
  locale,
  onLocaleChange,
  theme = 'auto',
  resolvedTheme = 'dark',
  onThemeChange,
  dshHome,
  dataDir,
}: SettingsPanelProps) {
  const tr = useT()
  const activeLocale = useLocale()
  const ids = useId()
  const [keepLast, setKeepLast] = useState('10')
  const [schedule, setSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE)
  const [defaultTargetId, setDefaultTargetId] = useState('')
  const [kdf, setKdf] = useState<KdfAlgorithm>('scrypt')
  const [dirty, setDirty] = useState(false)
  const [customInterval, setCustomInterval] = useState('')

  useEffect(() => {
    if (!settings) return
    setKeepLast(String(settings.retention.keepLast))
    setSchedule(settings.schedule)
    setDefaultTargetId(settings.defaultTargetId ?? '')
    setKdf(settings.preferredKdf)
    setDirty(false)
  }, [settings])

  if (!settings && loading) {
    return (
      <div className="dv-page">
        <PageHeader title={tr('settings.title')} subtitle={tr('settings.subtitle')} />
        <LoadingState label={tr('settings.loading')} />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="dv-page">
        <PageHeader title={tr('settings.title')} subtitle={tr('settings.subtitle')} />
        <ErrorState error={error ?? tr('app.error')} onRetry={onRetry} />
      </div>
    )
  }

  const updateSchedule = (patch: Partial<ScheduleConfig>) => {
    setSchedule((prev) => mergeSchedule(prev, patch))
    setDirty(true)
  }

  const validTargetIds = useMemo(() => new Set(targets.map((t) => t.id)), [targets])
  const scheduleTargetMissing = Boolean(schedule.targetId) && targets.length > 0 && !validTargetIds.has(schedule.targetId)
  const intervalTooSmall = schedule.intervalMinutes < 15

  function save() {
    const keep = Math.min(200, Math.max(1, Number(keepLast) || 10))
    const interval = Math.max(15, Math.round(Number(schedule.intervalMinutes) || 15))
    onSave({
      retention: { keepLast: keep },
      schedule: mergeSchedule(schedule, { intervalMinutes: interval, retention: { keepLast: keep } }),
      ...(defaultTargetId ? { defaultTargetId } : {}),
      preferredKdf: kdf,
    })
    setDirty(false)
  }

  return (
    <div className="dv-page">
      <PageHeader
        title={tr('settings.title')}
        subtitle={tr('settings.subtitle')}
        actions={
          <>
            {dirty ? <Badge tone="warn">{tr('settings.dirty')}</Badge> : null}
            <Button
              variant="primary"
              icon={<IconSave size={15} />}
              onClick={save}
              loading={busy}
            >
              {busy ? tr('settings.saving') : tr('settings.save')}
            </Button>
          </>
        }
      />

      {error ? <Banner tone="error" title={tr('app.error')}>{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      <div className="dv-grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHeader
            icon={<IconCalendar size={18} />}
            title={tr('settings.scheduleTitle')}
            subtitle={tr('settings.scheduleSubtitle')}
            actions={<Badge tone={schedule.enabled ? 'ok' : 'neutral'}>{schedule.enabled ? tr('common.enabled') : tr('common.disabled')}</Badge>}
          />
          <CardBody>
            <Switch
              id={`${ids}-sched-on`}
              title={tr('settings.scheduleEnable')}
              checked={schedule.enabled}
              onChange={(e) => updateSchedule({ enabled: e.target.checked })}
            />

            <Field label={tr('settings.intervalPreset')} htmlFor={`${ids}-preset`}>
              <div className="dv-row dv-gap-1" role="group" aria-label={tr('settings.intervalPreset')}>
                {INTERVAL_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    id={m === INTERVAL_PRESETS[0] ? `${ids}-preset` : undefined}
                    className="dv-chip"
                    aria-pressed={schedule.intervalMinutes === m}
                    onClick={() => {
                      updateSchedule({ intervalMinutes: m })
                      setCustomInterval('')
                    }}
                  >
                    {intervalLabel(tr, m, activeLocale)}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={tr('settings.intervalCustom')}
              htmlFor={`${ids}-interval`}
              hint={intervalTooSmall ? undefined : formatInterval(schedule.intervalMinutes, activeLocale)}
              error={intervalTooSmall ? tr('settings.intervalMin') : null}
            >
              <TextInput
                id={`${ids}-interval`}
                type="number"
                min={15}
                step={1}
                className="dv-num"
                value={customInterval || String(schedule.intervalMinutes)}
                onChange={(e) => {
                  setCustomInterval(e.target.value)
                  updateSchedule({ intervalMinutes: Number(e.target.value) || 0 })
                }}
                onBlur={() => {
                  const v = Math.max(15, Math.round(Number(customInterval) || schedule.intervalMinutes || 15))
                  updateSchedule({ intervalMinutes: v })
                  setCustomInterval('')
                }}
                aria-invalid={intervalTooSmall || undefined}
              />
            </Field>

            <Field label={tr('settings.target')} htmlFor={`${ids}-target`} required>
              <SelectField
                id={`${ids}-target`}
                value={schedule.targetId}
                onChange={(e) => updateSchedule({ targetId: e.target.value })}
              >
                {targets.length === 0 ? <option value="">—</option> : null}
                {targets.length > 0 && !validTargetIds.has(schedule.targetId) && schedule.targetId ? (
                  <option value={schedule.targetId}>{schedule.targetId}</option>
                ) : null}
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label} · {targetKindLabel(t, tr)}</option>
                ))}
              </SelectField>
            </Field>
            {scheduleTargetMissing ? (
              <Banner tone="warn" icon={<IconAlert size={16} />}>{tr('settings.scheduleTargetMissing')}</Banner>
            ) : null}

            <Checkbox
              title={tr('settings.encrypt')}
              description={tr('settings.encryptDesc')}
              checked={schedule.encrypt}
              onChange={(e) => updateSchedule({ encrypt: e.target.checked, includeSecrets: e.target.checked ? schedule.includeSecrets : false })}
            />
            <Checkbox
              title={tr('settings.includeSecrets')}
              description={schedule.encrypt ? tr('settings.includeSecretsDesc') : tr('settings.includeSecretsHalted')}
              checked={schedule.includeSecrets && schedule.encrypt}
              disabled={!schedule.encrypt}
              onChange={(e) => updateSchedule({ includeSecrets: e.target.checked })}
            />

            <div className="dv-grid-2" style={{ gap: 8 }}>
              <div className="dv-stack" style={{ gap: 1 }}>
                <span className="dv-hint">{tr('settings.lastRun')}</span>
                <span className="dv-small">{schedule.lastRunAt ? `${formatDateTime(schedule.lastRunAt)}（${relativeLabel(tr, schedule.lastRunAt)}）` : tr('common.never')}</span>
              </div>
              <div className="dv-stack" style={{ gap: 1 }}>
                <span className="dv-hint">{tr('settings.nextRun')}</span>
                <span className="dv-small">{schedule.nextRunAt ? `${formatDateTime(schedule.nextRunAt)}（${relativeLabel(tr, schedule.nextRunAt)}）` : '—'}</span>
              </div>
            </div>

            <div className="dv-row-between">
              <span className="dv-hint">{schedule.enabled ? tr('settings.runNowHint') : tr('settings.runDisabled')}</span>
              <Button size="sm" variant="outline" icon={<IconPlay size={13} />} onClick={onRunSchedule} disabled={busy || !schedule.enabled}>
                {tr('settings.runNow')}
              </Button>
            </div>
          </CardBody>
        </Card>

        <div className="dv-stack-4">
          <Card>
            <CardHeader icon={<IconClock size={18} />} title={tr('settings.retentionTitle')} subtitle={tr('settings.retentionSubtitle')} />
            <CardBody>
              <div className="dv-row dv-gap-3">
                <Field label={tr('settings.keepLast')} htmlFor={`${ids}-keep`} hint={tr('settings.keepLastHint')} className="dv-grow">
                  <TextInput
                    id={`${ids}-keep`}
                    type="number"
                    min={1}
                    max={200}
                    className="dv-num"
                    value={keepLast}
                    onChange={(e) => {
                      setKeepLast(e.target.value)
                      setDirty(true)
                    }}
                  />
                </Field>
              </div>
              <div className="dv-row dv-gap-1">
                {[5, 10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="dv-chip"
                    aria-pressed={Number(keepLast) === n}
                    onClick={() => {
                      setKeepLast(String(n))
                      setDirty(true)
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <Field label={tr('settings.defaultTarget')} htmlFor={`${ids}-default`} hint={tr('settings.defaultTargetHint')}>
                <SelectField id={`${ids}-default`} value={defaultTargetId} onChange={(e) => { setDefaultTargetId(e.target.value); setDirty(true) }}>
                  <option value="">{tr('common.none')}</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>{t.label} · {t.id}</option>
                  ))}
                </SelectField>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconKey size={18} />} title={tr('settings.kdf')} subtitle={tr('settings.kdfHint')} />
            <CardBody>
              <div className="dv-options" role="radiogroup" aria-label={tr('settings.kdf')}>
                <OptionTile
                  name={`${ids}-kdf`}
                  checked={kdf === 'scrypt'}
                  onChange={() => { setKdf('scrypt'); setDirty(true) }}
                  title={tr('backup.kdf.scrypt')}
                  icon={<IconLock size={15} />}
                />
                <OptionTile
                  name={`${ids}-kdf`}
                  checked={kdf === 'argon2id'}
                  onChange={() => { setKdf('argon2id'); setDirty(true) }}
                  title={tr('backup.kdf.argon2id')}
                  icon={<IconShield size={15} />}
                />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="dv-grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHeader icon={<IconLanguages size={18} />} title={tr('settings.languageTitle')} subtitle={tr('settings.languageSubtitle')} />
          <CardBody>
            <Segmented
              label={tr('settings.languageTitle')}
              value={locale ?? activeLocale}
              onChange={(v) => onLocaleChange?.(v)}
              options={[
                { value: 'zh', label: tr('settings.lang.zh') },
                { value: 'en', label: tr('settings.lang.en') },
              ]}
            />
            <span className="dv-hint"><IconGlobe size={12} style={{ verticalAlign: -2 }} /> {tr('settings.lang.auto')}</span>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<IconSparkles size={18} />} title={tr('settings.themeTitle')} subtitle={tr('settings.themeSubtitle')} />
          <CardBody>
            <Segmented
              label={tr('settings.themeTitle')}
              value={theme}
              onChange={(v) => onThemeChange?.(v)}
              options={[
                { value: 'auto', label: tr('settings.theme.auto') },
                { value: 'dark', label: tr('settings.theme.dark') },
                { value: 'light', label: tr('settings.theme.light') },
              ]}
            />
            <span className="dv-hint">
              {theme === 'auto'
                ? <><IconMonitor size={12} style={{ verticalAlign: -2 }} /> {resolvedTheme === 'dark' ? tr('settings.theme.dark') : tr('settings.theme.light')}</>
                : theme === 'dark'
                  ? <><IconMoon size={12} style={{ verticalAlign: -2 }} /> {tr('settings.theme.dark')}</>
                  : <><IconSun size={12} style={{ verticalAlign: -2 }} /> {tr('settings.theme.light')}</>}
            </span>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader icon={<IconTerminal size={18} />} title={tr('settings.aboutTitle')} subtitle={tr('settings.aboutSubtitle')} />
        <CardBody>
          <dl className="dv-kv">
            <dt>{tr('settings.dshHome')}</dt>
            <dd className="dv-row dv-gap-1">
              <span className="dv-mono dv-truncate" title={dshHome}>{dshHome || '—'}</span>
              {dshHome ? <CopyButton text={dshHome} /> : null}
            </dd>
            <dt>{tr('settings.dataDir')}</dt>
            <dd className="dv-row dv-gap-1">
              <span className="dv-mono dv-truncate" title={dataDir}>{dataDir || '—'}</span>
              {dataDir ? <CopyButton text={dataDir} /> : null}
            </dd>
            <dt>{tr('nav.storage')}</dt>
            <dd className="dv-row dv-gap-1">
              <StatusDot tone={targets.length ? 'ok' : 'warn'} />
              {targets.length ? `${targets.length} · ${targets.map((t) => t.label).join(', ')}` : tr('storage.emptyTitle')}
            </dd>
          </dl>
          <Banner tone="info" icon={<IconShield size={16} />}>{tr('settings.secretPolicy')}</Banner>
          <p className="dv-hint">{tr('settings.footer')}</p>
          <div className="dv-row">
            <Button variant="primary" icon={<IconSave size={15} />} onClick={save} loading={busy}>
              {busy ? tr('settings.saving') : tr('settings.save')}
            </Button>
            {dirty ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setKeepLast(String(settings.retention.keepLast))
                  setSchedule(settings.schedule)
                  setDefaultTargetId(settings.defaultTargetId ?? '')
                  setKdf(settings.preferredKdf)
                  setCustomInterval('')
                  setDirty(false)
                }}
              >
                {tr('settings.reset')}
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
