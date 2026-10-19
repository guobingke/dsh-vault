# Frontend contract — dsh-vault

This document is the single source of truth for a **frontend-only** redesign.  
You may restyle and rearrange UI freely if you keep these APIs, data shapes, and file boundaries.

## Ownership boundary

| Safe to edit (frontend pass) | Do not change without backend coordination |
|---|---|
| `src/client/theme.css` | `src/core/**` |
| `src/client/components/**` | `src/storage/**` |
| `src/client/VaultApp.tsx` (layout/composition) | `src/api/**` |
| Labels / copy in `src/client/index.ts` locale dicts | `src/cli/**`, `src/tools/**`, `src/commands/**` |
| Presentational props of panel components | HTTP path strings under `/api/dsh-vault` |

`src/client/api.ts` is the UI’s HTTP client. Prefer extending it over fetching ad hoc URLs.

## Where UI lives

```
src/client/
  index.ts              # Cordis client apply(); registers settings.section
  VaultApp.tsx          # Tab shell + state orchestration
  api.ts                # VaultApi
  theme.css             # CSS variables (--dv-*) — restyle here first
  components/
    Dashboard.tsx
    BackupPanel.tsx
    RestorePanel.tsx
    StoragePanel.tsx
    SnapshotsPanel.tsx
    SettingsPanel.tsx
```

Host mount: Settings → section id `dsh-vault` (slot `settings.section`).

This registration works for **both** `dsh web` and DeepSeek Harness Desktop. Desktop embeds the shared Web UI and loads the same browser half (`dsh.client.platform: "web"`). The plugin must be installed into the profile that owns the running Host (`web` or `desktop`); activation is not shared across profiles. No separate Electron-native panel exists — Settings → dsh Vault is the desktop entry point.

## Tabs / IA

| Tab id | Component | Purpose |
|---|---|---|
| `dashboard` | `Dashboard` | Overview KPIs + recent snapshots + CTA |
| `backup` | `BackupPanel` | Create snapshot |
| `restore` | `RestorePanel` | Preview diff → conflict → restore |
| `storage` | `StoragePanel` | CRUD storage targets |
| `snapshots` | `SnapshotsPanel` | List / verify / delete |
| `settings` | `SettingsPanel` | Retention + schedule |

## UI states (required)

Every data-bound panel must support:

| State | Behavior |
|---|---|
| `loading` | Initial fetch in progress (`Dashboard` empty-loading copy) |
| `empty` | No targets / no snapshots — show guidance, not a blank canvas |
| `error` | Inline banner `data-tone="error"` + retry where applicable |
| `busy` / `progress` | Disable primary actions; optional progress bar on Backup |
| `success` | Inline banner `data-tone="ok"` with snapshot id / counts |
| `warn` | Manual-action banners on Restore preview (`data-tone="warn"`) |

Do not toast secrets, passwords, tokens, or raw credential file contents.

## HTTP API

Base: `/api/dsh-vault`  
Auth: loopback-only (host rejects non-loopback with 403).  
Errors: `{ "error": string, "code"?: string }`.

### `GET /status`

```ts
{
  dshHome: string
  dataDir: string
  /** Host process profile from `$DSH_PROFILE` / `$DSH_PROFILE_DIR` (`web`, `desktop`, …). */
  activeProfile: string
  /** Initialized GUI profiles under `$DSH_HOME/profiles` that currently exist. */
  guiProfiles: string[]
  /** Derived from `activeProfile` for UX copy. */
  surface: 'desktop' | 'web' | 'other'
  /**
   * Install guidance for web + desktop (desktop always included so the UI can
   * show “also install on Desktop” when the Host is only on `web`).
   */
  installPlan: Array<{ profile: string; command: string; notes: string[] }>
  targets: StorageTargetConfig[]
  settings: VaultSettings
  recentSnapshots: SnapshotInfo[]
}
```

Frontend redesigns may surface `activeProfile` / `installPlan` (e.g. “Install into Desktop too”) but must tolerate older hosts that omit them only if talking to a pre-0.1.0 server — current contract always returns these fields.

### `GET|PUT /settings`

Body (PUT): `Partial<VaultSettings>`  
Returns: `VaultSettings`

```ts
interface VaultSettings {
  defaultTargetId?: string
  retention: { keepLast: number }
  schedule: ScheduleConfig
  preferredKdf: 'scrypt' | 'argon2id'
}

interface ScheduleConfig {
  enabled: boolean
  intervalMinutes: number
  targetId: string
  encrypt: boolean
  includeSecrets: boolean
  retention: { keepLast: number }
  lastRunAt?: string
  nextRunAt?: string
}
```

### `GET|POST /targets`

- GET → `{ targets: StorageTargetConfig[] }` (**secrets masked**)
- POST body → full `StorageTargetConfig` (upsert by `id`)
- `POST /targets/delete` body `{ id }` → `{ targets }` (**secrets masked**)

```ts
type StorageTargetConfig =
  | { kind: 'local'; id; label; directory; encryptByDefault?: boolean }
  | { kind: 'github'; id; label; owner; repo; branch?; pathPrefix?; tokenCredential?; token?; encryptByDefault?: boolean }
  | { kind: 'webdav'; id; label; url; username?; password?; pathPrefix?; encryptByDefault?: boolean }
  | { kind: 's3'; id; label; endpoint; region?; bucket; accessKeyId; secretAccessKey; pathPrefix?; forcePathStyle?; encryptByDefault?: boolean }
```

**Secret fields in responses** (`token`, `password`, `secretAccessKey`):

- When a secret is stored, GET/POST responses replace it with the placeholder `********` (never the real value).
- On POST upsert, if the client sends `********`, `""`, or omits the field, the server **keeps the previously stored secret**.
- Sending a new non-mask string replaces the stored secret.
- `GET /status` also returns masked targets.
- Reserved id `local-rollback` is rejected on upsert/delete (private rollback folder; not listed in `/targets`).

Never render raw `token` / `password` / `secretAccessKey` after save in logs. Mask inputs with `type="password"`. Leaving a secret field empty in the UI remains the supported “keep existing” UX (the client may also echo `********` from GET; the server treats that the same).

### `POST /backup`

```ts
// request
{
  /** One of targetId / directory / exportFile is required. */
  targetId?: string
  /** One-shot local folder (any path; USB / synced drive / Windows drive letter). */
  directory?: string
  /** Single portable archive path (.tar.gz or .dshvault). */
  exportFile?: string
  encrypt?: boolean
  password?: string
  includeSecrets?: boolean
  notes?: string
  categories?: BackupCategory[]
  kdf?: 'scrypt' | 'argon2id'
  /** Bundle link:/file: plugin source trees into the archive (default true). */
  bundleLocalPlugins?: boolean
}

// response
{
  snapshotId: string
  targetId: string
  remoteKey: string
  bytes: number
  encrypted: boolean
  includeSecrets: boolean
  manifest: VaultManifest
  /** Absolute path when directory/exportFile was used. */
  exportPath?: string
}
```

Constraint enforced by backend: `includeSecrets` requires `encrypt` + password.

### `GET /snapshots?targetId=`

`{ snapshots: SnapshotInfo[] }`

```ts
interface SnapshotInfo {
  id: string
  targetId: string
  remoteKey: string
  createdAt: string
  bytes: number
  encrypted: boolean
  includeSecrets: boolean
  notes?: string
}
```

### `POST /snapshots/delete`

`{ targetId, snapshotId }` → `{ ok: true }`

### `POST /verify`

`{ targetId, snapshotId, password? }` → `{ ok: true, manifestId }`

### `GET /fs/list?path=` / `POST /fs/list`

List one directory level for the in-app path browser (Windows-safe). Response: `{ path, parent, entries: [{ name, path, kind, bytes? }] }`.

### `POST /fs/pick-directory`

Native OS folder picker when the host exposes `directoryPicker`; otherwise `{ path: null }`.

### `POST /restore/preview`

```ts
// request
{
  /** targetId+snapshotId OR importPath (folder or .tar.gz/.dshvault file). */
  targetId?: string
  snapshotId?: string
  importPath?: string
  password?: string
  /** Optional. When set, each item is annotated with `resolution`. */
  conflict?: 'keep-current' | 'use-backup'
  /** Optional per-path overrides (same shape as restore). */
  conflicts?: Record<string, 'keep-current' | 'use-backup'>
}

// response
interface RestorePreview {
  snapshotId: string
  items: Array<{
    path: string
    category: string
    change: 'add' | 'change' | 'remove' | 'unchanged'
    currentSha256?: string
    backupSha256?: string
    /** Present when request included `conflict`. */
    resolution?: 'keep-current' | 'use-backup'
  }>
  added: number
  changed: number
  removed: number
  unchanged: number
  pluginsToReinstall: Array<{ name: string; version?: string; source: string; profile?: string }>
  manualActions: string[]
  conflict?: 'keep-current' | 'use-backup'
  conflicts?: Record<string, 'keep-current' | 'use-backup'>
}
```

Backward compatible: omit `conflict`/`conflicts` and the response matches the previous shape (no `resolution` fields).

### `POST /restore`

```ts
// request
{
  targetId?: string
  snapshotId?: string
  /** Folder or single archive; no storage target required. */
  importPath?: string
  password?: string
  /** Global default for any path not listed in `conflicts`. Required. */
  conflict: 'keep-current' | 'use-backup'
  /**
   * Optional per-path overrides. Keys are snapshot-relative paths
   * (same as `DiffItem.path` / manifest file paths).
   * Unspecified paths fall back to `conflict`.
   * Example: { "settings.yaml": "keep-current", "mcp.json": "use-backup" }
   */
  conflicts?: Record<string, 'keep-current' | 'use-backup'>
  createRollbackSnapshot?: boolean  // default true
  reinstallPlugins?: boolean        // default true
  includeSecrets?: boolean
}

// response (HTTP 409 when ok === false — plugins failed; body still full RestoreResult)
{
  snapshotId: string
  applied: string[]
  skipped: string[]
  rollbackSnapshotId?: string
  /** Present when a pre-restore rollback was created. Always `local-rollback`. */
  rollbackTargetId?: string
  pluginsReinstalled: string[]
  pluginsFailed: string[]
  pluginResults?: Array<{ name: string; profile: string; status: 'installed' | 'already-present' | 'failed' | 'skipped'; detail: string }>
  ok?: boolean
  restartRequired?: boolean
  manualActions: string[]
}
```

**Pre-restore rollback**

- Stored only under `$DSH_HOME/dsh-vault/rollback/` (mode `0700`), never on the first user local/USB target.
- Target id for restore/verify/list of those snapshots: `local-rollback` (not returned from `GET /targets`).
- When the restore would **apply** credential files, the rollback is encrypted and includes secrets; the restore `password` is reused. If credentials would be overwritten and no password is available → `400` `PASSWORD_REQUIRED`.
- When credentials are not applied (e.g. `conflicts: { ".credentials.yaml": "keep-current" }`), rollback stays plaintext without secrets.

**Conflict resolution rules** (preview annotations, apply, and later rollback-of-rollback all share this helper):

| `change` | resolved strategy | apply? |
|---|---|---|
| `unchanged` | (any) | no (skip) |
| `remove` | (any) | no (reported only; not auto-deleted) |
| `add` | (any) | yes |
| `change` | `use-backup` | yes |
| `change` | `keep-current` | no (skip) |

Preview **does** list local-only in-scope files as `change: "remove"` (compared against a live collect of the same categories as the snapshot, including secrets when the snapshot included them). Restore never deletes them unless a future explicit opt-in is added.

Pre-restore rollback snapshots always capture the live tree before apply; conflict choices do not alter what is snapshotted for rollback (except whether secrets are included when credentials would be applied). Re-applying a rollback snapshot uses `rollbackTargetId` + the same `conflict` / `conflicts` fields.

Invalid `conflicts` values → HTTP 400 `{ error }`. Omitting `conflicts` preserves the previous global-only behavior.

### Error mapping (4xx)

User-correctable failures return 4xx with `{ error, code? }` instead of 500:

| Situation | Status | Example `code` |
|---|---|---|
| Secrets without encryption | 400 | `SECRETS_REQUIRE_ENCRYPT` |
| Wrong / missing decrypt password | 400 | `BAD_PASSWORD` / `PASSWORD_REQUIRED` |
| Missing storage target / snapshot | 404 | `TARGET_NOT_FOUND` / `SNAPSHOT_NOT_FOUND` |
| Remote auth / missing object (`(401)` / `(403)` / `(404)` in adapter message) | 401 / 403 / 404 | `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` |
| Bad config / conflict payload | 400 | `BAD_CONFIG` / `BAD_REQUEST` |

Unknown failures remain 500.

### `GET|PUT /schedule` and `POST /schedule/run`

Schedule GET/PUT uses `ScheduleConfig`.  
`/schedule/run` → `{ result: BackupResult | null }`.

## Client helper: `VaultApi`

Methods mirror the routes above (`status`, `backup`, `listSnapshots`, `previewRestore`, `restore`, …).  
Throw `VaultApiError` with `.status` on failure.

## Component props (stable)

Redesigns should keep these prop contracts (or adapt `VaultApp` wiring in the same PR):

- `DashboardProps`: `status`, `loading`, `error`, `onRefresh`, `onBackup`
- `BackupPanelProps`: `targets`, `busy`, `message`, `error`, `progress?`, `onBackup`
- `RestorePanelProps`: `targets`, `snapshots`, `preview`, `busy`, `message`, `error`, `onPreview`, `onRestore`
  - `onRestore` may pass `conflicts?: Record<path, 'keep-current' | 'use-backup'>` alongside required `conflict`
  - `onPreview` may optionally pass `conflict` / `conflicts` to receive `items[].resolution`
- `StoragePanelProps`: `targets`, `busy`, `error`, `message`, `onUpsert`, `onDelete`
- `SnapshotsPanelProps`: `snapshots`, `busy`, `error`, `onRefresh`, `onDelete`, `onVerify`
- `SettingsPanelProps`: `settings`, `busy`, `error`, `message`, `onSave`, `onRunSchedule`

## Theming

All colors/spacing go through `--dv-*` in `theme.css`, which maps onto host `--dsw-*` tokens with fallbacks.  
A visual redesign should:

1. Update `theme.css` variables  
2. Avoid hard-coded hex in components  
3. Keep class names prefixed with `dv-` / root `dsh-vault-root` unless you update both CSS and components together

## Events / progress

HTTP calls are request/response today (no SSE). Progress UI may be optimistic/indeterminate.  
If a later backend adds progress streaming, prefer an additive endpoint such as `GET /api/dsh-vault/jobs/:id` rather than breaking existing routes.

## Model tools & slash commands (non-UI, for parity)

| Surface | Name |
|---|---|
| Tool | `dsh_vault_status` |
| Tool | `dsh_vault_backup` |
| Tool | `dsh_vault_list` |
| Tool | `dsh_vault_restore_preview` |
| Tool | `dsh_vault_restore` |
| Slash | `/vault status\|backup\|list\|restore …` |

Frontend redesigns do not need to touch these.
