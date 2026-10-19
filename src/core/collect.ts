import { createHash } from 'node:crypto'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  isSecretRelPath,
  resolveAgentsHome,
  resolveDshHome,
  shouldSkipDir,
  toSafeRelPath,
} from './paths.js'
import { bundledSourceRel } from './plugin-install.js'
import { isRemoteNonRegistrySpec, parseLocalSpec, resolveLocalSpecPath } from './local-spec.js'
import { homeExcludeReason, isPluginDataRoot, isSecretPath, walkHome } from './home-scope.js'
import type { BackupCategory, CollectedFile, CollectOptions, PluginRecord } from './types.js'

function isBuiltinDshBundle(name: string): boolean {
  return name.startsWith('@deepseek-ai/dsh-') || name === '@deepseek-ai/dsh'
}

async function fileShaAndData(abs: string): Promise<{ size: number; sha256: string; data: Buffer }> {
  const data = await readFile(abs)
  const sha256 = createHash('sha256').update(data).digest('hex')
  return { size: data.length, sha256, data }
}

async function walkFiles(
  absDir: string,
  relPrefix: string,
  category: BackupCategory,
  includeSecrets: boolean,
  out: CollectedFile[],
): Promise<void> {
  let entries
  try {
    entries = await readdir(absDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name) || homeExcludeReason(entry.name, true) === 'cache') continue
      const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      await walkFiles(join(absDir, entry.name), nextRel, category, includeSecrets, out)
      continue
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) continue
    const rel = toSafeRelPath(relPrefix ? `${relPrefix}/${entry.name}` : entry.name)
    const secret = isSecretRelPath(rel)
    if (secret && !includeSecrets) continue
    const absPath = join(absDir, entry.name)
    try {
      const info = await stat(absPath)
      if (!info.isFile()) continue
      const { size, sha256, data } = await fileShaAndData(absPath)
      out.push({ absPath, relPath: rel, category, secret, size, sha256, data })
    } catch {
      // skip unreadable
    }
  }
}

async function maybeAddFile(
  absPath: string,
  relPath: string,
  category: BackupCategory,
  includeSecrets: boolean,
  out: CollectedFile[],
): Promise<void> {
  const secret = isSecretRelPath(relPath) || isSecretPath(relPath)
  if (secret && !includeSecrets) return
  try {
    const info = await stat(absPath)
    if (!info.isFile()) return
    const { size, sha256, data } = await fileShaAndData(absPath)
    out.push({ absPath, relPath: toSafeRelPath(relPath), category, secret, size, sha256, data })
  } catch {
    // missing is fine
  }
}

/** Extract plugin install records from a profile package.json / cordis patch. */
export function extractPluginsFromProfilePackage(
  packageJsonText: string,
  profileName: string,
): PluginRecord[] {
  let pkg: {
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: Array<string | { name?: string; version?: string }> } }
  }
  try {
    pkg = JSON.parse(packageJsonText) as typeof pkg
  } catch {
    return []
  }
  const out: PluginRecord[] = []
  const deps = pkg.dependencies ?? {}
  for (const [name, version] of Object.entries(deps)) {
    const local = parseLocalSpec(version) !== null
    out.push({ name, version, source: local || version.startsWith('git') || isRemoteNonRegistrySpec(version) ? version : `npm:${name}@${version}`, profile: profileName })
  }
  const bundles = pkg.dsh?.profile?.bundles ?? []
  for (const b of bundles) {
    if (typeof b === 'string') {
      if (!out.some((p) => p.name === b)) out.push({ name: b, source: b, profile: profileName })
    } else if (b?.name) {
      if (!out.some((p) => p.name === b.name)) {
        out.push({ name: b.name, version: b.version, source: b.name, profile: profileName })
      }
    }
  }
  return out
}

export function extractPluginsFromPatchYaml(patchText: string, profileName: string): PluginRecord[] {
  const out: PluginRecord[] = []
  try {
    const docs = parseYaml(patchText)
    const rows = Array.isArray(docs) ? docs : [docs]
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const insert = (row as { insert?: unknown }).insert
      if (!Array.isArray(insert)) continue
      for (const item of insert) {
        if (!item || typeof item !== 'object') continue
        const name = (item as { name?: string }).name
        if (typeof name === 'string' && name && !name.endsWith('.ts') && !name.startsWith('/')) {
          out.push({ name, source: name, profile: profileName })
        }
      }
    }
  } catch {
    // ignore malformed patch
  }
  return out
}

/** Collect all backup-scoped files from a dsh home. */
export async function collectBackupFiles(options: CollectOptions): Promise<{
  files: CollectedFile[]
  plugins: PluginRecord[]
  dshHome: string
  agentsHome: string
}> {
  const dshHome = options.dshHome || resolveDshHome()
  const agentsHome = options.agentsHome || resolveAgentsHome()
  const includeSecrets = Boolean(options.includeSecrets)
  const wanted = new Set<BackupCategory>(
    options.categories ?? [
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
      ...(includeSecrets ? (['credentials'] as BackupCategory[]) : []),
    ],
  )
  const files: CollectedFile[] = []
  const plugins: PluginRecord[] = []

  // Profiles carry the plugin inventory, so any plugin-related category pulls them in.
  const wants = (cat: BackupCategory): boolean => {
    if (cat === 'profiles') return ['profiles', 'plugins', 'plugin-config', 'mcp', 'providers'].some((c) => wanted.has(c as BackupCategory))
    if (cat === 'settings') return wanted.has('settings') || wanted.has('providers')
    if (cat === 'credentials') return includeSecrets && wanted.has('credentials')
    return wanted.has(cat)
  }

  // Everything under $DSH_HOME except the denylist (home-scope.ts).
  const progress = options.onProgress
  const homeFiles = await walkHome(dshHome, { includeSecrets })
  progress?.({ phase: 'collect', message: 'Collecting files', current: 0, total: homeFiles.length })
  let n = 0
  for (const f of homeFiles) {
    n++
    const category = categoryForRelPath(f.rel)
    if (wants(category)) await maybeAddFile(f.abs, f.rel, category, includeSecrets, files)
    if (progress && (n % 25 === 0 || n === homeFiles.length)) {
      progress({ phase: 'collect', message: 'Collecting files', current: n, total: homeFiles.length, item: f.rel })
    }
  }
  if (wanted.has('skills')) {
    await walkFiles(join(agentsHome, 'skills'), 'agents-home/skills', 'skills', includeSecrets, files)
  }
  if (wanted.has('instructions')) {
    await maybeAddFile(join(agentsHome, 'AGENTS.md'), 'agents-home/AGENTS.md', 'instructions', includeSecrets, files)
  }

  for (const extra of options.extraRoots ?? []) {
    await walkFiles(extra.abs, extra.relPrefix, extra.category, includeSecrets, files)
  }

  // Derive plugin inventory from collected profile manifests.
  for (const f of files) {
    if (f.relPath.match(/^profiles\/[^/]+\/package\.json$/)) {
      const profileName = f.relPath.split('/')[1]!
      plugins.push(...extractPluginsFromProfilePackage(f.data.toString('utf8'), profileName))
    }
    if (f.relPath.match(/^profiles\/[^/]+\/cordis\.patch\.yml$/)) {
      const profileName = f.relPath.split('/')[1]!
      for (const p of extractPluginsFromPatchYaml(f.data.toString('utf8'), profileName)) {
        if (!plugins.some((x) => x.name === p.name && x.profile === p.profile)) plugins.push(p)
      }
    }
  }

  // Also pick up plugins that are installed / referenced only in cordis (e.g. dsh-vscode-bridge
  // in cordis.patch.yml but not in package.json dependencies).
  const profileNames = new Set<string>()
  for (const f of files) {
    const m = f.relPath.match(/^profiles\/([^/]+)\//)
    if (m) profileNames.add(m[1]!)
  }
  for (const profileName of profileNames) {
    for (const p of await extractPluginsFromNodeModules(join(dshHome, 'profiles', profileName), profileName)) {
      if (!plugins.some((x) => x.name === p.name && x.profile === p.profile)) plugins.push(p)
    }
  }

  // Record the exact installed version so machine 2 gets the same one, not just the range.
  for (const plugin of plugins) {
    if (!plugin.profile || parseLocalSpec(plugin.version ?? plugin.source)) continue
    try {
      const pkgPath = join(dshHome, 'profiles', plugin.profile, 'node_modules', ...plugin.name.split('/'), 'package.json')
      const v = (JSON.parse(await readFile(pkgPath, 'utf8')) as { version?: unknown }).version
      if (typeof v === 'string' && v) plugin.installedVersion = v
    } catch {
      // not installed on this machine (or a dsh built-in) — keep the manifest range
    }
  }

  // Bundle local plugin sources (link:/file:/portal: dirs, file: tarballs, workspace: specs)
  // so machine 2 can install them from the snapshot instead of machine 1's paths.
  const bundleLocal = options.bundleLocalPlugins !== false
  const noCopy = new Set(options.pluginCopyExclude ?? [])
  const copyWanted = (p: PluginRecord) => !noCopy.has('*') && !noCopy.has(`${p.profile ?? 'web'}:${p.name}`)
  const copyTotal = plugins.filter((p) => p.profile && !isBuiltinDshBundle(p.name)).length
  let copyN = 0
  const copyTick = (plugin: PluginRecord) => {
    copyN++
    progress?.({ phase: 'copies', message: 'Packing plugin copies', current: Math.min(copyN, copyTotal), total: copyTotal, item: plugin.name })
  }
  if (bundleLocal && (wanted.has('plugins') || wanted.has('profiles') || wanted.has('plugin-config'))) {
    for (const plugin of plugins) {
      if (!plugin.profile) continue
      const spec = parseLocalSpec(plugin.version ?? plugin.source)
      if (!spec) continue
      if (!copyWanted(plugin)) {
        if (spec.kind === 'path') plugin.originalSource = `${spec.protocol}:${resolveLocalSpecPath(spec.path, join(dshHome, 'profiles', plugin.profile))}`
        else plugin.originalSource = spec.raw
        continue
      }
      const profileDir = join(dshHome, 'profiles', plugin.profile)
      const relPrefix = bundledSourceRel(plugin.profile, plugin.name)
      const before = files.length
      if (spec.kind === 'path') {
        const abs = resolveLocalSpecPath(spec.path, profileDir)
        plugin.originalSource = `${spec.protocol}:${abs}`
        if (spec.tarball) {
          if (await isFile(abs)) {
            const rel = `${relPrefix}/${basename(abs.replace(/\\/g, '/'))}`
            await maybeAddFile(abs, rel, 'plugins', true, files)
            if (files.length > before) {
              plugin.bundledSource = rel
              plugin.bundledKind = 'tarball'
              plugin.source = `file:${rel}`
              continue
            }
          }
        } else if (await isFile(join(abs, 'package.json'))) {
          await walkFiles(abs, relPrefix, 'plugins', includeSecrets, files)
          if (files.some((f, i) => i >= before && f.relPath === `${relPrefix}/package.json`)) {
            plugin.bundledSource = relPrefix
            plugin.bundledKind = 'dir'
            plugin.source = `link:${relPrefix}`
            continue
          }
        }
      } else {
        plugin.originalSource = spec.raw
      }
      // The source is gone (tarball deleted, workspace spec, …): bundle the installed copy instead.
      const installed = await installedPackageDir(profileDir, plugin.name)
      if (installed) {
        files.length = before
        await walkFiles(installed, relPrefix, 'plugins', includeSecrets, files)
        if (files.some((f, i) => i >= before && f.relPath === `${relPrefix}/package.json`)) {
          plugin.bundledSource = relPrefix
          plugin.bundledKind = 'dir'
          plugin.bundledFrom = 'installed'
          plugin.source = `link:${relPrefix}`
        }
      }
    }
  }

  // Registry / github plugins: pack the installed copy as a fallback when that exact version
  // is later unpublished (or git is unavailable). Nested node_modules are skipped by walkFiles.
  if (bundleLocal && (wanted.has('plugins') || wanted.has('profiles') || wanted.has('plugin-config'))) {
    const locks = new Map<string, Record<string, string>>()
    for (const plugin of plugins) {
      if (!plugin.profile || isBuiltinDshBundle(plugin.name)) continue
      copyTick(plugin)
      // Local file:/link: already have a primary bundledSource (or will fail with a clear reason).
      if (plugin.bundledSource) continue
      if (parseLocalSpec(plugin.version ?? plugin.source)?.kind === 'path') continue
      if (parseLocalSpec(plugin.version ?? plugin.source)?.kind === 'unsupported') continue

      const profileDir = join(dshHome, 'profiles', plugin.profile)
      if (isRemoteNonRegistrySpec(plugin.version ?? plugin.source)) {
        if (!locks.has(plugin.profile)) locks.set(plugin.profile, await lockedVersions(profileDir))
        const locked = locks.get(plugin.profile)![plugin.name]
        if (locked && /^https?:\/\//.test(locked)) plugin.lockedTarball = locked
      }
      if (plugin.fallbackBundle || !copyWanted(plugin)) continue
      const installed = await installedPackageDir(profileDir, plugin.name)
      if (!installed) continue
      const rel = bundledSourceRel(plugin.profile, plugin.name)
      const before = files.length
      await walkFiles(installed, rel, 'plugins', false, files)
      if (!files.some((f, i) => i >= before && f.relPath === `${rel}/package.json`)) {
        files.length = before
        continue
      }
      plugin.fallbackBundle = rel
      const meta = {
        name: plugin.name,
        version: plugin.installedVersion ?? plugin.version ?? null,
        originalSpec: plugin.source,
        bundledFrom: 'installed' as const,
        note: 'Fallback copy for when the registry/git no longer has this exact version',
      }
      const data = Buffer.from(`${JSON.stringify(meta, null, 2)}\n`, 'utf8')
      const sha256 = createHash('sha256').update(data).digest('hex')
      files.push({
        absPath: join(installed, '.dsh-vault-bundle.json'),
        relPath: `${rel}/.dsh-vault-bundle.json`,
        category: 'plugins',
        secret: false,
        size: data.length,
        sha256,
        data,
      })
    }
  }

  // Deduplicate identical relative paths (keep first).
  const seen = new Set<string>()
  const deduped: CollectedFile[] = []
  for (const f of files) {
    if (seen.has(f.relPath)) continue
    seen.add(f.relPath)
    deduped.push(f)
  }

  return { files: deduped, plugins, dshHome, agentsHome }
}

/** importers['.'].dependencies from a profile's pnpm-lock.yaml: name → resolved version/URL. */
async function lockedVersions(profileDir: string): Promise<Record<string, string>> {
  try {
    const lock = parseYaml(await readFile(join(profileDir, 'pnpm-lock.yaml'), 'utf8')) as {
      importers?: Record<string, { dependencies?: Record<string, { version?: string } | string> }>
      dependencies?: Record<string, { version?: string } | string>
    }
    const deps = lock?.importers?.['.']?.dependencies ?? lock?.dependencies ?? {}
    const out: Record<string, string> = {}
    for (const [name, v] of Object.entries(deps)) {
      const version = typeof v === 'string' ? v : v?.version
      if (typeof version === 'string') out[name] = version.replace(/\(.*$/, '')
    }
    return out
  } catch {
    return {}
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}


/** Top-level packages in a profile's node_modules that look like dsh plugins. */
export async function extractPluginsFromNodeModules(
  profileDir: string,
  profileName: string,
): Promise<PluginRecord[]> {
  const nm = join(profileDir, 'node_modules')
  let entries
  try {
    entries = await readdir(nm, { withFileTypes: true })
  } catch {
    return []
  }
  const names: string[] = []
  for (const e of entries) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue
    if (e.name.startsWith('.')) continue
    if (e.name.startsWith('@')) {
      let scoped
      try {
        scoped = await readdir(join(nm, e.name), { withFileTypes: true })
      } catch {
        continue
      }
      for (const s of scoped) {
        if (s.isDirectory() || s.isSymbolicLink()) names.push(`${e.name}/${s.name}`)
      }
    } else {
      names.push(e.name)
    }
  }
  const out: PluginRecord[] = []
  for (const name of names) {
    if (isBuiltinDshBundle(name)) continue
    try {
      const pkg = JSON.parse(await readFile(join(nm, ...name.split('/'), 'package.json'), 'utf8')) as {
        name?: string
        version?: string
        keywords?: string[]
        dsh?: unknown
      }
      const keywords = pkg.keywords ?? []
      const isPlugin =
        Boolean(pkg.dsh) ||
        keywords.includes('dsh-plugin') ||
        keywords.includes('dsh-plugins')
      if (!isPlugin) continue
      out.push({
        name,
        version: typeof pkg.version === 'string' ? pkg.version : undefined,
        source: typeof pkg.version === 'string' ? `npm:${name}@${pkg.version}` : name,
        profile: profileName,
        installedVersion: typeof pkg.version === 'string' ? pkg.version : undefined,
      })
    } catch {
      // not a package
    }
  }
  return out
}

/** Real directory of an installed package in a profile, if any. */
async function installedPackageDir(profileDir: string, name: string): Promise<string | null> {
  const dir = join(profileDir, 'node_modules', ...name.split('/'))
  try {
    const real = await realpath(dir)
    return (await isFile(join(real, 'package.json'))) ? real : null
  } catch {
    return null
  }
}

/** Category for a relative path (used by restore/diff). */
export function categoryForRelPath(rel: string): BackupCategory {
  const p = rel.replace(/\\/g, '/')
  if (isSecretRelPath(p) || isSecretPath(p)) return 'credentials'
  if (p === 'settings.yaml' || p === 'settings.yaml.imported' || p === 'cordis.patch.yml') return 'settings'
  if (p.startsWith('storages/')) return 'plugin-config'
  if (p === 'mcp.json' || p.startsWith('mcp/')) return 'mcp'
  if (p.startsWith('skills/') || p.startsWith('agents-home/skills/')) return 'skills'
  if (p === 'AGENTS.md' || p === 'agents-home/AGENTS.md') return 'instructions'
  if (p.startsWith('.agent-presets/') || p.startsWith('agent-presets/')) return 'agent-presets'
  if (p.startsWith('profiles/')) return 'profiles'
  if (p.startsWith('plugin-sources/')) return 'plugins'
  if (isPluginDataRoot(p.split('/')[0]!)) return 'plugin-data'
  return 'plugin-config'
}
