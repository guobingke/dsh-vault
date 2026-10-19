import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { isSecretRelPath, resolveAgentsHome, resolveDshHome, shouldSkipDir, toSafeRelPath, } from './paths.js';
import { bundledSourceRel } from './plugin-install.js';
import { isSelfPlugin } from './self-entry.js';
import { isRemoteNonRegistrySpec, parseLocalSpec, resolveLocalSpecPath } from './local-spec.js';
import { homeExcludeReason, isPluginDataRoot, isSecretPath, walkHome } from './home-scope.js';
function isBuiltinDshBundle(name) {
    return name.startsWith('@deepseek-ai/dsh-') || name === '@deepseek-ai/dsh';
}
async function fileShaAndData(abs) {
    const data = await readFile(abs);
    const sha256 = createHash('sha256').update(data).digest('hex');
    return { size: data.length, sha256, data };
}
async function walkFiles(absDir, relPrefix, category, includeSecrets, out) {
    let entries;
    try {
        entries = await readdir(absDir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..')
            continue;
        if (entry.isDirectory()) {
            if (shouldSkipDir(entry.name) || homeExcludeReason(entry.name, true) === 'cache')
                continue;
            const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
            await walkFiles(join(absDir, entry.name), nextRel, category, includeSecrets, out);
            continue;
        }
        if (!entry.isFile() && !entry.isSymbolicLink())
            continue;
        const rel = toSafeRelPath(relPrefix ? `${relPrefix}/${entry.name}` : entry.name);
        const secret = isSecretRelPath(rel);
        if (secret && !includeSecrets)
            continue;
        const absPath = join(absDir, entry.name);
        try {
            const info = await stat(absPath);
            if (!info.isFile())
                continue;
            const { size, sha256, data } = await fileShaAndData(absPath);
            out.push({ absPath, relPath: rel, category, secret, size, sha256, data });
        }
        catch {
            // skip unreadable
        }
    }
}
async function maybeAddFile(absPath, relPath, category, includeSecrets, out) {
    const secret = isSecretRelPath(relPath) || isSecretPath(relPath);
    if (secret && !includeSecrets)
        return;
    try {
        const info = await stat(absPath);
        if (!info.isFile())
            return;
        const { size, sha256, data } = await fileShaAndData(absPath);
        out.push({ absPath, relPath: toSafeRelPath(relPath), category, secret, size, sha256, data });
    }
    catch {
        // missing is fine
    }
}
/** Extract plugin install records from a profile package.json / cordis patch. */
export function extractPluginsFromProfilePackage(packageJsonText, profileName) {
    let pkg;
    try {
        pkg = JSON.parse(packageJsonText);
    }
    catch {
        return [];
    }
    const out = [];
    const deps = pkg.dependencies ?? {};
    for (const [name, version] of Object.entries(deps)) {
        const local = parseLocalSpec(version) !== null;
        out.push({ name, version, source: local || version.startsWith('git') || isRemoteNonRegistrySpec(version) ? version : `npm:${name}@${version}`, profile: profileName, recordedFrom: 'dependency' });
    }
    const bundles = pkg.dsh?.profile?.bundles ?? [];
    for (const b of bundles) {
        if (typeof b === 'string') {
            if (!out.some((p) => p.name === b))
                out.push({ name: b, source: b, profile: profileName, recordedFrom: 'name-only' });
        }
        else if (b?.name) {
            if (!out.some((p) => p.name === b.name)) {
                out.push({ name: b.name, version: b.version, source: b.name, profile: profileName, recordedFrom: 'name-only' });
            }
        }
    }
    return out;
}
export function extractPluginsFromPatchYaml(patchText, profileName) {
    const out = [];
    try {
        const docs = parseYaml(patchText);
        const rows = Array.isArray(docs) ? docs : [docs];
        for (const row of rows) {
            if (!row || typeof row !== 'object')
                continue;
            const insert = row.insert;
            if (!Array.isArray(insert))
                continue;
            for (const item of insert) {
                if (!item || typeof item !== 'object')
                    continue;
                const name = item.name;
                if (typeof name === 'string' && name && !name.endsWith('.ts') && !name.startsWith('/')) {
                    out.push({ name, source: name, profile: profileName, recordedFrom: 'name-only' });
                }
            }
        }
    }
    catch {
        // ignore malformed patch
    }
    return out;
}
/** Collect all backup-scoped files from a dsh home. */
export async function collectBackupFiles(options) {
    const dshHome = options.dshHome || resolveDshHome();
    const agentsHome = options.agentsHome || resolveAgentsHome();
    const includeSecrets = Boolean(options.includeSecrets);
    const wanted = new Set(options.categories ?? [
        'plugins',
        'plugin-config',
        'mcp',
        'skills',
        'settings',
        'providers',
        'agent-presets',
        'profiles',
        'instructions',
        'plugin-data',
        ...(includeSecrets ? ['credentials'] : []),
    ]);
    const files = [];
    const plugins = [];
    // Profiles carry the plugin inventory, so any plugin-related category pulls them in.
    const wants = (cat) => {
        if (cat === 'profiles')
            return ['profiles', 'plugins', 'plugin-config', 'mcp', 'providers'].some((c) => wanted.has(c));
        if (cat === 'settings')
            return wanted.has('settings') || wanted.has('providers');
        if (cat === 'credentials')
            return includeSecrets && wanted.has('credentials');
        return wanted.has(cat);
    };
    // Everything under $DSH_HOME except the denylist (home-scope.ts).
    const progress = options.onProgress;
    const homeFiles = await walkHome(dshHome, { includeSecrets });
    progress?.({ phase: 'collect', message: 'Collecting files', current: 0, total: homeFiles.length });
    let n = 0;
    for (const f of homeFiles) {
        n++;
        const category = categoryForRelPath(f.rel);
        if (wants(category))
            await maybeAddFile(f.abs, f.rel, category, includeSecrets, files);
        if (progress && (n % 25 === 0 || n === homeFiles.length)) {
            progress({ phase: 'collect', message: 'Collecting files', current: n, total: homeFiles.length, item: f.rel });
        }
    }
    if (wanted.has('skills')) {
        await walkFiles(join(agentsHome, 'skills'), 'agents-home/skills', 'skills', includeSecrets, files);
    }
    if (wanted.has('instructions')) {
        await maybeAddFile(join(agentsHome, 'AGENTS.md'), 'agents-home/AGENTS.md', 'instructions', includeSecrets, files);
    }
    for (const extra of options.extraRoots ?? []) {
        await walkFiles(extra.abs, extra.relPrefix, extra.category, includeSecrets, files);
    }
    // Derive plugin inventory from collected profile manifests.
    for (const f of files) {
        if (f.relPath.match(/^profiles\/[^/]+\/package\.json$/)) {
            const profileName = f.relPath.split('/')[1];
            plugins.push(...extractPluginsFromProfilePackage(f.data.toString('utf8'), profileName));
        }
        if (f.relPath.match(/^profiles\/[^/]+\/cordis\.patch\.yml$/)) {
            const profileName = f.relPath.split('/')[1];
            for (const p of extractPluginsFromPatchYaml(f.data.toString('utf8'), profileName)) {
                if (!plugins.some((x) => x.name === p.name && x.profile === p.profile))
                    plugins.push(p);
            }
        }
    }
    // One record per profile:name; a recorded source (package.json dependency) beats a bare
    // bundle / cordis name, whichever file was read first.
    {
        const best = new Map();
        for (const p of plugins) {
            const k = `${p.profile ?? ''}:${p.name}`;
            const cur = best.get(k);
            if (!cur || (cur.recordedFrom === 'name-only' && p.recordedFrom !== 'name-only'))
                best.set(k, p);
        }
        plugins.splice(0, plugins.length, ...best.values());
    }
    // Also pick up plugins that are installed / referenced only in cordis (e.g. dsh-vscode-bridge
    // in cordis.patch.yml but not in package.json dependencies).
    const profileNames = new Set();
    for (const f of files) {
        const m = f.relPath.match(/^profiles\/([^/]+)\//);
        if (m)
            profileNames.add(m[1]);
    }
    for (const profileName of profileNames) {
        for (const p of await extractPluginsFromNodeModules(join(dshHome, 'profiles', profileName), profileName)) {
            if (!plugins.some((x) => x.name === p.name && x.profile === p.profile))
                plugins.push(p);
        }
    }
    // Record the exact installed version (and integrity) so machine 2 gets the same package,
    // not just the range. A name-only record (bundle / cordis entry) becomes installable from
    // the registry only when the real installed package told us its name + version here.
    const lockMeta = new Map();
    for (const plugin of plugins) {
        if (!plugin.profile || isSelfPlugin(plugin.name) || parseLocalSpec(plugin.version ?? plugin.source))
            continue;
        const profileDir = join(dshHome, 'profiles', plugin.profile);
        try {
            const pkgPath = join(profileDir, 'node_modules', ...plugin.name.split('/'), 'package.json');
            const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
            const v = pkg.version;
            if (typeof v !== 'string' || !v || (typeof pkg.name === 'string' && pkg.name !== plugin.name))
                continue;
            plugin.installedVersion = v;
            if (!lockMeta.has(plugin.profile))
                lockMeta.set(plugin.profile, await lockedPackages(profileDir));
            const locked = lockMeta.get(plugin.profile).get(`${plugin.name}@${v}`);
            const integrity = locked?.integrity ?? (typeof pkg._integrity === 'string' ? pkg._integrity : undefined);
            const resolved = locked?.tarball ?? (typeof pkg._resolved === 'string' ? pkg._resolved : undefined);
            if (integrity)
                plugin.integrity = integrity;
            if (resolved)
                plugin.resolved = resolved;
            if (plugin.recordedFrom === 'name-only' && !isRemoteNonRegistrySpec(plugin.version ?? '')) {
                plugin.recordedFrom = 'installed';
                plugin.version = v;
                plugin.source = `npm:${plugin.name}@${v}`;
            }
        }
        catch {
            // not installed on this machine (or a dsh built-in) — keep the manifest range
        }
    }
    // Bundle local plugin sources (link:/file:/portal: dirs, file: tarballs, workspace: specs)
    // so machine 2 can install them from the snapshot instead of machine 1's paths.
    const bundleLocal = options.bundleLocalPlugins !== false;
    const noCopy = new Set(options.pluginCopyExclude ?? []);
    const copyWanted = (p) => !noCopy.has('*') && !noCopy.has(`${p.profile ?? 'web'}:${p.name}`);
    const copyTotal = plugins.filter((p) => p.profile && !isBuiltinDshBundle(p.name) && !isSelfPlugin(p.name)).length;
    let copyN = 0;
    const copyTick = (plugin) => {
        copyN++;
        progress?.({ phase: 'copies', message: 'Packing plugin copies', current: Math.min(copyN, copyTotal), total: copyTotal, item: plugin.name });
    };
    if (bundleLocal && (wanted.has('plugins') || wanted.has('profiles') || wanted.has('plugin-config'))) {
        for (const plugin of plugins) {
            if (!plugin.profile || isSelfPlugin(plugin.name))
                continue;
            const spec = parseLocalSpec(plugin.version ?? plugin.source);
            if (!spec)
                continue;
            if (!copyWanted(plugin)) {
                if (spec.kind === 'path')
                    plugin.originalSource = `${spec.protocol}:${resolveLocalSpecPath(spec.path, join(dshHome, 'profiles', plugin.profile))}`;
                else
                    plugin.originalSource = spec.raw;
                continue;
            }
            const profileDir = join(dshHome, 'profiles', plugin.profile);
            const relPrefix = bundledSourceRel(plugin.profile, plugin.name);
            const before = files.length;
            if (spec.kind === 'path') {
                const abs = resolveLocalSpecPath(spec.path, profileDir);
                plugin.originalSource = `${spec.protocol}:${abs}`;
                if (spec.tarball) {
                    if (await isFile(abs)) {
                        const rel = `${relPrefix}/${basename(abs.replace(/\\/g, '/'))}`;
                        await maybeAddFile(abs, rel, 'plugins', true, files);
                        if (files.length > before) {
                            plugin.bundledSource = rel;
                            plugin.bundledKind = 'tarball';
                            plugin.source = `file:${rel}`;
                            continue;
                        }
                    }
                }
                else if (await isFile(join(abs, 'package.json'))) {
                    await walkFiles(abs, relPrefix, 'plugins', includeSecrets, files);
                    if (files.some((f, i) => i >= before && f.relPath === `${relPrefix}/package.json`)) {
                        plugin.bundledSource = relPrefix;
                        plugin.bundledKind = 'dir';
                        plugin.source = `link:${relPrefix}`;
                        continue;
                    }
                }
            }
            else {
                plugin.originalSource = spec.raw;
            }
            // The source is gone (tarball deleted, workspace spec, …): bundle the installed copy instead.
            const installed = await installedPackageDir(profileDir, plugin.name);
            if (installed) {
                files.length = before;
                await walkFiles(installed, relPrefix, 'plugins', includeSecrets, files);
                if (files.some((f, i) => i >= before && f.relPath === `${relPrefix}/package.json`)) {
                    plugin.bundledSource = relPrefix;
                    plugin.bundledKind = 'dir';
                    plugin.bundledFrom = 'installed';
                    plugin.source = `link:${relPrefix}`;
                }
            }
        }
    }
    // Registry / github plugins: pack the installed copy as a fallback when that exact version
    // is later unpublished (or git is unavailable). Nested node_modules are skipped by walkFiles.
    if (bundleLocal && (wanted.has('plugins') || wanted.has('profiles') || wanted.has('plugin-config'))) {
        const locks = new Map();
        for (const plugin of plugins) {
            if (!plugin.profile || isBuiltinDshBundle(plugin.name) || isSelfPlugin(plugin.name))
                continue;
            copyTick(plugin);
            // Local file:/link: already have a primary bundledSource (or will fail with a clear reason).
            if (plugin.bundledSource)
                continue;
            if (parseLocalSpec(plugin.version ?? plugin.source)?.kind === 'path')
                continue;
            if (parseLocalSpec(plugin.version ?? plugin.source)?.kind === 'unsupported')
                continue;
            const profileDir = join(dshHome, 'profiles', plugin.profile);
            if (isRemoteNonRegistrySpec(plugin.version ?? plugin.source)) {
                if (!locks.has(plugin.profile))
                    locks.set(plugin.profile, await lockedVersions(profileDir));
                const locked = locks.get(plugin.profile)[plugin.name];
                if (locked && /^https?:\/\//.test(locked))
                    plugin.lockedTarball = locked;
            }
            if (plugin.fallbackBundle || !copyWanted(plugin))
                continue;
            const installed = await installedPackageDir(profileDir, plugin.name);
            if (!installed)
                continue;
            const rel = bundledSourceRel(plugin.profile, plugin.name);
            const before = files.length;
            await walkFiles(installed, rel, 'plugins', false, files);
            if (!files.some((f, i) => i >= before && f.relPath === `${rel}/package.json`)) {
                files.length = before;
                continue;
            }
            plugin.fallbackBundle = rel;
            const meta = {
                name: plugin.name,
                version: plugin.installedVersion ?? plugin.version ?? null,
                originalSpec: plugin.source,
                bundledFrom: 'installed',
                note: 'Fallback copy for when the registry/git no longer has this exact version',
            };
            const data = Buffer.from(`${JSON.stringify(meta, null, 2)}\n`, 'utf8');
            const sha256 = createHash('sha256').update(data).digest('hex');
            files.push({
                absPath: join(installed, '.dsh-vault-bundle.json'),
                relPath: `${rel}/.dsh-vault-bundle.json`,
                category: 'plugins',
                secret: false,
                size: data.length,
                sha256,
                data,
            });
        }
    }
    // Deduplicate identical relative paths (keep first).
    const seen = new Set();
    const deduped = [];
    for (const f of files) {
        if (seen.has(f.relPath))
            continue;
        seen.add(f.relPath);
        deduped.push(f);
    }
    return { files: deduped, plugins, dshHome, agentsHome };
}
/** importers['.'].dependencies from a profile's pnpm-lock.yaml: name → resolved version/URL. */
async function lockedVersions(profileDir) {
    try {
        const lock = parseYaml(await readFile(join(profileDir, 'pnpm-lock.yaml'), 'utf8'));
        const deps = lock?.importers?.['.']?.dependencies ?? lock?.dependencies ?? {};
        const out = {};
        for (const [name, v] of Object.entries(deps)) {
            const version = typeof v === 'string' ? v : v?.version;
            if (typeof version === 'string')
                out[name] = version.replace(/\(.*$/, '');
        }
        return out;
    }
    catch {
        return {};
    }
}
/** `name@version` → integrity / tarball from a profile's pnpm-lock.yaml `packages` (v5–v9 keys). */
export async function lockedPackages(profileDir) {
    const out = new Map();
    try {
        const lock = parseYaml(await readFile(join(profileDir, 'pnpm-lock.yaml'), 'utf8'));
        for (const [rawKey, v] of Object.entries(lock?.packages ?? {})) {
            // v9: "name@1.2.3", v6: "/name@1.2.3(peer)", v5: "/name/1.2.3"
            let k = rawKey.replace(/^\//, '').replace(/\(.*$/, '');
            const at = k.lastIndexOf('@');
            if (at <= 0) {
                const slash = k.lastIndexOf('/');
                if (slash > 0)
                    k = `${k.slice(0, slash)}@${k.slice(slash + 1)}`;
            }
            const r = v?.resolution;
            if (r && (r.integrity || r.tarball))
                out.set(k, { integrity: r.integrity, tarball: r.tarball });
        }
    }
    catch {
        // no lockfile
    }
    return out;
}
async function isFile(p) {
    try {
        return (await stat(p)).isFile();
    }
    catch {
        return false;
    }
}
/** Top-level packages in a profile's node_modules that look like dsh plugins. */
export async function extractPluginsFromNodeModules(profileDir, profileName) {
    const nm = join(profileDir, 'node_modules');
    let entries;
    try {
        entries = await readdir(nm, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const names = [];
    for (const e of entries) {
        if (!e.isDirectory() && !e.isSymbolicLink())
            continue;
        if (e.name.startsWith('.'))
            continue;
        if (e.name.startsWith('@')) {
            let scoped;
            try {
                scoped = await readdir(join(nm, e.name), { withFileTypes: true });
            }
            catch {
                continue;
            }
            for (const s of scoped) {
                if (s.isDirectory() || s.isSymbolicLink())
                    names.push(`${e.name}/${s.name}`);
            }
        }
        else {
            names.push(e.name);
        }
    }
    const out = [];
    for (const name of names) {
        if (isBuiltinDshBundle(name))
            continue;
        try {
            const pkg = JSON.parse(await readFile(join(nm, ...name.split('/'), 'package.json'), 'utf8'));
            const keywords = pkg.keywords ?? [];
            const isPlugin = Boolean(pkg.dsh) ||
                keywords.includes('dsh-plugin') ||
                keywords.includes('dsh-plugins');
            if (!isPlugin)
                continue;
            out.push({
                name,
                version: typeof pkg.version === 'string' ? pkg.version : undefined,
                source: typeof pkg.version === 'string' ? `npm:${name}@${pkg.version}` : name,
                profile: profileName,
                installedVersion: typeof pkg.version === 'string' ? pkg.version : undefined,
                recordedFrom: typeof pkg.version === 'string' ? 'installed' : 'name-only',
            });
        }
        catch {
            // not a package
        }
    }
    return out;
}
/** Real directory of an installed package in a profile, if any. */
async function installedPackageDir(profileDir, name) {
    const dir = join(profileDir, 'node_modules', ...name.split('/'));
    try {
        const real = await realpath(dir);
        return (await isFile(join(real, 'package.json'))) ? real : null;
    }
    catch {
        return null;
    }
}
/** Category for a relative path (used by restore/diff). */
export function categoryForRelPath(rel) {
    const p = rel.replace(/\\/g, '/');
    if (isSecretRelPath(p) || isSecretPath(p))
        return 'credentials';
    if (p === 'settings.yaml' || p === 'settings.yaml.imported' || p === 'cordis.patch.yml')
        return 'settings';
    if (p.startsWith('storages/'))
        return 'plugin-config';
    if (p === 'mcp.json' || p.startsWith('mcp/'))
        return 'mcp';
    if (p.startsWith('skills/') || p.startsWith('agents-home/skills/'))
        return 'skills';
    if (p === 'AGENTS.md' || p === 'agents-home/AGENTS.md')
        return 'instructions';
    if (p.startsWith('.agent-presets/') || p.startsWith('agent-presets/'))
        return 'agent-presets';
    if (p.startsWith('profiles/'))
        return 'profiles';
    if (p.startsWith('plugin-sources/'))
        return 'plugins';
    if (isPluginDataRoot(p.split('/')[0]))
        return 'plugin-data';
    return 'plugin-config';
}
//# sourceMappingURL=collect.js.map