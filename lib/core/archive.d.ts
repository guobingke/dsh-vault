export interface ArchiveEntry {
    path: string;
    data: Buffer;
    mode?: number;
}
/**
 * Pack entries into a gzip-compressed POSIX (pax) tar.
 * Names that are non-ASCII (e.g. Chinese skill files) or too long for ustar get a pax
 * `path` record in UTF-8, which GNU tar, bsdtar / Windows tar.exe and 7-Zip all honor,
 * so names round-trip on Windows and Linux instead of turning into mojibake.
 */
export declare function packTarGz(entries: ArchiveEntry[]): Buffer;
/** Hard limits for untrusted archives (M-05: decompression bombs, header abuse). */
export interface ArchiveLimits {
    /** Max decompressed tar size in bytes. */
    maxTotalBytes: number;
    /** Max size of one entry. */
    maxEntryBytes: number;
    /** Max number of entries (headers). */
    maxEntries: number;
    /** Max entry path length in bytes. */
    maxPathLength: number;
}
/**
 * Default uncompressed-size limit: a quarter of installed memory, between 256 MiB and
 * 2 GiB − 1 (unpacking is in memory, so the limit follows what the machine can hold).
 */
export declare function memoryBasedArchiveLimit(totalMem?: number): number;
export declare function defaultArchiveLimits(): ArchiveLimits;
export declare class ArchiveLimitError extends Error {
    readonly code = "ARCHIVE_LIMIT";
    constructor(message: string);
}
/** Unpack a gzip-compressed tar (ustar, pax `x`/`g`, GNU `L` long names). Links and devices are refused. */
export declare function unpackTarGz(archive: Buffer, limitsIn?: Partial<ArchiveLimits>): ArchiveEntry[];
export declare function archiveFingerprint(archive: Buffer): string;
//# sourceMappingURL=archive.d.ts.map