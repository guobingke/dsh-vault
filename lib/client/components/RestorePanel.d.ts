import type { ConflictStrategy, RestorePreview, RestoreResult, SnapshotInfo, StorageTargetConfig } from '../../core/types.js';
import { type FsBrowser } from './PathPicker.js';
export interface RestorePanelProps {
    targets: StorageTargetConfig[];
    snapshots: SnapshotInfo[];
    preview: RestorePreview | null;
    busy: boolean;
    message: string | null;
    error: string | null;
    /** `conflict` / `conflicts` annotate the preview so the diff shows per-item `resolution`. */
    onPreview: (input: {
        targetId?: string;
        snapshotId?: string;
        importPath?: string;
        password?: string;
        conflict?: ConflictStrategy;
        conflicts?: Record<string, ConflictStrategy>;
    }) => void;
    onRestore: (input: {
        targetId?: string;
        snapshotId?: string;
        importPath?: string;
        password?: string;
        conflict: ConflictStrategy;
        /** Optional per-path decisions; unspecified paths fall back to `conflict`. */
        conflicts?: Record<string, ConflictStrategy>;
        createRollbackSnapshot?: boolean;
        reinstallPlugins?: boolean;
        /** Write credential files from an encrypted snapshot that carries them (explicit opt-in). */
        includeSecrets?: boolean;
        /** `profile:name` of git / tarball / URL plugin sources the user allowed to be fetched. */
        approvedPluginSources?: string[];
    }) => void;
    loading?: boolean;
    /** Re-attempt only the failed plugins of the shown result (no config rewrite). */
    onRetryFailed?: () => void;
    retrying?: boolean;
    /** Preselect a snapshot (e.g. from the Snapshots tab). */
    initialTargetId?: string;
    initialSnapshotId?: string;
    onNavigateStorage?: () => void;
    /** Filesystem access for the Browse… dialog (in-app browser + optional native chooser). */
    fs?: FsBrowser;
    /** Last restore outcome: per-plugin install results are listed under the banner. */
    result?: RestoreResult | null;
}
export declare function RestorePanel({ targets, snapshots, preview, busy, message, error, onPreview, onRestore, loading, initialTargetId, initialSnapshotId, onNavigateStorage, fs, result, onRetryFailed, retrying, }: RestorePanelProps): import("react").JSX.Element;
//# sourceMappingURL=RestorePanel.d.ts.map