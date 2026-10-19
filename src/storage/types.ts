import type { SnapshotInfo } from '../core/types.js'

/** Pluggable storage target interface. */
export interface StorageAdapter {
  readonly id: string
  readonly kind: string
  readonly label: string

  /** Upload opaque snapshot bytes under a stable key derived from snapshotId. */
  put(snapshotId: string, data: Buffer, meta?: Record<string, string>): Promise<{ remoteKey: string }>

  /** Download snapshot bytes by id or remote key. */
  get(snapshotIdOrKey: string): Promise<Buffer>

  /** List known snapshots on this target. */
  list(): Promise<SnapshotInfo[]>

  /** Delete a snapshot by id or remote key. */
  delete(snapshotIdOrKey: string): Promise<void>
}

export interface StorageAdapterFactoryContext {
  /** Resolve a credential string (e.g. GitHub token) without logging it. */
  resolveSecret?: (ref: string) => Promise<string | undefined>
}
