import type { BackupResult, RestoreResult } from '../../core/types.js';
import { useT } from '../i18n.js';
export declare function formatDuration(ms: number | undefined): string;
export type RestoreState = 'ok' | 'partial' | 'failed';
export declare function restoreState(r: RestoreResult): RestoreState;
/** 「恢复完成：插件 8 成功 · 1 失败，文件 121 写入，耗时 12s」 */
export declare function restoreHeadline(r: RestoreResult, tr: ReturnType<typeof useT>): string;
export declare function RestoreSummary({ result, detail, onRetry, retrying, }: {
    result: RestoreResult;
    detail?: string | null;
    onRetry?: () => void;
    retrying?: boolean;
}): import("react").JSX.Element;
/** 「备份完成：xx 个文件 · xx MB · 插件副本 x 个，保存到 <location>」 */
export declare function BackupSummary({ result, location }: {
    result: BackupResult;
    location: string;
}): import("react").JSX.Element;
//# sourceMappingURL=ResultSummary.d.ts.map