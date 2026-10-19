import { createHash } from 'node:crypto'
import type { ManifestFileEntry, VaultManifest } from './types.js'

export function sha256Buffer(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Stable integrity hash over the sorted file table. */
export function computeManifestSha256(files: readonly ManifestFileEntry[]): string {
  const lines = [...files]
    .map((f) => `${f.path}:${f.sha256}:${f.size}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return sha256Buffer(lines.join('\n'))
}

export function verifyManifestIntegrity(manifest: VaultManifest): { ok: boolean; expected: string; actual: string } {
  const expected = computeManifestSha256(manifest.files)
  return { ok: expected === manifest.manifestSha256, expected, actual: manifest.manifestSha256 }
}
