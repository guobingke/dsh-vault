import { GitHubStorageAdapter } from './github.js';
import { LocalStorageAdapter } from './local.js';
import { S3StorageAdapter } from './s3.js';
import { WebDavStorageAdapter } from './webdav.js';
export { LocalStorageAdapter } from './local.js';
export { GitHubStorageAdapter } from './github.js';
export { WebDavStorageAdapter, parsePropfind } from './webdav.js';
export { S3StorageAdapter, signS3Request, buildS3SigningKey, parseListObjects } from './s3.js';
export function createStorageAdapter(config, ctx = {}) {
    switch (config.kind) {
        case 'local':
            return new LocalStorageAdapter(config);
        case 'github':
            return new GitHubStorageAdapter(config, ctx);
        case 'webdav':
            return new WebDavStorageAdapter(config);
        case 's3':
            return new S3StorageAdapter(config);
        default: {
            const _exhaustive = config;
            throw new Error(`unknown storage kind: ${JSON.stringify(_exhaustive)}`);
        }
    }
}
export class StorageRegistry {
    ctx;
    adapters = new Map();
    configs = new Map();
    constructor(configs = [], ctx = {}) {
        this.ctx = ctx;
        for (const config of configs)
            this.upsert(config);
    }
    upsert(config) {
        const adapter = createStorageAdapter(config, this.ctx);
        this.adapters.set(config.id, adapter);
        this.configs.set(config.id, config);
        return adapter;
    }
    remove(id) {
        this.adapters.delete(id);
        this.configs.delete(id);
    }
    get(id) {
        const adapter = this.adapters.get(id);
        if (!adapter)
            throw new Error(`storage target not found: ${id}`);
        return adapter;
    }
    list() {
        return [...this.configs.values()];
    }
    getAdapter(id) {
        return this.get(id);
    }
}
//# sourceMappingURL=index.js.map