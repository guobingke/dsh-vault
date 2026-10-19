import type { VaultStatusResponse } from '../api.js';
import type { SnapshotInfo } from '../../core/types.js';
import type { VaultTab } from '../VaultApp.js';
export interface DashboardProps {
    status: VaultStatusResponse | null;
    loading: boolean;
    error: string | null;
    onRefresh: () => void;
    onBackup: () => void;
    /** Optional: all known snapshots (falls back to `status.recentSnapshots`). */
    snapshots?: SnapshotInfo[];
    /** Optional: "Back up now" on the overview row (uses the default target). */
    onBackupNow?: () => void;
    backupBusy?: boolean;
    /** Optional: sub-section navigation. */
    onNavigate?: (tab: VaultTab) => void;
    /** Optional: inline notice shown above the rows (e.g. "snapshot created"). */
    message?: string | null;
}
/**
 * Overview — plain status lines like the host's own General rows:
 * last backup, snapshot count, auto backup, one text row per storage
 * location (dot + name, not a card grid), and "Back up now" on its own row.
 */
export declare function Overview({ status, loading, error, onRefresh, onBackup, snapshots, onBackupNow, backupBusy, onNavigate, message, }: DashboardProps): import("react").JSX.Element;
//# sourceMappingURL=Dashboard.d.ts.map