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
  targets: StorageTargetConfig[]
  settings: VaultSettings
  recentSnapshots: SnapshotInfo[]
}
```

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

- GET → `{ targets: StorageTargetConfig[] }`
- POST body → full `StorageTargetConfig` (upsert by `id`)
- `POST /targets/delete` body `{ id }` → `{ targets }`

```ts
type StorageTargetConfig =
  | { kind: 'local'; id; label; directory; encryptByDefault?: boolean }
  | { kind: 'github'; id; label; owner; repo; branch?; pathPrefix?; tokenCredential?; token?; encryptByDefault?: boolean }
  | { kind: 'webdav'; id; label; url; username?; password?; pathPrefix?; encryptByDefault?: boolean }
  | { kind: 's3'; id; label; endpoint; region?; bucket; accessKeyId; secretAccessKey; pathPrefix?; forcePathStyle?; encryptByDefault?: boolean }
```

Never render raw `token` / `password` / `secretAccessKey` after save in logs. Mask inputs with `type="password"`.

### `POST /backup`

```ts
// request
{
  targetId: string
  encrypt?: boolean
  password?: string
  includeSecrets?: boolean
  notes?: string
  categories?: BackupCategory[]
  kdf?: 'scrypt' | 'argon2id'
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

### `POST /restore/preview`

`{ targetId, snapshotId, password? }` → `RestorePreview`

```ts
interface RestorePreview {
  snapshotId: string
  items: Array<{
    path: string
    category: string
    change: 'add' | 'change' | 'remove' | 'unchanged'
    currentSha256?: string
    backupSha256?: string
  }>
  added: number
  changed: number
  removed: number
  unchanged: number
  pluginsToReinstall: Array<{ name: string; version?: string; source: string; profile?: string }>
  manualActions: string[]
}
```

### `POST /restore`

```ts
// request
{
  targetId: string
  snapshotId: string
  password?: string
  conflict: 'keep-current' | 'use-backup'
  createRollbackSnapshot?: boolean  // default true
  reinstallPlugins?: boolean        // default true
  includeSecrets?: boolean
}

// response
{
  snapshotId: string
  applied: string[]
  skipped: string[]
  rollbackSnapshotId?: string
  pluginsReinstalled: string[]
  pluginsFailed: string[]
  manualActions: string[]
}
```

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
