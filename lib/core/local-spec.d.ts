/**
 * Dependency specs that point at the local filesystem (or a workspace) and so
 * cannot be resolved by a registry on another machine.
 *
 * pnpm resolves relative `file:` / `link:` paths against the profile directory
 * (the folder that holds package.json), never against the process cwd.
 */
export type LocalSpec = {
    kind: 'path';
    protocol: 'link' | 'file' | 'portal';
    raw: string;
    path: string;
    tarball: boolean;
} | {
    kind: 'unsupported';
    protocol: 'workspace' | 'catalog';
    raw: string;
};
export declare function isTarballPath(p: string): boolean;
/** `C:\x`, `C:/x`, `\\server\share`. */
export declare function isWindowsAbsPath(p: string): boolean;
export declare function parseLocalSpec(spec: string | undefined | null): LocalSpec | null;
/**
 * Absolute path a local spec refers to, as pnpm would resolve it from `profileDir`.
 * Works on Windows-style strings even when running on POSIX (tests), and vice versa.
 */
export declare function resolveLocalSpecPath(specPath: string, profileDir: string, opts?: {
    home?: string;
    platform?: NodeJS.Platform;
}): string;
/** Path string for a spec written into package.json (pnpm accepts forward slashes everywhere). */
export declare function specPath(abs: string): string;
export type PluginFailureReason = 'local-source-missing' | 'tarball-missing' | 'unsupported-spec' | 'blocked-by-other' | 'registry-not-found' | 'network' | 'installer-missing' | 'missing-deps' | 'version-mismatch' | 'incompatible' | 'git-missing' | 'git-unavailable' | 'no-backup-copy' | 'not-resolvable' | 'no-recorded-source' | 'integrity-mismatch' | 'self' | 'source-not-approved' | 'invalid-spec' | 'unknown';
export interface ClassifiedFailure {
    reason: PluginFailureReason;
    /** Path / spec / package named by the failure, when there is one. */
    subject?: string;
    /** One-line English summary (the UI localizes `reason`). */
    summary: string;
}
/**
 * Classify raw pnpm / dsh output for one plugin. `ownPaths` are this plugin's own
 * local source paths; an ENOENT for any other path means another dependency in the
 * same manifest broke the install.
 */
export declare function classifyInstallFailure(detail: string, ownPaths?: string[], name?: string): ClassifiedFailure;
export declare function decodeConsoleOutput(buf: Buffer, platform?: NodeJS.Platform): string;
/** git+…, github:/gitlab:/bitbucket:, owner/repo shorthand, or an http(s) tarball URL. */
export declare function isRemoteNonRegistrySpec(spec: string | undefined): boolean;
//# sourceMappingURL=local-spec.d.ts.map