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

The full repository URL also works: `https://github.com/guobingke/dsh-vault` (with or without `.git`). Use the repository root; don't add a trailing `/` or a path such as `/tree/main`.

`github:` and repository URLs need **git** on the machine, because pnpm calls `git ls-remote` to resolve the commit. On Windows, install [Git for Windows](https://git-scm.com/download/win) first.

If git isn't available, use a tarball for one commit. This path uses HTTPS only:

```
https://github.com/guobingke/dsh-vault/archive/<commit>.tar.gz
```

Replace `<commit>` with a hash from the commit list. To update, uninstall the plugin and add the tarball for a newer commit. Avoid `archive/refs/heads/main.tar.gz`: it works once, but adding it again after main changes fails the integrity check.

Restart Desktop when installation finishes, then open **Settings → 大肥鱼备份**. There is no build step; the built files are in the repository.

Don't enter just `dsh-vault`. The npm package with that name is unrelated.

On networks in mainland China, GitHub may be unreachable. Set a system proxy or `HTTPS_PROXY` before starting Desktop.

If installation fails, see [Installation troubleshooting](#installation-troubleshooting).

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

### Updating

The plugin page doesn't update in place. Uninstall 大肥鱼备份, add `github:guobingke/dsh-vault` again, and restart Desktop. Targets, settings and snapshots are kept in `$DSH_HOME/dsh-vault`.

To pin a branch, tag or commit, append it to the source, for example `github:guobingke/dsh-vault#main`.

### Installation troubleshooting

The plugin page sometimes reports **“没有写入权限，无法安装”** or **“安装过程中出错，原因见安装详情”**. Those messages hide the pnpm error. Open the newest log:

```
%USERPROFILE%\.dsh\profiles\desktop\.plugin-manager\logs\operation-*\pnpm.log
```

If Desktop uses another `$DSH_HOME` or runs as a different Windows user, use that account's path instead. For `dsh web`, replace `desktop` with `web`.

#### `a URL must point at a git repository or a tarball`

The address points at a GitHub page, not at the repository root or a tarball. This happens with `/tree/main`, `/blob/...` and similar links.

Use one of:

```
github:guobingke/dsh-vault
https://github.com/guobingke/dsh-vault
https://github.com/guobingke/dsh-vault.git
```

Remove the trailing `/` and anything after the repository name.

#### `ERR_PNPM_GIT_RESOLVE_FAILED` / `'git' is not recognized`

The DSH process can't find `git`. On Windows this often means Desktop is running under a different account (for example, `Administrator`) whose `PATH` doesn't include Git, or that Desktop was started before Git was installed.

Check from the same Windows account that runs DSH:

```
where.exe git
```

If nothing is printed, install Git for Windows and make sure its `cmd` directory is on `PATH`. Then quit DSH completely, including the tray process, and start it again. A running process doesn't pick up environment changes.

Git installed for your normal user isn't added to `Administrator`'s `PATH`. If a new terminal finds git but DSH still doesn't, sign out and back in, or reboot once.

pnpm may suggest `git config --global url."git@github.com:".insteadOf ...`. That switches HTTPS to SSH; it does not fix a missing `git` command. If `where.exe git` finds Git but GitHub's HTTPS endpoint is blocked, then that SSH setup can help, provided the account also has a GitHub SSH key.

Without Git, use the commit tarball URL above.

#### `ERR_PNPM_EPERM` on `node_modules\dsh-vault`

Windows reports `EPERM: operation not permitted, rename` when pnpm tries to replace the existing `node_modules\dsh-vault` entry. This usually means dsh-vault was previously installed with `link:` and the entry is a junction or symlink to a local source folder. The folder ACL is often fine; the plugin page simply reports it as "no write permission".

1. If dsh-vault is listed on the plugin page, uninstall it first. If that fails, quit DSH completely, including the tray process.
2. Open Command Prompt (`cmd`), then check for a link:

```
dir /AL "%USERPROFILE%\.dsh\profiles\desktop\node_modules"
```

Look for a line containing `dsh-vault` and `<JUNCTION>` or `<SYMLINKD>`.

3. In the same window, remove only the link. Don't add `/S`:

```
rmdir "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-vault"
```

`rmdir` without `/S` removes the junction or symlink itself, not the folder it points to. If the entry is a normal non-empty folder, the command fails instead of emptying it.

4. Start DSH and install again.

Don't delete the source folder or the whole `node_modules`. If the entry isn't a link, check the pnpm log again; a locked file or an ACL problem will be named there.

When filing an issue, include the source you entered and the last part of `pnpm.log`.

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

### Moving between Windows and Linux/macOS

A snapshot can cross operating systems: Windows to Ubuntu, macOS to Windows, and so on. Configuration, skills, presets, MCP servers and plugins that come from npm or GitHub come across. Local plugin paths do not, because `C:\Users\you\plugins\x` has no meaning on Linux.

What happens on the new machine:

- The preview says which system made the snapshot and warns that local paths will be skipped.
- Local plugins that were copied into the snapshot are re-linked from the copy under `$DSH_HOME/plugin-sources/`.
- Local plugins with no copy fail individually and are listed with a reason. Everything else still restores; the profile stays installable.
- Entries pointing at the other system's drive paths are removed from the profile `package.json` and from `dsh.profile.bundles`. This happens even if you turn plugin restore off.
- `pnpm-lock.yaml` from the other machine is not used with `--frozen-lockfile`, since the platform-specific packages in it would not match.

`pnpm` does not need to be on `PATH`. If it is installed globally (nvm, npm prefix, Desktop's bundled runtime), dsh-vault runs its `bin/pnpm.mjs` with the current `node`.

On Ubuntu with nvm, `sudo npm install -g pnpm` fails with `sudo: 'npm': command not found`, because `sudo` does not see nvm's path. Install without `sudo`:

```bash
npm install -g pnpm
hash -r
```

`pnpm -v` can still say command not found afterwards, if the nvm bin folder was not reloaded in that shell. That does not block a restore: when the `pnpm` command is missing, dsh-vault looks for the package under `<node prefix>/lib/node_modules/pnpm` itself.

**Snapshots made before this change have no plugin copies.** There is nothing to restore for a local plugin that only existed on the old machine. Back up again on the original machine with the current version so `plugin-sources/` is included, then restore that snapshot.

The current version tells you this at backup time: if the snapshot contains plugins that would not survive a move (a local path with no saved copy, or a name with no recorded install source), the result lists them separately and the CLI prints a warning. Turn on plugin copies and back up again then, rather than discovering it on the new machine.

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

### Hardening (2026-10-20 audit)

See [docs/SECURITY-FIXES-2026-10-20.md](docs/SECURITY-FIXES-2026-10-20.md) for every finding, its fix and its test.

- **The HTTP API needs your dsh session.** Every `/api/dsh-vault/*` route, reads included, goes through dsh's own login check: the signed `HttpOnly`, `SameSite=Strict` cookie you get when you open the launch URL (`/?token=…`). The plugin adds its own checks on top. The `Host` must be loopback (this blocks DNS rebinding). A cross-site `Origin` or `Sec-Fetch-Site` is refused. Every request must carry the `x-dsh-vault-request: 1` header, and writes must be `application/json`. If a dsh build has no session service, the API turns itself off (`503`). The CLI and model tools don't use HTTP, so none of this affects them.
- **Paths from the browser stay in approved folders.** Export targets, one-shot folders, import files and the folder browser are limited to:
  - your home folder,
  - removable or extra drives (`/media`, `/mnt`, `/Volumes`, and every Windows drive except the system drive),
  - folders you picked in the system dialog.

  Paths are checked after links are resolved. System folders, credential folders (`~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.kube`, `~/.docker`, …) and the dsh-vault data folder are always refused, for browsing and reading too, and are left out of folder listings. An import file must be a `.tar.gz` or `.dshvault` archive (checked after links are resolved). An existing export file is never overwritten silently: the UI asks first.
- **Restore is link-safe and all-or-nothing.** Before anything is written, every target path is checked. A symlink, a junction or a file sitting where a folder should be makes the whole restore stop with nothing changed. If a write fails partway, every change is reverted. Plugin install failures are a partial success on purpose: the restored config stays, failures are listed and can be retried. If the plugin step itself aborts, the restored files are rolled back too (`RESTORE_ROLLED_BACK`). Archives that contain links or device entries are refused, and decompression has size and entry-count limits.
- **Credentials need three things to be written:** you turn on "Restore credentials", the manifest says the snapshot has credentials, and the snapshot really is encrypted. A plaintext snapshot can't claim otherwise. Credential files are found by one shared, case-insensitive rule: `.env*`, `.npmrc`, `.pypirc`, `.netrc`, `credentials.*`, `auth.json`, `*.pem`, `*.key`, SSH keys and more. When credentials will be written, the pre-restore rollback is encrypted. The result lists which credential files were written.
- **Plaintext backups strip URL credentials.** `https://user:TOKEN@…` in plugin sources, profile `package.json` and lockfiles is reduced to `https://…`. Job results and plugin logs are redacted too. A private git plugin then needs its credentials again on the new machine.
- **Plugin sources from a snapshot need your OK.** A plugin that would be downloaded from a git, tarball or URL source is listed in the restore dialog. Each one is checked by default when the snapshot comes from one of your storage targets, and unchecked when it comes from an imported file. An unchecked plugin installs from the copy saved in the snapshot if there is one; otherwise it is skipped. The CLI equivalent is `--allow-plugin-source profile:name` or `--allow-remote-plugins`. All installs run `pnpm` with `--ignore-scripts`. The browser approval is tied to the exact source shown, so a snapshot that changes the source afterwards isn't covered. Sources other than npm / npmmirror and github.com are flagged and start unchecked. Restores never install through the host's plugin manager, because it can't be told to skip scripts. Every install process also gets `npm_config_ignore_scripts=true`. There are no signature checks.
- **Crash during a restore.** If dsh-vault stops while restoring files, the next start shows a banner offering the pre-restore rollback snapshot (or Dismiss).
- **Import size limit.** Snapshots are unpacked in memory, up to a quarter of installed RAM (256 MiB to 2 GiB; `DSH_VAULT_MAX_ARCHIVE_BYTES` overrides). The Restore tab shows the limit.
- **Import from a folder.** A folder works if it holds `.tar.gz` / `.dshvault` snapshots or an extracted plaintext snapshot (`manifest.json` + `files/`). Links inside it are refused. A file or folder that isn't a snapshot gets a clear error instead of HTTP 500.
- **One operation at a time.** Backups, restores and plugin retries from the UI, the schedule, the tools and the CLI share a lock file. A second operation waits, then fails with `VAULT_BUSY`. The lock names its owner (host, pid, random id) and is kept fresh while the operation runs; it is only taken over when that process is gone (same machine) or has stopped refreshing it (another machine), and an operation only ever removes its own lock.

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
