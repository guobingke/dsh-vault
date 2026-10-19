import { randomBytes } from 'node:crypto';
import { hostname, platform } from 'node:os';
import { computeManifestSha256 } from './checksum.js';
import { MANIFEST_SCHEMA_VERSION } from './types.js';
export function makeSnapshotId(date = new Date()) {
    const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const suffix = randomBytes(3).toString('hex');
    return `vault-${iso}-${suffix}`;
}
/** Recover the creation time encoded in a `vault-YYYYMMDDTHHMMSSZ-xxxxxx` id (undefined if not parseable). */
export function snapshotTimeFromId(id) {
    const m = /^vault-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/.exec(id);
    if (!m)
        return undefined;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}
export function buildManifest(input) {
    const categories = [...new Set(input.files.map((f) => f.category))];
    const files = input.files.map((f) => ({
        path: f.relPath,
        category: f.category,
        size: f.size,
        sha256: f.sha256,
        ...(f.secret ? { secret: true } : {}),
    }));
    const manifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        id: input.id,
        createdAt: input.createdAt ?? new Date().toISOString(),
        dshVersion: input.dshVersion,
        hostname: hostname(),
        platform: platform(),
        categories,
        includeSecrets: input.includeSecrets,
        encrypted: input.encrypted,
        plugins: input.plugins,
        files,
        manifestSha256: '',
        notes: input.notes,
    };
    if (input.encrypted) {
        manifest.encryption = {
            algorithm: 'aes-256-gcm',
            kdf: input.kdf ?? 'scrypt',
        };
    }
    manifest.manifestSha256 = computeManifestSha256(manifest.files);
    return manifest;
}
export function parseManifest(raw) {
    const manifest = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
        throw new Error(`unsupported manifest schemaVersion: ${String(manifest.schemaVersion)}`);
    }
    if (!manifest.id || !Array.isArray(manifest.files)) {
        throw new Error('invalid manifest: missing id or files');
    }
    return manifest;
}
//# sourceMappingURL=manifest.js.map