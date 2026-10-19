# dsh-vault architecture

## Goals

`dsh-vault` backs up a DeepSeek Harness (`dsh`) setup so users can restore it after reinstall, profile reset, or moving to a new machine. This repository owns the **backend, plugin skeleton, CLI, and a minimal functional Settings UI**. Visual polish is intentionally deferred.

## Plugin shape (dsh / Cordis)

dsh loads third-party packages as Cordis plugins when they export:

- `package.json` → `dsh.bundle.patch` pointing at `cordis.patch.yml`
- host entry (`exports["."]`) with `name` + `apply(ctx)`
- optional browser entry (`exports["./client"]`) via `dsh.client`

Install:

```bash
dsh plugin --profile web add dsh-vault
# local checkout:
dsh plugin --profile web add link:$PWD
```

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
3. Preview diff (add/change/remove)  
4. User picks conflict strategy: `keep-current` | `use-backup`  
5. Automatic pre-restore snapshot (local target) for rollback  
6. Apply files  
7. Attempt `dsh plugin --profile <name> add <pkg>` for missing plugins  
8. Report manual actions (re-enter API keys, re-link `link:` plugins)

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
- Plugin reinstall shells out to the `dsh` binary — if `dsh` is missing from `PATH`, restore still applies files and lists failed plugins as manual actions.
- Settings UI registration uses `ctx.slots.inject('settings.section', …)` (current web client contract). If a future dsh release renames the slot, only `src/client/index.ts` needs updating.
- Argon2id support is interface-ready; the default runtime uses Node `scrypt` unless an argon2 hasher is injected (keeps zero native deps).
- Snapshot “remove” diffs are reported but not auto-deleted (safer default for one-click restore).

## Key paths

| Path | Role |
|---|---|
| `src/index.ts` | Cordis host plugin |
| `src/client/` | Settings UI |
| `src/core/` | collect/manifest/encrypt/restore |
| `src/storage/` | adapters |
| `src/api/` | HTTP routes |
| `src/cli/` | standalone CLI |
| `docs/FRONTEND_CONTRACT.md` | UI/API contract for a later design pass |
