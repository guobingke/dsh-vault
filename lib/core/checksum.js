import { createHash } from 'node:crypto';
export function sha256Buffer(data) {
    return createHash('sha256').update(data).digest('hex');
}
/** Stable integrity hash over the sorted file table. */
export function computeManifestSha256(files) {
    const lines = [...files]
        .map((f) => `${f.path}:${f.sha256}:${f.size}`)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return sha256Buffer(lines.join('\n'));
}
export function verifyManifestIntegrity(manifest) {
    const expected = computeManifestSha256(manifest.files);
    return { ok: expected === manifest.manifestSha256, expected, actual: manifest.manifestSha256 };
}
//# sourceMappingURL=checksum.js.map