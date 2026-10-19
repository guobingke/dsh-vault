import type { ConflictStrategy } from './types.js'

/** Per-path (or per-item id) conflict overrides. Keys are snapshot-relative paths. */
export type ConflictMap = Record<string, ConflictStrategy>

/**
 * Resolve the conflict strategy for one item.
 * Per-path entry wins when present and valid; otherwise the global default applies.
 */
export function resolveItemConflict(
  path: string,
  global: ConflictStrategy,
  conflicts?: ConflictMap | null,
): ConflictStrategy {
  const specific = conflicts?.[path]
  if (specific === 'keep-current' || specific === 'use-backup') return specific
  return global
}

/** True when a changed item should be written from the backup under the resolved strategy. */
export function shouldApplyChange(
  change: 'add' | 'change' | 'remove' | 'unchanged',
  strategy: ConflictStrategy,
): boolean {
  if (change === 'unchanged' || change === 'remove') return false
  if (change === 'add') return true
  // change
  return strategy === 'use-backup'
}

/**
 * Validate/normalize an unknown conflicts payload (e.g. from HTTP JSON).
 * Returns undefined when absent; throws on malformed input.
 */
export function normalizeConflicts(conflicts: unknown): ConflictMap | undefined {
  if (conflicts === undefined || conflicts === null) return undefined
  if (typeof conflicts !== 'object' || Array.isArray(conflicts)) {
    throw new Error('conflicts must be an object map of path -> "keep-current" | "use-backup"')
  }
  const out: ConflictMap = {}
  for (const [path, value] of Object.entries(conflicts as Record<string, unknown>)) {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new Error('conflicts keys must be non-empty paths')
    }
    if (value !== 'keep-current' && value !== 'use-backup') {
      throw new Error(`invalid conflict strategy for "${path}": ${String(value)}`)
    }
    out[path] = value
  }
  return out
}
