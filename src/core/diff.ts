import { isWorkspaceStatePath } from './home-scope.js'
import { normalizePlatformName, parseLocalSpec, platformsDiffer } from './local-spec.js'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import type { ConflictMap } from './conflict.js'
import { resolveItemConflict } from './conflict.js'
import { categoryForRelPath } from './collect.js'
import { joinRel } from './paths.js'
import type { ConflictStrategy, DiffItem, PluginRecord, RestorePreview, VaultManifest } from './types.js'

async function currentSha(abs: string): Promise<string | undefined> {
  try {
    const info = await stat(abs)
    if (!info.isFile()) return undefined
    const data = await readFile(abs)
    return createHash('sha256').update(data).digest('hex')
  } catch {
    return undefined
  }
}

/** Preview restore effects against the live dsh home. */
export async function previewRestoreDiff(input: {
  manifest: VaultManifest
  dshHome: string
  agentsHome: string
  /** Relative paths currently present that are in scope (optional; when omitted only backup paths are considered for remove). */
  currentScopedPaths?: string[]
  /** When set, each item is annotated with its resolved conflict strategy. */
  conflict?: ConflictStrategy
  /** Optional per-path overrides for `conflict`. */
  conflicts?: ConflictMap
  /** Platform recorded by the snapshot manifest. */
  sourcePlatform?: string
  /** Platform this restore is running on. */
  targetPlatform?: NodeJS.Platform
}): Promise<RestorePreview> {
  const items: DiffItem[] = []
  const backupPaths = new Set(input.manifest.files.map((f) => f.path))
  const annotate = input.conflict !== undefined

  for (const file of input.manifest.files) {
    // Older snapshots may carry the source machine's workspace registry: never restore it.
    if (isWorkspaceStatePath(file.path)) continue
    const abs = resolveLivePath(file.path, input.dshHome, input.agentsHome)
    const cur = await currentSha(abs)
    let change: DiffItem['change']
    if (!cur) change = 'add'
    else if (cur === file.sha256) change = 'unchanged'
    else change = 'change'
    const item: DiffItem = {
      path: file.path,
      category: file.category,
      change,
      currentSha256: cur,
      backupSha256: file.sha256,
    }
    if (annotate) {
      item.resolution = resolveItemConflict(file.path, input.conflict!, input.conflicts)
    }
    items.push(item)
  }

  for (const path of input.currentScopedPaths ?? []) {
    if (backupPaths.has(path)) continue
    const item: DiffItem = {
      path,
      category: categoryForRelPath(path),
      change: 'remove',
      currentSha256: await currentSha(resolveLivePath(path, input.dshHome, input.agentsHome)),
    }
    if (annotate) {
      item.resolution = resolveItemConflict(path, input.conflict!, input.conflicts)
    }
    items.push(item)
  }

  const added = items.filter((i) => i.change === 'add').length
  const changed = items.filter((i) => i.change === 'change').length
  const removed = items.filter((i) => i.change === 'remove').length
  const unchanged = items.filter((i) => i.change === 'unchanged').length

  // dsh's own shipped bundles (e.g. @deepseek-ai/dsh-base) are profile layers, not reinstallable plugins.
  const pluginsToReinstall = (await findMissingPlugins(input.manifest.plugins, input.dshHome)).filter((p) => !isBuiltinDshBundle(p.name))
  const manualActions: string[] = []
  const rawSourcePlatform = input.sourcePlatform ?? input.manifest.platform
  const sourcePlatform = normalizePlatformName(rawSourcePlatform) ?? rawSourcePlatform
  const targetPlatform = normalizePlatformName(input.targetPlatform ?? process.platform)!
  const crossPlatform = platformsDiffer(sourcePlatform, targetPlatform)
  if (crossPlatform) {
    manualActions.push('This snapshot was made on ' + sourcePlatform + '; this machine runs ' + targetPlatform + '. Local plugin paths from the snapshot cannot be opened here, and plugins without a saved copy will be listed as failed. Other plugins and configuration still restore.')
  }
  if (!input.manifest.includeSecrets) {
    manualActions.push('Re-enter API keys and other secrets in Settings → Models (credentials were excluded from this snapshot).')
  }
  // Bundled link: sources are restored from the snapshot and re-linked automatically.
  if (pluginsToReinstall.some((p) => {
    if (p.bundledSource) return false
    const local = parseLocalSpec(p.source) ?? parseLocalSpec(p.version)
    return local?.kind === 'path'
  })) {
    manualActions.push('Some plugins used local link:/file: sources; reinstall or re-link them on this machine.')
  }

  return {
    snapshotId: input.manifest.id,
    ...(sourcePlatform ? { sourcePlatform } : {}),
    targetPlatform,
    crossPlatform,
    items,
    added,
    changed,
    removed,
    unchanged,
    pluginsToReinstall,
    manualActions,
    ...(annotate
      ? {
          conflict: input.conflict,
          ...(input.conflicts ? { conflicts: input.conflicts } : {}),
        }
      : {}),
  }
}

export function resolveLivePath(rel: string, dshHome: string, agentsHome: string): string {
  if (rel.startsWith('agents-home/')) {
    return joinRel(agentsHome, rel.slice('agents-home/'.length))
  }
  return joinRel(dshHome, rel)
}

async function findMissingPlugins(plugins: PluginRecord[], dshHome: string): Promise<PluginRecord[]> {
  const missing: PluginRecord[] = []
  for (const plugin of plugins) {
    const profile = plugin.profile ?? 'web'
    const pkgPath = joinRel(dshHome, `profiles/${profile}/node_modules/${plugin.name}/package.json`)
    try {
      await stat(pkgPath)
    } catch {
      missing.push(plugin)
    }
  }
  return missing
}

/** dsh ships its own bundles under the @deepseek-ai/dsh-* scope; they are never reinstalled. */
export function isBuiltinDshBundle(name: string): boolean {
  return name.startsWith('@deepseek-ai/dsh-') || name === '@deepseek-ai/dsh'
}
