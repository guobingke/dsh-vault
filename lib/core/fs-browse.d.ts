export interface FsEntry {
    name: string;
    path: string;
    kind: 'file' | 'directory';
    bytes?: number;
    hidden?: boolean;
}
export interface FsListing {
    path: string;
    parent: string | null;
    /** User home directory (the browser's "Home" shortcut). */
    home: string;
    /** Filesystem roots: Windows drive letters (`C:\`, `D:\`…) or `/`. */
    roots: string[];
    /** Path separator of the host, so the browser can join names. */
    sep: string;
    entries: FsEntry[];
    /** True when the host exposes dsh's native OS folder chooser. */
    nativePicker?: boolean;
}
/** Filesystem roots for the browser sidebar: mounted drive letters on Windows, `/` elsewhere. */
export declare function listRoots(platform?: NodeJS.Platform): Promise<string[]>;
/** List one directory level for the in-app path browser (Windows-safe). Empty input lists the home dir. */
export declare function listDirectory(inputPath: string): Promise<FsListing>;
/** Create one new folder under `parent` for the in-app browser; returns its absolute path. */
export declare function createDirectory(parentInput: string, name: string): Promise<string>;
export declare function isSnapshotArchiveName(name: string): boolean;
//# sourceMappingURL=fs-browse.d.ts.map