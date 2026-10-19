/**
 * Real backup / restore progress: weighted stages → one monotonic percentage, plus a
 * small in-memory job registry so the UI can poll (and re-attach after navigating away).
 */
import { randomUUID } from 'node:crypto';
/** Relative weights: plugin install dominates a restore; collecting/packing dominate a backup. */
export const STAGE_WEIGHTS = {
    backup: [['prepare', 2], ['collect', 33], ['copies', 25], ['pack', 20], ['encrypt', 8], ['upload', 12]],
    restore: [['prepare', 6], ['rollback', 12], ['apply', 14], ['reinstall', 60], ['verify', 8]],
    'retry-plugins': [['prepare', 2], ['reinstall', 90], ['verify', 8]],
};
/** Map the low-level event phases onto UI stages. */
export function stageOf(kind, phase) {
    switch (phase) {
        case 'prepare':
        case 'download':
        case 'decrypt':
        case 'diff': return 'prepare';
        case 'collect': return 'collect';
        case 'copies': return 'copies';
        case 'pack': return kind === 'backup' ? 'pack' : 'rollback';
        case 'encrypt': return kind === 'backup' ? 'encrypt' : 'rollback';
        case 'upload': return kind === 'backup' ? 'upload' : 'rollback';
        case 'rollback': return 'rollback';
        case 'apply': return 'apply';
        case 'reinstall': return 'reinstall';
        case 'verify': return 'verify';
        case 'done': return 'done';
        default: return null;
    }
}
export class ProgressTracker {
    kind;
    stages;
    sum;
    last;
    constructor(kind) {
        this.kind = kind;
        this.stages = STAGE_WEIGHTS[kind];
        this.sum = this.stages.reduce((a, [, w]) => a + w, 0);
        this.last = { stage: 'prepare', percent: 0, message: '' };
    }
    get snapshot() {
        return this.last;
    }
    update(ev) {
        const stage = stageOf(this.kind, ev.phase);
        if (!stage)
            return this.last;
        if (stage === 'done') {
            this.last = { stage: 'done', percent: 100, message: ev.message };
            return this.last;
        }
        const idx = this.stages.findIndex(([s]) => s === stage);
        if (idx < 0)
            return this.last;
        // Never move back to an earlier stage (e.g. a nested pack inside the rollback step).
        const lastIdx = this.stages.findIndex(([s]) => s === this.last.stage);
        if (idx < lastIdx)
            return this.last;
        const before = this.stages.slice(0, idx).reduce((a, [, w]) => a + w, 0);
        const w = this.stages[idx][1];
        let frac = 0;
        if (typeof ev.fraction === 'number')
            frac = ev.fraction;
        else if (ev.total && ev.total > 0 && typeof ev.current === 'number')
            frac = ev.current / ev.total;
        frac = Math.min(1, Math.max(0, frac));
        const raw = ((before + w * frac) / this.sum) * 100;
        const percent = Math.min(99, Math.max(this.last.percent, Math.floor(raw)));
        const sameStage = stage === this.last.stage;
        this.last = {
            stage,
            percent,
            current: ev.current ?? (sameStage ? this.last.current : undefined),
            total: ev.total ?? (sameStage ? this.last.total : undefined),
            item: ev.item ?? (sameStage && ev.current === undefined ? this.last.item : undefined),
            message: ev.message,
        };
        return this.last;
    }
}
/** One job at a time; finished jobs are kept briefly so a re-mounted UI can still read the result. */
export class JobRegistry {
    keepMs;
    jobs = new Map();
    constructor(keepMs = 30 * 60_000) {
        this.keepMs = keepMs;
    }
    active() {
        for (const j of this.jobs.values())
            if (j.status === 'running')
                return this.view(j);
        return null;
    }
    /** The running job, else the most recent one. */
    latest() {
        const a = this.active();
        if (a)
            return a;
        let best = null;
        for (const j of this.jobs.values())
            if (!best || j.started > best.started)
                best = j;
        return best ? this.view(best) : null;
    }
    get(id) {
        const j = this.jobs.get(id);
        return j ? this.view(j) : null;
    }
    start(kind, run) {
        const running = this.active();
        if (running) {
            const err = new Error(`another ${running.kind} is still running`);
            err.status = 409;
            err.code = 'JOB_RUNNING';
            throw err;
        }
        this.prune();
        const tracker = new ProgressTracker(kind);
        const job = {
            id: randomUUID(),
            kind,
            status: 'running',
            progress: tracker.snapshot,
            startedAt: new Date().toISOString(),
            started: Date.now(),
            elapsedMs: 0,
        };
        this.jobs.set(job.id, job);
        void (async () => {
            try {
                job.result = await run((ev) => { job.progress = tracker.update(ev); });
                job.progress = tracker.update({ phase: 'done', message: 'done' });
                job.status = 'done';
            }
            catch (e) {
                const err = e;
                job.error = { message: err?.message ?? String(e), code: err?.code, status: err?.status };
                job.status = 'error';
            }
            finally {
                job.finishedAt = new Date().toISOString();
                job.elapsedMs = Date.now() - job.started;
            }
        })();
        return this.view(job);
    }
    view(j) {
        const { started, ...rest } = j;
        return { ...rest, elapsedMs: j.status === 'running' ? Date.now() - started : j.elapsedMs };
    }
    prune() {
        const now = Date.now();
        for (const [id, j] of this.jobs)
            if (j.status !== 'running' && now - j.started > this.keepMs)
                this.jobs.delete(id);
    }
}
//# sourceMappingURL=progress.js.map