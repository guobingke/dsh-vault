import type { ProgressEvent } from './types.js';
export type JobKind = 'backup' | 'restore' | 'retry-plugins';
export type StageId = 'prepare' | 'collect' | 'copies' | 'pack' | 'encrypt' | 'upload' | 'rollback' | 'apply' | 'reinstall' | 'verify' | 'done';
/** Relative weights: plugin install dominates a restore; collecting/packing dominate a backup. */
export declare const STAGE_WEIGHTS: Record<JobKind, Array<[StageId, number]>>;
/** Map the low-level event phases onto UI stages. */
export declare function stageOf(kind: JobKind, phase: ProgressEvent['phase']): StageId | null;
export interface ProgressSnapshot {
    stage: StageId;
    /** 0–100, never decreases. */
    percent: number;
    current?: number;
    total?: number;
    /** Current file / plugin name. */
    item?: string;
    message: string;
}
export declare class ProgressTracker {
    readonly kind: JobKind;
    private readonly stages;
    private readonly sum;
    private last;
    constructor(kind: JobKind);
    get snapshot(): ProgressSnapshot;
    update(ev: ProgressEvent): ProgressSnapshot;
}
export interface JobState<R = unknown> {
    id: string;
    kind: JobKind;
    status: 'running' | 'done' | 'error';
    progress: ProgressSnapshot;
    startedAt: string;
    finishedAt?: string;
    elapsedMs: number;
    result?: R;
    error?: {
        message: string;
        code?: string;
        status?: number;
    };
}
/** One job at a time; finished jobs are kept briefly so a re-mounted UI can still read the result. */
export declare class JobRegistry {
    private readonly keepMs;
    private jobs;
    constructor(keepMs?: number);
    active(): JobState | null;
    /** The running job, else the most recent one. */
    latest(): JobState | null;
    get(id: string): JobState | null;
    start<R>(kind: JobKind, run: (onProgress: (ev: ProgressEvent) => void) => Promise<R>): JobState<R>;
    private view;
    private prune;
}
//# sourceMappingURL=progress.d.ts.map