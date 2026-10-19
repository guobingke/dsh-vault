# dsh-vault

Backup and restore your whole [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) setup — plugins, MCP servers, skills, settings/providers, agent presets, profile patches, and global instructions — then one-click import when you reinstall, reset a profile, or move machines.

Works with **`dsh web` and DeepSeek Harness Desktop** (same Settings UI / host APIs; install once per profile).

中文说明见 [README.zh-CN.md](./README.zh-CN.md).

## Install

Requires Node `^22.19.0 || >=24` (same floor as dsh).

### DeepSeek Harness Desktop (recommended if you use the app)

Desktop owns the reserved profile `$DSH_HOME/profiles/desktop`. Plugin activation is **not** shared with `web`.

1. Launch Desktop once (creates the profile), then **fully quit** it.
2. Install with **Desktop’s bundled** `dsh` (Tray → Terminal, or the `dsh` / `dsh.cmd` shipped next to the app). npm-global `dsh` refuses `--profile desktop`.

```bash
dsh plugin --profile desktop add dsh-vault
```

3. Reopen Desktop → **Settings → 大肥鱼备份**.

Alternatively, while Desktop is running: **Plugins** → add `dsh-vault` (same Web Plugin Manager).

Local checkout:

```bash
dsh plugin --profile desktop add link:/absolute/path/to/dsh-vault
```

### Browser / `dsh web`

```bash
dsh plugin --profile web add dsh-vault
# local checkout:
dsh plugin --profile web add link:/absolute/path/to/dsh-vault
```

Restart `dsh web`, then open **Settings → 大肥鱼备份**.

### Both surfaces

Profiles do not share plugins. Install into each profile you use:

```bash
dsh plugin --profile web add dsh-vault
dsh plugin --profile desktop add dsh-vault   # Desktop's bundled dsh; see above
```

Or print / run a guided plan:

```bash
npx dsh-vault setup --dry-run
npx dsh-vault setup --profile web
npx dsh-vault setup --profile desktop
```

### Standalone CLI

Works even if the UI will not start (shared `$DSH_HOME` data on Windows / macOS / Linux):

```bash
npm install -g dsh-vault   # or: npx dsh-vault
dsh-vault status
```

## What is backed up

| Included | Notes |
|---|---|
| Installed plugins (name / version / source) + their config | From each profile’s `package.json` + `cordis.patch.yml` (incl. `desktop` / `web`) |
| MCP servers | `mcp.json` / `mcp/**` |
| Skills | `$DSH_HOME/skills` and `$DSH_AGENTS_HOME/skills` |
| Settings & model providers | `settings.yaml` + profile patches |
| Agent presets | `.agent-presets/**` |
| Profile patches | `profiles/**` (skips `node_modules`) |
| Global instructions | `AGENTS.md` |
| Credentials / API keys | **Excluded by default**; only inside an encrypted snapshot when you opt in |

Excluded: `node_modules`, caches, and other reinstallable artifacts. Every snapshot carries a schema-versioned manifest with SHA-256 checksums.

Paths follow `$DSH_HOME` / `$DSH_AGENTS_HOME` (default `~/.dsh` and `~/.agents` on all OSes; Desktop and CLI share this home for product data).

## Storage targets

All implement one `StorageAdapter` interface:

1. **Local** — folder of `.tar.gz` (plain) or `.dshvault` (encrypted)
2. **Local encrypted** — password-based scrypt (default) or argon2id + AES-256-GCM
3. **GitHub** — push/list/pull snapshots in a private repo (token from dsh credentials / `GITHUB_TOKEN`)
4. **Cloud** — WebDAV and S3-compatible (S3 / R2 / MinIO / OSS-style endpoints)

Encryption can be toggled for remote targets too (`encryptByDefault` or per-backup).

## Quick usage

### Settings UI (web + Desktop)

**Settings → 大肥鱼备份**: Dashboard / Backup / Restore / Storage / Snapshots / Settings.

Desktop embeds the shared Web UI; the plugin’s browser half declares `dsh.client.platform: "web"` (required for Desktop as well).

**Backup destinations (per run):** a configured storage target, **any local folder** (USB / synced drive / Windows `D:\…`), or **export to a single portable archive** (`.tar.gz` / `.dshvault`).

**Restore sources:** a configured snapshot, or **import from any folder/file** (no target required). Windows cmd: use full paths or `%USERPROFILE%` — not `~`.

### CLI

```bash
dsh-vault backup --target local-default
dsh-vault backup --encrypt --password '…' --secrets
dsh-vault list
dsh-vault verify vault-20261019T025600Z-abc123 --password '…'
dsh-vault restore vault-20261019T025600Z-abc123 --use-backup
```

### Model tools / slash command

When the plugin is loaded in that profile:

- Tools: `dsh_vault_status`, `dsh_vault_backup`, `dsh_vault_list`, `dsh_vault_restore_preview`, `dsh_vault_restore`
- Slash: `/vault status|backup|list|restore …`

## Restore flow

1. Pick a snapshot from a target **or** an import path (folder / `.tar.gz` / `.dshvault`)  
2. Preview diff (add / change / remove)  
3. Choose global conflict policy and optional per-path `conflicts`  
4. Automatic pre-restore rollback snapshot  
5. Apply files, then reinstall missing plugins via the **host `pluginManager`** when available, else Desktop’s bundled `dsh` / `pnpm install` in the profile (npm-global `dsh` refuses `--profile desktop`)  
6. Per-plugin result list (`installed` / `already-present` / `failed` with reason). Restore reports **not OK** (HTTP 409) if any plugin failed; restart Desktop when prompted  
7. Local `link:`/`file:` plugins are bundled into `plugin-sources/` when the source folder exists at backup time
8. npm / GitHub plugins also pack a fallback copy of the installed package; if that exact version is later unpublished, restore installs the backup copy and reports **Installed from backup**. Plugins referenced only in `cordis.patch.yml` (not in `package.json`) are detected too

## Develop

```bash
npm install
npm test
npm run build
```

Docs:

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — backend layout, Desktop notes & limitations  
- [docs/FRONTEND_CONTRACT.md](./docs/FRONTEND_CONTRACT.md) — API/UI contract for a later visual pass  

## License

MIT
