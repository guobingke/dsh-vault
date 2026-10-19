/** Schema version for vault snapshot manifests. */
export const MANIFEST_SCHEMA_VERSION = 1 as const

/** Snapshot file extension for encrypted vault payloads. */
export const ENCRYPTED_EXTENSION = '.dshvault'

/** Snapshot archive extension for plaintext local archives. */
export const ARCHIVE_EXTENSION = '.tar.gz'

/** Categories collected into a snapshot. */
export type BackupCategory =
  | 'plugins'
  | 'plugin-config'
  | 'mcp'
  | 'skills'
  | 'settings'
  | 'providers'
  | 'agent-presets'
  | 'profiles'
  | 'instructions'
  | 'credentials'

/** Conflict resolution when restoring overlapping paths. */
export type ConflictStrategy = 'keep-current' | 'use-backup'

/** Storage target kinds. */
export type StorageKind = 'local' | 'github' | 'webdav' | 's3'

/** Encryption algorithm envelope identifier. */
export type EncryptionAlgorithm = 'aes-256-gcm'

/** Key-derivation function identifier. */
export type KdfAlgorithm = 'scrypt' | 'argon2id'

export interface ManifestFileEntry {
  /** POSIX-style path relative to the snapshot root. */
  path: string
  /** Category this file belongs to. */
  category: BackupCategory
  /** Byte length of the file contents as stored in the archive. */
  size: number
  /** SHA-256 hex digest of the file bytes. */
  sha256: string
  /** True when the file is a secret (only present in encrypted snapshots). */
  secret?: boolean
}

export interface PluginRecord {
  name: string
  version?: string
  /** Install source (npm package, link:, file:, git:, etc.). */
  source: string
  profile?: string
}

export interface VaultManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION
  /** Snapshot id, e.g. vault-20261019T025600Z */
  id: string
  createdAt: string
  dshVersion?: string
  hostname?: string
  platform: string
  /** Categories included in this snapshot. */
  categories: BackupCategory[]
  includeSecrets: boolean
  encrypted: boolean
  encryption?: {
    algorithm: EncryptionAlgorithm
    kdf: KdfAlgorithm
  }
  plugins: PluginRecord[]
  files: ManifestFileEntry[]
  /** SHA-256 of the concatenated sorted "path:sha256" lines (integrity of the file table). */
  manifestSha256: string
  notes?: string
}

export interface CollectedFile {
  absPath: string
  relPath: string
  category: BackupCategory
  secret: boolean
  size: number
  sha256: string
  data: Buffer
}

export interface CollectOptions {
  dshHome: string
  agentsHome?: string
  includeSecrets?: boolean
  categories?: BackupCategory[]
  /** Extra absolute roots to include under a relative prefix. */
  extraRoots?: Array<{ abs: string; relPrefix: string; category: BackupCategory }>
}

export interface BackupRequest {
  targetId: string
  encrypt?: boolean
  password?: string
  kdf?: KdfAlgorithm
  includeSecrets?: boolean
  categories?: BackupCategory[]
  notes?: string
  dshVersion?: string
}

export interface BackupResult {
  snapshotId: string
  targetId: string
  remoteKey: string
  bytes: number
  encrypted: boolean
  includeSecrets: boolean
  manifest: VaultManifest
}

export interface DiffItem {
  path: string
  category: BackupCategory
  change: 'add' | 'change' | 'remove' | 'unchanged'
  currentSha256?: string
  backupSha256?: string
  /**
   * Effective conflict strategy for this path after merging the global default
   * with an optional per-path `conflicts` map. Present when preview/restore
   * was called with a global `conflict` (and optional overrides).
   */
  resolution?: ConflictStrategy
}

export interface RestorePreview {
  snapshotId: string
  items: DiffItem[]
  added: number
  changed: number
  removed: number
  unchanged: number
  pluginsToReinstall: PluginRecord[]
  manualActions: string[]
  /** Global default used when computing `items[].resolution` (if provided). */
  conflict?: ConflictStrategy
  /** Per-path overrides that were applied when computing resolutions. */
  conflicts?: Record<string, ConflictStrategy>
}

export interface RestoreRequest {
  targetId: string
  snapshotId: string
  password?: string
  /** Global default conflict strategy (required; used for any path not listed in `conflicts`). */
  conflict: ConflictStrategy
  /**
   * Optional per-path overrides. Keys are snapshot-relative paths (same as
   * `DiffItem.path` / manifest file paths). Unspecified paths fall back to `conflict`.
   */
  conflicts?: Record<string, ConflictStrategy>
  /** Create an automatic pre-restore snapshot before applying. Defaults to true. */
  createRollbackSnapshot?: boolean
  /** Attempt `dsh plugin add` for missing plugins. Defaults to true. */
  reinstallPlugins?: boolean
  includeSecrets?: boolean
}

export interface RestoreResult {
  snapshotId: string
  applied: string[]
  skipped: string[]
  rollbackSnapshotId?: string
  pluginsReinstalled: string[]
  pluginsFailed: string[]
  manualActions: string[]
}

export interface SnapshotInfo {
  id: string
  targetId: string
  remoteKey: string
  createdAt: string
  bytes: number
  encrypted: boolean
  includeSecrets: boolean
  notes?: string
}

export interface RetentionPolicy {
  keepLast: number
}

export interface ScheduleConfig {
  enabled: boolean
  /** Interval in minutes (minimum 15). */
  intervalMinutes: number
  targetId: string
  encrypt: boolean
  includeSecrets: boolean
  retention: RetentionPolicy
  lastRunAt?: string
  nextRunAt?: string
}

export interface VaultSettings {
  defaultTargetId?: string
  retention: RetentionPolicy
  schedule: ScheduleConfig
  /** Prefer scrypt (built-in) or argon2id when available. */
  preferredKdf: KdfAlgorithm
}

export interface ProgressEvent {
  phase: 'collect' | 'pack' | 'encrypt' | 'upload' | 'download' | 'decrypt' | 'diff' | 'apply' | 'reinstall' | 'done' | 'error'
  message: string
  current?: number
  total?: number
  percent?: number
}

export type ProgressCallback = (event: ProgressEvent) => void

/** Local unencrypted or encrypted folder target. */
export interface LocalTargetConfig {
  kind: 'local'
  id: string
  label: string
  directory: string
  /** When true, every upload is wrapped in an encrypted envelope. */
  encryptByDefault?: boolean
}

export interface GitHubTargetConfig {
  kind: 'github'
  id: string
  label: string
  owner: string
  repo: string
  branch?: string
  /** Directory prefix inside the repo. */
  pathPrefix?: string
  /** Credential key name inside ~/.dsh/.credentials.yaml, or raw token env name. */
  tokenCredential?: string
  /** Direct token (never persisted by the vault settings writer). */
  token?: string
  encryptByDefault?: boolean
}

export interface WebDavTargetConfig {
  kind: 'webdav'
  id: string
  label: string
  url: string
  username?: string
  password?: string
  /** Path prefix on the server. */
  pathPrefix?: string
  encryptByDefault?: boolean
}

export interface S3TargetConfig {
  kind: 's3'
  id: string
  label: string
  endpoint: string
  region?: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  pathPrefix?: string
  forcePathStyle?: boolean
  encryptByDefault?: boolean
}

export type StorageTargetConfig =
  | LocalTargetConfig
  | GitHubTargetConfig
  | WebDavTargetConfig
  | S3TargetConfig

export interface VaultPluginConfig {
  dataDir?: string
  targets?: StorageTargetConfig[]
  settings?: Partial<VaultSettings>
}
