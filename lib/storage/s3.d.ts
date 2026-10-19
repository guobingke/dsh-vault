import type { S3TargetConfig, SnapshotInfo } from '../core/types.js';
import type { StorageAdapter } from './types.js';
export type S3Fetch = typeof fetch;
export declare function buildS3SigningKey(secret: string, dateStamp: string, region: string, service: string): Buffer;
export interface SignedRequest {
    url: string;
    headers: Record<string, string>;
}
/** Create AWS SigV4 headers for a single S3-compatible request. */
export declare function signS3Request(input: {
    method: string;
    endpoint: string;
    region: string;
    bucket: string;
    key: string;
    accessKeyId: string;
    secretAccessKey: string;
    body?: Buffer;
    forcePathStyle?: boolean;
    now?: Date;
    extraHeaders?: Record<string, string>;
}): SignedRequest;
export declare class S3StorageAdapter implements StorageAdapter {
    readonly id: string;
    readonly kind = "s3";
    readonly label: string;
    private readonly config;
    private readonly fetchImpl;
    private readonly prefix;
    constructor(config: S3TargetConfig, fetchImpl?: S3Fetch);
    private objectKey;
    private fileName;
    put(snapshotId: string, data: Buffer): Promise<{
        remoteKey: string;
    }>;
    get(snapshotIdOrKey: string): Promise<Buffer>;
    private resolveName;
    list(): Promise<SnapshotInfo[]>;
    delete(snapshotIdOrKey: string): Promise<void>;
}
export declare function parseListObjects(xml: string, targetId: string, prefix: string): SnapshotInfo[];
//# sourceMappingURL=s3.d.ts.map