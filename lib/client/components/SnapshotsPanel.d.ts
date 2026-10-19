import type { SnapshotInfo, StorageTargetConfig } from '../../core/types.js';
export interface VerifyResult {
    ok: boolean;
    manifestId?: string;
    error?: string;
}
export interface SnapshotsPanelProps {
    snapshots: SnapshotInfo[];
    busy: boolean;
    error: string | null;
    message?: string | null;
    onRefresh: () => void;
    onDelete: (targetId: string, snapshotId: string) => void;
    onVerify: (targetId: string, snapshotId: string, password?: string) => void | Promise<VerifyResult | void>;
    targets?: StorageTargetConfig[];
    loading?: boolean;
    onRestoreRequest?: (targetId: string, snapshotId: string) => void;
    onNavigateBackup?: () => void;
}
export declare function SnapshotsPanel({ snapshots, busy, error, message, onRefresh, onDelete, onVerify, targets, loading, onRestoreRequest, onNavigateBackup, }: SnapshotsPanelProps): import("react").JSX.Element;
//# sourceMappingURL=SnapshotsPanel.d.ts.map