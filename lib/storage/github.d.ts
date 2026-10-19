import type { GitHubTargetConfig, SnapshotInfo } from '../core/types.js';
import type { StorageAdapter, StorageAdapterFactoryContext } from './types.js';
export type GitHubFetch = typeof fetch;
export declare class GitHubStorageAdapter implements StorageAdapter {
    readonly id: string;
    readonly kind = "github";
    readonly label: string;
    private readonly owner;
    private readonly repo;
    private readonly branch;
    private readonly pathPrefix;
    private readonly tokenDirect?;
    private readonly tokenCredential?;
    private readonly resolveSecret?;
    private readonly fetchImpl;
    constructor(config: GitHubTargetConfig, ctx?: StorageAdapterFactoryContext, fetchImpl?: GitHubFetch);
    private token;
    private objectPath;
    private api;
    private headers;
    put(snapshotId: string, data: Buffer): Promise<{
        remoteKey: string;
    }>;
    get(snapshotIdOrKey: string): Promise<Buffer>;
    private resolvePath;
    list(): Promise<SnapshotInfo[]>;
    delete(snapshotIdOrKey: string): Promise<void>;
}
//# sourceMappingURL=github.d.ts.map