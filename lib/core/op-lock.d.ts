export interface LockInfo {
    pid: number;
    host: string;
    op: string;
    startedAt: string;
}
export declare class OperationLock {
    private readonly dir;
    private readonly opts;
    private tail;
    private holder;
    constructor(dir: string, opts?: {
        timeoutMs?: number;
        staleMs?: number;
        pollMs?: number;
    });
    get path(): string;
    /** Name of the operation holding the in-process lock, if any. */
    current(): string | null;
    /** Run `fn` exclusively (queued behind earlier calls in this process and other processes). */
    run<T>(op: string, fn: () => Promise<T>): Promise<T>;
    private acquireFile;
    private read;
    private isStale;
}
//# sourceMappingURL=op-lock.d.ts.map