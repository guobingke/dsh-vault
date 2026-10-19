import type { StorageTargetConfig } from '../core/types.js';
import type { StorageAdapter, StorageAdapterFactoryContext } from './types.js';
export type { StorageAdapter, StorageAdapterFactoryContext } from './types.js';
export { LocalStorageAdapter } from './local.js';
export { GitHubStorageAdapter } from './github.js';
export { WebDavStorageAdapter, parsePropfind } from './webdav.js';
export { S3StorageAdapter, signS3Request, buildS3SigningKey, parseListObjects } from './s3.js';
export declare function createStorageAdapter(config: StorageTargetConfig, ctx?: StorageAdapterFactoryContext): StorageAdapter;
export declare class StorageRegistry {
    private readonly ctx;
    private adapters;
    private configs;
    constructor(configs?: StorageTargetConfig[], ctx?: StorageAdapterFactoryContext);
    upsert(config: StorageTargetConfig): StorageAdapter;
    remove(id: string): void;
    get(id: string): StorageAdapter;
    list(): StorageTargetConfig[];
    getAdapter(id: string): StorageAdapter;
}
//# sourceMappingURL=index.d.ts.map