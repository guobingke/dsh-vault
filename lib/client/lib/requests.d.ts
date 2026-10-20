/**
 * Request bodies the UI sends. One type from panel → app → API client, built by pure
 * functions, so a field the panel sets (includeSecrets, approvedPluginSources) cannot be
 * dropped on the way: VaultApp forwards the object as-is and the tests check the JSON.
 */
import type { ConflictStrategy } from '../../core/types.js';
export interface RestoreRequestBody {
    targetId?: string;
    snapshotId?: string;
    importPath?: string;
    password?: string;
    conflict: ConflictStrategy;
    conflicts?: Record<string, ConflictStrategy>;
    createRollbackSnapshot?: boolean;
    reinstallPlugins?: boolean;
    /** Write credential files (only honored for encrypted snapshots that carry them). */
    includeSecrets?: boolean;
    /** Source-bound approval keys (`profile:name#hash`) from the preview (H-06). */
    approvedPluginSources?: string[];
}
export interface RestoreFormState {
    usingImport: boolean;
    targetId?: string;
    snapshotId?: string;
    importPath: string;
    password: string;
    conflict: ConflictStrategy;
    conflicts: Record<string, ConflictStrategy>;
    rollback: boolean;
    reinstall: boolean;
    /** The "restore credentials" switch. */
    withSecrets: boolean;
    /** From the preview: the snapshot is encrypted and carries credentials. */
    secretsAvailable: boolean;
    /** Checkbox state per approval key. */
    approvedSources: Record<string, boolean>;
}
export declare function buildRestoreRequest(s: RestoreFormState): RestoreRequestBody;
//# sourceMappingURL=requests.d.ts.map