import type { ConflictStrategy, RestorePreview, RestoreResult, SnapshotInfo, StorageTargetConfig } from '../../core/types.js';
import { type RestoreRequestBody } from '../lib/requests.js';
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
    onRestore: (input: RestoreRequestBody) => void;
    loading?: boolean;
    /** Re-attempt only the failed plugins of the shown result (no config rewrite). */
    onRetryFailed?: () => void;
    retrying?: boolean;
    /** Preselect a snapshot (e.g. from the Snapshots tab). */
    initialTargetId?: string;
    initialSnapshotId?: string;
    /** M-05: largest uncompressed snapshot the host unpacks. */
    archiveLimitBytes?: number;
    /** The user switched between storage target and import (or changed the import path). */
    onSourceChange?: () => void;
    onNavigateStorage?: () => void;
    /** Filesystem access for the Browse… dialog (in-app browser + optional native chooser). */
    fs?: FsBrowser;
    /** Last restore outcome: per-plugin install results are listed under the banner. */
    result?: RestoreResult | null;
}
export declare function RestorePanel({ targets, snapshots, preview, archiveLimitBytes, onSourceChange, busy, message, error, onPreview, onRestore, loading, initialTargetId, initialSnapshotId, onNavigateStorage, fs, result, onRetryFailed, retrying, }: RestorePanelProps): import("react").JSX.Element;
//# sourceMappingURL=RestorePanel.d.ts.map