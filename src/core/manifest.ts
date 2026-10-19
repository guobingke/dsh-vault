import { randomBytes } from 'node:crypto'
import { hostname, platform } from 'node:os'
import { computeManifestSha256 } from './checksum.js'
import type {
  BackupCategory,
  CollectedFile,
  PluginRecord,
  VaultManifest,
} from './types.js'
import { MANIFEST_SCHEMA_VERSION } from './types.js'

export function makeSnapshotId(date = new Date()): string {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const suffix = randomBytes(3).toString('hex')
  return `vault-${iso}-${suffix}`
}

export function buildManifest(input: {
  id: string
  files: CollectedFile[]
  plugins: PluginRecord[]
  includeSecrets: boolean
  encrypted: boolean
  kdf?: VaultManifest['encryption'] extends infer E ? E extends { kdf: infer K } ? K : never : never
  dshVersion?: string
  notes?: string
  createdAt?: string
}): VaultManifest {
  const categories = [...new Set(input.files.map((f) => f.category))] as BackupCategory[]
  const files = input.files.map((f) => ({
    path: f.relPath,
    category: f.category,
    size: f.size,
    sha256: f.sha256,
    ...(f.secret ? { secret: true as const } : {}),
  }))
  const manifest: VaultManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: input.id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    dshVersion: input.dshVersion,
    hostname: hostname(),
    platform: platform(),
    categories,
    includeSecrets: input.includeSecrets,
    encrypted: input.encrypted,
    plugins: input.plugins,
    files,
    manifestSha256: '',
    notes: input.notes,
  }
  if (input.encrypted) {
    manifest.encryption = {
      algorithm: 'aes-256-gcm',
      kdf: (input.kdf as 'scrypt' | 'argon2id') ?? 'scrypt',
    }
  }
  manifest.manifestSha256 = computeManifestSha256(manifest.files)
  return manifest
}

export function parseManifest(raw: string | Buffer): VaultManifest {
  const manifest = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8')) as VaultManifest
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`unsupported manifest schemaVersion: ${String(manifest.schemaVersion)}`)
  }
  if (!manifest.id || !Array.isArray(manifest.files)) {
    throw new Error('invalid manifest: missing id or files')
  }
  return manifest
}
