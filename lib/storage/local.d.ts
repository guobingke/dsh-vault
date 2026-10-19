import type { LocalTargetConfig, SnapshotInfo } from '../core/types.js';
import type { StorageAdapter } from './types.js';
export declare class LocalStorageAdapter implements StorageAdapter {
    readonly id: string;
    readonly kind = "local";
    readonly label: string;
    private readonly directory;
    constructor(config: LocalTargetConfig);
    private ensureDir;
    private fileFor;
    put(snapshotId: string, data: Buffer): Promise<{
        remoteKey: string;
    }>;
    get(snapshotIdOrKey: string): Promise<Buffer>;
    list(): Promise<SnapshotInfo[]>;
    delete(snapshotIdOrKey: string): Promise<void>;
}
//# sourceMappingURL=local.d.ts.map