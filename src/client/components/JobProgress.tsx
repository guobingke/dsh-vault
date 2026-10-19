import type { JobView } from '../api.js'
import { useT, type MessageKey } from '../i18n.js'
import { ProgressBar } from './ui.js'
import { formatDuration } from './ResultSummary.js'

/** Thin native bar with the real server-side stage, current item and elapsed time. */
export function JobProgress({ job }: { job: JobView }) {
  const tr = useT()
  const p = job.progress
  const stage = tr(`job.stage.${job.kind === 'backup' ? 'backup' : 'restore'}.${p.stage}` as MessageKey)
  const title = tr(`job.title.${job.kind}` as MessageKey)
  const count = p.total ? ` (${p.current ?? 0}/${p.total})` : ''
  const detail = (
    <>
      {p.item ? <span className="dv-mono" style={{ overflowWrap: 'anywhere' }}>{p.item}</span> : null}
      {p.item ? ' · ' : null}
      {tr('job.elapsed', { time: formatDuration(job.elapsedMs) })}
    </>
  )
  return (
    <div className="dv-job" role="status">
      <ProgressBar value={p.percent} label={`${title} · ${stage}${count}`} detail={detail} />
    </div>
  )
}
