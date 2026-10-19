import type { BackupResult, RestoreResult } from '../../core/types.js'
import { useT } from '../i18n.js'
import { formatBytes } from '../lib/format.js'
import { pluginReasonText } from '../notices.js'
import { Banner, Button } from './ui.js'

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export type RestoreState = 'ok' | 'partial' | 'failed'

export function restoreState(r: RestoreResult): RestoreState {
  const rows = r.pluginResults ?? []
  const failed = rows.filter((x) => x.status === 'failed').length
  if (!failed && r.ok !== false) return 'ok'
  const good = rows.length - failed
  return good > 0 || r.applied.length > 0 ? 'partial' : 'failed'
}

/** 「恢复完成：插件 8 成功 · 1 失败，文件 121 写入，耗时 12s」 */
export function restoreHeadline(r: RestoreResult, tr: ReturnType<typeof useT>): string {
  const rows = r.pluginResults ?? []
  const failed = rows.filter((x) => x.status === 'failed').length
  const parts: string[] = []
  if (rows.length) parts.push(failed ? tr('summary.restore.plugins', { ok: rows.length - failed, failed }) : tr('summary.restore.pluginsOk', { ok: rows.length }))
  parts.push(tr('summary.restore.files', { applied: r.applied.length }))
  if (r.skipped.length) parts.push(tr('summary.restore.skipped', { skipped: r.skipped.length }))
  if (r.durationMs !== undefined) parts.push(tr('summary.took', { time: formatDuration(r.durationMs) }))
  const state = restoreState(r)
  return `${tr(`summary.restore.${state}`)}：${parts.join('，')}`
}

export function RestoreSummary({
  result,
  detail,
  onRetry,
  retrying,
}: {
  result: RestoreResult
  detail?: string | null
  onRetry?: () => void
  retrying?: boolean
}) {
  const tr = useT()
  const state = restoreState(result)
  const failedRows = (result.pluginResults ?? []).filter((r) => r.status === 'failed')
  return (
    <Banner
      tone={state === 'ok' ? 'ok' : state === 'partial' ? 'warn' : 'error'}
      role={state === 'ok' ? 'status' : 'alert'}
      title={restoreHeadline(result, tr)}
      actions={failedRows.length && onRetry ? (
        <Button size="sm" onClick={onRetry} loading={retrying} disabled={retrying} title={tr('restore.retryDesc')}>
          {retrying ? tr('restore.retrying') : tr('restore.retryFailed')}
        </Button>
      ) : undefined}
    >
      {failedRows.length ? (
        <details className="dv-details" open={failedRows.length <= 3}>
          <summary>{tr('summary.failedList', { count: failedRows.length })}</summary>
          <ul className="dv-result-list">
            {failedRows.map((r) => (
              <li key={`${r.profile}:${r.name}`}>
                <span className="dv-mono">{r.name}</span> <span className="dv-muted">({r.profile})</span>：{pluginReasonText(r, tr)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {result.rollbackSnapshotId ? <div className="dv-hint">{tr('restore.rollbackCreated', { id: result.rollbackSnapshotId })}</div> : null}
      {result.restartRequired || state !== 'failed' ? <div className="dv-hint">{tr('summary.restartDesktop')}</div> : null}
      {detail ? <div className="dv-hint">{detail}</div> : null}
    </Banner>
  )
}

/** 「备份完成：xx 个文件 · xx MB · 插件副本 x 个，保存到 <location>」 */
export function BackupSummary({ result, location }: { result: BackupResult; location: string }) {
  const tr = useT()
  const files = result.manifest?.files?.length ?? 0
  const copies = (result.manifest?.plugins ?? []).filter((p) => p.fallbackBundle || p.bundledSource).length
  const parts = [
    tr('summary.backup.files', { files }),
    formatBytes(result.bytes),
    tr('summary.backup.copies', { copies }),
  ]
  if (result.encrypted) parts.push(tr('common.encrypted'))
  const took = result.durationMs !== undefined ? `，${tr('summary.took', { time: formatDuration(result.durationMs) })}` : ''
  return (
    <Banner tone="ok" role="status" title={`${tr('summary.backup.ok')}：${parts.join(' · ')}${took}`}>
      <div className="dv-hint">{tr('summary.backup.savedTo', { location })}</div>
      <div className="dv-hint dv-mono">{result.snapshotId}</div>
    </Banner>
  )
}
