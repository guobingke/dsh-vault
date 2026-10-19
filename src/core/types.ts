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
  /** Plugin-owned data directly under $DSH_HOME (dsh-purge/, redteam/, skin-center/, …). */
  | 'plugin-data'
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
  /** Snapshot-relative directory when a link:/file: plugin tree was bundled into the archive. */
  /** git/GitHub/URL plugins: machine 1's resolved tarball from pnpm-lock.yaml (no git needed). */
  lockedTarball?: string
  /**
   * Snapshot-relative copy of the installed package (npm or github:), used when the
   * registry/git no longer has that exact version. Excludes nested node_modules.
   */
  fallbackBundle?: string
  bundledSource?: string
  /** Original local source on the source machine, resolved to an absolute path (`link:C:/…`, `file:/…/x.tgz`). */
  originalSource?: string
  /** What `bundledSource` holds: a package directory or a packed tarball. Default `dir`. */
  bundledKind?: 'dir' | 'tarball'
  /** `installed` when the source was missing at backup time and the installed copy was bundled. */
  bundledFrom?: 'source' | 'installed'
  /** Exact version found in the profile's node_modules at backup time (npm plugins). */
  installedVersion?: string
  /** Backup-time registry check: this exact version is not on the registry (restore uses the copy directly). */
  registryMissing?: boolean
  /**
   * Where the install source was recorded on the source machine:
   * `dependency` (package.json spec), `lockfile` (pnpm-lock entry), `installed`
   * (node_modules/<name>/package.json), or `name-only` (just a bundle / cordis name; no
   * source — never installed from the registry by name). Absent in older snapshots.
   */
  recordedFrom?: 'dependency' | 'lockfile' | 'installed' | 'name-only'
  /** Integrity (sha512-…) of the installed package at backup time, from the lockfile or package.json. */
  integrity?: string
  /** Resolved tarball URL at backup time, when known. */
  resolved?: string
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
  /** Bundle link:/file: plugin source trees into plugin-sources/. Default true. */
  bundleLocalPlugins?: boolean
  /** `profile:name` keys that get no saved copy (neither local source nor installed fallback). */
  pluginCopyExclude?: string[]
  onProgress?: ProgressCallback
}

export interface BackupRequest {
  /**
   * Storage target id. Optional when `directory` or `exportFile` is set
   * (one-shot local export without a persisted target).
   */
  targetId?: string
  /** One-shot local folder (any absolute path; Windows drive letters OK). */
  directory?: string
  /** Write a single portable archive to this file path (.tar.gz / .dshvault). */
  exportFile?: string
  encrypt?: boolean
  password?: string
  kdf?: KdfAlgorithm
  includeSecrets?: boolean
  categories?: BackupCategory[]
  notes?: string
  dshVersion?: string
  /** When true, bundle link:/file: plugin source trees into the snapshot. Default true. */
  bundleLocalPlugins?: boolean
  /** Save plugin copies at all (default: settings.pluginCopies.enabled, true). */
  bundlePluginCopies?: boolean
  /** `profile:name` keys without a saved copy (default: settings.pluginCopies.exclude). */
  pluginCopyExclude?: string[]
}

export interface BackupResult {
  snapshotId: string
  targetId: string
  remoteKey: string
  bytes: number
  encrypted: boolean
  includeSecrets: boolean
  manifest: VaultManifest
  /** Absolute path when exportFile/directory was used. */
  exportPath?: string
  durationMs?: number
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
  /**
   * Storage target id. Optional when `importPath` points at a folder or archive file.
   */
  targetId?: string
  snapshotId?: string
  /**
   * Import from a folder of snapshots or a single `.tar.gz` / `.dshvault` file
   * without configuring a storage target first.
   */
  importPath?: string
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
  /** Attempt to reinstall missing plugins. Defaults to true. */
  reinstallPlugins?: boolean
  /** Only install plugins of these profiles (files are still restored in full). */
  pluginProfiles?: string[]
  includeSecrets?: boolean
  /** Plugins with a saved copy: try the copy first, or the source first (default: settings). */
  pluginRestoreOrder?: PluginRestoreOrder
}

/** 优先从源安装，失败再用副本 (`source-first`) / 优先使用备份副本 (`copy-first`). */
export type PluginRestoreOrder = 'source-first' | 'copy-first'

export type PluginInstallStatus = 'installed' | 'installed-from-backup' | 'already-present' | 'failed' | 'skipped'

export type PluginFailureReasonCode =
  | 'local-source-missing'
  | 'tarball-missing'
  | 'unsupported-spec'
  | 'blocked-by-other'
  | 'registry-not-found'
  | 'network'
  | 'installer-missing'
  | 'missing-deps'
  | 'version-mismatch'
  | 'incompatible'
  | 'git-missing'
  | 'git-unavailable'
  | 'no-backup-copy'
  | 'not-resolvable'
  | 'no-recorded-source'
  | 'integrity-mismatch'
  | 'self'
  | 'unknown'

export interface PluginInstallResultRow {
  name: string
  profile: string
  status: PluginInstallStatus
  /** One short line; raw installer output is in `log`. */
  detail: string
  source?: string
  reason?: PluginFailureReasonCode
  /** Path / spec / package the reason refers to. */
  subject?: string
  /** Raw pnpm / dsh output (shown collapsed). */
  log?: string
}

export interface RestoreResult {
  snapshotId: string
  applied: string[]
  skipped: string[]
  rollbackSnapshotId?: string
  /** Storage target id for the private rollback folder (`local-rollback`). */
  rollbackTargetId?: string
  pluginsReinstalled: string[]
  pluginsFailed: string[]
  /** Per-plugin outcome (installed / already-present / failed with reason). */
  pluginResults?: PluginInstallResultRow[]
  /** False when any plugin failed to install — never treat as full success. */
  ok?: boolean
  /** Plugins were installed into a running Desktop/web host; restart recommended. */
  restartRequired?: boolean
  manualActions: string[]
  /** Wall time of the restore (or retry), for the completion summary. */
  durationMs?: number
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
  /** Save copies of installed plugins in each backup. Default: enabled, nothing excluded. */
  pluginCopies: { enabled: boolean; exclude: string[] }
  /** How restore uses saved copies. Default `source-first`. */
  pluginRestoreOrder: PluginRestoreOrder
}

export interface ProgressEvent {
  phase: 'prepare' | 'collect' | 'copies' | 'pack' | 'encrypt' | 'upload' | 'download' | 'decrypt' | 'diff' | 'rollback' | 'apply' | 'reinstall' | 'verify' | 'done' | 'error'
  message: string
  current?: number
  total?: number
  percent?: number
  /** Fraction (0–1) of the current stage when there is no current/total. */
  fraction?: number
  /** Current file / plugin name. */
  item?: string
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
