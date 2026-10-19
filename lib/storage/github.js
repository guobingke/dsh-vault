import { snapshotTimeFromId } from '../core/manifest.js';
import { ENCRYPTED_EXTENSION, ARCHIVE_EXTENSION } from '../core/types.js';
export class GitHubStorageAdapter {
    id;
    kind = 'github';
    label;
    owner;
    repo;
    branch;
    pathPrefix;
    tokenDirect;
    tokenCredential;
    resolveSecret;
    fetchImpl;
    constructor(config, ctx = {}, fetchImpl = fetch) {
        this.id = config.id;
        this.label = config.label;
        this.owner = config.owner;
        this.repo = config.repo;
        this.branch = config.branch ?? 'main';
        this.pathPrefix = (config.pathPrefix ?? 'dsh-vault').replace(/^\/+|\/+$/g, '');
        this.tokenDirect = config.token;
        this.tokenCredential = config.tokenCredential;
        this.resolveSecret = ctx.resolveSecret;
        this.fetchImpl = fetchImpl;
    }
    async token() {
        if (this.tokenDirect)
            return this.tokenDirect;
        if (this.tokenCredential && this.resolveSecret) {
            const v = await this.resolveSecret(this.tokenCredential);
            if (v)
                return v;
        }
        if (process.env.GITHUB_TOKEN)
            return process.env.GITHUB_TOKEN;
        if (process.env.GH_TOKEN)
            return process.env.GH_TOKEN;
        throw new Error('GitHub token not available (set token, credential ref, or GITHUB_TOKEN)');
    }
    objectPath(snapshotId, encrypted) {
        const ext = encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION;
        return `${this.pathPrefix}/${snapshotId}${ext}`;
    }
    api(path) {
        return `https://api.github.com/repos/${this.owner}/${this.repo}${path}`;
    }
    async headers(json = true) {
        const token = await this.token();
        return {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
            'user-agent': 'dsh-vault',
            ...(json ? { 'content-type': 'application/json' } : {}),
        };
    }
    async put(snapshotId, data) {
        const encrypted = data.toString('utf8', 0, 64).includes('dsh-vault-encrypted');
        const path = this.objectPath(snapshotId, encrypted);
        let sha;
        const existing = await this.fetchImpl(this.api(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`), {
            headers: await this.headers(),
        });
        if (existing.ok) {
            const body = (await existing.json());
            sha = body.sha;
        }
        const res = await this.fetchImpl(this.api(`/contents/${path}`), {
            method: 'PUT',
            headers: await this.headers(),
            body: JSON.stringify({
                message: `dsh-vault: snapshot ${snapshotId}`,
                content: data.toString('base64'),
                branch: this.branch,
                ...(sha ? { sha } : {}),
            }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`GitHub put failed (${res.status}): ${text.slice(0, 200)}`);
        }
        return { remoteKey: path };
    }
    async get(snapshotIdOrKey) {
        const path = snapshotIdOrKey.includes('/')
            ? snapshotIdOrKey
            : await this.resolvePath(snapshotIdOrKey);
        const res = await this.fetchImpl(this.api(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`), {
            headers: await this.headers(),
        });
        if (!res.ok)
            throw new Error(`GitHub get failed (${res.status})`);
        const body = (await res.json());
        if (body.content && body.encoding !== 'none') {
            return Buffer.from(body.content.replace(/\n/g, ''), body.encoding || 'base64');
        }
        // The contents API omits the body for files over 1 MB (encoding "none").
        // The git blobs API serves them up to 100 MB.
        if (!body.sha)
            throw new Error('GitHub content missing');
        const blob = await this.fetchImpl(this.api(`/git/blobs/${body.sha}`), { headers: await this.headers(false) });
        if (!blob.ok)
            throw new Error(`GitHub blob get failed (${blob.status})`);
        const b = (await blob.json());
        if (typeof b.content !== 'string')
            throw new Error('GitHub content missing');
        return Buffer.from(b.content.replace(/\n/g, ''), b.encoding || 'base64');
    }
    async resolvePath(snapshotId) {
        const list = await this.list();
        const hit = list.find((s) => s.id === snapshotId);
        if (!hit)
            throw new Error(`snapshot not found: ${snapshotId}`);
        return hit.remoteKey;
    }
    async list() {
        const res = await this.fetchImpl(this.api(`/contents/${this.pathPrefix}?ref=${encodeURIComponent(this.branch)}`), { headers: await this.headers() });
        if (res.status === 404)
            return [];
        if (!res.ok)
            throw new Error(`GitHub list failed (${res.status})`);
        const items = (await res.json());
        if (!Array.isArray(items))
            return [];
        return items
            .filter((i) => i.type === 'file')
            .map((i) => {
            const encrypted = i.name.endsWith(ENCRYPTED_EXTENSION);
            const id = i.name.replace(/\.tar\.gz$/i, '').replace(/\.dshvault$/i, '');
            return {
                id,
                targetId: this.id,
                remoteKey: i.path,
                // Contents API listings carry no timestamps; the id encodes creation time.
                createdAt: snapshotTimeFromId(id) ?? new Date(0).toISOString(),
                bytes: i.size,
                encrypted,
                includeSecrets: false,
            };
        });
    }
    async delete(snapshotIdOrKey) {
        const path = snapshotIdOrKey.includes('/')
            ? snapshotIdOrKey
            : await this.resolvePath(snapshotIdOrKey);
        const metaRes = await this.fetchImpl(this.api(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`), {
            headers: await this.headers(),
        });
        if (!metaRes.ok)
            throw new Error(`GitHub delete lookup failed (${metaRes.status})`);
        const meta = (await metaRes.json());
        const res = await this.fetchImpl(this.api(`/contents/${path}`), {
            method: 'DELETE',
            headers: await this.headers(),
            body: JSON.stringify({
                message: `dsh-vault: delete ${path}`,
                sha: meta.sha,
                branch: this.branch,
            }),
        });
        if (!res.ok)
            throw new Error(`GitHub delete failed (${res.status})`);
    }
}
//# sourceMappingURL=github.js.map