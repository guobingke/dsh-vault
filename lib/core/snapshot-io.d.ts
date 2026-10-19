import type { CollectedFile, KdfAlgorithm, PluginRecord, ProgressCallback, VaultManifest } from './types.js';
export interface PackedSnapshot {
    snapshotId: string;
    bytes: Buffer;
    manifest: VaultManifest;
    encrypted: boolean;
}
/** Build archive bytes (optionally encrypted) from collected files. */
export declare function packSnapshot(input: {
    files: CollectedFile[];
    plugins: PluginRecord[];
    includeSecrets: boolean;
    encrypt: boolean;
    password?: string;
    kdf?: KdfAlgorithm;
    dshVersion?: string;
    notes?: string;
    onProgress?: ProgressCallback;
}): Promise<PackedSnapshot>;
export interface UnpackedSnapshot {
    manifest: VaultManifest;
    files: Map<string, Buffer>;
}
/** Decode archive or encrypted envelope into manifest + file map. */
export declare function unpackSnapshot(bytes: Buffer, password?: string, onProgress?: ProgressCallback): Promise<UnpackedSnapshot>;
//# sourceMappingURL=snapshot-io.d.ts.map