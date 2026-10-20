import { ArchiveLimitError, packTarGz, unpackTarGz } from './archive.js'
import { VaultDecryptError, decryptBytes, encryptBytes, parseEnvelope, serializeEnvelope } from './encryption.js'
import { VaultUserError } from './errors.js'
import { buildManifest, makeSnapshotId, parseManifest } from './manifest.js'
import { sha256Buffer, verifyManifestIntegrity } from './checksum.js'
import type { CollectedFile, KdfAlgorithm, PluginRecord, ProgressCallback, VaultManifest } from './types.js'

export interface PackedSnapshot {
  snapshotId: string
  bytes: Buffer
  manifest: VaultManifest
  encrypted: boolean
}

/** Build archive bytes (optionally encrypted) from collected files. */
export async function packSnapshot(input: {
  files: CollectedFile[]
  plugins: PluginRecord[]
  includeSecrets: boolean
  encrypt: boolean
  password?: string
  kdf?: KdfAlgorithm
  dshVersion?: string
  notes?: string
  rollbackRemoves?: string[]
  onProgress?: ProgressCallback
}): Promise<PackedSnapshot> {
  const snapshotId = makeSnapshotId()
  input.onProgress?.({ phase: 'pack', message: 'Building manifest', percent: 10 })
  const manifest = buildManifest({
    id: snapshotId,
    files: input.files,
    plugins: input.plugins,
    includeSecrets: input.includeSecrets,
    encrypted: input.encrypt,
    kdf: input.kdf ?? 'scrypt',
    dshVersion: input.dshVersion,
    notes: input.notes,
    rollbackRemoves: input.rollbackRemoves,
  })
  const entries = [
    { path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
    ...input.files.map((f) => ({ path: `files/${f.relPath}`, data: f.data })),
  ]
  input.onProgress?.({ phase: 'pack', message: 'Compressing archive', percent: 40 })
  let bytes = packTarGz(entries)
  let encrypted = false
  if (input.encrypt) {
    if (!input.password) throw new Error('password required when encrypt=true')
    input.onProgress?.({ phase: 'encrypt', message: 'Encrypting snapshot', percent: 70 })
    const envelope = await encryptBytes(bytes, { password: input.password, kdf: input.kdf ?? 'scrypt' })
    bytes = serializeEnvelope(envelope)
    encrypted = true
  }
  input.onProgress?.({ phase: 'done', message: 'Snapshot packed', percent: 100 })
  return { snapshotId, bytes, manifest: { ...manifest, encrypted }, encrypted }
}

export interface UnpackedSnapshot {
  manifest: VaultManifest
  files: Map<string, Buffer>
  /** True only when the bytes really were an encrypted envelope that decrypted (never taken from the manifest). */
  encrypted: boolean
}

/** Decode archive or encrypted envelope into manifest + file map. */
export async function unpackSnapshot(
  bytes: Buffer,
  password?: string,
  onProgress?: ProgressCallback,
): Promise<UnpackedSnapshot> {
  let archive = bytes
  let encrypted = false
  const head = bytes.toString('utf8', 0, Math.min(bytes.length, 80))
  if (head.includes('dsh-vault-encrypted')) {
    onProgress?.({ phase: 'decrypt', message: 'Decrypting snapshot', percent: 20 })
    if (!password) throw new VaultDecryptError('password required to decrypt snapshot', 'PASSWORD_REQUIRED')
    archive = await decryptBytes(parseEnvelope(bytes), password)
    encrypted = true
  }
  onProgress?.({ phase: 'download', message: 'Unpacking archive', percent: 50 })
  let entries
  try {
    entries = unpackTarGz(archive)
  } catch (err) {
    if (err instanceof ArchiveLimitError) throw err
    // zlib / tar parse errors ("incorrect header check") are bad input, not a server fault.
    throw new VaultUserError(`not a valid dsh-vault snapshot: ${err instanceof Error ? err.message : String(err)}`, 400, 'BAD_SNAPSHOT')
  }
  const bad = (why: string) => new VaultUserError(`not a valid dsh-vault snapshot: ${why}`, 400, 'BAD_SNAPSHOT')
  let manifest: VaultManifest
  try {
    manifest = parseManifest((entries.find((e) => e.path === 'manifest.json') ?? { data: Buffer.alloc(0) }).data)
  } catch (err) {
    throw bad(entries.some((e) => e.path === 'manifest.json') ? (err instanceof Error ? err.message : String(err)) : 'manifest.json missing')
  }
  const integrity = verifyManifestIntegrity(manifest)
  if (!integrity.ok) {
    throw bad(`manifest integrity check failed (expected ${integrity.expected}, got ${integrity.actual})`)
  }
  const files = new Map<string, Buffer>()
  for (const entry of entries) {
    if (!entry.path.startsWith('files/')) continue
    files.set(entry.path.slice('files/'.length), entry.data)
  }
  // Verify file checksums
  for (const meta of manifest.files) {
    const data = files.get(meta.path)
    if (!data) throw bad(`missing file in archive: ${meta.path}`)
    if (sha256Buffer(data) !== meta.sha256) throw bad(`checksum mismatch for ${meta.path}`)
    if (data.length !== meta.size) throw bad(`size mismatch for ${meta.path}`)
  }
  onProgress?.({ phase: 'done', message: 'Snapshot verified', percent: 100 })
  return { manifest, files, encrypted }
}
