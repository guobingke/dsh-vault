import type { BackupResult, RestoreResult } from '../../core/types.js'
import { useT } from '../i18n.js'
import { formatBytes } from '../lib/format.js'
import { pluginReasonText } from '../notices.js'
import { restartNotice } from '../restart-notice.js'
import { Banner, Button } from './ui.js'

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return ''
  if (ms < 1000) return ms < 100 ? '<0.1s' : `${(ms / 1000).toFixed(1)}s`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export type RestoreState = 'ok' | 'partial' | 'failed'

/** Plugin rows by outcome: skipped rows are neither a success nor a failure. */
export function pluginCounts(r: Pick<RestoreResult, 'pluginResults'>): { ok: number; failed: number; skipped: number } {
  const rows = r.pluginResults ?? []
  const failed = rows.filter((x) => x.status === 'failed').length
  const skipped = rows.filter((x) => x.status === 'skipped').length
  return { ok: rows.length - failed - skipped, failed, skipped }
}

export function restoreState(r: RestoreResult): RestoreState {
  const { ok, failed } = pluginCounts(r)
  if (!failed && r.ok !== false) return 'ok'
  const good = ok
  return good > 0 || r.applied.length > 0 ? 'partial' : 'failed'
}

/** 「恢复完成：插件 8 成功 · 1 失败，文件 121 写入，耗时 12s」 */
export function restoreHeadline(r: RestoreResult, tr: ReturnType<typeof useT>): string {
  const { ok, failed, skipped } = pluginCounts(r)
  const parts: string[] = []
  if (ok || failed) parts.push(failed ? tr('summary.restore.plugins', { ok, failed }) : tr('summary.restore.pluginsOk', { ok }))
  if (skipped) parts.push(tr('summary.restore.pluginsSkipped', { skipped }))
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
  const notice = restartNotice(result)
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
      {result.credentialsWritten ? (
        <div className="dv-hint">
          {result.credentialsWritten.length
            ? tr('restore.credentialsWritten', { files: result.credentialsWritten.join(', ') })
            : tr('restore.credentialsUntouched')}
        </div>
      ) : null}
      {notice ? <p className="dv-restart-notice">{tr(notice.key, notice.vars)}</p> : null}
      {detail ? <div className="dv-hint">{detail}</div> : null}
    </Banner>
  )
}

/**
 * File / plugin-copy counts. API results are trimmed (H-04): the manifest carries
 * `fileCount` / `pluginCopyCount` instead of the file list; a full manifest still works.
 */
export function backupCounts(result: BackupResult): { files: number; copies: number } {
  const m = result.manifest as unknown as { files?: unknown[]; fileCount?: number; pluginCopyCount?: number; plugins?: Array<{ fallbackBundle?: unknown; bundledSource?: unknown; hasCopy?: boolean }> } | undefined
  const files = typeof m?.fileCount === 'number' ? m.fileCount : m?.files?.length ?? 0
  const copies = typeof m?.pluginCopyCount === 'number'
    ? m.pluginCopyCount
    : (m?.plugins ?? []).filter((p) => p.hasCopy || p.fallbackBundle || p.bundledSource).length
  return { files, copies }
}

/** 「备份完成：xx 个文件 · xx MB · 插件副本 x 个，保存到 <location>」 */
export function BackupSummary({ result, location }: { result: BackupResult; location: string }) {
  const tr = useT()
  const { files, copies } = backupCounts(result)
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
