# dsh-vault architecture

## Goals

`dsh-vault` backs up a DeepSeek Harness (`dsh`) setup so users can restore it after reinstall, profile reset, or moving to a new machine. This repository owns the **backend, plugin skeleton, CLI, and a minimal functional Settings UI**. Visual polish is intentionally deferred.

Primary GUI surfaces:

| Surface | Profile | How the UI loads |
|---|---|---|
| Browser (`dsh web`) | `web` | Cordis web client |
| DeepSeek Harness Desktop | `desktop` | Electron embeds the **same** Web UI |

Both use the same host plugin + `settings.section` client entry. Plugins are **not** shared between profiles — install once per surface you use.

## Plugin shape (dsh / Cordis)

dsh loads third-party packages as Cordis plugins when they export:

- `package.json` → `dsh.bundle.patch` pointing at `cordis.patch.yml`
- host entry (`exports["."]`) with `name` + `apply(ctx)`
- browser entry (`exports["./client"]`) via `dsh.client` with **`platform: "web"`** (required for Desktop as well — Desktop does not use a separate `platform: "desktop"` client)

Install:

```bash
# Browser
dsh plugin --profile web add dsh-vault

# Desktop — reserved profile; npm-global `dsh` refuses this unless the carrier
# enables manageDesktopProfile (Desktop's bundled dsh / Tray → Terminal).
# Launch Desktop once, fully quit, then:
dsh plugin --profile desktop add dsh-vault

# Or: while Desktop is running → Plugins → add dsh-vault
# Guided CLI (prints commands; can invoke dsh when available):
npx dsh-vault setup --dry-run
npx dsh-vault setup --profile desktop
```

Local checkout uses `link:/absolute/path` (POSIX and Windows absolute paths both work).

## Desktop integration model

Verified against upstream DeepSeek Harness (`apps/desktop`, `apps/cli`, shell-env, ui-settings):

1. **Profile** — Electron owns `$DSH_HOME/profiles/desktop`. CLI boot / config-dump for `desktop` are rejected. Plugin add/list/remove for `desktop` requires Desktop’s bundled `dsh` (`manageDesktopProfile`) after the profile has been initialized by launching the app once.
2. **Env** — Host injects `DSH_PROFILE` / `DSH_PROFILE_DIR` (and `DSH_HOME`). `VaultService` reads these via `resolveActiveProfile()` so restore reinstall targets the running profile.
3. **Settings UI** — Client registers `ctx.slots.inject('settings.section', …)` with id `dsh-vault` (same slot catalog Desktop’s embedded Web UI uses). No native Electron settings panel API is required.
4. **Paths** — Product data lives under `$DSH_HOME` (default `~/.dsh` on Windows / macOS / Linux). Vault state is `$DSH_HOME/dsh-vault/`. Path helpers use `node:path` + Windows-aware `assertInside` (case-insensitive drive roots).
5. **Shared home, separate activation** — Desktop and CLI share `$DSH_HOME` product data but **not** plugin activation / `node_modules` for the desktop profile.

Helpers live in `src/core/profiles.ts` (`DESKTOP_PROFILE`, `installCommandForProfile`, `multiProfileInstallPlan`). Status / tools / CLI expose `activeProfile`, `surface`, `guiProfiles`, and `installPlan`.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│ Settings UI (src/client)  — tabs call VaultApi          │
│ Model tools / slash cmd   — thin wrappers               │
│ Standalone CLI (bin)      — no Cordis required          │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ HTTP API  /api/dsh-vault/*  (src/api)                   │
│ VaultService (src/core/vault-service.ts)                │
│  collect → pack/encrypt → StorageAdapter                │
│  download → decrypt/verify → diff → apply → reinstall   │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ StorageAdapter interface                                │
│  local | github | webdav | s3                           │
└─────────────────────────────────────────────────────────┘
```

## Backup scope

Collected from `$DSH_HOME` (and `$DSH_AGENTS_HOME` for shared skills / `AGENTS.md`):

| Category | Typical paths |
|---|---|
| settings / providers | `settings.yaml`, profile patches with provider rows |
| plugins | `profiles/*/package.json` deps + `cordis.patch.yml` insert rows |
| plugin-config / profiles | `profiles/**` excluding `node_modules` |
| MCP | `mcp.json`, `mcp/**` |
| skills | `$DSH_HOME/skills`, `$DSH_AGENTS_HOME/skills` |
| agent presets | `.agent-presets/**`, `agent-presets/**` |
| instructions | `AGENTS.md` (home + agents-home) |
| credentials | `.credentials.yaml` **only** when encrypted mode is on |

Skipped: `node_modules`, `.git`, `cache`, and other reinstallable/plugin-owned cache dirs.

Each snapshot contains `manifest.json` (schema v1) + `files/**` inside a `.tar.gz`. Encrypted mode wraps that archive in a JSON envelope (`dsh-vault-encrypted`) using scrypt (default) or argon2id (when a hasher is injected) + AES-256-GCM.

## Secrets policy

- Default backups **never** include `.credentials.yaml` / `.env`.
- Including secrets requires `encrypt=true` and a password; secrets live only inside the encrypted payload.
- Logging helpers redact password/token/key fields (`redactForLog`).

## Restore flow

1. Download snapshot from any target  
2. Decrypt (if needed) + verify SHA-256 table  
3. Preview diff (add/change/remove); optional `conflict` + per-path `conflicts` annotate each item with `resolution`  
4. User picks a global conflict strategy (`keep-current` | `use-backup`) and optional per-path overrides in `conflicts`  
5. Automatic pre-restore snapshot into **`$DSH_HOME/dsh-vault/rollback/`** (`0700`, target id `local-rollback`) — never the user’s first local/USB target. When the restore would apply credentials, that rollback is encrypted (restore password reused) and includes secrets; otherwise plaintext without secrets  
6. Apply files using `resolveItemConflict(path, conflict, conflicts)` (same helper as preview); `remove` diffs are informational only  
7. Attempt `dsh plugin --profile <activeProfile|plugin.profile> add <pkg>` for missing plugins  
8. Report manual actions (re-enter API keys, re-link `link:` plugins; Desktop failures append bundled-CLI notes)
9. npm/GitHub plugins pack a fallback copy under `plugin-sources/`; if that exact version is later unpublished, restore installs it and reports `installed-from-backup`

API responses never echo stored WebDAV/S3/GitHub secrets (`********` placeholder; masked/empty upsert keeps the previous value). User errors map to HTTP 4xx where possible.

## Storage

All targets implement `StorageAdapter` (`put` / `get` / `list` / `delete`):

- **local** — folder of `.tar.gz` / `.dshvault`
- **github** — Contents API into a private repo (token from config, credential ref, or `GITHUB_TOKEN`)
- **webdav** — PUT/GET/PROPFIND/DELETE
- **s3** — SigV4 for S3/R2/MinIO/OSS-compatible endpoints

Encryption can be toggled per backup or via `encryptByDefault` on a target.

## Scheduling & retention

`VaultSettings.schedule` stores interval + target; `VaultService` arms an in-process timer when the host plugin is loaded. Retention `keepLast` deletes oldest snapshots after each backup on that target.

## Known dsh limitations / assumptions

- Host services (`webServer`, `tools`, `commands`, `credentials`) are **optional**; the CLI works without them.
- **Desktop ≠ web for plugins**: installing into `web` does not enable Settings → 大肥鱼备份 inside Desktop. Users must install into `desktop` separately (or use in-app Plugins).
- npm-global `dsh` **rejects** `--profile desktop`; only Desktop’s bundled carrier (with `manageDesktopProfile`) may mutate that profile from the CLI. In-app Plugins remains the easiest path while the app is open.
- Plugin reinstall shells out to the `dsh` on `PATH` — if that binary is npm-global while restoring inside Desktop, desktop-profile reinstalls may fail; restore still applies files and lists failed plugins + Desktop notes as manual actions.
- Settings UI registration uses `ctx.slots.inject('settings.section', …)` (current web / Desktop-embedded client contract). If a future dsh release renames the slot, only `src/client/index.ts` needs updating.
- Argon2id support is interface-ready; the default runtime uses Node `scrypt` unless an argon2 hasher is injected (keeps zero native deps).
- Snapshot “remove” diffs are reported but not auto-deleted (safer default for one-click restore).
- There is no dsh API to auto-install a plugin into both `web` and `desktop` in one call; `dsh-vault setup` / `installPlan` document the two-step flow.

## Key paths

| Path | Role |
|---|---|
| `src/index.ts` | Cordis host plugin |
| `src/client/` | Settings UI (`settings.section`) |
| `src/core/` | collect/manifest/encrypt/restore |
| `src/core/profiles.ts` | web/desktop profile helpers + install guidance |
| `src/storage/` | adapters |
| `src/api/` | HTTP routes |
| `src/cli/` | standalone CLI (`setup` / backup / restore) |
| `docs/FRONTEND_CONTRACT.md` | UI/API contract for a later design pass |
