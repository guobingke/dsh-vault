import type { SnapshotInfo, StorageTargetConfig } from '../../core/types.js'
import type { Translate } from '../i18n.js'

/** Must match `SECRET_MASK` in `src/core/target-secrets.ts`. */
const SECRET_MASK = '********'

export function newestFirst(a: SnapshotInfo, b: SnapshotInfo): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
}

export function targetKindLabel(t: StorageTargetConfig, tr: Translate): string {
  switch (t.kind) {
    case 'local':
      return tr('kind.local')
    case 'github':
      return tr('kind.github')
    case 'webdav':
      return tr('kind.webdav')
    case 's3':
      return tr('kind.s3')
    default: {
      const _exhaustive: never = t
      void _exhaustive
      return 'unknown'
    }
  }
}

export function targetLocation(t: StorageTargetConfig): string {
  switch (t.kind) {
    case 'local':
      return t.directory
    case 'github':
      return `${t.owner}/${t.repo}${t.branch ? `@${t.branch}` : ''}${t.pathPrefix ? `/${t.pathPrefix}` : ''}`
    case 'webdav':
      return t.pathPrefix ? `${t.url.replace(/\/$/, '')}/${t.pathPrefix}` : t.url
    case 's3':
      return `${t.endpoint.replace(/\/$/, '')}/${t.bucket}${t.pathPrefix ? `/${t.pathPrefix}` : ''}`
    default: {
      const _exhaustive: never = t
      void _exhaustive
      return ''
    }
  }
}

/** True when the API reported a stored secret (masked placeholder or legacy plaintext). */
export function hasStoredSecret(t: StorageTargetConfig): boolean {
  if (t.kind === 'webdav') return Boolean(t.password)
  if (t.kind === 's3') return Boolean(t.secretAccessKey)
  if (t.kind === 'github') return Boolean(t.token) || Boolean(t.tokenCredential)
  return false
}

export function isSecretMask(value: string | undefined): boolean {
  return value === SECRET_MASK
}

export function summarizeSnapshotsByTarget(
  targets: StorageTargetConfig[],
  snapshots: SnapshotInfo[],
): Array<{ target: StorageTargetConfig; count: number; latest?: SnapshotInfo }> {
  return targets.map((target) => {
    const list = snapshots.filter((s) => s.targetId === target.id).sort(newestFirst)
    return { target, count: list.length, latest: list[0] }
  })
}
