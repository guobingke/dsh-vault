import { JobRegistry, type JobState } from './progress.js';
import { type DetectedPlugin, type RegistryLookup } from './plugin-copies.js';
import { type PluginInstallDeps, type PluginManagerLike, type PnpmInvocationLike } from './plugin-install.js';
import type { BackupRequest, BackupResult, ProgressCallback, RestorePreview, RestoreRequest, RestoreResult, ScheduleConfig, SnapshotInfo, StorageTargetConfig, VaultSettings } from './types.js';
/** Native directory chooser; dsh's implementation requires a signal. */
export type PickDirectoryFn = (signal: AbortSignal) => Promise<string | null>;
export interface VaultServiceOptions {
    dshHome?: string;
    agentsHome?: string;
    dataDir?: string;
    dshVersion?: string;
    /** Override active profile (defaults to $DSH_PROFILE / desktop|web). */
    activeProfile?: string;
    resolveSecret?: (ref: string) => Promise<string | undefined>;
    /** In-process dsh pluginManager (preferred on Desktop / web hosts). */
    pluginManager?: PluginManagerLike | null;
    /** Preferred pnpm binary for profile materialization. */
    pnpmCommand?: string;
    /** Host package manager (dsh profileContext.packageManager — Desktop's bundled pnpm). */
    pnpm?: PnpmInvocationLike;
    /** Preferred npm registry (China mainland mirror by default when unset). */
    preferredRegistry?: string | null;
    /** Native OS directory picker from host directoryPicker (optional). */
    pickDirectory?: PickDirectoryFn;
    /** Override plugin install runner (tests). */
    runPluginInstall?: PluginInstallDeps['runCommand'];
    /** Registry version check (tests inject; default queries npm registries with a timeout; null disables). */
    registryLookup?: RegistryLookup | null;
    /** Registry integrity lookup for restore (tests); null disables the check. */
    registryIntegrity?: PluginInstallDeps['registryIntegrity'];
}
export declare class VaultService {
    private readonly options;
    readonly dshHome: string;
    readonly agentsHome: string;
    readonly dataDir: string;
    /** Profile this Host process is running as (`web`, `desktop`, …). */
    readonly activeProfile: string;
    private settings;
    /** Background backup / restore jobs with real progress (polled by the UI). */
    readonly jobs: JobRegistry;
    private registry;
    private rollbackAdapter;
    private scheduleTimer;
    private readonly dshVersion?;
    private pluginManager;
    private readonly pnpmCommand?;
    private readonly pnpm?;
    private preferredRegistry;
    private pickDirectoryFn?;
    private readonly runCommand?;
    constructor(options?: VaultServiceOptions);
    /** Hot-bind host services that may activate after the vault plugin. */
    setPluginManager(manager: PluginManagerLike | null): void;
    setPickDirectory(fn: PickDirectoryFn | undefined): void;
    /** Whether dsh exposes a native OS folder chooser on this host. */
    hasNativePicker(): boolean;
    listFs(path: string): Promise<{
        nativePicker: boolean;
        path: string;
        parent: string | null;
        home: string;
        roots: string[];
        sep: string;
        entries: import("./fs-browse.js").FsEntry[];
    }>;
    createFsDirectory(parent: string, name: string): Promise<string>;
    /**
     * Open dsh's native OS folder chooser. dsh's picker requires an AbortSignal
     * (it dereferences `signal.aborted`), so one is always passed.
     * Returns null when the user cancels; throws NO_NATIVE_PICKER when unavailable.
     */
    pickDirectory(signal?: AbortSignal): Promise<string | null>;
    init(): Promise<void>;
    getSettings(): VaultSettings;
    startBackupJob(req: BackupRequest): JobState<BackupResult>;
    startRestoreJob(req: RestoreRequest): JobState<RestoreResult>;
    startRetryPluginsJob(req?: {
        plugins?: Array<{
            name: string;
            profile: string;
        }>;
    }): JobState<RestoreResult>;
    private registryLookup;
    /** Effective no-copy list for a backup: request overrides, else persisted settings. */
    private copyExcludeFor;
    /** Every plugin in every profile, with registry status and 「建议保存副本」 hints. */
    listPlugins(opts?: {
        checkRegistry?: boolean;
    }): Promise<{
        plugins: Array<DetectedPlugin & {
            copy: boolean;
        }>;
        settings: VaultSettings['pluginCopies'];
        restoreOrder: VaultSettings['pluginRestoreOrder'];
    }>;
    updateSettings(patch: Partial<VaultSettings>): Promise<VaultSettings>;
    /** Stored targets with secrets masked for browser/API responses. */
    listTargets(): StorageTargetConfig[];
    /** Unmasked configs (internal / CLI that already has filesystem access). */
    listTargetsRaw(): StorageTargetConfig[];
    upsertTarget(config: StorageTargetConfig): Promise<StorageTargetConfig[]>;
    removeTarget(id: string): Promise<StorageTargetConfig[]>;
    backup(req: BackupRequest, onProgress?: ProgressCallback): Promise<BackupResult>;
    private backupInner;
    listSnapshots(targetId?: string): Promise<SnapshotInfo[]>;
    deleteSnapshot(targetId: string, snapshotId: string): Promise<void>;
    verify(targetId: string, snapshotId: string, password?: string): Promise<{
        ok: true;
        manifestId: string;
    }>;
    previewRestore(req: Pick<RestoreRequest, 'targetId' | 'snapshotId' | 'importPath' | 'password' | 'conflicts'> & {
        conflict?: RestoreRequest['conflict'];
    }): Promise<RestorePreview>;
    restore(req: RestoreRequest, onProgress?: ProgressCallback): Promise<RestoreResult>;
    private restoreInner;
    private installDeps;
    private registryIntegrity;
    private installPlugins;
    /** ok flag + the (deduplicated) manual actions that follow from plugin results. */
    private finishPluginSummary;
    private lastRestorePath;
    private saveLastRestore;
    private loadLastRestore;
    /**
     * Re-attempt only the failed plugins of the last restore, without rewriting config.
     * Also works after a restore made by an older dsh-vault: plugin records then come
     * from the profile manifests on disk.
     */
    retryFailedPlugins(req?: {
        plugins?: Array<{
            name: string;
            profile: string;
        }>;
    }, onProgress?: ProgressCallback): Promise<RestoreResult>;
    /** Load snapshot bytes from a configured target or an import path (file/folder). */
    private resolveSnapshotBytes;
    getSchedule(): ScheduleConfig;
    updateSchedule(patch: Partial<ScheduleConfig>): Promise<ScheduleConfig>;
    runScheduledBackup(onProgress?: ProgressCallback): Promise<BackupResult | null>;
    stopSchedule(): void;
    private armSchedule;
    private armScheduleAfterFailure;
    private applyRetention;
    /** Status summary for dashboard / tools. */
    status(): Promise<{
        dshHome: string;
        dataDir: string;
        activeProfile: string;
        guiProfiles: string[];
        surface: 'desktop' | 'web' | 'other';
        installPlan: Array<{
            profile: string;
            command: string;
            notes: string[];
        }>;
        targets: StorageTargetConfig[];
        settings: VaultSettings;
        recentSnapshots: SnapshotInfo[];
        /** Plugin-owned entries directly under $DSH_HOME that a backup includes. */
        pluginDataEntries: string[];
    }>;
    private adapterFor;
    private ensureRollbackDir;
    private ensureRollbackAdapter;
    /**
     * Write a pre-restore snapshot into the private 0700 rollback folder under DSH_HOME.
     * Never uses a user-configured local target (USB/sync folders).
     */
    private createPrivateRollbackSnapshot;
    private restoreWillApplySecrets;
}
/** Minimum schedule interval enforced by the timer (and reflected in nextRunAt). */
export declare const MIN_SCHEDULE_MINUTES = 15;
export declare function effectiveIntervalMs(intervalMinutes: number): number;
/** Id of the private local rollback folder (not a user-editable storage target). */
export declare const ROLLBACK_TARGET_ID = "local-rollback";
/** Write a sidecard meta file next to a local snapshot (optional helper for CLI). */
export declare function writeSidecarMeta(dir: string, snapshotId: string, meta: Record<string, unknown>): Promise<void>;
export { isBuiltinDshBundle } from './diff.js';
//# sourceMappingURL=vault-service.d.ts.map