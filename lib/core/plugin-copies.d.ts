import type { PluginRecord } from './types.js';
export type PluginSourceKind = 'npm' | 'github' | 'local';
export type RegistryStatus = 'present' | 'missing' | 'unknown' | 'not-applicable';
export interface DetectedPlugin {
    /** `profile:name` — the key used by `pluginCopies.exclude`. */
    key: string;
    name: string;
    profile: string;
    kind: PluginSourceKind;
    /** Version installed in the profile's node_modules (or the manifest range). */
    version?: string;
    /** True when found only via cordis.patch.yml / node_modules (not package.json dependencies). */
    cordisOnly: boolean;
    installed: boolean;
    registry: RegistryStatus;
    /** Local plugin or exact version missing from the registry: a copy is strongly advised. */
    recommended: boolean;
}
export declare function pluginKey(profile: string | undefined, name: string): string;
export declare function isBuiltinDshBundle(name: string): boolean;
export declare function pluginSourceKind(p: Pick<PluginRecord, 'source' | 'version' | 'originalSource'>): PluginSourceKind;
/** Every plugin in every profile: package.json deps, cordis.patch.yml inserts, node_modules plugins. */
export declare function detectProfilePlugins(dshHome: string): Promise<Array<PluginRecord & {
    cordisOnly: boolean;
    installed: boolean;
    localVersion?: string;
}>>;
export type RegistryLookup = (name: string, version: string) => Promise<RegistryStatus>;
/**
 * Ask the registries (preferred, npmmirror, npmjs — in parallel) whether `name@version`
 * exists. `present` if any has it, `missing` if one answered and none has it, else
 * `unknown` (offline / timeout). Never throws.
 */
export declare function npmRegistryLookup(preferred?: string | null, timeoutMs?: number): RegistryLookup;
/**
 * `dist.integrity` of `name@version` from the registries (preferred, npmmirror, npmjs).
 * string = integrity, null = that version does not exist, undefined = unknown (offline).
 */
export declare function npmRegistryIntegrity(preferred?: string | null, timeoutMs?: number): (name: string, version: string) => Promise<string | null | undefined>;
/** Registry status per plugin key, bounded by `overallMs` so backup / the UI never hang. */
export declare function registryStatuses(plugins: Array<Pick<PluginRecord, 'name' | 'profile' | 'source' | 'version' | 'installedVersion' | 'originalSource'>>, lookup: RegistryLookup, overallMs?: number): Promise<Map<string, RegistryStatus>>;
export declare function listDetectedPlugins(dshHome: string, lookup?: RegistryLookup): Promise<DetectedPlugin[]>;
//# sourceMappingURL=plugin-copies.d.ts.map