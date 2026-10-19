import { useMemo } from 'react'
import type { VaultStatusResponse } from '../api.js'
import type { SnapshotInfo, StorageTargetConfig, VaultSettings } from '../../core/types.js'
import { useLocale, useT, type Translate } from '../i18n.js'
import { formatInterval } from '../lib/format.js'
import {
  formatBytes,
  formatDateTime,
  relativeLabel,
  summarizeSnapshotsByTarget,
  targetKindLabel,
  targetLocation,
} from '../lib/targets.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyButton,
  CtaButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Stat,
  StatusDot,
} from './ui.js'
import {
  IconArchive,
  IconCalendar,
  IconClock,
  IconDatabase,
  IconFolder,
  IconHardDrive,
  IconLock,
  IconRefresh,
  IconSettings,
  IconShieldCheck,
  IconSparkles,
  IconUnlock,
  IconZap,
  storageIcon,
} from './Icons.js'

export interface DashboardProps {
  status: VaultStatusResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onBackup: () => void
  /** Optional composition hooks supplied by VaultApp. */
  onNavigate?: (tab: 'storage' | 'snapshots' | 'settings' | 'backup' | 'restore') => void
  onBackupTo?: (targetId: string) => void
  /** Optional extra recent snapshots (falls back to `status.recentSnapshots`). */
  recentSnapshots?: SnapshotInfo[]
}

function newestFirst(a: SnapshotInfo, b: SnapshotInfo): number {
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
}

function emptyStatus(): VaultStatusResponse {
  const settings: VaultSettings = {
    retention: { keepLast: 0 },
    preferredKdf: 'scrypt',
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

export function Dashboard({ status, loading, error, onRefresh, onBackup, onNavigate, onBackupTo, recentSnapshots }: DashboardProps) {
  const tr = useT()
  const locale = useLocale()

  const data = useMemo(() => status ?? (loading ? null : emptyStatus()), [status, loading])
  const recent: SnapshotInfo[] = useMemo(
    () => recentSnapshots ?? data?.recentSnapshots ?? [],
    [recentSnapshots, data],
  )

  if (!data) {
    return (
      <div className="dv-page">
        <PageHeader title={tr('dashboard.title')} subtitle={tr('dashboard.subtitle')} />
        <LoadingState label={tr('app.loadingStatus')} />
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="dv-page">
        <PageHeader title={tr('dashboard.title')} subtitle={tr('dashboard.subtitle')} />
        <ErrorState error={error} onRetry={onRefresh} />
      </div>
    )
  }

  const settings = data.settings
  const targets = data.targets
  const summaries = summarizeSnapshotsByTarget(targets, recent)
  const latest = [...recent].sort(newestFirst)[0]
  const targetLabel = (id: string): string => targets.find((t) => t.id === id)?.label ?? id
  const latestTarget = latest ? targetLabel(latest.targetId) : null
  const encryptedCount = recent.filter((s) => s.encrypted).length
  const totalBytes = recent.reduce((acc, s) => acc + (s.bytes || 0), 0)
  const schedule = settings.schedule
  const scheduledTarget = targets.find((t) => t.id === schedule.targetId)
  const recurringEncryption = schedule.enabled
    ? schedule.encrypt
    : summaries.some((s) => s.target.encryptByDefault)
  const canBackup = targets.length > 0
  const top = [...recent].sort(newestFirst).slice(0, 5)

  return (
    <div className="dv-page">
      <PageHeader
        title={tr('dashboard.title')}
        subtitle={tr('dashboard.subtitle')}
        actions={
          <>
            <Button variant="ghost" icon={<IconRefresh size={15} />} onClick={onRefresh} loading={loading}>
              {tr('app.refresh')}
            </Button>
            {onNavigate ? (
              <Button variant="ghost" icon={<IconSettings size={15} />} onClick={() => onNavigate('settings')}>
                {tr('nav.settings')}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <ErrorState compact error={error} onRetry={onRefresh} /> : null}

      <div className="dv-kpi">
        <Stat
          icon={<IconArchive size={15} />}
          label={tr('dashboard.lastBackup')}
          value={latest ? relativeLabel(tr, latest.createdAt) : tr('common.never')}
          valueSize={latest ? 'sm' : 'md'}
          foot={
            latest
              ? tr('dashboard.lastBackupFoot', { target: latestTarget ?? '—', ago: formatDateTime(latest.createdAt) })
              : tr('dashboard.noBackupFoot')
          }
        />
        <Stat
          icon={<IconDatabase size={15} />}
          label={tr('dashboard.snapshotCount')}
          value={recent.length}
          foot={
            recent.length
              ? tr('dashboard.snapshotFoot', { encrypted: encryptedCount, totalSize: formatBytes(totalBytes) })
              : tr('dashboard.snapshotFootEmpty')
          }
        />
        <Stat
          icon={<IconCalendar size={15} />}
          label={tr('dashboard.schedule')}
          value={
            <span className="dv-row dv-gap-2">
              <StatusDot tone={schedule.enabled ? 'ok' : 'neutral'} />
              {schedule.enabled ? formatInterval(schedule.intervalMinutes, locale) : tr('common.off')}
            </span>
          }
          valueSize="sm"
          foot={
            schedule.enabled
              ? schedule.nextRunAt
                ? tr('dashboard.scheduleNext', { time: formatDateTime(schedule.nextRunAt) })
                : scheduledTarget?.label ?? '—'
              : tr('dashboard.scheduleOff')
          }
        />
        <Stat
          icon={recurringEncryption ? <IconLock size={15} /> : <IconUnlock size={15} />}
          label={tr('dashboard.encryption')}
          value={
            <span className="dv-row dv-gap-2">
              <StatusDot tone={recurringEncryption ? 'ok' : 'neutral'} />
              {recurringEncryption ? tr('dashboard.encryptionOn') : tr('dashboard.encryptionOff')}
            </span>
          }
          valueSize="sm"
          foot={tr('dashboard.encryptionFoot', { kdf: settings.preferredKdf })}
        />
      </div>

      <div className="dv-hero">
        <div className="dv-hero-main">
          <span className="dv-icon-tile" aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 14 }}>
            <IconShieldCheck size={22} />
          </span>
          <div className="dv-hero-text">
            <div className="dv-hero-title">{tr('dashboard.ctaTitle')}</div>
            <div className="dv-hero-sub">{canBackup ? tr('dashboard.ctaSub') : tr('dashboard.backupUnavailable')}</div>
          </div>
        </div>
        <CtaButton icon={<IconZap size={18} />} onClick={onBackup} disabled={!canBackup}>
          {tr('dashboard.backupNow')}
        </CtaButton>
      </div>

      <Card>
        <CardHeader
          icon={<IconHardDrive size={18} />}
          title={tr('dashboard.targetsTitle')}
          subtitle={tr('dashboard.targetsSubtitle', { count: targets.length })}
          actions={
            onNavigate ? (
              <Button variant="ghost" size="sm" onClick={() => onNavigate('storage')}>
                {tr('nav.storage')}
              </Button>
            ) : null
          }
        />
        <CardBody>
          {targets.length === 0 ? (
            <EmptyState
              compact
              icon={<IconFolder size={22} />}
              title={tr('storage.emptyTitle')}
              body={tr('storage.emptyBody')}
              actions={
                onNavigate ? (
                  <Button variant="primary" size="sm" icon={<IconHardDrive size={14} />} onClick={() => onNavigate('storage')}>
                    {tr('storage.add')}
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="dv-grid-3">
              {summaries.map(({ target, count, bytes, latest: tLatest }) => (
                <TargetStatusCard
                  key={target.id}
                  target={target}
                  count={count}
                  bytes={bytes}
                  latest={tLatest}
                  tr={tr}
                  onBackupTo={onBackupTo}
                />
              ))}
            </div>
          )}
          <p className="dv-hint">{tr('dashboard.secretsNote')}</p>
        </CardBody>
      </Card>

      <div className="dv-grid-2">
        <Card>
          <CardHeader
            icon={<IconClock size={18} />}
            title={tr('dashboard.recentTitle')}
            actions={
              recent.length && onNavigate ? (
                <Button variant="ghost" size="sm" onClick={() => onNavigate('snapshots')}>
                  {tr('dashboard.viewAll')}
                </Button>
              ) : null
            }
          />
          <div className="dv-mt-2">
            {top.length === 0 ? (
              <EmptyState
                compact
                icon={<IconArchive size={22} />}
                title={tr('dashboard.recentEmpty')}
                body={tr('dashboard.recentEmptyBody')}
                actions={
                  <Button variant="primary" size="sm" icon={<IconZap size={14} />} onClick={onBackup} disabled={!canBackup}>
                    {tr('dashboard.backupNow')}
                  </Button>
                }
              />
            ) : (
              <ul className="dv-list" style={{ listStyle: 'none', padding: 0 }}>
                {top.map((s) => (
                  <li key={`${s.targetId}:${s.id}`} className="dv-list-item">
                    <span
                      className="dv-icon-tile"
                      data-size="sm"
                      data-kind={targets.find((t) => t.id === s.targetId)?.kind}
                      aria-hidden="true"
                    >
                      {s.encrypted ? <IconLock size={14} /> : <IconArchive size={14} />}
                    </span>
                    <span className="dv-list-main">
                      <span className="dv-list-title dv-mono">{s.id}</span>
                      <span className="dv-list-sub">
                        {targetLabel(s.targetId)}
                        {s.notes ? ` · ${s.notes}` : ''}
                      </span>
                    </span>
                    <span className="dv-list-meta">
                      {s.encrypted ? <Badge tone="ok">{tr('common.encrypted')}</Badge> : null}
                      <span className="dv-num">{formatBytes(s.bytes)}</span>
                      <span title={formatDateTime(s.createdAt)}>{relativeLabel(tr, s.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={<IconSparkles size={18} />} title={tr('dashboard.envTitle')} />
          <CardBody>
            <dl className="dv-kv">
              <dt>{tr('dashboard.dshHome')}</dt>
              <dd className="dv-row dv-gap-1">
                <span className="dv-mono dv-truncate" title={data.dshHome}>{data.dshHome || '—'}</span>
                {data.dshHome ? <CopyButton text={data.dshHome} /> : null}
              </dd>
              <dt>{tr('dashboard.dataDir')}</dt>
              <dd className="dv-row dv-gap-1">
                <span className="dv-mono dv-truncate" title={data.dataDir}>{data.dataDir || '—'}</span>
                {data.dataDir ? <CopyButton text={data.dataDir} /> : null}
              </dd>
              <dt>{tr('nav.storage')}</dt>
              <dd className="dv-num">{targets.length}</dd>
              <dt>{tr('nav.snapshots')}</dt>
              <dd className="dv-num">
                {recent.length ? tr('dashboard.snapshotFoot', { encrypted: encryptedCount, totalSize: formatBytes(totalBytes) }) : '—'}
              </dd>
            </dl>
            {loading ? (
              <div className="dv-loading-inline" role="status">
                <span className="dv-spinner" aria-hidden="true" />
                {tr('dashboard.loadingHint')}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function TargetStatusCard({
  target,
  count,
  bytes,
  latest,
  tr,
  onBackupTo,
}: {
  target: StorageTargetConfig
  count: number
  bytes: number
  latest?: SnapshotInfo
  tr: Translate
  onBackupTo?: (targetId: string) => void
}) {
  const KindIcon = storageIcon(target.kind)
  return (
    <Card interactive>
      <CardBody>
        <div className="dv-row-between" style={{ alignItems: 'flex-start' }}>
          <div className="dv-row dv-gap-3" style={{ minWidth: 0, flex: 1, flexWrap: 'nowrap' }}>
            <span className="dv-icon-tile" data-size="sm" data-kind={target.kind} aria-hidden="true">
              <KindIcon size={16} />
            </span>
            <div className="dv-stack" style={{ gap: 2, minWidth: 0 }}>
              <span className="dv-card-title dv-truncate" title={target.label}>{target.label}</span>
              <span className="dv-card-sub">{targetKindLabel(target, tr)}</span>
            </div>
          </div>
          <span className="dv-row dv-gap-1" style={{ flex: 'none' }}>
            <StatusDot tone={count > 0 ? 'ok' : 'neutral'} />
            <span className="dv-small dv-muted">{count > 0 ? tr('target.statusReady') : tr('target.statusNoSnapshots')}</span>
          </span>
        </div>
        <div className="dv-mono dv-truncate dv-muted dv-small" title={targetLocation(target)}>{targetLocation(target)}</div>
        <div className="dv-row-between dv-small">
          <span className="dv-num">{tr('target.snapshots', { count })}</span>
          <span className="dv-faint dv-num">{latest ? formatBytes(bytes) : '—'}</span>
        </div>
        <div className="dv-row-between dv-small dv-faint">
          <span className="dv-truncate">
            {latest ? tr('target.latest', { time: relativeLabel(tr, latest.createdAt) }) : tr('target.noSnapshots')}
          </span>
          {target.encryptByDefault ? (
            <Badge tone="ok" icon={<IconLock size={11} />}>{tr('target.encDefault')}</Badge>
          ) : (
            <Badge>{tr('target.plainDefault')}</Badge>
          )}
        </div>
        {onBackupTo ? (
          <Button size="sm" variant="outline" icon={<IconZap size={13} />} onClick={() => onBackupTo(target.id)}>
            {tr('target.backupHere')}
          </Button>
        ) : null}
      </CardBody>
    </Card>
  )
}
