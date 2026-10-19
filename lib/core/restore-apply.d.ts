import type { ConflictMap } from './conflict.js';
import type { ConflictStrategy, ProgressCallback, RestorePreview, RestoreResult, VaultManifest } from './types.js';
export declare function applyRestore(input: {
    manifest: VaultManifest;
    files: Map<string, Buffer>;
    dshHome: string;
    agentsHome: string;
    conflict: ConflictStrategy;
    /** Optional per-path overrides; unspecified paths use `conflict`. */
    conflicts?: ConflictMap;
    includeSecrets?: boolean;
    rollbackSnapshotId?: string;
    onProgress?: ProgressCallback;
}): Promise<RestoreResult>;
export declare function deletePathSafe(abs: string): Promise<void>;
export type { RestorePreview };
//# sourceMappingURL=restore-apply.d.ts.map