import type { SnapshotInfo, WebDavTargetConfig } from '../core/types.js';
import type { StorageAdapter } from './types.js';
export type WebDavFetch = typeof fetch;
export declare class WebDavStorageAdapter implements StorageAdapter {
    readonly id: string;
    readonly kind = "webdav";
    readonly label: string;
    private readonly url;
    private readonly username?;
    private readonly password?;
    private readonly pathPrefix;
    private readonly fetchImpl;
    constructor(config: WebDavTargetConfig, fetchImpl?: WebDavFetch);
    private authHeaders;
    private objectUrl;
    private fileName;
    put(snapshotId: string, data: Buffer): Promise<{
        remoteKey: string;
    }>;
    get(snapshotIdOrKey: string): Promise<Buffer>;
    private resolveName;
    list(): Promise<SnapshotInfo[]>;
    delete(snapshotIdOrKey: string): Promise<void>;
}
/** Minimal PROPFIND response parser (href + size + modified). */
export declare function parsePropfind(xml: string, targetId: string): SnapshotInfo[];
//# sourceMappingURL=webdav.d.ts.map