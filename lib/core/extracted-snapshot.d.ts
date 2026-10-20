import { type ArchiveLimits } from './archive.js';
export declare function isExtractedSnapshotDir(dir: string): Promise<boolean>;
export declare function packExtractedSnapshot(dir: string, limitsIn?: Partial<ArchiveLimits>): Promise<Buffer>;
//# sourceMappingURL=extracted-snapshot.d.ts.map