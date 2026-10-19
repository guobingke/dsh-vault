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
/** Unpack a gzip-compressed tar (ustar, pax `x`/`g`, GNU `L` long names). */
export declare function unpackTarGz(archive: Buffer): ArchiveEntry[];
export declare function archiveFingerprint(archive: Buffer): string;
//# sourceMappingURL=archive.d.ts.map