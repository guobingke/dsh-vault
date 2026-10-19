import type { RestoreResult } from '../core/types.js';
export type RestartNotice = {
    key: 'summary.restartDsh';
    vars?: undefined;
} | {
    key: 'summary.restartPartial';
    vars: {
        count: number;
    };
} | {
    key: 'summary.restartFailedWritten';
    vars: {
        files: number;
    };
};
/**
 * Which restart prompt to show under a restore summary, or null for none.
 * - everything restored and installed  → full-success notice
 * - files written but some plugins failed → partial notice with the failure count
 * - nothing written → no prompt (nothing changed on disk)
 * - aborted after writing files, no plugin outcome → mention files + rollback
 */
export declare function restartNotice(r: RestoreResult): RestartNotice | null;
//# sourceMappingURL=restart-notice.d.ts.map