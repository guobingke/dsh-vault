export interface FsListingView {
    path: string;
    parent: string | null;
    home?: string;
    roots?: string[];
    sep?: string;
    nativePicker?: boolean;
    entries: Array<{
        name: string;
        path: string;
        kind: 'file' | 'directory';
        bytes?: number;
        hidden?: boolean;
    }>;
}
/** Filesystem access the picker needs (VaultApi in the app, fakes in tests). */
export interface FsBrowser {
    list: (path: string) => Promise<FsListingView>;
    mkdir: (path: string, name: string) => Promise<{
        path: string;
    }>;
    pickNative?: () => Promise<{
        path: string | null;
    }>;
}
export type PathPickerMode = 'directory' | 'open' | 'save';
export interface PathPickerProps {
    open: boolean;
    mode: PathPickerMode;
    fs: FsBrowser;
    /** Current text-field value; the browser starts there (or its parent). */
    initialPath?: string;
    /** Save mode: suggested file name. */
    defaultFileName?: string;
    onSelect: (path: string) => void;
    onClose: () => void;
}
export declare function isArchiveName(name: string): boolean;
/** Join a directory and a single name with the host separator. */
export declare function joinPath(dir: string, name: string, sep?: string): string;
/** Parent of a path (either separator); null at a root. */
export declare function parentOf(p: string): string | null;
export declare function PathPicker({ open, mode, fs, initialPath, defaultFileName, onSelect, onClose }: PathPickerProps): import("react").JSX.Element | null;
//# sourceMappingURL=PathPicker.d.ts.map