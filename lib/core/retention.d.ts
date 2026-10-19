import type { RetentionPolicy, SnapshotInfo } from './types.js';
export declare const DEFAULT_RETENTION: RetentionPolicy;
/** Return snapshot ids that should be deleted to satisfy keep-last-N. */
export declare function snapshotsToDelete(snapshots: readonly SnapshotInfo[], policy: RetentionPolicy): string[];
//# sourceMappingURL=retention.d.ts.map