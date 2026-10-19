<div align="center">

# dsh-vault · 大肥鱼备份

Back up your whole DeepSeek Harness (`dsh`) setup and bring it back on another machine: same plugins, same versions, same config.

**English** · [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![dsh](https://img.shields.io/badge/dsh-Desktop%20%2B%20web-555)

<img src="docs/screenshots/overview-dark.png" width="760" alt="大肥鱼备份 overview in dsh Settings">

</div>

## Why

Moving `dsh` to a new computer usually means reinstalling a dozen plugins by hand, guessing which versions you had, re-adding MCP servers, copying skills and presets around, and re-entering model providers. Some plugins come from GitHub forks or local folders and won't install the same way twice.

dsh-vault turns that into: back up on the old machine, restore on the new one, restart.

It lives inside dsh as a Settings page (**Settings → 大肥鱼备份**), works in both DeepSeek Harness Desktop and `dsh web`, and ships a CLI that works even when the dsh UI won't start.

## Features

- **Whole `$DSH_HOME` backup** with sensible excludes (`node_modules`, caches, logs, chat history). Run `dsh-vault excludes` to see the exact list.
- **Same-version plugin reinstall.** Plugins are reinstalled from their original spec (npm version, `github:` ref, `link:` path) using Desktop's bundled pnpm, so you don't need Node or pnpm installed system-wide.
- **Plugin copies.** The installed package of each plugin can be saved into the snapshot as a fallback, for when a version gets unpublished, a GitHub repo disappears, or a local folder doesn't exist on the new machine. You choose per plugin; plugins that most likely need a copy are flagged.
- **Storage:** local folder (plain `.tar.gz` or AES-256-GCM encrypted `.dshvault`), a private GitHub repo, WebDAV (e.g. 坚果云/Nextcloud), and S3-compatible storage (S3, R2, MinIO, OSS).
- **Single-file export** to a USB drive or any folder, and import from any folder or file without configuring a target first.
- **Diff preview before restore**, grouped and collapsible, with per-file conflict choices.
- **Rollback snapshot** taken automatically before every restore.
- **Real progress** for backup, restore and plugin installation.
- **Retry failed plugins** without rewriting your config.
- **Auto backup** on a schedule.
- **Chat history and workspaces are deliberately not migrated.** They're large, machine-specific, and contain absolute paths.
- Windows, macOS and Linux.

## Screenshots

| Backup: choose which plugins get a saved copy | Storage targets |
|---|---|
| <img src="docs/screenshots/backup-plugin-copies.png" alt="Backup page with plugin copy list"> | <img src="docs/screenshots/storage-targets.png" alt="Storage targets"> |
| **Restore: diff preview** | **Restore in progress** |
| <img src="docs/screenshots/restore-diff-groups.png" alt="Restore diff preview"> | <img src="docs/screenshots/restore-progress.png" alt="Restore progress bar"> |
| **After restore** | **Built-in folder browser** |
| <img src="docs/screenshots/restore-complete.png" alt="Restore summary with restart notice"> | <img src="docs/screenshots/folder-browser.png" alt="Folder browser"> |

If some plugins fail to install, the summary says how many and offers a retry instead: [restore-partial.png](docs/screenshots/restore-partial.png). Light theme follows dsh: [overview-light.png](docs/screenshots/overview-light.png).

## Install

### From the plugin page (recommended)

In DeepSeek Harness Desktop (or `dsh web`), open **Plugins → 添加插件** and enter:

```
github:guobingke/dsh-vault
```

Restart Desktop when it finishes, then open **Settings → 大肥鱼备份**. No build step is needed: the built files are committed to the repo.

The full repository URL works too: `https://github.com/guobingke/dsh-vault` (with or without `.git`). Don't add a trailing `/` or a `/tree/...` path, because the plugin page rejects those.

These forms need **git** on the machine, because pnpm asks git which commit to fetch. On Windows, install [Git for Windows](https://git-scm.com/download/win) first. Without git, enter a tarball URL for one commit instead. It installs with no git at all:

```
https://github.com/guobingke/dsh-vault/archive/<commit>.tar.gz
```

Replace `<commit>` with a commit hash from the repo's commit list. To update, uninstall and add the URL of a newer commit. Avoid `archive/refs/heads/main.tar.gz`: it installs once, but adding it again after main changes fails with an integrity error.

Don't enter just `dsh-vault`. That name on npm belongs to an unrelated package.

On networks in mainland China, GitHub may be unreachable. Set a system proxy (or `HTTPS_PROXY`) before starting Desktop.

**Updating.** dsh's plugin page doesn't update plugins in place. To get the latest version, uninstall 大肥鱼备份 on the plugin page, add `github:guobingke/dsh-vault` again, and restart Desktop. Your targets, settings and snapshots live in `$DSH_HOME/dsh-vault` and are kept. To pin a version, add a branch, tag or commit, e.g. `github:guobingke/dsh-vault#main`.

### From the command line

With Desktop fully quit, use Desktop's bundled `dsh` (Tray → Terminal):

```bash
dsh plugin --profile desktop add github:guobingke/dsh-vault
```

For `dsh web`:

```bash
dsh plugin --profile web add github:guobingke/dsh-vault
```

The npm-global `dsh` refuses `--profile desktop`. Profiles don't share plugins, so install into each profile you use.

### From a local clone (for development)

Requires Node `^22.19.0 || >=24`.

```bash
git clone https://github.com/guobingke/dsh-vault.git
cd dsh-vault
npm install
npm run build
```

Then add `link:/absolute/path/to/dsh-vault` on the plugin page, or with `dsh plugin --profile desktop add link:…`. To update: `git pull`, `npm run build`, restart Desktop.

### CLI only

The CLI is `node lib/cli/index.js` inside the installed package or a clone (`npm link` puts `dsh-vault` on your PATH). It reads `$DSH_HOME` directly and doesn't need dsh to be running.

## Moving to a new machine

**Old machine**

1. Settings → 大肥鱼备份 → **备份**.
2. Pick a destination: a USB folder, export to a single file, or a GitHub/WebDAV/S3 target.
3. Tick **加密** if you also want API keys and credentials included.
4. Check the plugin copy list. Keep copies for anything installed from GitHub or a local folder.

**New machine**

1. Install DeepSeek Harness Desktop, open it once, quit.
2. Install dsh-vault from the plugin page (`github:guobingke/dsh-vault`).
3. Settings → 大肥鱼备份 → **恢复**. Choose the snapshot, or point it at the folder/file you copied over.
4. Click **预览差异**, review the changes, then **恢复**.
5. Fully quit Desktop and reopen it when the summary asks you to.

If some plugins failed (offline, registry blocked), the summary says how many. You can still restart to load everything else, and click **重试失败的插件** once the network is fixed.

CLI equivalent:

```bash
# old machine
dsh-vault backup --to-file /media/usb/dsh.dshvault --encrypt --secrets --password '…'
# new machine
dsh-vault restore --from /media/usb/dsh.dshvault --password '…' --profile all
```

## What gets backed up

| Item | Backed up | Notes |
|---|---|---|
| Plugin list with exact specs and versions | Yes | Every profile's `package.json` |
| Plugin config | Yes | `cordis.patch.yml` per profile |
| Plugin package copies | Optional | Per-plugin choice |
| MCP servers | Yes | `mcp.json`, `mcp/` |
| Skills | Yes | `$DSH_HOME/skills` and `$DSH_AGENTS_HOME/skills` |
| Settings and model providers | Yes | `settings.yaml` |
| Agent presets | Yes | |
| Global instructions | Yes | `AGENTS.md` |
| API keys and credentials | Encrypted backups only | Needs `--secrets` with `--encrypt` |
| `node_modules` | No | Reinstalled at the recorded versions |
| Chat history | No | Intentional |
| Workspaces | No | Intentional; they hold machine-specific paths |
| Caches and logs | No | |
| dsh-vault's own targets and snapshots | No | Targets hold credentials; re-add per machine |

## Security

- Credentials are never written to a plain backup. They're included only when you both encrypt and opt in to secrets.
- Encryption is AES-256-GCM with a key derived from your password (scrypt by default). The password isn't stored anywhere; lose it and the snapshot can't be opened.
- Storage target settings and tokens (GitHub, WebDAV, S3) stay on the machine and are never put in a snapshot. Re-add targets on the new machine, or restore from a file/folder.
- The settings page never sends stored passwords or tokens back to the browser.
- Each snapshot carries a manifest with SHA-256 checksums. `dsh-vault verify` checks them.

## CLI reference

```
dsh-vault setup [--profile web|desktop|all] [--package <spec>] [--dry-run]
dsh-vault backup [--target <id> | --to-file <path>] [--encrypt] [--password <pass>] [--secrets]
                 [--no-plugin-copies] [--no-copy <profile:name>]... [--save-copy-choice]
dsh-vault plugins [--no-registry] [--json]
dsh-vault plugins --copy all|none | --exclude <profile:name>... | --include <profile:name>...
                  [--restore-order source-first|copy-first]
dsh-vault restore <snapshotId> [--target <id>] [--password <pass>] [--keep|--use-backup]
                  [--plugin-order source-first|copy-first]
dsh-vault restore --from <file> [--profile desktop|web|all] [--dsh-desktop-dir <dir>]
                  [--password <pass>] [--no-plugins]
dsh-vault retry-plugins
dsh-vault diff <homeA> <homeB> [--agents-a <dir>] [--agents-b <dir>] [--secrets] [--json]
dsh-vault installers [--dsh-desktop-dir <dir>]
dsh-vault excludes
dsh-vault list [--target <id>]
dsh-vault verify <snapshotId> [--target <id>] [--password <pass>]
dsh-vault status
```

Global options: `--home <path>` uses a different `$DSH_HOME` (the agents root moves to `<home>/../.agents` unless you pass `--agents-home <dir>`), which makes sandboxed test restores easy.

`restore` exits with code 2 when files were restored but a plugin failed to install. `diff` exits with 1 when the homes differ. `installers` shows which node, pnpm, git and dsh a restore would use.

## FAQ

**A plugin shows 包不可用 after restore.**
Desktop loads plugins at startup. Fully quit Desktop (from the tray, not just the window) and reopen it.

**dsh-purge (or a similar plugin) isn't doing anything on the new machine.**
Some plugins apply their settings only when you press **应用** in their own page. Open it and press 应用 once.

**GitHub targets or `github:` plugins time out in mainland China.**
Configure a proxy, e.g. `git config --global http.proxy http://127.0.0.1:7897`, or set `HTTPS_PROXY` before starting dsh. A saved plugin copy also lets the restore skip GitHub entirely.

**A plugin was skipped: "no recorded install source".**
The backup only saw the plugin's name (in the bundle list or `cordis.patch.yml`), not where it was installed from, and had no saved copy. dsh-vault won't install a plugin from npm by name alone, because a different package with the same name could be installed instead. Install it by hand, or back up again with plugin copies turned on.

**Does a restore update dsh-vault itself?**
No. The restore skips dsh-vault and keeps this machine's own installation, including its `link:` path. Update it from the plugin page (uninstall, then add `github:guobingke/dsh-vault` again).

**Can I restore onto a machine that already has a dsh setup?**
Yes. The diff preview shows what will change, you choose per conflict, and a rollback snapshot is taken first.

## Contributing

Issues and pull requests are welcome.

```bash
npm install
npm test        # needs Node 24
npm run build
npm run check:lib   # lib/ is committed; commit the rebuilt lib/ with your change
```

Architecture notes are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the UI contract is in [docs/FRONTEND_CONTRACT.md](docs/FRONTEND_CONTRACT.md).

If dsh-vault saved you an afternoon of reinstalling plugins, a star helps others find it.

## License

[MIT](./LICENSE) © 2026 dsh-vault contributors
