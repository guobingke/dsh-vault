export type ApiPathUse = 'list' | 'read' | 'mkdir' | 'write-dir' | 'write-file';
export declare function isWithin(root: string, p: string, platform?: NodeJS.Platform): boolean;
/** Resolve symlinks/junctions on the longest existing prefix, then re-append the rest. */
export declare function realpathLoose(p: string): Promise<string>;
export interface PathPolicyOptions {
    /** Extra approved roots (tests, host config). */
    extraRoots?: string[];
    /** Always refused (plugin data dir with targets.json, rollback snapshots). */
    protectedDirs?: string[];
    home?: string;
    platform?: NodeJS.Platform;
}
export declare class PathPolicy {
    private readonly options;
    private readonly approved;
    private readonly platform;
    private readonly home;
    constructor(options?: PathPolicyOptions);
    /** Remember a folder the user picked in the native OS dialog. */
    approve(path: string | null | undefined): void;
    /** Approved roots (unresolved) for the in-app browser's sidebar. */
    roots(): Promise<string[]>;
    private systemDirs;
    /**
     * Validate an API-supplied path for `use`; returns the realpath-resolved absolute path.
     * Throws VaultUserError 403 PATH_NOT_ALLOWED otherwise.
     */
    check(input: string, use: ApiPathUse): Promise<string>;
}
//# sourceMappingURL=path-policy.d.ts.map