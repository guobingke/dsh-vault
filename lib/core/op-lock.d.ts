export interface LockInfo {
    pid: number;
    host: string;
    nonce: string;
    op: string;
    startedAt: string;
    /** Acquisition time (ms since epoch); later heartbeats touch the file mtime. */
    heartbeatAt: number;
}
export interface OperationLockOptions {
    /** How long to wait for another operation (default 30 min). */
    timeoutMs?: number;
    /** Heartbeat age after which a lock from another host / live-looking pid counts as abandoned (default 10 min). */
    staleMs?: number;
    /** Heartbeat interval (default 30 s). */
    heartbeatMs?: number;
    pollMs?: number;
}
export declare class OperationLock {
    private readonly dir;
    private readonly opts;
    private tail;
    private holder;
    constructor(dir: string, opts?: OperationLockOptions);
    get path(): string;
    /** Name of the operation holding the in-process lock, if any. */
    current(): string | null;
    /** Run `fn` exclusively (queued behind earlier calls in this process and other processes). */
    run<T>(op: string, fn: () => Promise<T>): Promise<T>;
    /** Read the current owner record (null when absent or unreadable). */
    read(): Promise<LockInfo | null>;
    private tryCreate;
    private acquire;
    /** Owner provably gone: same host and dead pid, or no heartbeat for staleMs. A live same-host owner is never evicted. */
    abandoned(info: LockInfo): Promise<boolean>;
    /**
     * Move the lock aside only if it is still the one we judged (same nonce); the rename is
     * atomic, so of two contenders only one moves it, and a fresh lock is never removed.
     */
    private evict;
    /** Heartbeat = file mtime (touching is atomic; the owner record itself is never rewritten). */
    private heartbeat;
    /** Remove the lock only if it is still ours (compare, then rename-to-tombstone, then re-check). */
    private release;
}
//# sourceMappingURL=op-lock.d.ts.map