import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ARCHIVE_EXTENSION, ENCRYPTED_EXTENSION } from '../core/types.js';
function isSnapshotFile(name) {
    return name.endsWith(ARCHIVE_EXTENSION) || name.endsWith(ENCRYPTED_EXTENSION) || name.endsWith('.json');
}
function idFromName(name) {
    return name
        .replace(/\.tar\.gz$/i, '')
        .replace(/\.dshvault$/i, '')
        .replace(/\.json$/i, '');
}
export class LocalStorageAdapter {
    id;
    kind = 'local';
    label;
    directory;
    constructor(config) {
        this.id = config.id;
        this.label = config.label;
        this.directory = config.directory;
    }
    async ensureDir() {
        await mkdir(this.directory, { recursive: true });
    }
    fileFor(snapshotId, data) {
        const encrypted = data.toString('utf8', 0, 64).includes('dsh-vault-encrypted');
        const ext = encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION;
        return join(this.directory, `${snapshotId}${ext}`);
    }
    async put(snapshotId, data) {
        await this.ensureDir();
        const path = this.fileFor(snapshotId, data);
        await writeFile(path, data, { mode: 0o600 });
        return { remoteKey: basename(path) };
    }
    async get(snapshotIdOrKey) {
        await this.ensureDir();
        const direct = join(this.directory, snapshotIdOrKey);
        try {
            return await readFile(direct);
        }
        catch {
            // try common extensions
        }
        // Prefer an exact id match from the directory listing (unique ids include a suffix).
        const names = await readdir(this.directory);
        const id = idFromName(snapshotIdOrKey);
        const match = names.find((n) => idFromName(n) === id);
        if (match)
            return readFile(join(this.directory, match));
        for (const ext of [ARCHIVE_EXTENSION, ENCRYPTED_EXTENSION, '.json']) {
            try {
                return await readFile(join(this.directory, `${id}${ext}`));
            }
            catch {
                // continue
            }
        }
        throw new Error(`snapshot not found: ${snapshotIdOrKey}`);
    }
    async list() {
        await this.ensureDir();
        const names = await readdir(this.directory);
        const out = [];
        for (const name of names) {
            if (!isSnapshotFile(name))
                continue;
            const abs = join(this.directory, name);
            const info = await stat(abs);
            if (!info.isFile())
                continue;
            const id = idFromName(name);
            const encrypted = name.endsWith(ENCRYPTED_EXTENSION);
            out.push({
                id,
                targetId: this.id,
                remoteKey: name,
                createdAt: info.mtime.toISOString(),
                bytes: info.size,
                encrypted,
                includeSecrets: false,
            });
        }
        return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    async delete(snapshotIdOrKey) {
        const list = await this.list();
        const hit = list.find((s) => s.id === idFromName(snapshotIdOrKey) || s.remoteKey === snapshotIdOrKey);
        if (!hit)
            throw new Error(`snapshot not found: ${snapshotIdOrKey}`);
        await unlink(join(this.directory, hit.remoteKey));
    }
}
//# sourceMappingURL=local.js.map