import type { SnapshotInfo, StorageTargetConfig } from '../../core/types.js';
import type { Translate } from '../i18n.js';
export declare function newestFirst(a: SnapshotInfo, b: SnapshotInfo): number;
export declare function targetKindLabel(t: StorageTargetConfig, tr: Translate): string;
export declare function targetLocation(t: StorageTargetConfig): string;
/** True when the API reported a stored secret (masked placeholder or legacy plaintext). */
export declare function hasStoredSecret(t: StorageTargetConfig): boolean;
export declare function isSecretMask(value: string | undefined): boolean;
export declare function summarizeSnapshotsByTarget(targets: StorageTargetConfig[], snapshots: SnapshotInfo[]): Array<{
    target: StorageTargetConfig;
    count: number;
    latest?: SnapshotInfo;
}>;
//# sourceMappingURL=targets.d.ts.map