/** This plugin's own package name. A restore never reinstalls or rewrites it. */
export declare const SELF_PLUGIN_NAME = "dsh-vault";
export declare function isSelfPlugin(name: string): boolean;
export interface SelfEntry {
    /** The target's own dependency spec for dsh-vault (often `link:<its checkout>`), if any. */
    dep?: string;
    inBundles: boolean;
}
/** Snapshot how each profile on this machine references dsh-vault, before files are restored. */
export declare function captureSelfEntries(dshHome: string): Promise<Map<string, SelfEntry>>;
/**
 * After restore: put back this machine's own dsh-vault entry in every profile package.json.
 * The source machine's spec (e.g. its `link:` path) is dropped; a profile that had no
 * dsh-vault here gets none.
 */
export declare function reapplySelfEntries(dshHome: string, before: Map<string, SelfEntry>): Promise<string[]>;
//# sourceMappingURL=self-entry.d.ts.map