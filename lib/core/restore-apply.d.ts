import type { ConflictMap } from './conflict.js';
import type { ConflictStrategy, ProgressCallback, RestorePreview, RestoreResult, VaultManifest } from './types.js';
/** One shared rule (H-02/M-06/M-07): a path is a credential if the manifest OR the classifier says so. */
export declare function isSecretEntry(manifest: VaultManifest, path: string): boolean;
/**
 * Apply a snapshot to the live homes, all-or-nothing (H-03):
 *  1. plan every write (and, for private rollbacks, every delete),
 *  2. pre-check every target for links / junctions / type conflicts before touching anything (H-01),
 *  3. write through an undo journal; on any failure every change is reverted and the
 *     error says so.
 */
export declare function applyRestore(input: {
    manifest: VaultManifest;
    files: Map<string, Buffer>;
    dshHome: string;
    agentsHome: string;
    conflict: ConflictStrategy;
    /** Optional per-path overrides; unspecified paths use `conflict`. */
    conflicts?: ConflictMap;
    /**
     * Whether credential files may be written. The caller decides (request AND manifest AND
     * really-encrypted); the manifest's own flag is never consulted here.
     */
    allowSecrets?: boolean;
    /** Snapshot-relative paths to delete (only from a private rollback's `rollbackRemoves`; M-01). */
    removePaths?: string[];
    rollbackSnapshotId?: string;
    onProgress?: ProgressCallback;
}): Promise<RestoreResult>;
export declare function deletePathSafe(abs: string): Promise<void>;
export type { RestorePreview };
//# sourceMappingURL=restore-apply.d.ts.map