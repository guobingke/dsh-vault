import { useMemo } from 'react'
import type { VaultStatusResponse } from '../api.js'
import type { SnapshotInfo, VaultSettings } from '../../core/types.js'
import { useLocale, useT } from '../i18n.js'
import type { VaultTab } from '../VaultApp.js'
import { formatBytes, formatWhen, scheduleLabel } from '../lib/format.js'
import { newestFirst, summarizeSnapshotsByTarget } from '../lib/targets.js'
import {
  Banner,
  Button,
  DotText,
  EmptyState,
  ErrorState,
  LoadingState,
  Rows,
  SettingRow,
} from './ui.js'

export interface DashboardProps {
  status: VaultStatusResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onBackup: () => void
  /** Optional: all known snapshots (falls back to `status.recentSnapshots`). */
  snapshots?: SnapshotInfo[]
  /** Optional: "Back up now" on the overview row (uses the default target). */
  onBackupNow?: () => void
  backupBusy?: boolean
  /** Optional: sub-section navigation. */
  onNavigate?: (tab: VaultTab) => void
  /** Optional: inline notice shown above the rows (e.g. "snapshot created"). */
  message?: string | null
}

function emptyStatus(): VaultStatusResponse {
  const settings: VaultSettings = {
    retention: { keepLast: 0 },
    preferredKdf: 'scrypt',
    pluginCopies: { enabled: true, exclude: [] },
    pluginRestoreOrder: 'source-first',
    schedule: {
      enabled: false,
      intervalMinutes: 1440,
      targetId: '',
      encrypt: false,
      includeSecrets: false,
      retention: { keepLast: 0 },
    },
  }
  return { dshHome: '', dataDir: '', targets: [], settings, recentSnapshots: [] }
}

/**
 * Overview — plain status lines like the host's own General rows:
 * last backup, snapshot count, auto backup, one text row per storage
 * location (dot + name, not a card grid), and "Back up now" on its own row.
 */
export function Overview({
  status,
  loading,
  error,
  onRefresh,
  onBackup,
  snapshots,
  onBackupNow,
  backupBusy,
  onNavigate,
  message,
}: DashboardProps) {
  const tr = useT()
  const locale = useLocale()

  const data = status ?? (loading ? null : emptyStatus())
  const list = useMemo<SnapshotInfo[]>(
    () => snapshots ?? data?.recentSnapshots ?? [],
    [snapshots, data],
  )

  if (!data) {
    return (
      <>
        <p className="dv-section-desc">{tr('overview.desc')}</p>
        {error ? <ErrorState error={error} onRetry={onRefresh} /> : <LoadingState label={tr('app.loading')} />}
      </>
    )
  }

  const settings = data.settings
  const targets = data.targets
  const summaries = summarizeSnapshotsByTarget(targets, list)
  const latest = [...list].sort(newestFirst)[0]
  const targetLabel = (id: string): string => targets.find((t) => t.id === id)?.label ?? id
  const encrypted = list.filter((s) => s.encrypted).length
  const totalBytes = list.reduce((acc, s) => acc + (s.bytes || 0), 0)
  const schedule = settings.schedule
  const defaultTargetId = settings.defaultTargetId && targets.some((t) => t.id === settings.defaultTargetId)
    ? settings.defaultTargetId
    : targets[0]?.id
  const defaultTarget = targets.find((t) => t.id === defaultTargetId)

  return (
    <>
      <p className="dv-section-desc">{tr('overview.desc')}</p>
      {error ? <ErrorState error={error} onRetry={onRefresh} /> : null}
      {message ? <Banner tone="ok">{message}</Banner> : null}

      {targets.length === 0 && !loading ? (
        <EmptyState
          title={tr('overview.emptyTitle')}
          body={tr('overview.emptyBody')}
          actions={onNavigate ? <Button variant="primary" onClick={() => onNavigate('storage')}>{tr('overview.goStorage')}</Button> : null}
        />
      ) : null}

      <Rows label={tr('overview.desc')}>
        <SettingRow
          title={tr('overview.lastTitle')}
          description={latest?.notes}
          control={
            latest ? (
              <span className="dv-truncate" title={`${latest.id} · ${targetLabel(latest.targetId)}`}>
                {tr('overview.lastValue', {
                  target: targetLabel(latest.targetId),
                  time: formatWhen(latest.createdAt, locale),
                })}
              </span>
            ) : (
              <span className="dv-muted">{tr('overview.lastEmpty')}</span>
            )
          }
        />
        <SettingRow
          title={tr('overview.snapshotsTitle')}
          description={list.length ? tr('overview.snapshotsDesc', { encrypted, plain: list.length - encrypted }) : undefined}
          control={
            <span className="dv-num">
              {list.length ? tr('overview.snapshotsValue', { count: list.length, size: formatBytes(totalBytes) }) : tr('overview.snapshotsEmpty')}
            </span>
          }
        />
        <SettingRow
          title={tr('overview.scheduleTitle')}
          control={
            schedule.enabled ? (
              <span>
                {schedule.nextRunAt
                  ? tr('overview.scheduleValue', { interval: scheduleLabel(locale, schedule.intervalMinutes), time: formatWhen(schedule.nextRunAt, locale) })
                  : tr('overview.scheduleNoNext', { interval: scheduleLabel(locale, schedule.intervalMinutes) })}
              </span>
            ) : (
              <span className="dv-muted">{tr('overview.scheduleOff')}</span>
            )
          }
        />

        {summaries.map(({ target, count, latest: tLatest }) => (
          <SettingRow
            key={target.id}
            title={
              <span className="dv-inline">
                <DotText tone={count > 0 ? 'ok' : 'neutral'}>{target.label}</DotText>
                {target.id === defaultTargetId ? <span className="dv-tag">{tr('common.default')}</span> : null}
              </span>
            }
            description={
              count > 0 && tLatest
                ? tr('storage.lastBackup', { time: formatWhen(tLatest.createdAt, locale) })
                : tr('storage.noSnapshots')
            }
            control={<span className="dv-num dv-muted">{tr('storage.snapshots', { count })}</span>}
          />
        ))}

        <SettingRow
          title={tr('overview.backupRow')}
          description={defaultTarget
            ? tr('overview.backupDescTarget', { target: defaultTarget.label })
            : tr('overview.backupDesc')}
          control={
            onBackupNow ? (
              <Button
                variant="primary"
                onClick={targets.length ? onBackupNow : onBackup}
                loading={backupBusy}
              >
                {tr('overview.backupButton')}
              </Button>
            ) : (
              <Button variant="primary" onClick={onBackup} disabled={targets.length === 0}>
                {tr('overview.backupButton')}
              </Button>
            )
          }
        />
      </Rows>

      <p className="dv-hint">{tr('overview.secretsNote')}</p>
      {loading ? <LoadingState label={tr('app.loading')} /> : null}
    </>
  )
}
