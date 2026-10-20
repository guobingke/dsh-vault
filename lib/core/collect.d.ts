import type { BackupCategory, CollectedFile, CollectOptions, PluginRecord } from './types.js';
/** Extract plugin install records from a profile package.json / cordis patch. */
export declare function extractPluginsFromProfilePackage(packageJsonText: string, profileName: string): PluginRecord[];
export declare function extractPluginsFromPatchYaml(patchText: string, profileName: string): PluginRecord[];
/** Collect all backup-scoped files from a dsh home. */
export declare function collectBackupFiles(options: CollectOptions): Promise<{
    files: CollectedFile[];
    plugins: PluginRecord[];
    dshHome: string;
    agentsHome: string;
    redactedFiles: string[];
}>;
/** Strip URL userinfo / tokens from every string field of a plugin record (H-05). */
export declare function sanitizePluginRecord(p: PluginRecord): PluginRecord;
export interface LockedPackage {
    integrity?: string;
    tarball?: string;
}
/** `name@version` → integrity / tarball from a profile's pnpm-lock.yaml `packages` (v5–v9 keys). */
export declare function lockedPackages(profileDir: string): Promise<Map<string, LockedPackage>>;
/** Top-level packages in a profile's node_modules that look like dsh plugins. */
export declare function extractPluginsFromNodeModules(profileDir: string, profileName: string): Promise<PluginRecord[]>;
/** Category for a relative path (used by restore/diff). */
export declare function categoryForRelPath(rel: string): BackupCategory;
//# sourceMappingURL=collect.d.ts.map