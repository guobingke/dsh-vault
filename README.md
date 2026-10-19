# dsh-vault

Backup and restore your whole [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) setup — plugins, MCP servers, skills, settings/providers, agent presets, profile patches, and global instructions — then one-click import when you reinstall, reset a profile, or move machines.

中文说明见 [README.zh-CN.md](./README.zh-CN.md).

## Install

Requires Node `^22.19.0 || >=24` (same floor as dsh).

```bash
# into the web profile
dsh plugin --profile web add dsh-vault

# from a local checkout
dsh plugin --profile web add link:/absolute/path/to/dsh-vault
```

Also available as a standalone CLI (works even if the dsh UI will not start):

```bash
npm install -g dsh-vault   # or: npx dsh-vault
dsh-vault status
```

## What is backed up

| Included | Notes |
|---|---|
| Installed plugins (name / version / source) + their config | From profile `package.json` + `cordis.patch.yml` |
| MCP servers | `mcp.json` / `mcp/**` |
| Skills | `$DSH_HOME/skills` and `$DSH_AGENTS_HOME/skills` |
| Settings & model providers | `settings.yaml` + profile patches |
| Agent presets | `.agent-presets/**` |
| Profile patches | `profiles/**` |
| Global instructions | `AGENTS.md` |
| Credentials / API keys | **Excluded by default**; only inside an encrypted snapshot when you opt in |

Excluded: `node_modules`, caches, and other reinstallable artifacts. Every snapshot carries a schema-versioned manifest with SHA-256 checksums.

## Storage targets

All implement one `StorageAdapter` interface:

1. **Local** — folder of `.tar.gz` (plain) or `.dshvault` (encrypted)
2. **Local encrypted** — password-based scrypt (default) or argon2id + AES-256-GCM
3. **GitHub** — push/list/pull snapshots in a private repo (token from dsh credentials / `GITHUB_TOKEN`)
4. **Cloud** — WebDAV and S3-compatible (S3 / R2 / MinIO / OSS-style endpoints)

Encryption can be toggled for remote targets too (`encryptByDefault` or per-backup).

## Quick usage

### Settings UI

Open dsh web → **Settings → dsh Vault**:

- Dashboard / Backup / Restore / Storage / Snapshots / Settings

### CLI

```bash
dsh-vault backup --target local-default
dsh-vault backup --encrypt --password '…' --secrets
dsh-vault list
dsh-vault verify vault-20261019T025600Z --password '…'
dsh-vault restore vault-20261019T025600Z --use-backup
```

### Model tools / slash command

When the plugin is loaded in dsh:

- Tools: `dsh_vault_status`, `dsh_vault_backup`, `dsh_vault_list`, `dsh_vault_restore_preview`, `dsh_vault_restore`
- Slash: `/vault status|backup|list|restore …`

## Restore flow

1. Pick a snapshot from any target  
2. Preview diff (add / change / remove)  
3. Choose conflict policy: keep current **or** use backup  
4. Automatic pre-restore rollback snapshot  
5. Apply files + reinstall missing plugins via `dsh plugin add`  
6. See manual actions (e.g. re-enter API keys if secrets were excluded)

## Develop

```bash
npm install
npm test
npm run build
```

Docs:

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — backend layout & limitations  
- [docs/FRONTEND_CONTRACT.md](./docs/FRONTEND_CONTRACT.md) — API/UI contract for a later visual pass

## License

MIT
