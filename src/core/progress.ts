/**
 * Real backup / restore progress: weighted stages → one monotonic percentage, plus a
 * small in-memory job registry so the UI can poll (and re-attach after navigating away).
 */
import { randomUUID } from 'node:crypto'
import type { ProgressEvent } from './types.js'

export type JobKind = 'backup' | 'restore' | 'retry-plugins'
export type StageId = 'prepare' | 'collect' | 'copies' | 'pack' | 'encrypt' | 'upload' | 'rollback' | 'apply' | 'reinstall' | 'verify' | 'done'

/** Relative weights: plugin install dominates a restore; collecting/packing dominate a backup. */
export const STAGE_WEIGHTS: Record<JobKind, Array<[StageId, number]>> = {
  backup: [['prepare', 2], ['collect', 33], ['copies', 25], ['pack', 20], ['encrypt', 8], ['upload', 12]],
  restore: [['prepare', 6], ['rollback', 12], ['apply', 14], ['reinstall', 60], ['verify', 8]],
  'retry-plugins': [['prepare', 2], ['reinstall', 90], ['verify', 8]],
}

/** Map the low-level event phases onto UI stages. */
export function stageOf(kind: JobKind, phase: ProgressEvent['phase']): StageId | null {
  switch (phase) {
    case 'prepare': case 'download': case 'decrypt': case 'diff': return 'prepare'
    case 'collect': return 'collect'
    case 'copies': return 'copies'
    case 'pack': return kind === 'backup' ? 'pack' : 'rollback'
    case 'encrypt': return kind === 'backup' ? 'encrypt' : 'rollback'
    case 'upload': return kind === 'backup' ? 'upload' : 'rollback'
    case 'rollback': return 'rollback'
    case 'apply': return 'apply'
    case 'reinstall': return 'reinstall'
    case 'verify': return 'verify'
    case 'done': return 'done'
    default: return null
  }
}

export interface ProgressSnapshot {
  stage: StageId
  /** 0–100, never decreases. */
  percent: number
  current?: number
  total?: number
  /** Current file / plugin name. */
  item?: string
  message: string
}

export class ProgressTracker {
  private readonly stages: Array<[StageId, number]>
  private readonly sum: number
  private last: ProgressSnapshot

  constructor(readonly kind: JobKind) {
    this.stages = STAGE_WEIGHTS[kind]
    this.sum = this.stages.reduce((a, [, w]) => a + w, 0)
    this.last = { stage: 'prepare', percent: 0, message: '' }
  }

  get snapshot(): ProgressSnapshot {
    return this.last
  }

  update(ev: ProgressEvent): ProgressSnapshot {
    const stage = stageOf(this.kind, ev.phase)
    if (!stage) return this.last
    if (stage === 'done') {
      this.last = { stage: 'done', percent: 100, message: ev.message }
      return this.last
    }
    const idx = this.stages.findIndex(([s]) => s === stage)
    if (idx < 0) return this.last
    // Never move back to an earlier stage (e.g. a nested pack inside the rollback step).
    const lastIdx = this.stages.findIndex(([s]) => s === this.last.stage)
    if (idx < lastIdx) return this.last
    const before = this.stages.slice(0, idx).reduce((a, [, w]) => a + w, 0)
    const w = this.stages[idx]![1]
    let frac = 0
    if (typeof ev.fraction === 'number') frac = ev.fraction
    else if (ev.total && ev.total > 0 && typeof ev.current === 'number') frac = ev.current / ev.total
    frac = Math.min(1, Math.max(0, frac))
    const raw = ((before + w * frac) / this.sum) * 100
    const percent = Math.min(99, Math.max(this.last.percent, Math.floor(raw)))
    const sameStage = stage === this.last.stage
    this.last = {
      stage,
      percent,
      current: ev.current ?? (sameStage ? this.last.current : undefined),
      total: ev.total ?? (sameStage ? this.last.total : undefined),
      item: ev.item ?? (sameStage && ev.current === undefined ? this.last.item : undefined),
      message: ev.message,
    }
    return this.last
  }
}

export interface JobState<R = unknown> {
  id: string
  kind: JobKind
  status: 'running' | 'done' | 'error'
  progress: ProgressSnapshot
  startedAt: string
  finishedAt?: string
  elapsedMs: number
  result?: R
  error?: { message: string; code?: string; status?: number }
}

/** One job at a time; finished jobs are kept briefly so a re-mounted UI can still read the result. */
export class JobRegistry {
  private jobs = new Map<string, JobState & { started: number }>()

  constructor(private readonly keepMs = 30 * 60_000) {}

  active(): JobState | null {
    for (const j of this.jobs.values()) if (j.status === 'running') return this.view(j)
    return null
  }

  /** The running job, else the most recent one. */
  latest(): JobState | null {
    const a = this.active()
    if (a) return a
    let best: (JobState & { started: number }) | null = null
    for (const j of this.jobs.values()) if (!best || j.started > best.started) best = j
    return best ? this.view(best) : null
  }

  get(id: string): JobState | null {
    const j = this.jobs.get(id)
    return j ? this.view(j) : null
  }

  start<R>(kind: JobKind, run: (onProgress: (ev: ProgressEvent) => void) => Promise<R>): JobState<R> {
    const running = this.active()
    if (running) {
      const err = new Error(`another ${running.kind} is still running`) as Error & { status?: number; code?: string }
      err.status = 409
      err.code = 'JOB_RUNNING'
      throw err
    }
    this.prune()
    const tracker = new ProgressTracker(kind)
    const job: JobState & { started: number } = {
      id: randomUUID(),
      kind,
      status: 'running',
      progress: tracker.snapshot,
      startedAt: new Date().toISOString(),
      started: Date.now(),
      elapsedMs: 0,
    }
    this.jobs.set(job.id, job)
    void (async () => {
      try {
        job.result = await run((ev) => { job.progress = tracker.update(ev) })
        job.progress = tracker.update({ phase: 'done', message: 'done' })
        job.status = 'done'
      } catch (e) {
        const err = e as { message?: string; code?: string; status?: number }
        job.error = { message: err?.message ?? String(e), code: err?.code, status: err?.status }
        job.status = 'error'
      } finally {
        job.finishedAt = new Date().toISOString()
        job.elapsedMs = Date.now() - job.started
      }
    })()
    return this.view(job) as JobState<R>
  }

  private view(j: JobState & { started: number }): JobState {
    const { started, ...rest } = j
    return { ...rest, elapsedMs: j.status === 'running' ? Date.now() - started : j.elapsedMs }
  }

  private prune(): void {
    const now = Date.now()
    for (const [id, j] of this.jobs) if (j.status !== 'running' && now - j.started > this.keepMs) this.jobs.delete(id)
  }
}
