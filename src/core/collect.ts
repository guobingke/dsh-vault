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
import { parseLocalSpec, resolveLocalSpecPath } from './local-spec.js'
import type { BackupCategory, CollectedFile, CollectOptions, PluginRecord } from './types.js'

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
      if (shouldSkipDir(entry.name)) continue
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
  const secret = isSecretRelPath(relPath)
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
    out.push({ name, version, source: local || version.startsWith('git') ? version : `npm:${name}@${version}`, profile: profileName })
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
      ...(includeSecrets ? (['credentials'] as BackupCategory[]) : []),
    ],
  )
  const files: CollectedFile[] = []
  const plugins: PluginRecord[] = []

  if (wanted.has('settings') || wanted.has('providers')) {
    await maybeAddFile(join(dshHome, 'settings.yaml'), 'settings.yaml', 'settings', includeSecrets, files)
    // Home-wide patch layer: dsh-app-boot applies $DSH_HOME/cordis.patch.yml to every profile.
    await maybeAddFile(join(dshHome, 'cordis.patch.yml'), 'cordis.patch.yml', 'settings', includeSecrets, files)
  }
  if (wanted.has('plugin-config')) {
    // Plugin data written through dsh's storage root ($DSH_HOME/storages/<domain>/…),
    // e.g. dsh-cost-meter's ledger. Caches are skipped by shouldSkipDir.
    await walkFiles(join(dshHome, 'storages'), 'storages', 'plugin-config', includeSecrets, files)
  }
  if (wanted.has('credentials') && includeSecrets) {
    await maybeAddFile(join(dshHome, '.credentials.yaml'), '.credentials.yaml', 'credentials', true, files)
  }
  if (wanted.has('profiles') || wanted.has('plugins') || wanted.has('plugin-config') || wanted.has('mcp') || wanted.has('providers')) {
    await walkFiles(join(dshHome, 'profiles'), 'profiles', 'profiles', includeSecrets, files)
  }
  if (wanted.has('agent-presets')) {
    await walkFiles(join(dshHome, '.agent-presets'), '.agent-presets', 'agent-presets', includeSecrets, files)
    await walkFiles(join(dshHome, 'agent-presets'), 'agent-presets', 'agent-presets', includeSecrets, files)
  }
  if (wanted.has('skills')) {
    await walkFiles(join(dshHome, 'skills'), 'skills', 'skills', includeSecrets, files)
    await walkFiles(join(agentsHome, 'skills'), 'agents-home/skills', 'skills', includeSecrets, files)
  }
  if (wanted.has('instructions')) {
    await maybeAddFile(join(dshHome, 'AGENTS.md'), 'AGENTS.md', 'instructions', includeSecrets, files)
    await maybeAddFile(join(agentsHome, 'AGENTS.md'), 'agents-home/AGENTS.md', 'instructions', includeSecrets, files)
  }
  if (wanted.has('mcp')) {
    await maybeAddFile(join(dshHome, 'mcp.json'), 'mcp.json', 'mcp', includeSecrets, files)
    await walkFiles(join(dshHome, 'mcp'), 'mcp', 'mcp', includeSecrets, files)
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
  if (bundleLocal && (wanted.has('plugins') || wanted.has('profiles') || wanted.has('plugin-config'))) {
    for (const plugin of plugins) {
      if (!plugin.profile) continue
      const spec = parseLocalSpec(plugin.version ?? plugin.source)
      if (!spec) continue
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

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
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
  if (isSecretRelPath(p)) return 'credentials'
  if (p === 'settings.yaml' || p === 'cordis.patch.yml') return 'settings'
  if (p.startsWith('storages/')) return 'plugin-config'
  if (p === 'mcp.json' || p.startsWith('mcp/')) return 'mcp'
  if (p.startsWith('skills/') || p.startsWith('agents-home/skills/')) return 'skills'
  if (p === 'AGENTS.md' || p === 'agents-home/AGENTS.md') return 'instructions'
  if (p.startsWith('.agent-presets/') || p.startsWith('agent-presets/')) return 'agent-presets'
  if (p.startsWith('profiles/')) return 'profiles'
  return 'plugin-config'
}
