import { snapshotTimeFromId } from '../core/manifest.js';
import { createHash, createHmac } from 'node:crypto';
import { ARCHIVE_EXTENSION, ENCRYPTED_EXTENSION } from '../core/types.js';
function hmac(key, data) {
    return createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256Hex(data) {
    return createHash('sha256').update(data).digest('hex');
}
function encodeRfc3986(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
export function buildS3SigningKey(secret, dateStamp, region, service) {
    const kDate = hmac(`AWS4${secret}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(kService, 'aws4_request');
}
/** Create AWS SigV4 headers for a single S3-compatible request. */
export function signS3Request(input) {
    const now = input.now ?? new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const dateStamp = amzDate.slice(0, 8);
    const region = input.region || 'auto';
    const service = 's3';
    const endpointUrl = new URL(input.endpoint);
    const host = endpointUrl.host;
    const pathStyle = input.forcePathStyle ?? !host.startsWith(`${input.bucket}.`);
    const canonicalUri = pathStyle
        ? `/${input.bucket}/${input.key.split('/').map(encodeRfc3986).join('/')}`
        : `/${input.key.split('/').map(encodeRfc3986).join('/')}`;
    const url = pathStyle
        ? `${endpointUrl.origin}/${input.bucket}/${input.key}`
        : `${endpointUrl.protocol}//${input.bucket}.${host}/${input.key}`;
    const payloadHash = sha256Hex(input.body ?? Buffer.alloc(0));
    const headers = {
        host: pathStyle ? host : `${input.bucket}.${host}`,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...input.extraHeaders,
    };
    if (input.body)
        headers['content-length'] = String(input.body.length);
    const signedHeaderKeys = Object.keys(headers)
        .map((k) => k.toLowerCase())
        .sort();
    const signedHeaders = signedHeaderKeys.join(';');
    const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k].trim()}\n`).join('');
    const canonicalRequest = [
        input.method,
        canonicalUri,
        '',
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');
    const signingKey = buildS3SigningKey(input.secretAccessKey, dateStamp, region, service);
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { url, headers };
}
export class S3StorageAdapter {
    id;
    kind = 's3';
    label;
    config;
    fetchImpl;
    prefix;
    constructor(config, fetchImpl = fetch) {
        this.id = config.id;
        this.label = config.label;
        this.config = config;
        this.fetchImpl = fetchImpl;
        this.prefix = (config.pathPrefix ?? 'dsh-vault').replace(/^\/+|\/+$/g, '');
    }
    objectKey(name) {
        return `${this.prefix}/${name}`;
    }
    fileName(snapshotId, data) {
        const encrypted = data.toString('utf8', 0, 64).includes('dsh-vault-encrypted');
        return `${snapshotId}${encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION}`;
    }
    async put(snapshotId, data) {
        const name = this.fileName(snapshotId, data);
        const key = this.objectKey(name);
        const signed = signS3Request({
            method: 'PUT',
            endpoint: this.config.endpoint,
            region: this.config.region ?? 'auto',
            bucket: this.config.bucket,
            key,
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey,
            body: data,
            forcePathStyle: this.config.forcePathStyle,
            extraHeaders: { 'content-type': 'application/octet-stream' },
        });
        const res = await this.fetchImpl(signed.url, {
            method: 'PUT',
            headers: signed.headers,
            body: new Uint8Array(data),
        });
        if (!res.ok)
            throw new Error(`S3 put failed (${res.status})`);
        return { remoteKey: name };
    }
    async get(snapshotIdOrKey) {
        const name = snapshotIdOrKey.includes('.') ? snapshotIdOrKey : await this.resolveName(snapshotIdOrKey);
        const signed = signS3Request({
            method: 'GET',
            endpoint: this.config.endpoint,
            region: this.config.region ?? 'auto',
            bucket: this.config.bucket,
            key: this.objectKey(name),
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey,
            forcePathStyle: this.config.forcePathStyle,
        });
        const res = await this.fetchImpl(signed.url, { method: 'GET', headers: signed.headers });
        if (!res.ok)
            throw new Error(`S3 get failed (${res.status})`);
        return Buffer.from(await res.arrayBuffer());
    }
    async resolveName(snapshotId) {
        const list = await this.list();
        const hit = list.find((s) => s.id === snapshotId);
        if (!hit)
            throw new Error(`snapshot not found: ${snapshotId}`);
        return hit.remoteKey;
    }
    async list() {
        const prefix = `${this.prefix}/`;
        // ListObjectsV2 via query string — signed with empty body.
        const endpointUrl = new URL(this.config.endpoint);
        const pathStyle = this.config.forcePathStyle ?? true;
        const listPath = pathStyle ? `/${this.config.bucket}` : `/`;
        const host = pathStyle ? endpointUrl.host : `${this.config.bucket}.${endpointUrl.host}`;
        const query = `list-type=2&prefix=${encodeRfc3986(prefix)}`;
        const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        const dateStamp = amzDate.slice(0, 8);
        const region = this.config.region ?? 'auto';
        const payloadHash = sha256Hex('');
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        const canonicalRequest = ['GET', listPath, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
        const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
        const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
        const signingKey = buildS3SigningKey(this.config.secretAccessKey, dateStamp, region, 's3');
        const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
        const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        const url = pathStyle
            ? `${endpointUrl.origin}${listPath}?${query}`
            : `${endpointUrl.protocol}//${host}/?${query}`;
        const res = await this.fetchImpl(url, {
            method: 'GET',
            headers: {
                host,
                'x-amz-content-sha256': payloadHash,
                'x-amz-date': amzDate,
                authorization,
            },
        });
        if (!res.ok)
            throw new Error(`S3 list failed (${res.status})`);
        const xml = await res.text();
        return parseListObjects(xml, this.id, this.prefix);
    }
    async delete(snapshotIdOrKey) {
        const name = snapshotIdOrKey.includes('.') ? snapshotIdOrKey : await this.resolveName(snapshotIdOrKey);
        const signed = signS3Request({
            method: 'DELETE',
            endpoint: this.config.endpoint,
            region: this.config.region ?? 'auto',
            bucket: this.config.bucket,
            key: this.objectKey(name),
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey,
            forcePathStyle: this.config.forcePathStyle,
        });
        const res = await this.fetchImpl(signed.url, { method: 'DELETE', headers: signed.headers });
        if (!res.ok && res.status !== 204)
            throw new Error(`S3 delete failed (${res.status})`);
    }
}
export function parseListObjects(xml, targetId, prefix) {
    const out = [];
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    const sizes = [...xml.matchAll(/<Size>(\d+)<\/Size>/g)].map((m) => Number(m[1]));
    const modified = [...xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)].map((m) => m[1]);
    keys.forEach((key, i) => {
        const name = key.startsWith(prefix + '/') ? key.slice(prefix.length + 1) : key.split('/').pop();
        if (!name.endsWith(ARCHIVE_EXTENSION) && !name.endsWith(ENCRYPTED_EXTENSION))
            return;
        const id = name.replace(/\.tar\.gz$/i, '').replace(/\.dshvault$/i, '');
        out.push({
            id,
            targetId,
            remoteKey: name,
            createdAt: modified[i] ? new Date(modified[i]).toISOString() : (snapshotTimeFromId(id) ?? new Date(0).toISOString()),
            bytes: sizes[i] ?? 0,
            encrypted: name.endsWith(ENCRYPTED_EXTENSION),
            includeSecrets: false,
        });
    });
    return out;
}
//# sourceMappingURL=s3.js.map