/**
 * What a backup covers: everything under $DSH_HOME except the denylist below.
 * Plugins keep their own data directly under $DSH_HOME (dsh-purge/, redteam/,
 * skin-center/, llm-deepseek/, backups/, …), so an allowlist always misses some.
 *
 * The same rules drive collect (backup), `dsh-vault diff`, and the UI scope list.
 */
export type ExcludeReason = 'chat-history' | 'attachments' | 'vault-own' | 'node-modules' | 'git' | 'plugin-manager-logs' | 'cache' | 'machine-id' | 'secret' | 'machine-state' | 'restored-plugin-sources' | 'runtime' | 'workspace';
/**
 * dsh's workspace registry (Desktop sidebar 工作区): the `workspace` storage domain
 * (@deepseek-ai/dsh-workspace, defineDomain name "workspace") persisted by
 * dsh-storage-json as $DSH_HOME/storages/workspace.json. It holds absolute local
 * project paths (e.g. E:\\travel) and session ids; on another machine those paths do
 * not exist and session creation fails with `failed to ensure project directory`.
 * The file is dedicated to workspaces, so it is excluded whole on backup and never
 * written on restore (the target's own registry is preserved untouched), including
 * for older snapshots that still contain it.
 */
export declare function isWorkspaceStatePath(rel: string): boolean;
export interface ScopeOptions {
    /** Include .credentials.yaml / .env* (only allowed for encrypted backups). */
    includeSecrets?: boolean;
}
/** Why `rel` (POSIX, relative to $DSH_HOME) is not backed up, or null when it is. */
export declare function homeExcludeReason(rel: string, isDir: boolean, opts?: ScopeOptions): ExcludeReason | null;
export declare function isSecretPath(rel: string): boolean;
export interface HomeFile {
    rel: string;
    abs: string;
}
/** Every backed-up regular file under `root` (symlinked files followed, symlinked dirs not). */
export declare function walkHome(root: string, opts?: ScopeOptions, relPrefix?: string): Promise<HomeFile[]>;
export declare function isPluginDataRoot(first: string): boolean;
/** Top-level plugin data entries present in a home (for the UI scope list). */
export declare function listPluginDataEntries(dshHome: string): Promise<string[]>;
/** Human-readable list of what is never backed up (docs / CLI / UI). */
export declare const DOCUMENTED_EXCLUDES: Array<{
    pattern: string;
    reason: ExcludeReason;
    why: string;
}>;
//# sourceMappingURL=home-scope.d.ts.map