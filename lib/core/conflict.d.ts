import type { ConflictStrategy } from './types.js';
/** Per-path (or per-item id) conflict overrides. Keys are snapshot-relative paths. */
export type ConflictMap = Record<string, ConflictStrategy>;
/**
 * Resolve the conflict strategy for one item.
 * Per-path entry wins when present and valid; otherwise the global default applies.
 */
export declare function resolveItemConflict(path: string, global: ConflictStrategy, conflicts?: ConflictMap | null): ConflictStrategy;
/** True when a changed item should be written from the backup under the resolved strategy. */
export declare function shouldApplyChange(change: 'add' | 'change' | 'remove' | 'unchanged', strategy: ConflictStrategy): boolean;
/**
 * Validate/normalize an unknown conflicts payload (e.g. from HTTP JSON).
 * Returns undefined when absent; throws on malformed input.
 */
export declare function normalizeConflicts(conflicts: unknown): ConflictMap | undefined;
//# sourceMappingURL=conflict.d.ts.map