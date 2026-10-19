import type { ManifestFileEntry, VaultManifest } from './types.js';
export declare function sha256Buffer(data: Buffer | Uint8Array | string): string;
/** Stable integrity hash over the sorted file table. */
export declare function computeManifestSha256(files: readonly ManifestFileEntry[]): string;
export declare function verifyManifestIntegrity(manifest: VaultManifest): {
    ok: boolean;
    expected: string;
    actual: string;
};
//# sourceMappingURL=checksum.d.ts.map