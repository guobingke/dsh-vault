import type { BackupCategory, BackupResult, StorageTargetConfig } from '../../core/types.js';
import { type FsBrowser } from './PathPicker.js';
import { type PluginCopiesApi } from './PluginCopiesCard.js';
export interface BackupPanelProps {
    targets: StorageTargetConfig[];
    busy: boolean;
    message: string | null;
    error: string | null;
    progress?: number;
    onBackup: (input: {
        targetId?: string;
        directory?: string;
        exportFile?: string;
        encrypt: boolean;
        password?: string;
        includeSecrets: boolean;
        notes?: string;
        categories?: BackupCategory[];
    }) => void;
    /** Optional: pre-select a target (default target from settings). */
    defaultTargetId?: string;
    /** Optional: current progress stage: collect | pack | encrypt | upload. */
    stage?: string;
    onNavigateStorage?: () => void;
    /** Filesystem access for the Browse… dialog (in-app browser + optional native chooser). */
    fs?: FsBrowser;
    /** Detected plugin data entries under $DSH_HOME (shown under 插件数据). */
    pluginDataEntries?: string[];
    /** Plugin copy selection (保存插件副本); hidden when absent. */
    copiesApi?: PluginCopiesApi;
    /** Last finished backup (completion summary). */
    result?: BackupResult | null;
    resultLocation?: string;
}
/** Suggested export file name: dsh-vault-YYYYMMDD-HHMM.(dshvault|tar.gz). */
export declare function defaultExportName(encrypt: boolean, now?: Date): string;
export declare function BackupPanel({ targets, busy, message, error, progress, onBackup, defaultTargetId, stage, onNavigateStorage, fs, pluginDataEntries, copiesApi, result, resultLocation, }: BackupPanelProps): import("react").JSX.Element;
//# sourceMappingURL=BackupPanel.d.ts.map