import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path, { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { isBuiltinDshBundle } from './diff.js';
import { isRemoteNonRegistrySpec, classifyInstallFailure, decodeConsoleOutput, isWindowsAbsPath, parseLocalSpec, resolveLocalSpecPath, specPath, } from './local-spec.js';
import { DESKTOP_PROFILE, installCommandForProfile } from './profiles.js';
import { expandUserPath } from './win-paths.js';
import { isSelfPlugin } from './self-entry.js';
const NPMMIRROR = 'https://registry.npmmirror.com/';
export function sanitizePluginDirName(name) {
    return name.replace(/^@/, '').replace(/\//g, '__').replace(/[<>:"|?*]/g, '_');
}
export function localSourcePath(source) {
    const spec = parseLocalSpec(source);
    return spec?.kind === 'path' ? spec.path : null;
}
export function bundledSourceRel(profile, name) {
    return `plugin-sources/${profile}/${sanitizePluginDirName(name)}`;
}
async function pathExists(p) {
    try {
        await access(p, constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function isFile(p) {
    try {
        return (await stat(p)).isFile();
    }
    catch {
        return false;
    }
}
export async function installedPackageVersion(pkgDir) {
    try {
        const v = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')).version;
        return typeof v === 'string' ? v : undefined;
    }
    catch {
        return undefined;
    }
}
export async function pluginPackagePresent(dshHome, profile, name) {
    const parts = ['profiles', profile, 'node_modules', ...name.split('/'), 'package.json'];
    return pathExists(join(dshHome, ...parts));
}
/**
 * Spawn without a shell whenever possible: cmd.exe mangles quoting and prints GBK on
 * Chinese Windows. `.cmd` / `.bat` shims still need it.
 */
function defaultRunCommand(command, args, opts) {
    return new Promise((resolvePromise) => {
        const win = process.platform === 'win32';
        const needsShell = win && (/\.(cmd|bat)$/i.test(command) || !/[\\/]/.test(command));
        // L-04: cmd.exe re-parses the joined command line. Refuse metacharacters outright and
        // quote arguments with spaces, so a snapshot-supplied spec can never inject commands.
        if (needsShell) {
            const bad = [command, ...args].find((a) => !isShellSafeArg(a));
            if (bad !== undefined) {
                resolvePromise({ ok: false, detail: `refusing to run through cmd.exe: unsafe argument ${JSON.stringify(bad)}`, code: null });
                return;
            }
        }
        const spawnCommand = needsShell ? quoteForCmd(command) : command;
        const spawnArgs = needsShell ? args.map(quoteForCmd) : args;
        let child;
        try {
            child = spawn(spawnCommand, spawnArgs, {
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: opts.cwd,
                env: opts.env ?? process.env,
                shell: needsShell,
                windowsHide: true,
            });
        }
        catch (err) {
            resolvePromise({ ok: false, detail: err instanceof Error ? err.message : String(err), code: null });
            return;
        }
        const chunks = [];
        child.stdout?.on('data', (c) => chunks.push(c));
        child.stderr?.on('data', (c) => chunks.push(c));
        child.on('error', (err) => resolvePromise({ ok: false, detail: `spawn ${command} failed: ${err.message}`, code: null }));
        child.on('close', (code) => {
            const detail = decodeConsoleOutput(Buffer.concat(chunks));
            resolvePromise({ ok: code === 0, detail: detail.slice(-6000), code });
        });
    });
}
/* --------------------------------------------------------------------------
 * Installer discovery (Desktop ships its own node + pnpm + dsh; nothing is on PATH)
 * ------------------------------------------------------------------------ */
/** Candidate `resources` folders of an installed DeepSeek Harness Desktop. */
export function desktopResourceRoots(env = process.env, platform = process.platform) {
    const P = platform === 'win32' ? path.win32 : path.posix;
    const out = [];
    if (env.DSH_DESKTOP_RESOURCES?.trim())
        out.push(env.DSH_DESKTOP_RESOURCES.trim());
    const resources = process.resourcesPath;
    if (resources)
        out.push(resources);
    if (platform === 'win32') {
        for (const base of [env.LOCALAPPDATA && P.join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']]) {
            if (base)
                out.push(P.join(base, 'DeepSeek Harness', 'resources'));
        }
    }
    else if (platform === 'darwin') {
        out.push('/Applications/DeepSeek Harness.app/Contents/Resources');
        if (env.HOME)
            out.push(P.join(env.HOME, 'Applications', 'DeepSeek Harness.app', 'Contents', 'Resources'));
    }
    else {
        out.push('/opt/DeepSeek Harness/resources');
    }
    return [...new Set(out)];
}
/** Desktop's bundled node + pnpm (resources/runtime/primary-runtime/dependencies). */
export async function findBundledPnpm(env = process.env, platform = process.platform, exists = isFile) {
    const P = platform === 'win32' ? path.win32 : path.posix;
    const nodeExe = platform === 'win32' ? 'node.exe' : 'node';
    for (const root of desktopResourceRoots(env, platform)) {
        const deps = P.join(root, 'runtime', 'primary-runtime', 'dependencies');
        let node = null;
        for (const c of [P.join(deps, 'node', 'bin', nodeExe), P.join(deps, 'node', nodeExe)]) {
            if (await exists(c)) {
                node = c;
                break;
            }
        }
        if (!node)
            continue;
        for (const c of ['bin/pnpm.mjs', 'dist/pnpm.mjs', 'bin/pnpm.cjs', 'dist/pnpm.cjs']) {
            const script = P.join(deps, 'pnpm', ...c.split('/'));
            if (await exists(script)) {
                const delim = platform === 'win32' ? ';' : ':';
                return { command: node, args: [script], env: { PATH: `${P.dirname(node)}${delim}${env.PATH ?? env.Path ?? ''}` } };
            }
        }
    }
    return null;
}
function pnpmFromManager(manager) {
    const pm = manager?.profile?.packageManager;
    if (pm?.command)
        return pm;
    if (manager?.pnpmCommand && manager.pnpmCommand !== 'pnpm')
        return { command: manager.pnpmCommand };
    return undefined;
}
async function resolvePnpm(deps) {
    if (deps.pnpm?.command)
        return deps.pnpm;
    if (deps.pnpmCommand)
        return { command: deps.pnpmCommand };
    const fromMgr = pnpmFromManager(deps.pluginManager);
    if (fromMgr)
        return fromMgr;
    return (await findBundledPnpm(deps.env ?? process.env)) ?? { command: 'pnpm' };
}
/* --------------------------------------------------------------------------
 * Local sources
 * ------------------------------------------------------------------------ */
/**
 * Where a bundled local plugin should point on this machine: the original path when
 * it exists here (same layout as machine 1), else the copy restored under
 * $DSH_HOME/plugin-sources.
 */
export async function resolveLinkTarget(plugin, dshHome) {
    const profileDir = join(dshHome, 'profiles', plugin.profile ?? 'web');
    const original = parseLocalSpec(plugin.originalSource);
    if (original?.kind === 'path' && plugin.bundledFrom !== 'installed') {
        const abs = resolveLocalSpecPath(original.path, profileDir);
        if (original.tarball ? await isFile(abs) : await pathExists(join(abs, 'package.json'))) {
            return { abs, bundled: false, kind: original.tarball ? 'tarball' : 'dir' };
        }
    }
    if (plugin.bundledSource) {
        const abs = join(dshHome, ...plugin.bundledSource.split('/'));
        const kind = plugin.bundledKind ?? 'dir';
        if (kind === 'tarball' ? await isFile(abs) : await pathExists(abs))
            return { abs, bundled: true, kind };
    }
    return null;
}
function specForTarget(target) {
    return `${target.kind === 'tarball' ? 'file' : 'link'}:${specPath(target.abs)}`;
}
/** Names of a package's runtime `dependencies` that Node cannot find from its (real) directory. */
export async function missingRuntimeDependencies(pkgDir) {
    let real = pkgDir;
    try {
        real = await realpath(pkgDir);
    }
    catch {
        return [];
    }
    let deps = {};
    try {
        deps = JSON.parse(await readFile(join(real, 'package.json'), 'utf8')).dependencies ?? {};
    }
    catch {
        return [];
    }
    const missing = [];
    for (const dep of Object.keys(deps)) {
        let dir = real;
        let found = false;
        for (;;) {
            if (await pathExists(join(dir, 'node_modules', ...dep.split('/'), 'package.json'))) {
                found = true;
                break;
            }
            const up = dirname(dir);
            if (up === dir)
                break;
            dir = up;
        }
        if (!found)
            missing.push(dep);
    }
    return missing;
}
async function runPnpm(deps, pnpm, args, cwd) {
    const run = deps.runCommand ?? defaultRunCommand;
    return run(pnpm.command, [...(pnpm.args ?? []), ...args], { cwd, env: await installerEnv(deps, pnpm) });
}
/** Child env: host env + package-manager env, one PATH key (Windows has `Path`), git reachable. */
async function installerEnv(deps, pnpm) {
    const base = deps.env ?? process.env;
    const win = process.platform === 'win32';
    let env = { ...process.env, ...(deps.env ?? {}) };
    for (const [k, v] of Object.entries(pnpm?.env ?? {})) {
        if (win && k.toUpperCase() === 'PATH')
            env = withPath(env, v ?? '');
        else
            env[k] = v;
    }
    env.DSH_HOME = deps.dshHome;
    const gitDir = deps.gitDir === undefined ? await findGitDir(base) : deps.gitDir;
    if (gitDir) {
        const delim = win ? ';' : ':';
        env = withPath(env, `${gitDir}${delim}${pathOf(env)}`);
    }
    return env;
}
function pathKey(env) {
    return Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
}
function pathOf(env) {
    return env[pathKey(env)] ?? '';
}
function withPath(env, value) {
    const out = {};
    for (const [k, v] of Object.entries(env))
        if (k.toUpperCase() !== 'PATH')
            out[k] = v;
    out[process.platform === 'win32' ? 'Path' : 'PATH'] = value;
    return out;
}
/**
 * pnpm needs `git` to resolve github:/git+ specs that are not in pnpm-lock.yaml.
 * Returns a directory to put on PATH when git is not already there, else null.
 */
export async function findGit(env = process.env, platform = process.platform, exists = isFile) {
    const win = platform === 'win32';
    const P = win ? path.win32 : path.posix;
    const exe = win ? 'git.exe' : 'git';
    const delim = win ? ';' : ':';
    const pathValue = Object.entries(env).find(([k]) => k.toUpperCase() === 'PATH')?.[1] ?? '';
    for (const dir of pathValue.split(delim).filter(Boolean)) {
        if (await exists(P.join(dir, exe)))
            return { path: P.join(dir, exe), onPath: true };
    }
    const candidates = [];
    if (env.DSH_GIT?.trim())
        candidates.push(env.DSH_GIT.trim());
    for (const root of desktopResourceRoots(env, platform)) {
        candidates.push(P.join(root, 'git', 'cmd', exe), P.join(root, 'git', 'bin', exe), P.join(root, 'runtime', 'primary-runtime', 'dependencies', 'git', 'cmd', exe), P.join(root, 'runtime', 'primary-runtime', 'dependencies', 'git', 'bin', exe));
    }
    if (win) {
        for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && P.join(env.LOCALAPPDATA, 'Programs')]) {
            if (base)
                candidates.push(P.join(base, 'Git', 'cmd', exe), P.join(base, 'Git', 'bin', exe));
        }
        if (env.LOCALAPPDATA)
            candidates.push(P.join(env.LOCALAPPDATA, 'GitHubDesktop', 'app', 'resources', 'app', 'git', 'cmd', exe));
    }
    else {
        candidates.push('/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git');
    }
    for (const c of candidates)
        if (await exists(c))
            return { path: c, onPath: false };
    return null;
}
/** Directory to prepend to PATH so pnpm finds git, or null (already on PATH / not found). */
export async function findGitDir(env = process.env, platform = process.platform, exists = isFile) {
    const git = await findGit(env, platform, exists);
    if (!git || git.onPath)
        return null;
    return (platform === 'win32' ? path.win32 : path.posix).dirname(git.path);
}
/**
 * pnpm does not install the dependencies of a `link:` package, so a bundled
 * plugin source restored on machine 2 has no node_modules — and fails to
 * import in dsh. Install its production deps in place.
 */
export async function installBundledSourceDeps(dir, deps) {
    if ((await missingRuntimeDependencies(dir)).length === 0)
        return { ok: true, detail: 'dependencies present' };
    const pnpm = await resolvePnpm(deps);
    const args = ['install', '--prod', '--ignore-workspace', '--ignore-scripts', '--config.auto-install-peers=false', '--config.node-linker=hoisted'];
    if (deps.preferredRegistry)
        args.push(`--config.registry=${deps.preferredRegistry}`);
    let result = await runPnpm(deps, pnpm, args, dir);
    if (!result.ok && deps.preferredRegistry) {
        result = await runPnpm(deps, pnpm, args.filter((a) => !a.startsWith('--config.registry=')), dir);
    }
    const still = await missingRuntimeDependencies(dir);
    if (still.length)
        return { ok: false, detail: `dependencies not installed in ${dir}: ${still.join(', ')}\n${result.detail}` };
    return { ok: true, detail: 'installed bundled source dependencies' };
}
/** Characters cmd.exe treats specially (L-04). */
export function isShellSafeArg(arg) {
    return !/[&|<>^%!"`\r\n\0]/.test(arg);
}
function quoteForCmd(arg) {
    return /[\s()]/.test(arg) ? `"${arg}"` : arg;
}
const NPM_NAME = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i;
/**
 * H-06: a plugin record from a snapshot must look like a package, and its spec must not be
 * an option (`--foo`) or carry whitespace / control characters.
 */
export function invalidPluginRecord(p) {
    if (typeof p.name !== 'string' || p.name.length > 214 || !NPM_NAME.test(p.name))
        return `invalid package name ${JSON.stringify(p.name)}`;
    for (const field of [p.source, p.version, p.lockedTarball, p.installedVersion, p.profile]) {
        if (field === undefined || field === null)
            continue;
        if (typeof field !== 'string' || field.startsWith('-') || /[\s\0]/.test(field) || field.length > 2048) {
            return `invalid spec ${JSON.stringify(field)}`;
        }
    }
    if (p.profile !== undefined && !/^[\w.-]+$/.test(p.profile))
        return `invalid profile ${JSON.stringify(p.profile)}`;
    return null;
}
async function readManifest(profileDir) {
    try {
        return JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'));
    }
    catch {
        return null;
    }
}
async function writeManifest(profileDir, pkg) {
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, { mode: 0o644 });
}
const bundleName = (b) => (typeof b === 'string' ? b : b?.name ?? '');
/** Drop `names` from the profile manifest (dependencies and dsh.profile.bundles). */
async function removeFromManifest(profileDir, names) {
    if (!names.length)
        return;
    const pkg = await readManifest(profileDir);
    if (!pkg)
        return;
    let changed = false;
    for (const n of names) {
        if (pkg.dependencies && n in pkg.dependencies) {
            delete pkg.dependencies[n];
            changed = true;
        }
    }
    const bundles = pkg.dsh?.profile?.bundles;
    if (bundles) {
        const kept = bundles.filter((b) => !names.includes(bundleName(b)));
        if (kept.length !== bundles.length) {
            pkg.dsh.profile.bundles = kept;
            changed = true;
        }
    }
    if (changed)
        await writeManifest(profileDir, pkg);
}
/** Make sure an installed plugin is listed as a profile bundle (pnpm add only writes dependencies). */
async function ensureBundleListed(profileDir, name) {
    const pkg = await readManifest(profileDir);
    const bundles = pkg?.dsh?.profile?.bundles;
    if (!pkg || !bundles || bundles.some((b) => bundleName(b) === name))
        return;
    bundles.push(name);
    await writeManifest(profileDir, pkg);
}
/**
 * Same lookup dsh-app-boot uses for `dsh.profile.bundles` (resolveBundleDir, profile anchor):
 * Node's node_modules search paths from <profile>/package.json, a directory holding package.json.
 * When it fails, Desktop marks the plugin 异常 / 包不可用 ("cannot resolve profile bundle").
 */
export function bundleResolvesFromProfile(profileDir, name) {
    try {
        for (const p of createRequire(join(profileDir, 'package.json')).resolve.paths(name) ?? []) {
            if (existsSync(join(p, name, 'package.json')))
                return true;
        }
    }
    catch {
        // fall through
    }
    return false;
}
/**
 * Keep `dsh.profile.bundles` loadable while plugins install: only list a restored plugin once
 * its package resolves the way dsh resolves it, so a Desktop (re)start mid-restore never sees a
 * bundle it cannot load. Returns the restored plugins that still do not resolve.
 */
async function syncResolvableBundles(profileDir, original, ours, installedNow = new Set()) {
    const pkg = await readManifest(profileDir);
    const bundles = pkg?.dsh?.profile?.bundles;
    if (!pkg || !bundles)
        return [];
    const unresolved = [];
    const keep = bundles.filter((b) => {
        const n = bundleName(b);
        if (!ours.has(n) || isBuiltinDshBundle(n))
            return true;
        if (bundleResolvesFromProfile(profileDir, n))
            return true;
        unresolved.push(n);
        return false;
    });
    for (const n of [...original, ...ours]) {
        if (!ours.has(n) || isBuiltinDshBundle(n) || keep.some((b) => bundleName(b) === n))
            continue;
        if (!original.includes(n) && !installedNow.has(n))
            continue;
        if (bundleResolvesFromProfile(profileDir, n))
            keep.push(n);
        else if (!unresolved.includes(n))
            unresolved.push(n);
    }
    if (keep.map(bundleName).join('\0') !== bundles.map(bundleName).join('\0')) {
        pkg.dsh.profile.bundles = keep;
        await writeManifest(profileDir, pkg);
    }
    return unresolved;
}
/** Put bundles back into the backup's order after per-plugin installs appended them. */
async function restoreBundleOrder(profileDir, original) {
    const pkg = await readManifest(profileDir);
    const bundles = pkg?.dsh?.profile?.bundles;
    if (!pkg || !bundles || !original.length)
        return;
    const rank = new Map(original.map((b, i) => [b, i]));
    const sorted = [...bundles].sort((a, b) => (rank.get(bundleName(a)) ?? 1e9) - (rank.get(bundleName(b)) ?? 1e9));
    if (sorted.map(bundleName).join('\0') !== bundles.map(bundleName).join('\0')) {
        pkg.dsh.profile.bundles = sorted;
        await writeManifest(profileDir, pkg);
    }
}
/** Rewrite local deps to the restored bundled sources (or the original path when it exists here). */
export async function rewriteBundledLinkDeps(dshHome, plugins) {
    const touched = [];
    const byProfile = new Map();
    for (const p of plugins) {
        if (!p.bundledSource || !p.profile)
            continue;
        const list = byProfile.get(p.profile) ?? [];
        list.push(p);
        byProfile.set(p.profile, list);
    }
    for (const [profile, list] of byProfile) {
        const profileDir = join(dshHome, 'profiles', profile);
        const pkg = await readManifest(profileDir);
        if (!pkg?.dependencies)
            continue;
        let changed = false;
        for (const plugin of list) {
            if (!(plugin.name in pkg.dependencies))
                continue;
            const target = await resolveLinkTarget(plugin, dshHome);
            if (!target)
                continue;
            const spec = specForTarget(target);
            if (pkg.dependencies[plugin.name] !== spec) {
                pkg.dependencies[plugin.name] = spec;
                changed = true;
            }
        }
        if (changed) {
            await writeManifest(profileDir, pkg);
            touched.push(profile);
        }
    }
    return touched;
}
/**
 * Every dependency spec in a profile manifest that cannot resolve on this machine
 * (missing file:/link:/portal: path with no bundled copy, workspace:/catalog:).
 * One such spec makes `pnpm install` fail for the whole profile.
 */
export async function findUnresolvableSpecs(profileDir) {
    const pkg = await readManifest(profileDir);
    const out = [];
    for (const [name, value] of Object.entries(pkg?.dependencies ?? {})) {
        const spec = parseLocalSpec(value);
        if (!spec)
            continue;
        if (spec.kind === 'unsupported') {
            out.push({ name, spec: value, reason: 'unsupported-spec', subject: value });
            continue;
        }
        const abs = resolveLocalSpecPath(spec.path, profileDir);
        const ok = spec.tarball ? await isFile(abs) : await pathExists(abs);
        // Absolute specs name machine 1's path as is; relative ones are shown as written.
        const absolute = isWindowsAbsPath(spec.path) || spec.path.startsWith('/') || spec.path.startsWith('~');
        if (!ok)
            out.push({ name, spec: value, reason: spec.tarball ? 'tarball-missing' : 'local-source-missing', subject: absolute ? abs : spec.path });
    }
    return out;
}
async function materializeProfile(profileDir, deps, opts = {}) {
    const pnpm = await resolvePnpm(deps);
    const hasLock = opts.frozen !== false && (await pathExists(join(profileDir, 'pnpm-lock.yaml')));
    const args = hasLock ? ['install', '--frozen-lockfile', '--ignore-scripts'] : ['install', '--ignore-scripts'];
    let result = await runPnpm(deps, pnpm, args, profileDir);
    if (!result.ok && hasLock)
        result = await runPnpm(deps, pnpm, ['install', '--ignore-scripts'], profileDir);
    return { ok: result.ok, detail: result.detail };
}
async function installViaPluginManager(manager, spec, deps) {
    try {
        const outcome = await manager.installBundle(spec, {
            saveExact: !spec.startsWith('link:') && !spec.startsWith('file:'),
            registry: deps.preferredRegistry === undefined ? NPMMIRROR : deps.preferredRegistry,
            enabled: true,
        });
        if (outcome.error?.code === 'already-installed') {
            return { ok: true, detail: 'already-installed in profile manifest', already: true };
        }
        if (outcome.application === 'failed' || outcome.error) {
            const detail = [outcome.error?.code, outcome.error?.message, outcome.error?.diagnostic, outcome.packageResult?.output]
                .filter(Boolean)
                .join('\n') || 'installBundle failed';
            return { ok: false, detail: `pluginManager: ${detail}` };
        }
        return { ok: true, detail: outcome.application ?? 'installed' };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/already-installed/i.test(message)) {
            return { ok: true, detail: message, already: true };
        }
        return { ok: false, detail: `pluginManager: ${message}` };
    }
}
/** `pnpm add` straight into a profile with the host's (or Desktop's bundled) pnpm. */
async function installViaPnpm(spec, name, kind, profileDir, deps) {
    const pnpm = await resolvePnpm(deps);
    const args = ['add', spec, '--ignore-scripts', ...(kind === 'npm' ? ['--save-exact'] : [])];
    const registry = deps.preferredRegistry === undefined ? NPMMIRROR : deps.preferredRegistry;
    let result = await runPnpm(deps, pnpm, registry && kind === 'npm' ? [...args, `--config.registry=${registry}`] : args, profileDir);
    if (!result.ok && registry && kind === 'npm')
        result = await runPnpm(deps, pnpm, args, profileDir);
    if (result.ok)
        await ensureBundleListed(profileDir, name);
    return { ok: result.ok, detail: result.ok ? `installed with ${path.basename(pnpm.args?.[0] ?? pnpm.command)}` : `pnpm: ${result.detail}` };
}
/** Candidate Desktop-bundled `dsh` carriers (npm-global `dsh` refuses --profile desktop). */
export function bundledDshCandidates(env = process.env, platform = process.platform) {
    const out = [];
    const win = platform === 'win32';
    const P = win ? path.win32 : path.posix;
    const exes = win ? ['dsh.cmd', 'dsh.exe'] : ['dsh'];
    if (env.DSH_DESKTOP_DSH_DIR?.trim()) {
        for (const exe of exes)
            out.push(P.join(expandUserPath(env.DSH_DESKTOP_DSH_DIR, env), exe));
    }
    if (env.DSH_CLI?.trim())
        out.push(expandUserPath(env.DSH_CLI, env));
    for (const root of desktopResourceRoots(env, platform)) {
        for (const exe of exes) {
            out.push(P.join(root, 'dsh', exe));
            out.push(P.join(root, 'bin', exe));
            out.push(P.join(root, 'app.asar.unpacked', 'dsh', exe));
        }
        out.push(P.join(P.dirname(root), exes[0]));
    }
    out.push(...exes);
    out.push('dsh');
    return [...new Set(out)];
}
/** Locate the dsh CLI package (`@deepseek-ai/dsh/lib/bin.js`) shipped inside Desktop's resources. */
export async function findDshCliEntry(roots, maxDepth = 6) {
    const rel = join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    const queue = roots.map((dir) => ({ dir, depth: 0 }));
    let visited = 0;
    while (queue.length && visited < 4000) {
        const { dir, depth } = queue.shift();
        visited++;
        if (await isFile(join(dir, rel)))
            return join(dir, rel);
        if (depth >= maxDepth)
            continue;
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const e of entries) {
            if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.'))
                continue;
            queue.push({ dir: join(dir, e.name), depth: depth + 1 });
        }
    }
    return null;
}
const CARRIER = `import { pathToFileURL } from 'node:url'
const pm = process.env.DSH_VAULT_PACKAGE_MANAGER ? JSON.parse(process.env.DSH_VAULT_PACKAGE_MANAGER) : undefined
const m = await import(pathToFileURL(process.env.DSH_VAULT_DSH_BIN).href)
await m.runCli({ manageDesktopProfile: true, ...(pm ? { packageManager: pm } : {}) })
`;
async function installViaDshCli(spec, profile, deps) {
    const run = deps.runCommand ?? defaultRunCommand;
    const env = await installerEnv(deps);
    const discoveryEnv = deps.env ?? process.env;
    const tried = [];
    let last = '';
    // 1) Desktop's dsh package run by its own node — no PATH, no cmd.exe, no GBK.
    const pnpm = await resolvePnpm(deps);
    const entry = await findDshCliEntry(desktopResourceRoots(discoveryEnv));
    const bundledPnpm = await findBundledPnpm(discoveryEnv);
    const node = bundledPnpm?.command ?? (process.versions.electron ? process.execPath : process.execPath);
    if (entry) {
        const carrier = join(tmpdir(), 'dsh-vault-dsh-carrier.mjs');
        await mkdir(dirname(carrier), { recursive: true });
        await writeFile(carrier, CARRIER);
        const result = await run(node, [carrier, 'plugin', '--profile', profile, 'add', spec], {
            env: {
                ...env,
                ...(process.versions.electron && node === process.execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
                DSH_VAULT_DSH_BIN: entry,
                ...(pnpm.command !== 'pnpm' ? { DSH_VAULT_PACKAGE_MANAGER: JSON.stringify({ command: pnpm.command, args: pnpm.args ?? [] }) } : {}),
            },
        });
        if (result.ok)
            return { ok: true, detail: `installed via ${entry}` };
        tried.push(entry);
        last = result.detail;
    }
    // 2) dsh executables
    const candidates = profile === DESKTOP_PROFILE ? bundledDshCandidates(discoveryEnv) : ['dsh'];
    for (const cmd of candidates) {
        if (/[\\/]/.test(cmd) && !(await isFile(cmd)))
            continue;
        const result = await run(cmd, ['plugin', '--profile', profile, 'add', spec], { env });
        tried.push(cmd);
        if (result.ok)
            return { ok: true, detail: `installed via ${cmd}` };
        last = `${cmd}: ${result.detail}`;
        if (/managed exclusively by the Electron|manageDesktopProfile|refuses/i.test(result.detail))
            continue;
    }
    let detail = `dsh: ${last || 'no dsh carrier found'} (tried: ${tried.join(', ') || 'none'})`;
    if (profile === DESKTOP_PROFILE)
        detail += '\n' + installCommandForProfile(DESKTOP_PROFILE, spec).notes.join('\n');
    return { ok: false, detail };
}
/**
 * When the registry/git cannot supply the exact version, install machine 1's copy from
 * the snapshot (locked tarball first, then the packed plugin-sources/ directory).
 */
async function installFromBackupFallback(plugin, profileDir, deps) {
    const logs = [];
    const pnpm = await resolvePnpm(deps);
    if (plugin.lockedTarball) {
        const r = await runPnpm(deps, pnpm, ['add', `${plugin.name}@${plugin.lockedTarball}`, '--ignore-scripts'], profileDir);
        if (r.ok || (await pluginPackagePresent(deps.dshHome, plugin.profile ?? 'web', plugin.name))) {
            await ensureBundleListed(profileDir, plugin.name);
            return { ok: true, detail: `installed machine 1's locked tarball ${plugin.lockedTarball}${plugin.installedVersion ? ` @${plugin.installedVersion}` : ''}`, fromBackup: true };
        }
        logs.push(`locked tarball: ${r.detail}`);
    }
    if (plugin.fallbackBundle) {
        const abs = join(deps.dshHome, ...plugin.fallbackBundle.split('/'));
        if (await pathExists(join(abs, 'package.json'))) {
            const r = await runPnpm(deps, pnpm, ['add', `link:${specPath(abs)}`, '--ignore-scripts'], profileDir);
            const present = await pluginPackagePresent(deps.dshHome, plugin.profile ?? 'web', plugin.name);
            if (r.ok || present) {
                await ensureBundleListed(profileDir, plugin.name);
                const d = await installBundledSourceDeps(abs, deps);
                if (!d.ok)
                    return { ok: false, detail: d.detail, fromBackup: false };
                return {
                    ok: true,
                    detail: `installed from backup copy (${plugin.fallbackBundle}); registry version unavailable${plugin.installedVersion ? ` @${plugin.installedVersion}` : ''}`,
                    fromBackup: true,
                };
            }
            logs.push(`backup copy: ${r.detail}`);
        }
        else {
            logs.push(`backup copy missing: ${abs}`);
        }
    }
    return { ok: false, detail: logs.join('\n\n') || 'no backup copy for this plugin', fromBackup: false };
}
function registryOrGitUnavailable(detail) {
    return /ERR_PNPM_NO_MATCHING_VERSION|No matching version found|ERR_PNPM_FETCH_404|E404|is not in the npm registry|404 Not Found|Not Found - 404|spawn git ENOENT|git-missing|Command failed with ENOENT: git|不是内部或外部命令.*git|Repository not found|could not read Username|fatal:.*repository/i.test(detail);
}
async function installSpecFor(plugin, dshHome) {
    if (plugin.bundledSource) {
        const target = await resolveLinkTarget(plugin, dshHome);
        if (target)
            return { spec: specForTarget(target), kind: 'link' };
        const kind = plugin.bundledKind ?? 'dir';
        return { spec: specForTarget({ abs: join(dshHome, ...plugin.bundledSource.split('/')), kind }), kind: 'link' };
    }
    const local = parseLocalSpec(plugin.source) ?? parseLocalSpec(plugin.version);
    if (local?.kind === 'path') {
        const abs = resolveLocalSpecPath(local.path, join(dshHome, 'profiles', plugin.profile ?? 'web'));
        return { spec: `${local.tarball ? 'file' : 'link'}:${specPath(abs)}`, kind: 'link' };
    }
    if (local?.kind === 'unsupported')
        return { spec: local.raw, kind: 'other' };
    const remote = [plugin.source, plugin.version].find((s) => isRemoteNonRegistrySpec(s) && !s.startsWith('npm:'));
    if (remote)
        return { spec: `${plugin.name}@${remote}`, kind: 'git' };
    if (plugin.source.startsWith('git') || plugin.source.includes('github.com')) {
        return { spec: plugin.source.startsWith('npm:') ? plugin.name : plugin.source, kind: 'git' };
    }
    // Exact version machine 1 actually had installed beats the manifest range (e.g. ^1.9.12).
    if (plugin.installedVersion) {
        return { spec: `${plugin.name}@${plugin.installedVersion}`, kind: 'npm' };
    }
    if (plugin.version && !parseLocalSpec(plugin.version)) {
        return { spec: `${plugin.name}@${plugin.version}`, kind: 'npm' };
    }
    if (plugin.source.startsWith('npm:')) {
        return { spec: plugin.source.slice(4), kind: 'npm' };
    }
    return { spec: plugin.name, kind: 'other' };
}
/** A local install spec whose file/folder is missing here, or a workspace-only spec. */
async function unusableLocalSpec(plugin, spec, kind) {
    const parsed = parseLocalSpec(spec);
    if (parsed?.kind === 'unsupported')
        return { reason: 'unsupported-spec', subject: parsed.raw };
    if (kind !== 'link' || parsed?.kind !== 'path')
        return null;
    const present = parsed.tarball ? await isFile(parsed.path) : await pathExists(join(parsed.path, 'package.json'));
    if (present)
        return null;
    // Name the path as machine 1 wrote it, so the owner can find it there.
    const original = parseLocalSpec(plugin.originalSource) ?? parseLocalSpec(plugin.source) ?? parsed;
    const subject = original.kind === 'path' ? original.path : parsed.path;
    const tarball = original.kind === 'path' ? original.tarball : parsed.tarball;
    return { reason: tarball ? 'tarball-missing' : 'local-source-missing', subject };
}
function ownPathsOf(plugin, dshHome) {
    const out = [];
    const profileDir = join(dshHome, 'profiles', plugin.profile ?? 'web');
    for (const s of [plugin.originalSource, plugin.source, plugin.version]) {
        const spec = parseLocalSpec(s);
        if (spec?.kind === 'path')
            out.push(resolveLocalSpecPath(spec.path, profileDir));
    }
    if (plugin.bundledSource)
        out.push(join(dshHome, ...plugin.bundledSource.split('/')));
    return out;
}
/** Short English line for a reason (UI localizes by `reason`). */
function reasonLine(reason, subject) {
    switch (reason) {
        case 'tarball-missing':
            return `local package file not found on this machine: ${subject}; re-run the backup on the original machine with the current dsh-vault`;
        case 'local-source-missing':
            return `local plugin folder not found on this machine: ${subject}; re-run the backup on the original machine with the current dsh-vault`;
        case 'unsupported-spec':
            return `dependency spec only resolves inside the original workspace: ${subject}`;
        case 'blocked-by-other':
            return `blocked by another dependency that cannot be resolved here: ${subject}`;
        case 'registry-not-found':
            return `not found in the npm registry${subject ? `: ${subject}` : ''}`;
        case 'network':
            return 'network error while contacting the npm registry';
        case 'installer-missing':
            return 'no pnpm / dsh installer found on this machine';
        case 'git-missing':
            return `git is needed to install ${subject ?? 'this plugin'} from GitHub, and it is not installed`;
        case 'git-unavailable':
            return `the git repository cannot be reached: ${subject}`;
        case 'no-recorded-source':
            return `the backup has no recorded install source for ${subject ?? 'this plugin'} and no saved copy; skipped (installing by name could pull an unrelated npm package with the same name)`;
        case 'integrity-mismatch':
            return `the registry's ${subject ?? 'package'} is a different package than the one backed up (integrity differs), and this backup has no copy of it`;
        case 'source-not-approved':
            return `${subject ?? 'this plugin'} would be fetched from a git / tarball / URL source named in the snapshot; it was not approved, and the snapshot has no saved copy — approve it in the restore dialog (or pass --allow-plugin-source) to install it`;
        case 'invalid-spec':
            return `refused a malformed plugin record: ${subject ?? ''}`;
        case 'self':
            return 'dsh-vault itself is never reinstalled by a restore; this machine keeps its own installation';
        case 'no-backup-copy':
            return `${subject ?? 'this plugin'} is not on the registry at that version, and this backup has no saved copy of it; back up again on the original machine with the current 大肥鱼备份 (dsh-vault)`;
        default:
            return subject ?? 'install failed';
    }
}
/**
 * True when the backup only knew this plugin's name (a bundle / cordis entry) and never
 * recorded where it came from. Such a plugin is never installed from the registry by name.
 */
export function hasNoRecordedSource(p) {
    if (p.recordedFrom)
        return p.recordedFrom === 'name-only';
    // Older snapshots: a bare name with no spec, version or installed version.
    return p.source === p.name && !p.installedVersion && !p.bundledSource && !p.lockedTarball &&
        !(p.version && (parseLocalSpec(p.version) || isRemoteNonRegistrySpec(p.version)));
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
export async function reinstallMissingPlugins(plugins, deps, options = {}) {
    const results = [];
    const key = (profile, name) => `${profile}:${name}`;
    const profileOf = (p) => p.profile ?? deps.activeProfile;
    // One record per profile:name (a plugin can legitimately be in two profiles).
    const seen = new Set();
    const actionable = plugins.filter((p) => {
        if (isBuiltinDshBundle(p.name))
            return false;
        const k = key(profileOf(p), p.name);
        if (seen.has(k) || (options.only && !options.only.has(k)))
            return false;
        seen.add(k);
        return true;
    });
    const done = new Set();
    const failedIn = new Map();
    const fail = (row) => {
        results.push(row);
        done.add(key(row.profile, row.name));
        const set = failedIn.get(row.profile) ?? new Set();
        set.add(row.name);
        failedIn.set(row.profile, set);
    };
    // dsh-vault itself: never reinstalled or rewritten (it is the running plugin, usually a
    // link: install of this machine's checkout). The target keeps its own entry.
    for (let i = actionable.length - 1; i >= 0; i--) {
        const p = actionable[i];
        if (!isSelfPlugin(p.name))
            continue;
        actionable.splice(i, 1);
        results.unshift({ name: p.name, profile: profileOf(p), status: 'skipped', reason: 'self', detail: reasonLine('self'), source: p.originalSource ?? p.source });
    }
    // H-06: malformed records never reach pnpm / dsh.
    for (let i = actionable.length - 1; i >= 0; i--) {
        const p = actionable[i];
        const bad = invalidPluginRecord(p);
        if (!bad)
            continue;
        actionable.splice(i, 1);
        results.push({ name: String(p.name), profile: profileOf(p), status: 'failed', reason: 'invalid-spec', subject: bad, detail: `refused: ${bad}`, source: String(p.source ?? '') });
    }
    // Only the bundle/cordis name was recorded: copy only, never the registry by name.
    const copyOnly = new Map();
    // H-06: unapproved git / tarball / URL sources: saved copy only, or skip.
    const blockedNoCopy = [];
    for (let i = actionable.length - 1; i >= 0; i--) {
        const p = actionable[i];
        const k = key(profileOf(p), p.name);
        if (!options.blockedSources?.has(k))
            continue;
        if (await pluginPackagePresent(deps.dshHome, profileOf(p), p.name))
            continue;
        if (p.fallbackBundle) {
            p.lockedTarball = undefined;
            copyOnly.set(k, 'remote plugin source not approved; installed the saved copy from the snapshot instead');
            continue;
        }
        actionable.splice(i, 1);
        blockedNoCopy.push(p);
        results.push({ name: p.name, profile: profileOf(p), status: 'skipped', reason: 'source-not-approved', subject: p.name, detail: reasonLine('source-not-approved', p.name), source: p.source });
    }
    // Their entries must not stay in the restored profile manifests either, or `pnpm install` would fetch them.
    for (const profile of new Set(blockedNoCopy.map(profileOf))) {
        await removeFromManifest(join(deps.dshHome, 'profiles', profile), blockedNoCopy.filter((p) => profileOf(p) === profile).map((p) => p.name));
    }
    for (let i = actionable.length - 1; i >= 0; i--) {
        const p = actionable[i];
        if (!hasNoRecordedSource(p))
            continue;
        const k = key(profileOf(p), p.name);
        if (await pluginPackagePresent(deps.dshHome, profileOf(p), p.name))
            continue;
        if (p.fallbackBundle || p.lockedTarball) {
            copyOnly.set(k, 'no recorded install source; installed the saved copy instead of the registry');
            continue;
        }
        actionable.splice(i, 1);
        results.push({ name: p.name, profile: profileOf(p), status: 'skipped', reason: 'no-recorded-source', subject: p.name, detail: reasonLine('no-recorded-source', p.name), source: p.source });
    }
    // Same name + version on the registry but a different package (integrity differs): prefer the copy.
    const mismatched = new Set();
    if (deps.registryIntegrity) {
        const check = actionable.filter((p) => p.integrity && p.installedVersion && !p.bundledSource && !copyOnly.has(key(profileOf(p), p.name)));
        await Promise.all(check.map(async (p) => {
            let reg;
            try {
                reg = await deps.registryIntegrity(p.name, p.installedVersion);
            }
            catch {
                reg = undefined;
            }
            if (typeof reg === 'string' && reg && reg !== p.integrity)
                mismatched.add(key(profileOf(p), p.name));
        }));
        for (const p of actionable) {
            const k = key(profileOf(p), p.name);
            if (!mismatched.has(k))
                continue;
            if (p.fallbackBundle || p.lockedTarball) {
                copyOnly.set(k, `registry ${p.name}@${p.installedVersion} has a different integrity than the backed-up package; installed the saved copy`);
            }
        }
    }
    await rewriteBundledLinkDeps(deps.dshHome, actionable);
    const presentBefore = new Set();
    for (const p of actionable) {
        if (await pluginPackagePresent(deps.dshHome, profileOf(p), p.name))
            presentBefore.add(key(profileOf(p), p.name));
    }
    const profiles = [...new Set(actionable.map(profileOf))];
    const oursIn = (profile) => new Set(actionable.filter((p) => profileOf(p) === profile).map((p) => p.name));
    const originalBundles = new Map();
    for (const profile of profiles) {
        const profileDir = join(deps.dshHome, 'profiles', profile);
        const pkg = await readManifest(profileDir);
        if (!pkg)
            continue;
        originalBundles.set(profile, (pkg.dsh?.profile?.bundles ?? []).map(bundleName));
        await syncResolvableBundles(profileDir, originalBundles.get(profile), oursIn(profile));
        // Never let pnpm fetch a package we will not take from the registry.
        const keepOut = actionable.filter((p) => profileOf(p) === profile && (copyOnly.has(key(profile, p.name)) || mismatched.has(key(profile, p.name))));
        if (keepOut.length)
            await removeFromManifest(profileDir, keepOut.map((p) => p.name));
        for (const p of keepOut) {
            if (copyOnly.has(key(profile, p.name)))
                continue;
            fail({ name: p.name, profile, status: 'failed', reason: 'integrity-mismatch', subject: `${p.name}@${p.installedVersion}`, detail: reasonLine('integrity-mismatch', `${p.name}@${p.installedVersion}`), source: p.source });
        }
        // 2) Pre-validate. Unresolvable specs come out of this install run.
        const invalid = await findUnresolvableSpecs(profileDir);
        if (invalid.length) {
            await removeFromManifest(profileDir, invalid.map((i) => i.name));
            for (const bad of invalid) {
                const rec = actionable.find((p) => p.name === bad.name && profileOf(p) === profile);
                const subject = rec?.originalSource ? parseLocalSpec(rec.originalSource)?.path ?? bad.subject : bad.subject;
                if (options.only && !options.only.has(key(profile, bad.name)))
                    continue;
                fail({
                    name: bad.name,
                    profile,
                    status: 'failed',
                    reason: bad.reason,
                    subject,
                    detail: reasonLine(bad.reason, subject),
                    source: rec?.originalSource ?? bad.spec,
                });
            }
        }
        // 3) Materialize.
        options.onProgress?.({ phase: 'reinstall', message: 'Installing profile dependencies', current: 0, total: actionable.length, item: `pnpm install (${profile})` });
        const mat = await materializeProfile(profileDir, deps, { frozen: invalid.length === 0 });
        if (!mat.ok) {
            const isolate = [];
            const current = await readManifest(profileDir);
            for (const p of actionable) {
                if (profileOf(p) !== profile || done.has(key(profile, p.name)))
                    continue;
                if (presentBefore.has(key(profile, p.name)))
                    continue;
                // Anything resolved from the network can fail alone; isolate it (npm and git/GitHub).
                const k = (await installSpecFor(p, deps.dshHome)).kind;
                if (k !== 'npm' && k !== 'git')
                    continue;
                if (current?.dependencies && p.name in current.dependencies)
                    isolate.push(p.name);
            }
            if (isolate.length) {
                await removeFromManifest(profileDir, isolate);
                await materializeProfile(profileDir, deps, { frozen: false });
            }
        }
    }
    // Bundled link: sources need their own runtime deps (pnpm skips them for link:).
    const bundledDeps = new Map();
    for (const plugin of actionable) {
        if (done.has(key(profileOf(plugin), plugin.name)))
            continue;
        const target = plugin.bundledSource ? await resolveLinkTarget(plugin, deps.dshHome) : null;
        if (!target?.bundled || target.kind !== 'dir' || bundledDeps.has(target.abs))
            continue;
        bundledDeps.set(target.abs, await installBundledSourceDeps(target.abs, deps));
    }
    const managerProfile = deps.pluginManager?.profile?.name ?? deps.activeProfile;
    let restartRequired = false;
    let pluginIndex = 0;
    for (const plugin of actionable) {
        const profile = profileOf(plugin);
        pluginIndex++;
        options.onProgress?.({ phase: 'reinstall', message: 'Installing plugins', current: pluginIndex - 1, total: actionable.length, item: plugin.name });
        if (done.has(key(profile, plugin.name)))
            continue;
        const profileDir = join(deps.dshHome, 'profiles', profile);
        // A failed add can leave its entry behind, which would break the next install too.
        await removeFromManifest(profileDir, [...(failedIn.get(profile) ?? [])]);
        if (await pluginPackagePresent(deps.dshHome, profile, plugin.name)) {
            // Present is not enough: a package whose dependencies don't resolve fails to import in dsh.
            const pkgDir = join(profileDir, 'node_modules', ...plugin.name.split('/'));
            const missing = await missingRuntimeDependencies(pkgDir);
            if (missing.length) {
                const target = plugin.bundledSource ? await resolveLinkTarget(plugin, deps.dshHome) : null;
                const bundledDetail = target ? bundledDeps.get(target.abs)?.detail : undefined;
                fail({
                    name: plugin.name,
                    profile,
                    status: 'failed',
                    reason: 'missing-deps',
                    subject: missing.join(', '),
                    detail: `installed but cannot load: missing dependencies ${missing.join(', ')}`,
                    log: bundledDetail,
                    source: plugin.originalSource ?? plugin.source,
                });
                continue;
            }
            const version = await installedPackageVersion(pkgDir);
            if (!(plugin.installedVersion && version && version !== plugin.installedVersion)) {
                const linked = plugin.bundledSource ? await resolveLinkTarget(plugin, deps.dshHome) : null;
                const isNew = !presentBefore.has(key(profile, plugin.name));
                if (isNew)
                    restartRequired = true;
                results.push({
                    name: plugin.name,
                    profile,
                    status: isNew ? 'installed' : 'already-present',
                    detail: linked
                        ? `linked ${linked.bundled ? 'bundled source' : 'local source'} ${linked.abs}`
                        : `${isNew ? 'installed by profile install' : 'already installed'}${version ? ` @${version}` : ''}`,
                    source: plugin.source,
                });
                done.add(key(profile, plugin.name));
                continue;
            }
            // Wrong version (lockfile missing/ignored): fall through and install the exact one.
        }
        const onlyCopy = copyOnly.get(key(profile, plugin.name));
        if (onlyCopy !== undefined) {
            const manifestBefore = await readManifest(profileDir);
            const fb = await installFromBackupFallback(plugin, profileDir, deps);
            if (fb.ok || (await pluginPackagePresent(deps.dshHome, profile, plugin.name))) {
                results.push({ name: plugin.name, profile, status: 'installed-from-backup', detail: `${onlyCopy} (${fb.detail})`, source: plugin.source });
                done.add(key(profile, plugin.name));
                restartRequired = true;
            }
            else {
                if (manifestBefore)
                    await writeManifest(profileDir, manifestBefore);
                const reason = mismatched.has(key(profile, plugin.name)) ? 'integrity-mismatch' : 'no-recorded-source';
                const subject = reason === 'integrity-mismatch' ? `${plugin.name}@${plugin.installedVersion}` : plugin.name;
                fail({ name: plugin.name, profile, status: 'failed', reason, subject, detail: reasonLine(reason, subject), log: fb.detail, source: plugin.source });
            }
            continue;
        }
        const { spec, kind } = await installSpecFor(plugin, deps.dshHome);
        // A bare name is a guess: never resolve it against the registry.
        if (kind === 'other' && spec === plugin.name) {
            results.push({ name: plugin.name, profile, status: 'skipped', reason: 'no-recorded-source', subject: plugin.name, detail: reasonLine('no-recorded-source', plugin.name), source: plugin.source });
            done.add(key(profile, plugin.name));
            continue;
        }
        // Never hand pnpm a local path that isn't here: it would fail (or link a dangling dir).
        const unusable = await unusableLocalSpec(plugin, spec, kind);
        if (unusable) {
            fail({
                name: plugin.name,
                profile,
                status: 'failed',
                reason: unusable.reason,
                subject: unusable.subject,
                detail: reasonLine(unusable.reason, unusable.subject),
                source: plugin.originalSource ?? plugin.source,
            });
            continue;
        }
        const manifestBefore = await readManifest(profileDir);
        const logs = [];
        let ok = false;
        let how = '';
        let fromBackup = false;
        // 0) Copy first: user chose 优先使用备份副本, or the exact version is known to be gone from the registry.
        const copyFirst = Boolean(plugin.fallbackBundle || plugin.lockedTarball) &&
            (options.restoreOrder === 'copy-first' || plugin.registryMissing === true);
        if (copyFirst) {
            const fb = await installFromBackupFallback(plugin, profileDir, deps);
            ok = fb.ok || (await pluginPackagePresent(deps.dshHome, profile, plugin.name));
            if (ok) {
                how = fb.detail;
                fromBackup = true;
            }
            else {
                logs.push(fb.detail);
            }
        }
        // a) Host pluginManager — only for the profile it manages.
        if (!ok && deps.pluginManager && profile === managerProfile) {
            const viaMgr = await installViaPluginManager(deps.pluginManager, spec, deps);
            if (viaMgr.already) {
                await materializeProfile(profileDir, deps);
                ok = await pluginPackagePresent(deps.dshHome, profile, plugin.name);
                how = 'materialized via pnpm after already-installed';
                if (!ok)
                    logs.push(viaMgr.detail);
            }
            else if (viaMgr.ok) {
                ok = true;
                how = viaMgr.detail;
            }
            else {
                logs.push(viaMgr.detail);
            }
        }
        // b) pnpm in the profile dir (any profile; host / Desktop-bundled pnpm).
        if (!ok) {
            const viaPnpm = await installViaPnpm(spec, plugin.name, kind, profileDir, deps);
            // Trust the files, not the exit code.
            ok = await pluginPackagePresent(deps.dshHome, profile, plugin.name);
            if (ok)
                how = viaPnpm.ok ? viaPnpm.detail : 'present after pnpm add';
            else
                logs.push(viaPnpm.ok ? 'pnpm add exited 0 but the package is not in node_modules' : viaPnpm.detail);
        }
        // c) dsh CLI (Desktop-bundled carrier first).
        if (!ok) {
            const viaCli = await installViaDshCli(spec, profile, deps);
            ok = await pluginPackagePresent(deps.dshHome, profile, plugin.name);
            if (ok)
                how = viaCli.ok ? viaCli.detail : 'present after CLI attempt';
            else
                logs.push(viaCli.ok ? 'dsh plugin add exited 0 but the package is not in node_modules' : viaCli.detail);
        }
        // d) Exact version unpublished / git missing: install the copy packed at backup time.
        if (!ok && !copyFirst && (plugin.fallbackBundle || plugin.lockedTarball)) {
            const soFar = logs.join('\n');
            const classified = classifyInstallFailure(soFar, ownPathsOf(plugin, deps.dshHome), plugin.name);
            const fetchFail = registryOrGitUnavailable(soFar) ||
                classified.reason === 'registry-not-found' ||
                classified.reason === 'git-missing' ||
                classified.reason === 'git-unavailable' ||
                classified.reason === 'network';
            if (fetchFail) {
                const fb = await installFromBackupFallback(plugin, profileDir, deps);
                ok = fb.ok || (await pluginPackagePresent(deps.dshHome, profile, plugin.name));
                if (ok) {
                    how = fb.detail;
                    fromBackup = true;
                }
                else {
                    logs.push(fb.detail);
                }
            }
        }
        // A failed attempt must not leave stray entries (e.g. a link named after a folder).
        if (!ok && manifestBefore)
            await writeManifest(profileDir, manifestBefore);
        if (ok) {
            results.push({
                name: plugin.name,
                profile,
                status: fromBackup ? 'installed-from-backup' : 'installed',
                detail: how,
                source: plugin.source,
            });
            done.add(key(profile, plugin.name));
            restartRequired = true;
        }
        else {
            const log = logs.join('\n\n');
            const c = classifyInstallFailure(log, ownPathsOf(plugin, deps.dshHome), plugin.name);
            // Snapshot from an older build (or the copy was turned off): say so instead of only the npm error.
            if (c.reason === 'registry-not-found' && !plugin.fallbackBundle && !plugin.lockedTarball && !plugin.bundledSource) {
                c.reason = 'no-backup-copy';
                c.subject = `${plugin.name}${plugin.installedVersion ? `@${plugin.installedVersion}` : ''}`;
            }
            fail({
                name: plugin.name,
                profile,
                status: 'failed',
                reason: c.reason,
                subject: c.subject,
                detail: c.reason === 'unknown' ? c.summary : reasonLine(c.reason, c.subject),
                log,
                source: plugin.source,
            });
        }
    }
    options.onProgress?.({ phase: 'verify', message: 'Verifying plugins', fraction: 0.2 });
    // Keep every manifest installable, and in the backup's bundle order.
    for (const profile of profiles) {
        const profileDir = join(deps.dshHome, 'profiles', profile);
        const failed = [...(failedIn.get(profile) ?? [])].filter((n) => !presentBefore.has(key(profile, n)));
        await removeFromManifest(profileDir, failed);
        for (const r of results) {
            if (r.profile === profile && r.status === 'failed' && failed.includes(r.name) && !/left out of/.test(r.detail)) {
                r.log = `${r.log ? `${r.log}\n\n` : ''}(left out of profiles/${profile}/package.json so the other plugins still install; use “retry failed plugins” after fixing the cause)`;
            }
        }
        // Re-list every restored plugin that now resolves exactly as dsh will; flag the rest.
        const installedNow = new Set(results.filter((r) => r.profile === profile && (r.status === 'installed' || r.status === 'installed-from-backup')).map((r) => r.name));
        const unresolved = await syncResolvableBundles(profileDir, originalBundles.get(profile) ?? [], oursIn(profile), installedNow);
        for (const name of unresolved) {
            const row = results.find((r) => r.profile === profile && r.name === name);
            if (row && row.status !== 'failed' && row.status !== 'skipped') {
                row.status = 'failed';
                row.reason = 'not-resolvable';
                row.subject = name;
                row.detail = `installed, but dsh cannot resolve profile bundle ${name} from profiles/${profile}; left out of dsh.profile.bundles`;
            }
        }
        await restoreBundleOrder(profileDir, originalBundles.get(profile) ?? []);
    }
    // Final check: never report success for a version other than machine 1's.
    for (const row of results) {
        if (row.status === 'failed' || row.status === 'skipped')
            continue;
        const plugin = actionable.find((p) => p.name === row.name && profileOf(p) === row.profile);
        if (!plugin?.installedVersion)
            continue;
        const pkgDir = join(deps.dshHome, 'profiles', row.profile, 'node_modules', ...row.name.split('/'));
        const now = await installedPackageVersion(pkgDir);
        const remote = isRemoteNonRegistrySpec(plugin.version ?? plugin.source);
        if (now && now !== plugin.installedVersion && remote) {
            // A branch-tracking GitHub spec may legitimately be newer; report, don't fail.
            row.detail = `${row.detail} (@${now}; backup had ${plugin.installedVersion})`;
        }
        else if (now && now !== plugin.installedVersion) {
            row.status = 'failed';
            row.reason = 'version-mismatch';
            row.subject = `${now} ≠ ${plugin.installedVersion}`;
            row.detail = `installed ${now}, but the backup had ${plugin.installedVersion}`;
        }
        else if (now && !row.detail.includes(now)) {
            row.detail = `${row.detail} (@${now})`;
        }
    }
    return { results, restartRequired };
}
//# sourceMappingURL=plugin-install.js.map