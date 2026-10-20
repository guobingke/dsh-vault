import type { UnfinishedRestore, BackupCategory, BackupResult, ConflictStrategy, KdfAlgorithm, RestorePreview, RestoreResult, ScheduleConfig, SnapshotInfo, StorageTargetConfig, VaultSettings } from '../core/types.js';
import type { FsListingView } from './components/PathPicker.js';
import type { RestoreRequestBody } from './lib/requests.js';
/** Per-path overrides for the global conflict strategy (keys are snapshot-relative paths). */
export type RestoreConflicts = Record<string, ConflictStrategy>;
export declare class VaultApiError extends Error {
    readonly status: number;
    readonly code?: string | undefined;
    constructor(message: string, status: number, code?: string | undefined);
}
export interface VaultStatusResponse {
    dshHome: string;
    dataDir: string;
    /** Host process profile (`web`, `desktop`, …) — optional on older hosts. */
    activeProfile?: string;
    /** Derived surface: `desktop` | `web` | `other` — optional on older hosts. */
    surface?: 'desktop' | 'web' | 'other';
    guiProfiles?: string[];
    targets: StorageTargetConfig[];
    settings: VaultSettings;
    recentSnapshots: SnapshotInfo[];
    /** Plugin data folders/files under $DSH_HOME included in backups (newer hosts). */
    pluginDataEntries?: string[];
    /** H-03: a restore interrupted by a crash (newer hosts). */
    unfinishedRestore?: UnfinishedRestore | null;
    /** M-05: largest uncompressed snapshot this machine unpacks (newer hosts). */
    archiveLimitBytes?: number;
}
export interface DetectedPluginView {
    key: string;
    name: string;
    profile: string;
    kind: 'npm' | 'github' | 'local';
    version?: string;
    cordisOnly: boolean;
    installed: boolean;
    registry: 'present' | 'missing' | 'unknown' | 'not-applicable';
    recommended: boolean;
    copy: boolean;
}
export interface PluginListResponse {
    plugins: DetectedPluginView[];
    settings: VaultSettings['pluginCopies'];
    restoreOrder: VaultSettings['pluginRestoreOrder'];
}
export interface JobView<R = unknown> {
    id: string;
    kind: 'backup' | 'restore' | 'retry-plugins';
    status: 'running' | 'done' | 'error';
    progress: {
        stage: string;
        percent: number;
        current?: number;
        total?: number;
        item?: string;
        message: string;
    };
    startedAt: string;
    finishedAt?: string;
    elapsedMs: number;
    result?: R;
    error?: {
        message: string;
        code?: string;
        status?: number;
    };
}
export declare class VaultApi {
    startBackupJob(body: Parameters<VaultApi['backup']>[0]): Promise<JobView<BackupResult>>;
    startRestoreJob(body: Parameters<VaultApi['restore']>[0]): Promise<JobView<RestoreResult>>;
    startRetryPluginsJob(plugins?: Array<{
        name: string;
        profile: string;
    }>): Promise<JobView<RestoreResult>>;
    /** A job by id, or the running / most recent one. */
    getJob(id?: string): Promise<{
        job: JobView | null;
    }>;
    listPlugins(checkRegistry?: boolean): Promise<PluginListResponse>;
    status(): Promise<VaultStatusResponse>;
    dismissUnfinishedRestore(): Promise<{
        ok: boolean;
    }>;
    getSettings(): Promise<VaultSettings>;
    updateSettings(patch: Partial<VaultSettings>): Promise<VaultSettings>;
    listTargets(): Promise<{
        targets: StorageTargetConfig[];
    }>;
    upsertTarget(target: StorageTargetConfig): Promise<{
        targets: StorageTargetConfig[];
    }>;
    deleteTarget(id: string): Promise<{
        targets: StorageTargetConfig[];
    }>;
    backup(body: {
        targetId?: string;
        directory?: string;
        exportFile?: string;
        /** Replace an existing export file (asked for explicitly after a 409 EXPORT_EXISTS). */
        overwrite?: boolean;
        encrypt?: boolean;
        password?: string;
        includeSecrets?: boolean;
        notes?: string;
        categories?: BackupCategory[];
        kdf?: KdfAlgorithm;
        bundleLocalPlugins?: boolean;
        bundlePluginCopies?: boolean;
        pluginCopyExclude?: string[];
    }): Promise<BackupResult>;
    listFs(path: string): Promise<FsListingView>;
    mkdir(path: string, name: string): Promise<{
        path: string;
    }>;
    pickDirectory(): Promise<{
        path: string | null;
    }>;
    listSnapshots(targetId?: string): Promise<{
        snapshots: SnapshotInfo[];
    }>;
    deleteSnapshot(targetId: string, snapshotId: string): Promise<{
        ok: true;
    }>;
    verify(targetId: string, snapshotId: string, password?: string): Promise<{
        ok: true;
        manifestId: string;
    }>;
    /**
     * Preview a restore diff. When `conflict` is set, every item in the response
     * carries a `resolution` for that path (global default + optional overrides).
     */
    previewRestore(targetId: string | undefined, snapshotId: string | undefined, password?: string, conflict?: ConflictStrategy, conflicts?: RestoreConflicts, importPath?: string): Promise<RestorePreview>;
    restore(body: RestoreRequestBody): Promise<RestoreResult>;
    /** Re-attempt only the given failed plugins (or all failed ones of the last restore). */
    retryPlugins(plugins?: Array<{
        name: string;
        profile: string;
    }>): Promise<RestoreResult>;
    getSchedule(): Promise<ScheduleConfig>;
    updateSchedule(patch: Partial<ScheduleConfig>): Promise<ScheduleConfig>;
    runSchedule(): Promise<{
        result: BackupResult | null;
    }>;
}
//# sourceMappingURL=api.d.ts.map