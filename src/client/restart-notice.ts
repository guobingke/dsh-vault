import type { RestoreResult } from '../core/types.js'

export type RestartNotice =
  | { key: 'summary.restartDsh'; vars?: undefined }
  | { key: 'summary.restartPartial'; vars: { count: number } }
  | { key: 'summary.restartFailedWritten'; vars: { files: number } }

/**
 * Which restart prompt to show under a restore summary, or null for none.
 * - everything restored and installed  → full-success notice
 * - files written but some plugins failed → partial notice with the failure count
 * - nothing written → no prompt (nothing changed on disk)
 * - aborted after writing files, no plugin outcome → mention files + rollback
 */
export function restartNotice(r: RestoreResult): RestartNotice | null {
  const rows = r.pluginResults ?? []
  const failed = rows.filter((x) => x.status === 'failed').length
  const good = rows.length - failed
  const files = r.applied?.length ?? 0
  if (!failed && r.ok !== false) return { key: 'summary.restartDsh' }
  if (failed && (good > 0 || files > 0)) return { key: 'summary.restartPartial', vars: { count: failed } }
  if (files > 0) return { key: 'summary.restartFailedWritten', vars: { files } }
  return null
}
