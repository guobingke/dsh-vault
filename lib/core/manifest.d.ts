import type { CollectedFile, PluginRecord, VaultManifest } from './types.js';
export declare function makeSnapshotId(date?: Date): string;
/** Recover the creation time encoded in a `vault-YYYYMMDDTHHMMSSZ-xxxxxx` id (undefined if not parseable). */
export declare function snapshotTimeFromId(id: string): string | undefined;
export declare function buildManifest(input: {
    id: string;
    files: CollectedFile[];
    plugins: PluginRecord[];
    includeSecrets: boolean;
    encrypted: boolean;
    kdf?: VaultManifest['encryption'] extends infer E ? E extends {
        kdf: infer K;
    } ? K : never : never;
    dshVersion?: string;
    notes?: string;
    createdAt?: string;
}): VaultManifest;
export declare function parseManifest(raw: string | Buffer): VaultManifest;
//# sourceMappingURL=manifest.d.ts.map