/** Resolve $DSH_HOME with the same precedence as @deepseek-ai/dsh-home-paths. */
export declare function resolveDshHome(configured?: string, env?: NodeJS.ProcessEnv): string;
/** Resolve $DSH_AGENTS_HOME (shared agents root outside DSH_HOME). */
export declare function resolveAgentsHome(configured?: string, env?: NodeJS.ProcessEnv): string;
/** Plugin-owned data directory under $DSH_HOME. */
export declare function vaultDataDir(dshHome: string, override?: string): string;
export declare function vaultConfigPath(dataDir: string): string;
export declare function vaultTargetsPath(dataDir: string): string;
export declare function vaultSchedulePath(dataDir: string): string;
export declare function vaultTempDir(dataDir: string): string;
export declare function vaultRollbackDir(dataDir: string): string;
/** Normalize to POSIX relative path and reject traversal. */
export declare function toSafeRelPath(rel: string): string;
/** Ensure absPath stays inside root (case-insensitive on Windows). */
export declare function assertInside(root: string, absPath: string): string;
export declare function joinRel(root: string, rel: string): string;
/** Paths that must never be packed unless explicitly opted into secrets mode. */
export declare const SECRET_BASENAMES: Set<string>;
/**
 * The single credential classifier used by backup, preview and restore (M-06).
 * Matches on the basename, case-insensitively, plus any `.credentials.yaml` component.
 */
export declare function isSecretRelPath(rel: string): boolean;
/** Directories skipped while collecting (reinstallable artifacts). */
export declare const SKIP_DIR_NAMES: Set<string>;
export declare function shouldSkipDir(name: string): boolean;
export declare function normalizePathKey(p: string): string;
//# sourceMappingURL=paths.d.ts.map