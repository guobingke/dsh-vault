import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { categoryForRelPath } from './collect.js'
import { joinRel } from './paths.js'
import type { DiffItem, PluginRecord, RestorePreview, VaultManifest } from './types.js'

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
}): Promise<RestorePreview> {
  const items: DiffItem[] = []
  const backupPaths = new Set(input.manifest.files.map((f) => f.path))

  for (const file of input.manifest.files) {
    const abs = resolveLivePath(file.path, input.dshHome, input.agentsHome)
    const cur = await currentSha(abs)
    let change: DiffItem['change']
    if (!cur) change = 'add'
    else if (cur === file.sha256) change = 'unchanged'
    else change = 'change'
    items.push({
      path: file.path,
      category: file.category,
      change,
      currentSha256: cur,
      backupSha256: file.sha256,
    })
  }

  for (const path of input.currentScopedPaths ?? []) {
    if (backupPaths.has(path)) continue
    items.push({
      path,
      category: categoryForRelPath(path),
      change: 'remove',
      currentSha256: await currentSha(resolveLivePath(path, input.dshHome, input.agentsHome)),
    })
  }

  const added = items.filter((i) => i.change === 'add').length
  const changed = items.filter((i) => i.change === 'change').length
  const removed = items.filter((i) => i.change === 'remove').length
  const unchanged = items.filter((i) => i.change === 'unchanged').length

  const pluginsToReinstall = await findMissingPlugins(input.manifest.plugins, input.dshHome)
  const manualActions: string[] = []
  if (!input.manifest.includeSecrets) {
    manualActions.push('Re-enter API keys and other secrets in Settings → Models (credentials were excluded from this snapshot).')
  }
  if (pluginsToReinstall.some((p) => p.source.startsWith('link:') || p.source.startsWith('file:'))) {
    manualActions.push('Some plugins used local link:/file: sources; reinstall or re-link them on this machine.')
  }

  return {
    snapshotId: input.manifest.id,
    items,
    added,
    changed,
    removed,
    unchanged,
    pluginsToReinstall,
    manualActions,
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
