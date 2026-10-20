import { isWorkspaceStatePath } from './home-scope.js'
import { unlink } from 'node:fs/promises'
import type { ConflictMap } from './conflict.js'
import { resolveItemConflict, shouldApplyChange } from './conflict.js'
import { previewRestoreDiff, resolveLivePath } from './diff.js'
import { VaultUserError } from './errors.js'
import { isSecretRelPath } from './paths.js'
import { dropForeignLocalDeps } from './plugin-install.js'
import { isWithin } from './path-policy.js'
import { checkTarget, WriteJournal } from './safe-fs.js'
import type {
  ConflictStrategy,
  ProgressCallback,
  RestorePreview,
  RestoreResult,
  VaultManifest,
} from './types.js'

/** One shared rule (H-02/M-06/M-07): a path is a credential if the manifest OR the classifier says so. */
export function isSecretEntry(manifest: VaultManifest, path: string): boolean {
  return isSecretRelPath(path) || Boolean(manifest.files.find((f) => f.path === path)?.secret)
}

/**
 * Apply a snapshot to the live homes, all-or-nothing (H-03):
 *  1. plan every write (and, for private rollbacks, every delete),
 *  2. pre-check every target for links / junctions / type conflicts before touching anything (H-01),
 *  3. write through an undo journal; on any failure every change is reverted and the
 *     error says so.
 */
export async function applyRestore(input: {
  manifest: VaultManifest
  files: Map<string, Buffer>
  dshHome: string
  agentsHome: string
  conflict: ConflictStrategy
  /** Optional per-path overrides; unspecified paths use `conflict`. */
  conflicts?: ConflictMap
  /**
   * Whether credential files may be written. The caller decides (request AND manifest AND
   * really-encrypted); the manifest's own flag is never consulted here.
   */
  allowSecrets?: boolean
  /** Snapshot-relative paths to delete (only from a private rollback's `rollbackRemoves`; M-01). */
  removePaths?: string[]
  rollbackSnapshotId?: string
  /** Platform recorded by the snapshot. */
  sourcePlatform?: string
  /** Platform this restore is running on. */
  targetPlatform?: NodeJS.Platform
  /** Caller-owned journal, so a later phase (plugin install) can still undo the files. */
  journal?: WriteJournal
  onProgress?: ProgressCallback
}): Promise<RestoreResult> {
  const preview = await previewRestoreDiff({
    manifest: input.manifest,
    dshHome: input.dshHome,
    agentsHome: input.agentsHome,
    conflict: input.conflict,
    conflicts: input.conflicts,
    ...(input.sourcePlatform ? { sourcePlatform: input.sourcePlatform } : {}),
    ...(input.targetPlatform ? { targetPlatform: input.targetPlatform } : {}),
  })
  input.onProgress?.({ phase: 'apply', message: 'Checking target paths', percent: 5, total: preview.items.length })

  const skipped: string[] = []
  const writes: Array<{ path: string; abs: string; data: Buffer; secret: boolean; add: boolean }> = []
  for (const item of preview.items) {
    const strategy = item.resolution
      ?? resolveItemConflict(item.path, input.conflict, input.conflicts)
    if (!shouldApplyChange(item.change, strategy)) {
      skipped.push(item.path)
      continue
    }
    const secret = isSecretEntry(input.manifest, item.path)
    if (secret && !input.allowSecrets) {
      skipped.push(item.path)
      continue
    }
    if (isWorkspaceStatePath(item.path)) {
      skipped.push(item.path)
      continue
    }
    const data = input.files.get(item.path)
    if (!data) {
      skipped.push(item.path)
      continue
    }
    writes.push({ path: item.path, abs: resolveLivePath(item.path, input.dshHome, input.agentsHome), data, secret, add: item.change === 'add' })
  }
  const writing = new Set(writes.map((w) => w.path))
  const removes: Array<{ path: string; abs: string }> = []
  for (const path of input.removePaths ?? []) {
    if (writing.has(path) || isWorkspaceStatePath(path)) continue
    if (isSecretRelPath(path) && !input.allowSecrets) continue
    removes.push({ path, abs: resolveLivePath(path, input.dshHome, input.agentsHome) })
  }

  const rootOf = (abs: string) => (isWithin(input.agentsHome, abs) && !isWithin(input.dshHome, abs) ? input.agentsHome : input.dshHome)
  const problems: string[] = []
  for (const w of [...writes, ...removes]) {
    try {
      await checkTarget(rootOf(w.abs), w.abs)
    } catch (err) {
      problems.push(`${w.path}: ${(err as Error).message}`)
    }
  }
  if (problems.length) {
    throw new VaultUserError(
      `restore refused before any change (${problems.length} unsafe path${problems.length === 1 ? '' : 's'}): ${problems.slice(0, 5).join('; ')}`,
      409,
      'RESTORE_UNSAFE_PATH',
    )
  }

  const journal = input.journal ?? new WriteJournal([input.dshHome, input.agentsHome])
  const applied: string[] = []
  const credentialsWritten: string[] = []
  const addedFiles: string[] = []
  const total = writes.length + removes.length
  let i = 0
  try {
    for (const w of writes) {
      i++
      await journal.write(w.abs, w.data, w.secret ? 0o600 : 0o644)
      applied.push(w.path)
      if (w.secret) credentialsWritten.push(w.path)
      if (w.add) addedFiles.push(w.path)
      input.onProgress?.({
        phase: 'apply',
        message: `Wrote ${w.path}`,
        current: i,
        total,
        percent: Math.round((i / Math.max(total, 1)) * 80),
      })
    }
    for (const r of removes) {
      i++
      if (await journal.remove(r.abs)) applied.push(r.path)
    }
  } catch (err) {
    const notReverted = await journal.rollback()
    const why = err instanceof Error ? err.message : String(err)
    throw new VaultUserError(
      notReverted.length
        ? `restore failed (${why}); rolled back, but ${notReverted.length} file(s) could not be reverted: ${notReverted.slice(0, 5).join(', ')} — restore the pre-restore rollback snapshot`
        : `restore failed (${why}); every change was rolled back, nothing was modified`,
      500,
      'RESTORE_ROLLED_BACK',
    )
  }

  // A manifest from another OS keeps that machine's local plugin paths unless the plugin
  // phase rewrites them. Do it here as well, so `pnpm install` works even when the user
  // turned plugin restore off; anything left behind is reported rather than hidden.
  const manualActions = [...preview.manualActions]
  if (input.sourcePlatform && applied.some((path) => path.endsWith('/package.json'))) {
    const dropped = await dropForeignLocalDeps(input.dshHome, {
      sourcePlatform: input.sourcePlatform,
      ...(input.targetPlatform ? { targetPlatform: input.targetPlatform } : {}),
    })
    if (dropped.length) {
      // Say it out loud: these plugins are no longer in the profile, so they will not load.
      manualActions.push(
        `Removed ${dropped.length} plugin ${dropped.length === 1 ? 'entry' : 'entries'} that pointed at the other computer's local files: ${dropped
          .map((d) => `${d.name} (${d.spec})`)
          .join(', ')}. Install them on this machine if you still need them.`,
      )
    }
  }

  return {
    snapshotId: input.manifest.id,
    applied,
    skipped,
    rollbackSnapshotId: input.rollbackSnapshotId,
    pluginsReinstalled: [],
    pluginsFailed: [],
    manualActions,
    credentialsWritten,
    addedFiles,
  }
}

export async function deletePathSafe(abs: string): Promise<void> {
  try {
    await unlink(abs)
  } catch {
    // ignore
  }
}

export type { RestorePreview }
