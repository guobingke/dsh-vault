export declare class UnsafePathError extends Error {
    readonly code = "UNSAFE_PATH";
    constructor(message: string);
}
export type TargetState = 'missing' | 'file';
/**
 * Validate that `abs` (a file to be written or deleted below `root`) is reachable without
 * following links and without a type conflict. Returns whether the file exists now.
 */
export declare function checkTarget(root: string, abs: string): Promise<TargetState>;
/** Writes/deletes below roots that can be undone in reverse order. */
export declare class WriteJournal {
    private readonly roots;
    private readonly entries;
    private readonly createdDirs;
    constructor(roots: string[]);
    private rootFor;
    /** Make missing parent folders one by one (each checked) and remember them for undo. */
    private ensureParents;
    write(abs: string, data: Buffer, mode: number): Promise<void>;
    remove(abs: string): Promise<boolean>;
    /** Undo everything in reverse order. Returns paths that could not be restored. */
    rollback(): Promise<string[]>;
}
//# sourceMappingURL=safe-fs.d.ts.map