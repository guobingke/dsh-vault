import { type PluginFailureReason } from './local-spec.js';
import type { PluginRecord } from './types.js';
export type PluginInstallStatus = 'installed' | 'installed-from-backup' | 'already-present' | 'failed' | 'skipped';
export interface PluginInstallResult {
    name: string;
    profile: string;
    status: PluginInstallStatus;
    /** One short line. Raw installer output, when any, is in `log`. */
    detail: string;
    source?: string;
    /** Why it failed (UI shows one localized sentence per reason). */
    reason?: PluginFailureReason;
    /** Path / spec / package the reason refers to. */
    subject?: string;
    /** Raw pnpm / dsh output, for a collapsed 详情 section. */
    log?: string;
}
export interface PluginManagerLike {
    installBundle: (spec: string, options?: {
        registry?: string | null;
        saveExact?: boolean;
        enabled?: boolean;
    }) => Promise<{
        application?: string;
        changed?: boolean;
        error?: {
            code?: string;
            diagnostic?: string;
            message?: string;
        };
        packageResult?: {
            kind?: string;
            output?: string;
        };
    }>;
    /** dsh's PluginManager exposes these; used to pick the right pnpm and profile. */
    pnpmCommand?: string;
    profile?: {
        name?: string;
        dir?: string;
        packageManager?: PnpmInvocationLike;
    };
}
export interface PnpmInvocationLike {
    command: string;
    args?: string[];
    env?: Record<string, string | undefined>;
}
export interface PluginInstallDeps {
    dshHome: string;
    activeProfile: string;
    pluginManager?: PluginManagerLike | null;
    /** Preferred pnpm binary (from pluginManager config when known). */
    pnpmCommand?: string;
    /** Host package manager (dsh profileContext.packageManager): command + leading args + env. */
    pnpm?: PnpmInvocationLike;
    /** Preferred registry URL (e.g. npmmirror) asked first. */
    preferredRegistry?: string | null;
    /** Environment used for installer discovery (tests). */
    env?: NodeJS.ProcessEnv;
    /** Directory holding git for github:/git specs (null = none; undefined = discover). */
    gitDir?: string | null;
    /**
     * Registry integrity of `name@version` (dist.integrity), `null` when the registry has no
     * such version, `undefined` when unknown (offline). Omit / null to skip integrity checks.
     */
    registryIntegrity?: ((name: string, version: string) => Promise<string | null | undefined>) | null;
    /** Override for tests. */
    runCommand?: (command: string, args: string[], opts: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
    }) => Promise<{
        ok: boolean;
        detail: string;
        code: number | null;
    }>;
}
export declare function sanitizePluginDirName(name: string): string;
export declare function localSourcePath(source: string): string | null;
export declare function bundledSourceRel(profile: string, name: string): string;
export declare function installedPackageVersion(pkgDir: string): Promise<string | undefined>;
export declare function pluginPackagePresent(dshHome: string, profile: string, name: string): Promise<boolean>;
/**
 * Spawn without a shell whenever possible: cmd.exe mangles quoting and prints GBK on
 * Chinese Windows. `.cmd` / `.bat` shims still need it.
 */
/** Environment that makes npm / pnpm skip lifecycle scripts (pnpm reads npm_config_*; newer pnpm also pnpm_config_*). */
export declare const NO_SCRIPTS_ENV: Readonly<Record<string, string>>;
export declare function defaultRunCommand(command: string, args: string[], opts: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<{
    ok: boolean;
    detail: string;
    code: number | null;
}>;
/** Candidate `resources` folders of an installed DeepSeek Harness Desktop. */
export declare function desktopResourceRoots(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string[];
type Exists = (p: string) => Promise<boolean>;
/** Desktop's bundled node + pnpm (resources/runtime/primary-runtime/dependencies). */
export declare function findBundledPnpm(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, exists?: Exists): Promise<PnpmInvocationLike | null>;
/**
 * Where a bundled local plugin should point on this machine: the original path when
 * it exists here (same layout as machine 1), else the copy restored under
 * $DSH_HOME/plugin-sources.
 */
export declare function resolveLinkTarget(plugin: PluginRecord, dshHome: string): Promise<{
    abs: string;
    bundled: boolean;
    kind: 'dir' | 'tarball';
} | null>;
/** Names of a package's runtime `dependencies` that Node cannot find from its (real) directory. */
export declare function missingRuntimeDependencies(pkgDir: string): Promise<string[]>;
/**
 * pnpm needs `git` to resolve github:/git+ specs that are not in pnpm-lock.yaml.
 * Returns a directory to put on PATH when git is not already there, else null.
 */
export declare function findGit(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, exists?: Exists): Promise<{
    path: string;
    onPath: boolean;
} | null>;
/** Directory to prepend to PATH so pnpm finds git, or null (already on PATH / not found). */
export declare function findGitDir(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, exists?: Exists): Promise<string | null>;
/**
 * pnpm does not install the dependencies of a `link:` package, so a bundled
 * plugin source restored on machine 2 has no node_modules — and fails to
 * import in dsh. Install its production deps in place.
 */
export declare function installBundledSourceDeps(dir: string, deps: PluginInstallDeps): Promise<{
    ok: boolean;
    detail: string;
}>;
/** Characters cmd.exe treats specially (L-04). */
export declare function isShellSafeArg(arg: string): boolean;
/**
 * H-06: a plugin record from a snapshot must look like a package, and its spec must not be
 * an option (`--foo`) or carry whitespace / control characters.
 */
export declare function invalidPluginRecord(p: PluginRecord): string | null;
/**
 * Same lookup dsh-app-boot uses for `dsh.profile.bundles` (resolveBundleDir, profile anchor):
 * Node's node_modules search paths from <profile>/package.json, a directory holding package.json.
 * When it fails, Desktop marks the plugin 异常 / 包不可用 ("cannot resolve profile bundle").
 */
export declare function bundleResolvesFromProfile(profileDir: string, name: string): boolean;
/** Rewrite local deps to the restored bundled sources (or the original path when it exists here). */
export declare function rewriteBundledLinkDeps(dshHome: string, plugins: PluginRecord[]): Promise<string[]>;
export interface InvalidSpec {
    name: string;
    spec: string;
    reason: Extract<PluginFailureReason, 'local-source-missing' | 'tarball-missing' | 'unsupported-spec'>;
    /** The path that does not exist here (machine 1's), or the spec itself. */
    subject: string;
}
/**
 * Every dependency spec in a profile manifest that cannot resolve on this machine
 * (missing file:/link:/portal: path with no bundled copy, workspace:/catalog:).
 * One such spec makes `pnpm install` fail for the whole profile.
 */
export declare function findUnresolvableSpecs(profileDir: string): Promise<InvalidSpec[]>;
/** Candidate Desktop-bundled `dsh` carriers (npm-global `dsh` refuses --profile desktop). */
export declare function bundledDshCandidates(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string[];
/** Locate the dsh CLI package (`@deepseek-ai/dsh/lib/bin.js`) shipped inside Desktop's resources. */
export declare function findDshCliEntry(roots: string[], maxDepth?: number): Promise<string | null>;
/**
 * True when the backup only knew this plugin's name (a bundle / cordis entry) and never
 * recorded where it came from. Such a plugin is never installed from the registry by name.
 */
export declare function hasNoRecordedSource(p: PluginRecord): boolean;
export interface ReinstallOptions {
    /** Only these `profile:name` keys (retry). Others are left alone. */
    only?: Set<string>;
    /** Plugins with a saved copy: `copy-first` installs the copy before trying the source. Default `source-first`. */
    restoreOrder?: 'source-first' | 'copy-first';
    /**
     * `profile:name` keys whose git / tarball / URL source must NOT be fetched (H-06): they
     * install from the snapshot's saved copy when there is one, else are skipped.
     */
    blockedSources?: Set<string>;
    /** Per-plugin progress (k/K, current plugin name). */
    onProgress?: (ev: {
        phase: 'reinstall' | 'verify';
        message: string;
        current?: number;
        total?: number;
        item?: string;
        fraction?: number;
    }) => void;
}
/**
 * Reinstall missing plugins after files were restored.
 *
 * 1. Point local deps at the restored bundled sources.
 * 2. Pre-validate every spec in each profile manifest; take unresolvable ones out so
 *    they cannot poison the install of the rest, and report them with one reason.
 * 3. Materialize each profile (pnpm install); if that still fails, isolate the
 *    not-yet-installed npm plugins and add them one at a time.
 * 4. Install what is still missing: host pluginManager (own profile only) → pnpm add
 *    in the profile dir → dsh CLI carrier.
 */
export declare function reinstallMissingPlugins(plugins: PluginRecord[], deps: PluginInstallDeps, options?: ReinstallOptions): Promise<{
    results: PluginInstallResult[];
    restartRequired: boolean;
}>;
export {};
//# sourceMappingURL=plugin-install.d.ts.map