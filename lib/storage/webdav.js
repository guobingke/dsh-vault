import { snapshotTimeFromId } from '../core/manifest.js';
import { ARCHIVE_EXTENSION, ENCRYPTED_EXTENSION } from '../core/types.js';
function joinUrl(base, ...parts) {
    const root = base.replace(/\/+$/, '');
    const rel = parts
        .map((p) => p.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
    return `${root}/${rel}`;
}
export class WebDavStorageAdapter {
    id;
    kind = 'webdav';
    label;
    url;
    username;
    password;
    pathPrefix;
    fetchImpl;
    constructor(config, fetchImpl = fetch) {
        this.id = config.id;
        this.label = config.label;
        this.url = config.url;
        this.username = config.username;
        this.password = config.password;
        this.pathPrefix = (config.pathPrefix ?? 'dsh-vault').replace(/^\/+|\/+$/g, '');
        this.fetchImpl = fetchImpl;
    }
    authHeaders() {
        if (!this.username)
            return {};
        const token = Buffer.from(`${this.username}:${this.password ?? ''}`).toString('base64');
        return { authorization: `Basic ${token}` };
    }
    objectUrl(name) {
        return joinUrl(this.url, this.pathPrefix, name);
    }
    fileName(snapshotId, data) {
        const encrypted = data.toString('utf8', 0, 64).includes('dsh-vault-encrypted');
        return `${snapshotId}${encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION}`;
    }
    async put(snapshotId, data) {
        const name = this.fileName(snapshotId, data);
        // Ensure collection exists (best-effort MKCOL).
        await this.fetchImpl(joinUrl(this.url, this.pathPrefix), {
            method: 'MKCOL',
            headers: this.authHeaders(),
        }).catch(() => undefined);
        const res = await this.fetchImpl(this.objectUrl(name), {
            method: 'PUT',
            headers: {
                ...this.authHeaders(),
                'content-type': 'application/octet-stream',
            },
            body: new Uint8Array(data),
        });
        if (!res.ok && res.status !== 201 && res.status !== 204) {
            throw new Error(`WebDAV put failed (${res.status})`);
        }
        return { remoteKey: name };
    }
    async get(snapshotIdOrKey) {
        const name = snapshotIdOrKey.includes('.') ? snapshotIdOrKey : await this.resolveName(snapshotIdOrKey);
        const res = await this.fetchImpl(this.objectUrl(name), { headers: this.authHeaders() });
        if (!res.ok)
            throw new Error(`WebDAV get failed (${res.status})`);
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
        const res = await this.fetchImpl(joinUrl(this.url, this.pathPrefix), {
            method: 'PROPFIND',
            headers: {
                ...this.authHeaders(),
                depth: '1',
                'content-type': 'application/xml',
            },
            body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>`,
        });
        if (res.status === 404)
            return [];
        if (!res.ok && res.status !== 207)
            throw new Error(`WebDAV list failed (${res.status})`);
        const xml = await res.text();
        return parsePropfind(xml, this.id);
    }
    async delete(snapshotIdOrKey) {
        const name = snapshotIdOrKey.includes('.') ? snapshotIdOrKey : await this.resolveName(snapshotIdOrKey);
        const res = await this.fetchImpl(this.objectUrl(name), {
            method: 'DELETE',
            headers: this.authHeaders(),
        });
        if (!res.ok && res.status !== 204)
            throw new Error(`WebDAV delete failed (${res.status})`);
    }
}
/** Minimal PROPFIND response parser (href + size + modified). */
export function parsePropfind(xml, targetId) {
    const responses = xml.split(/<d:response[\s>]/i).slice(1);
    const out = [];
    for (const chunk of responses) {
        const href = /<d:href>([^<]+)<\/d:href>/i.exec(chunk)?.[1];
        if (!href)
            continue;
        const name = decodeURIComponent(href.replace(/\/$/, '').split('/').pop() ?? '');
        if (!name || (!name.endsWith(ARCHIVE_EXTENSION) && !name.endsWith(ENCRYPTED_EXTENSION)))
            continue;
        const size = Number(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/i.exec(chunk)?.[1] ?? 0);
        const modified = /<d:getlastmodified>([^<]+)<\/d:getlastmodified>/i.exec(chunk)?.[1];
        const id = name.replace(/\.tar\.gz$/i, '').replace(/\.dshvault$/i, '');
        out.push({
            id,
            targetId,
            remoteKey: name,
            createdAt: modified ? new Date(modified).toISOString() : (snapshotTimeFromId(id) ?? new Date(0).toISOString()),
            bytes: size,
            encrypted: name.endsWith(ENCRYPTED_EXTENSION),
            includeSecrets: false,
        });
    }
    return out;
}
//# sourceMappingURL=webdav.js.map