import type { ScheduleConfig, StorageTargetConfig, VaultSettings } from './types.js';
export declare const DEFAULT_SCHEDULE: ScheduleConfig;
export declare const DEFAULT_SETTINGS: VaultSettings;
export declare function readJsonFile<T>(path: string, fallback: T): Promise<T>;
export declare function writeJsonFile(path: string, value: unknown): Promise<void>;
export declare function loadSettings(dataDir: string): Promise<VaultSettings>;
export declare function saveSettings(dataDir: string, settings: VaultSettings): Promise<void>;
export declare function loadTargets(dataDir: string): Promise<StorageTargetConfig[]>;
export declare function saveTargets(dataDir: string, targets: StorageTargetConfig[]): Promise<void>;
export declare function defaultLocalTarget(directory: string): StorageTargetConfig;
//# sourceMappingURL=config-store.d.ts.map