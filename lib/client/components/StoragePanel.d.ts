import type { SnapshotInfo, StorageTargetConfig } from '../../core/types.js';
import { type FsBrowser } from './PathPicker.js';
export interface StoragePanelProps {
    targets: StorageTargetConfig[];
    busy: boolean;
    error: string | null;
    message: string | null;
    onUpsert: (target: StorageTargetConfig) => void;
    onDelete: (id: string) => void;
    snapshots?: SnapshotInfo[];
    loading?: boolean;
    /** Read-only connection probe (GET /snapshots?targetId=). Must never throw raw secrets. */
    testConnection?: (target: StorageTargetConfig) => Promise<{
        ok: boolean;
        count?: number;
        error?: string;
    }>;
    /** Filesystem access for the local-directory Browse… dialog. */
    fs?: FsBrowser;
}
export declare function StoragePanel({ targets, busy, error, message, onUpsert, onDelete, snapshots, loading, testConnection, fs }: StoragePanelProps): import("react").JSX.Element;
//# sourceMappingURL=StoragePanel.d.ts.map