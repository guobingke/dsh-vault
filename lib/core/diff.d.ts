import type { ConflictMap } from './conflict.js';
import type { ConflictStrategy, RestorePreview, VaultManifest } from './types.js';
/** Preview restore effects against the live dsh home. */
export declare function previewRestoreDiff(input: {
    manifest: VaultManifest;
    dshHome: string;
    agentsHome: string;
    /** Relative paths currently present that are in scope (optional; when omitted only backup paths are considered for remove). */
    currentScopedPaths?: string[];
    /** When set, each item is annotated with its resolved conflict strategy. */
    conflict?: ConflictStrategy;
    /** Optional per-path overrides for `conflict`. */
    conflicts?: ConflictMap;
    /** Platform recorded by the snapshot manifest. */
    sourcePlatform?: string;
    /** Platform this restore is running on. */
    targetPlatform?: NodeJS.Platform;
}): Promise<RestorePreview>;
export declare function resolveLivePath(rel: string, dshHome: string, agentsHome: string): string;
/** dsh ships its own bundles under the @deepseek-ai/dsh-* scope; they are never reinstalled. */
export declare function isBuiltinDshBundle(name: string): boolean;
//# sourceMappingURL=diff.d.ts.map