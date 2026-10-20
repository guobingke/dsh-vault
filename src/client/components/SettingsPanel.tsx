import { targetName } from '../lib/format.js'
import { useEffect, useId, useMemo, useState } from 'react'
import type { KdfAlgorithm, ScheduleConfig, StorageTargetConfig, VaultSettings } from '../../core/types.js'
import { useT } from '../i18n.js'
import { formatDateTime, relativeLabel, scheduleLabel } from '../lib/format.js'
import { targetKindLabel } from '../lib/targets.js'
import {
  Banner,
  Button,
  Chips,
  ErrorState,
  Field,
  LoadingState,
  Rows,
  Segmented,
  Select,
  SettingRow,
  Switch,
  TextInput,
} from './ui.js'

/** Mirrors core DEFAULT_SCHEDULE; kept local so the browser bundle never pulls node-only core modules. */
const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  intervalMinutes: 1440,
  targetId: 'local-default',
  encrypt: false,
  includeSecrets: false,
  retention: { keepLast: 10 },
}

const INTERVAL_PRESETS = [60, 360, 720, 1440, 10080] as const
const KEEP_PRESETS = [5, 10, 20, 50, 100] as const

export interface SettingsPanelProps {
  settings: VaultSettings | null
  busy: boolean
  error: string | null
  message: string | null
  onSave: (patch: Partial<VaultSettings>) => void
  onRunSchedule: () => void
  targets?: StorageTargetConfig[]
  loading?: boolean
  onRetry?: () => void
  /** Active host locale (read-only; the UI follows the host). */
  locale: 'zh' | 'en'
}

/** Merge a partial schedule patch without dropping nested retention. */
function mergeSchedule(base: ScheduleConfig, patch: Partial<ScheduleConfig>): ScheduleConfig {
  return {
    ...base,
    ...patch,
    retention: { ...base.retention, ...(patch.retention ?? {}) },
  }
}

/**
 * Auto backup — the former Settings panel: schedule, retention, defaults and
 * one plain language row (read-only, follows the host).
 */
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
}: SettingsPanelProps) {
  const tr = useT()
  const ids = useId()
  // Initialise from the loaded settings so the first render never shows the
  // placeholder schedule (local-default) — the values are synced again below.
  const [keepLast, setKeepLast] = useState(() => String(settings?.retention.keepLast ?? 10))
  const [schedule, setSchedule] = useState<ScheduleConfig>(() => settings?.schedule ?? DEFAULT_SCHEDULE)
  const [defaultTargetId, setDefaultTargetId] = useState(() => settings?.defaultTargetId ?? '')
  const [kdf, setKdf] = useState<KdfAlgorithm>(() => settings?.preferredKdf ?? 'scrypt')
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

  const validTargetIds = useMemo(() => new Set(targets.map((t) => t.id)), [targets])

  if (!settings && loading) {
    return (
      <>
        <p className="dv-section-desc">{tr('schedule.desc')}</p>
        <LoadingState label={tr('schedule.loading')} />
      </>
    )
  }

  if (!settings) {
    return (
      <>
        <p className="dv-section-desc">{tr('schedule.desc')}</p>
        <ErrorState error={error ?? tr('app.error')} onRetry={onRetry} />
      </>
    )
  }

  const updateSchedule = (patch: Partial<ScheduleConfig>) => {
    setSchedule((prev) => mergeSchedule(prev, patch))
    setDirty(true)
  }

  const scheduleTargetMissing = Boolean(schedule.targetId) && targets.length > 0 && !validTargetIds.has(schedule.targetId)
  const intervalTooSmall = schedule.intervalMinutes < 15
  const isPreset = (INTERVAL_PRESETS as readonly number[]).includes(schedule.intervalMinutes)

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
    setCustomInterval('')
  }

  function discard() {
    setKeepLast(String(settings!.retention.keepLast))
    setSchedule(settings!.schedule)
    setDefaultTargetId(settings!.defaultTargetId ?? '')
    setKdf(settings!.preferredKdf)
    setCustomInterval('')
    setDirty(false)
  }

  return (
    <>
      <p className="dv-section-desc">{tr('schedule.desc')}</p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      <Rows label={tr('schedule.desc')}>
        <SettingRow
          title={tr('schedule.enabled')}
          description={tr('schedule.enabledDesc')}
          htmlFor={`${ids}-on`}
          control={<Switch id={`${ids}-on`} checked={schedule.enabled} onChange={() => updateSchedule({ enabled: !schedule.enabled })} />}
        />
        <SettingRow
          stacked
          title={tr('schedule.interval')}
          htmlFor={`${ids}-interval`}
          description={schedule.enabled
            ? (schedule.nextRunAt
                ? tr('schedule.interval.desc', { next: `${formatDateTime(schedule.nextRunAt, locale)}（${relativeLabel(tr, schedule.nextRunAt)}）` })
                : scheduleLabel(locale, schedule.intervalMinutes))
            : undefined}
        >
          <div className="dv-wrap">
            <Chips
              label={tr('schedule.intervalLabel')}
              value={isPreset ? schedule.intervalMinutes : undefined}
              options={[
                ...INTERVAL_PRESETS.map((m) => ({ value: m as number, label: scheduleLabel(locale, m) })),
                { value: -1, label: tr('schedule.custom') },
              ]}
              onChange={(v) => {
                if (v === -1) {
                  setCustomInterval(String(schedule.intervalMinutes))
                  return
                }
                setCustomInterval('')
                updateSchedule({ intervalMinutes: v })
              }}
            />
            {!isPreset || customInterval !== '' ? (
              <Field label={<span className="dv-sr-only">{tr('schedule.custom')}</span>} htmlFor={`${ids}-interval`} error={intervalTooSmall ? tr('schedule.intervalMin') : null}>
                <span className="dv-inline">
                  <TextInput
                    id={`${ids}-interval`}
                    type="number"
                    min={15}
                    step={1}
                    className="dv-input dv-num-input"
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
                    invalid={intervalTooSmall}
                  />
                  <span className="dv-hint">{tr('schedule.customUnit')}</span>
                </span>
              </Field>
            ) : null}
          </div>
        </SettingRow>
        <SettingRow
          stacked
          title={tr('schedule.target')}
          description={scheduleTargetMissing ? tr('schedule.targetMissing') : undefined}
          htmlFor={`${ids}-target`}
          control={
            <Select
              id={`${ids}-target`}
              value={schedule.targetId}
              onChange={(e) => updateSchedule({ targetId: e.target.value })}
            >
              {targets.length === 0 ? <option value="">—</option> : null}
              {scheduleTargetMissing ? <option value={schedule.targetId}>{schedule.targetId}</option> : null}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{targetName(t, tr)} · {targetKindLabel(t, tr)}</option>
              ))}
            </Select>
          }
        />
        <SettingRow
          title={tr('schedule.encrypt')}
          description={tr('schedule.encryptDesc')}
          htmlFor={`${ids}-enc`}
          control={
            <Switch
              id={`${ids}-enc`}
              checked={schedule.encrypt}
              onChange={() => updateSchedule({ encrypt: !schedule.encrypt, includeSecrets: schedule.encrypt ? false : schedule.includeSecrets })}
            />
          }
        />
        <SettingRow
          title={tr('schedule.secrets')}
          description={schedule.encrypt ? tr('schedule.secretsDescEncrypted') : tr('schedule.secretsDescHalted')}
          htmlFor={`${ids}-secrets`}
          control={
            <Switch
              id={`${ids}-secrets`}
              checked={schedule.includeSecrets && schedule.encrypt}
              disabled={!schedule.encrypt}
              onChange={() => updateSchedule({ includeSecrets: !schedule.includeSecrets })}
            />
          }
        />
        <SettingRow
          title={tr('schedule.lastRun')}
          control={
            <span className="dv-muted">
              {schedule.lastRunAt
                ? `${formatDateTime(schedule.lastRunAt, locale)}（${relativeLabel(tr, schedule.lastRunAt)}）`
                : tr('common.never')}
            </span>
          }
        />
        <SettingRow
          title={tr('schedule.runNow')}
          description={schedule.enabled ? tr('schedule.runNowDesc') : tr('schedule.runDisabled')}
          control={
            <Button onClick={onRunSchedule} disabled={busy || !schedule.enabled} loading={busy}>
              {tr('schedule.runNow')}
            </Button>
          }
        />

        <SettingRow
          stacked
          title={tr('schedule.retentionTitle')}
          description={tr('schedule.retentionDesc')}
          htmlFor={`${ids}-keep`}
        >
          <Field label={<span className="dv-sr-only">{tr('schedule.keepLast')}</span>} htmlFor={`${ids}-keep`} hint={tr('schedule.keepLastHint')}>
            <div className="dv-wrap">
              <span className="dv-inline">
                <TextInput
                  id={`${ids}-keep`}
                  type="number"
                  min={1}
                  max={200}
                  className="dv-input dv-num-input"
                  value={keepLast}
                  onChange={(e) => {
                    setKeepLast(e.target.value)
                    setDirty(true)
                  }}
                />
                <span className="dv-hint">{tr('schedule.keepLastUnit')}</span>
              </span>
              <Chips
                label={tr('schedule.keepLast')}
                value={KEEP_PRESETS.includes(Number(keepLast) as 5) ? Number(keepLast) : undefined}
                options={KEEP_PRESETS.map((n) => ({ value: n as number, label: String(n) }))}
                onChange={(n) => {
                  setKeepLast(String(n))
                  setDirty(true)
                }}
              />
            </div>
          </Field>
        </SettingRow>

        <SettingRow
          stacked
          title={tr('schedule.defaultTarget')}
          description={tr('schedule.defaultTargetDesc')}
          htmlFor={`${ids}-default`}
          control={
            <Select
              id={`${ids}-default`}
              value={defaultTargetId}
              onChange={(e) => {
                setDefaultTargetId(e.target.value)
                setDirty(true)
              }}
            >
              <option value="">{tr('common.none')}</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{targetName(t, tr)}</option>
              ))}
            </Select>
          }
        />
        <SettingRow
          title={tr('schedule.kdf')}
          description={tr('schedule.kdfDesc')}
          htmlFor={`${ids}-kdf`}
          control={
            <Segmented
              label={tr('schedule.kdf')}
              value={kdf}
              onChange={(v) => {
                setKdf(v)
                setDirty(true)
              }}
              options={[
                { value: 'scrypt', label: tr('schedule.kdf.scrypt') },
                { value: 'argon2id', label: tr('schedule.kdf.argon2id') },
              ]}
            />
          }
        />
        <SettingRow
          title={tr('schedule.language')}
          description={tr('schedule.languageDesc')}
          control={
            <span className="dv-muted">
              {(locale === 'zh' ? tr('schedule.lang.zh') : tr('schedule.lang.en'))} · {tr('schedule.lang.auto')}
            </span>
          }
        />
      </Rows>

      <div className="dv-card-foot" style={{ justifyContent: 'space-between' }}>
        <span className="dv-hint">{dirty ? tr('schedule.dirty') : ''}</span>
        <span className="dv-inline">
          {dirty ? <Button onClick={discard} disabled={busy}>{tr('schedule.discard')}</Button> : null}
          <Button variant="primary" onClick={save} loading={busy}>
            {busy ? tr('schedule.saving') : tr('schedule.save')}
          </Button>
        </span>
      </div>
    </>
  )
}
