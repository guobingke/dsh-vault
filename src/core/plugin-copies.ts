/**
 * Plugin copies ("保存插件副本"): which plugins get a copy of their installed package
 * packed into the snapshot, and whether each one's exact version is still on the registry.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  extractPluginsFromNodeModules,
  extractPluginsFromPatchYaml,
  extractPluginsFromProfilePackage,
} from './collect.js'
import { isRemoteNonRegistrySpec, parseLocalSpec } from './local-spec.js'
import type { PluginRecord } from './types.js'

export type PluginSourceKind = 'npm' | 'github' | 'local'
export type RegistryStatus = 'present' | 'missing' | 'unknown' | 'not-applicable'

export interface DetectedPlugin {
  /** `profile:name` — the key used by `pluginCopies.exclude`. */
  key: string
  name: string
  profile: string
  kind: PluginSourceKind
  /** Version installed in the profile's node_modules (or the manifest range). */
  version?: string
  /** True when found only via cordis.patch.yml / node_modules (not package.json dependencies). */
  cordisOnly: boolean
  installed: boolean
  registry: RegistryStatus
  /** Local plugin or exact version missing from the registry: a copy is strongly advised. */
  recommended: boolean
}

export function pluginKey(profile: string | undefined, name: string): string {
  return `${profile ?? 'web'}:${name}`
}

export function isBuiltinDshBundle(name: string): boolean {
  return name.startsWith('@deepseek-ai/dsh-') || name === '@deepseek-ai/dsh'
}

export function pluginSourceKind(p: Pick<PluginRecord, 'source' | 'version' | 'originalSource'>): PluginSourceKind {
  const spec = p.originalSource ?? p.version ?? p.source
  if (parseLocalSpec(spec) || parseLocalSpec(p.source)) return 'local'
  if (isRemoteNonRegistrySpec(spec) || p.source.startsWith('git') || p.source.includes('github.com')) return 'github'
  return 'npm'
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** Every plugin in every profile: package.json deps, cordis.patch.yml inserts, node_modules plugins. */
export async function detectProfilePlugins(dshHome: string): Promise<Array<PluginRecord & { cordisOnly: boolean; installed: boolean }>> {
  const profilesDir = join(dshHome, 'profiles')
  let profiles: string[] = []
  try {
    profiles = (await readdir(profilesDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
  const out: Array<PluginRecord & { cordisOnly: boolean; installed: boolean }> = []
  for (const profile of profiles) {
    const dir = join(profilesDir, profile)
    const recs: Array<PluginRecord & { cordisOnly: boolean }> = []
    const pkgText = await readText(join(dir, 'package.json'))
    let depNames = new Set<string>()
    if (pkgText) {
      try {
        depNames = new Set(Object.keys((JSON.parse(pkgText) as { dependencies?: Record<string, string> }).dependencies ?? {}))
      } catch { /* malformed */ }
      for (const p of extractPluginsFromProfilePackage(pkgText, profile)) recs.push({ ...p, cordisOnly: !depNames.has(p.name) })
    }
    const patch = await readText(join(dir, 'cordis.patch.yml'))
    if (patch) {
      for (const p of extractPluginsFromPatchYaml(patch, profile)) {
        if (!recs.some((x) => x.name === p.name)) recs.push({ ...p, cordisOnly: true })
      }
    }
    for (const p of await extractPluginsFromNodeModules(dir, profile)) {
      if (!recs.some((x) => x.name === p.name)) recs.push({ ...p, cordisOnly: true })
    }
    for (const r of recs) {
      if (isBuiltinDshBundle(r.name)) continue
      let installed = false
      try {
        const v = (JSON.parse(await readFile(join(dir, 'node_modules', ...r.name.split('/'), 'package.json'), 'utf8')) as { version?: unknown }).version
        installed = true
        if (typeof v === 'string' && v && !parseLocalSpec(r.version ?? r.source)) r.installedVersion = v
      } catch { /* not installed */ }
      out.push({ ...r, installed })
    }
  }
  return out
}

export type RegistryLookup = (name: string, version: string) => Promise<RegistryStatus>

function singleRegistryLookup(registry: string, timeoutMs: number): RegistryLookup {
  const base = registry.replace(/\/+$/, '')
  return async (name, version) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const url = `${base}/${name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name)}`
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/vnd.npm.install-v1+json' } })
      if (res.status === 404) return 'missing'
      if (!res.ok) return 'unknown'
      const doc = (await res.json()) as { versions?: Record<string, unknown> }
      return doc.versions && version in doc.versions ? 'present' : 'missing'
    } catch {
      return 'unknown'
    } finally {
      clearTimeout(t)
    }
  }
}

/**
 * Ask the registries (preferred, npmmirror, npmjs — in parallel) whether `name@version`
 * exists. `present` if any has it, `missing` if one answered and none has it, else
 * `unknown` (offline / timeout). Never throws.
 */
export function npmRegistryLookup(preferred?: string | null, timeoutMs = 4000): RegistryLookup {
  const urls = [...new Set([preferred, 'https://registry.npmmirror.com', 'https://registry.npmjs.org'].filter((u): u is string => Boolean(u)).map((u) => u.replace(/\/+$/, '')))]
  const lookups = urls.map((u) => singleRegistryLookup(u, timeoutMs))
  return async (name, version) => {
    const all = await Promise.all(lookups.map((l) => l(name, version)))
    if (all.includes('present')) return 'present'
    if (all.includes('missing')) return 'missing'
    return 'unknown'
  }
}

/** Registry status per plugin key, bounded by `overallMs` so backup / the UI never hang. */
export async function registryStatuses(
  plugins: Array<Pick<PluginRecord, 'name' | 'profile' | 'source' | 'version' | 'installedVersion' | 'originalSource'>>,
  lookup: RegistryLookup,
  overallMs = 6000,
): Promise<Map<string, RegistryStatus>> {
  const out = new Map<string, RegistryStatus>()
  const jobs: Array<Promise<void>> = []
  for (const p of plugins) {
    const key = pluginKey(p.profile, p.name)
    if (pluginSourceKind(p) !== 'npm') {
      out.set(key, 'not-applicable')
      continue
    }
    const v = p.installedVersion ?? (p.version && /^\d/.test(p.version) ? p.version : undefined)
    out.set(key, 'unknown')
    if (!v) continue
    jobs.push(lookup(p.name, v).then((s) => { out.set(key, s) }, () => {}))
  }
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, overallMs).unref?.())])
  return new Map(out)
}

export async function listDetectedPlugins(dshHome: string, lookup?: RegistryLookup): Promise<DetectedPlugin[]> {
  const recs = await detectProfilePlugins(dshHome)
  const reg = lookup ? await registryStatuses(recs, lookup) : new Map<string, RegistryStatus>()
  return recs.map((r) => {
    const key = pluginKey(r.profile, r.name)
    const kind = pluginSourceKind(r)
    const registry = kind === 'npm' ? reg.get(key) ?? 'unknown' : 'not-applicable'
    return {
      key,
      name: r.name,
      profile: r.profile ?? 'web',
      kind,
      version: r.installedVersion ?? r.version,
      cordisOnly: r.cordisOnly,
      installed: r.installed,
      registry,
      recommended: kind === 'local' || registry === 'missing',
    }
  })
}
