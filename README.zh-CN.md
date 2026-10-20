<div align="center">

# dsh-vault · 大肥鱼备份

把整套 DeepSeek Harness（`dsh`）环境备份下来，在另一台电脑上原样恢复：插件相同，版本相同，配置相同。

[English](./README.md) · **简体中文**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![dsh](https://img.shields.io/badge/dsh-Desktop%20%2B%20web-555)

<img src="docs/screenshots/overview-dark.png" width="760" alt="dsh 设置中的大肥鱼备份概览">

</div>

## 为什么做这个

把 dsh 搬到新电脑，通常意味着：一个个手动重装插件，回忆当时装的是哪个版本，重新添加 MCP，来回拷技能和预设，再把模型服务商重新填一遍。有些插件来自 GitHub fork 或本地文件夹，换台机器就装不回来。

dsh-vault 把这件事变成三步：旧电脑上备份，新电脑上恢复，重启。

它是 dsh 里的一个设置页（**设置 → 大肥鱼备份**），DeepSeek Harness Desktop 和 `dsh web` 都能用；另外带一个命令行，dsh 界面打不开时也能用。

## 功能

- **备份整个 `$DSH_HOME`**，自动排除 `node_modules`、缓存、日志和聊天记录。完整排除列表见 `dsh-vault excludes`。
- **按原版本重装插件**。按原来的来源（npm 版本、`github:` 引用、`link:` 路径）重装，使用 Desktop 自带的 pnpm，系统里不用装 Node 或 pnpm。
- **插件副本**。可以把已安装的插件包一并存进快照。版本被撤回、GitHub 仓库没了、新电脑上没有那个本地文件夹时，就从副本安装。逐个插件选择，最可能需要副本的会被标出来。
- **存储位置**：本地文件夹（明文 `.tar.gz` 或 AES-256-GCM 加密的 `.dshvault`）、GitHub 私有仓库、WebDAV（坚果云、Nextcloud 等）、S3 兼容存储（S3、R2、MinIO、OSS）。
- **导出单个文件**到 U 盘或任意目录；恢复时可直接从任意文件夹或文件导入，不需要先配置存储位置。
- **恢复前预览差异**，按类别分组、可折叠，冲突可以逐个文件选择。
- **每次恢复前自动生成回滚快照**。
- **真实进度**：备份、恢复、插件安装都有进度条。
- **只重试失败的插件**，不会重写配置。
- **定时自动备份**。
- **聊天记录和工作区刻意不迁移**：体积大、和机器绑定，而且包含绝对路径。
- 支持 Windows、macOS、Linux。

## 截图

| 备份：选择哪些插件保存副本 | 存储位置 |
|---|---|
| <img src="docs/screenshots/backup-plugin-copies.png" alt="备份页的插件副本列表"> | <img src="docs/screenshots/storage-targets.png" alt="存储位置"> |
| **恢复：差异预览** | **恢复进行中** |
| <img src="docs/screenshots/restore-diff-groups.png" alt="恢复差异预览"> | <img src="docs/screenshots/restore-progress.png" alt="恢复进度条"> |
| **恢复完成** | **内置文件夹浏览器** |
| <img src="docs/screenshots/restore-complete.png" alt="恢复结果和重启提示"> | <img src="docs/screenshots/folder-browser.png" alt="文件夹浏览器"> |

如果有插件安装失败，结果会写明失败个数并提供重试：[restore-partial.png](docs/screenshots/restore-partial.png)。浅色主题跟随 dsh：[overview-light.png](docs/screenshots/overview-light.png)。

## 安装

### 在插件页添加（推荐）

在 DeepSeek Harness Desktop（或 `dsh web`）中打开 **插件 → 添加插件**，填入：

```
github:guobingke/dsh-vault
```

也可以填完整仓库地址 `https://github.com/guobingke/dsh-vault`（带不带 `.git` 都行）。地址要指向仓库根目录，末尾不要加 `/`，也不要带 `/tree/main` 这类路径。

`github:` 和完整仓库地址都要求本机装有 **git**，因为 pnpm 要先执行 `git ls-remote` 查提交。Windows 请先安装 [Git for Windows](https://git-scm.com/download/win)。

没有 git 时，可以改用某个提交的压缩包，只走 HTTPS：

```
https://github.com/guobingke/dsh-vault/archive/<提交>.tar.gz
```

把 `<提交>` 换成仓库提交列表里的提交哈希。更新时卸载插件，再填较新提交的压缩包地址。不要用 `archive/refs/heads/main.tar.gz`：第一次能装上，main 更新后再添加会报校验错误。

安装完成后重启 Desktop，打开 **设置 → 大肥鱼备份**。不需要构建，构建产物已提交在仓库里。

不要只填 `dsh-vault`，npm 上这个名字属于另一个无关的包。

国内网络可能连不上 GitHub，请先开系统代理或设置 `HTTPS_PROXY`，再启动 Desktop。

安装失败时见[安装失败排查](#安装失败排查)。

### 命令行安装

完全退出 Desktop 后，用 Desktop 自带的 `dsh`（托盘 → 终端）：

```bash
dsh plugin --profile desktop add github:guobingke/dsh-vault
```

`dsh web`：

```bash
dsh plugin --profile web add github:guobingke/dsh-vault
```

npm 全局安装的 `dsh` 不接受 `--profile desktop`。不同 profile 之间插件不共享，用哪个就装到哪个。

### 从本地克隆安装（开发用）

需要 Node `^22.19.0 || >=24`。

```bash
git clone https://github.com/guobingke/dsh-vault.git
cd dsh-vault
npm install
npm run build
```

然后在插件页添加 `link:/absolute/path/to/dsh-vault`，或用 `dsh plugin --profile desktop add link:…`。更新：`git pull`，`npm run build`，重启 Desktop。

### 只用命令行

命令行是已安装包或克隆目录里的 `node lib/cli/index.js`（执行 `npm link` 后可直接用 `dsh-vault`）。它直接读取 `$DSH_HOME`，不需要 dsh 在运行。

### 更新

插件页不支持原地更新。卸载大肥鱼备份，再添加一次 `github:guobingke/dsh-vault`，然后重启 Desktop。存储位置、设置和快照保存在 `$DSH_HOME/dsh-vault`，不会丢。

想固定分支、标签或提交，可以在来源后面追加，例如 `github:guobingke/dsh-vault#main`。

### 安装失败排查

插件页有时只显示 **「没有写入权限，无法安装」** 或 **「安装过程中出错，原因见安装详情」**。具体错误要看最新的 pnpm 日志：

```
%USERPROFILE%\.dsh\profiles\desktop\.plugin-manager\logs\operation-*\pnpm.log
```

如果 Desktop 使用了别的 `$DSH_HOME`，或用另一个 Windows 账户运行，就去看那个账户下的路径。用 `dsh web` 时，把路径里的 `desktop` 换成 `web`。

#### 提示 `a URL must point at a git repository or a tarball`

填的是 GitHub 网页地址，不是仓库根地址或压缩包。常见于粘贴了 `/tree/main`、`/blob/...` 这类链接。

改成下面任意一种：

```
github:guobingke/dsh-vault
https://github.com/guobingke/dsh-vault
https://github.com/guobingke/dsh-vault.git
```

去掉末尾的 `/`，也去掉仓库名后面的路径。

#### 提示 `ERR_PNPM_GIT_RESOLVE_FAILED` / `'git' 不是内部或外部命令`

DSH 进程找不到 `git`。Windows 上常见的原因是 Desktop 跑在另一个账户下（例如 `Administrator`），那个账户的 `PATH` 里没有 Git；也可能是在装 Git 之前就已经启动了 Desktop。

在运行 DSH 的同一个 Windows 账户里检查：

```
where.exe git
```

没有输出就先安装 Git for Windows，并确认 Git 的 `cmd` 目录在 `PATH` 里。然后完全退出 DSH（包括托盘进程）再重新打开。已经运行的进程不会重新读取环境变量。

普通账户里装的 Git 不会自动加进 `Administrator` 的 `PATH`。如果新开的终端能找到 git、DSH 还是找不到，注销后重新登录，或者重启一次。

pnpm 可能会提示 `git config --global url."git@github.com:".insteadOf ...`。那是把 HTTPS 换成 SSH，不能解决 git 命令不存在的问题。如果 `where.exe git` 能找到 Git，只是 GitHub 的 HTTPS 连不上，再按这个提示改用 SSH，并先给该账户配好 GitHub SSH key。

没有 Git 就用上面的提交压缩包地址。

#### 提示 `ERR_PNPM_EPERM`，路径是 `node_modules\dsh-vault`

pnpm 要替换已有的 `node_modules\dsh-vault` 时，Windows 报 `EPERM: operation not permitted, rename`。多数情况是以前用 `link:` 装过，这个位置是指向本地源码的 Junction 或符号链接。目录权限通常没问题，插件页只是把它概括成了「没有写入权限」。

1. 如果插件页里还列着大肥鱼备份，先卸载。卸载也失败的话，完全退出 DSH，包括托盘进程。
2. 打开命令提示符（`cmd`），检查是不是链接：

```
dir /AL "%USERPROFILE%\.dsh\profiles\desktop\node_modules"
```

输出里找包含 `dsh-vault` 的那一行，类型应为 `<JUNCTION>` 或 `<SYMLINKD>`。

3. 在同一个窗口里只删这个链接，不要加 `/S`：

```
rmdir "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-vault"
```

不带 `/S` 的 `rmdir` 删除的是 Junction 或符号链接本身，不会删掉它指向的目录。如果这个位置是普通的非空文件夹，命令会失败，不会清空里面的文件。

4. 重新打开 DSH，再装一次。

不要删除链接指向的源码目录，也不要删除整个 `node_modules`。如果那里不是链接，就回到 `pnpm.log` 看具体报错，通常会写明哪个文件被占用，或者哪条 ACL 不允许。

提 issue 时附上你填的来源和 `pnpm.log` 的最后一段。

## 迁移到新电脑

**旧电脑**

1. 设置 → 大肥鱼备份 → **备份**。
2. 选择目标：U 盘目录、导出为单个文件，或 GitHub / WebDAV / S3。
3. 如果要连 API Key 和凭据一起带走，勾选 **加密**。
4. 看一眼插件副本列表。从 GitHub 或本地文件夹装的插件，建议保留副本。

**新电脑**

1. 安装 DeepSeek Harness Desktop，打开一次后退出。
2. 在插件页添加 `github:guobingke/dsh-vault`。
3. 设置 → 大肥鱼备份 → **恢复**。选择快照，或指向拷过来的文件夹/文件。
4. 点 **预览差异**，确认变更后点 **恢复**。
5. 按结果提示完全退出 Desktop 再重新打开。

如果有插件安装失败（离线、源被墙），结果会写明失败个数；可以先重启加载其余内容，网络恢复后再点 **重试失败的插件**。

### Windows 与 Linux / macOS 之间迁移

快照可以跨系统恢复：Windows 备份拿到 Ubuntu 上、macOS 备份拿到 Windows 上都行。配置、skills、presets、MCP 服务，以及来自 npm 或 GitHub 的插件都会还原。本地路径的插件不行，`C:\Users\you\plugins\x` 在 Linux 上没有意义。

新电脑上会这样处理：

- 预览页会写明快照来自哪个系统，并提示本地路径会被跳过。
- 快照里带副本的本地插件，会重新链接到 `$DSH_HOME/plugin-sources/` 下的副本。
- 没有副本的本地插件单独失败并给出原因，其余内容照常恢复，配置档案不会因此装不上。
- 指向另一系统盘符的条目会从 `package.json` 和 `dsh.profile.bundles` 里删除；即使你关掉「恢复插件」也会删。
- 另一台机器的 `pnpm-lock.yaml` 不会被当作 `--frozen-lockfile` 使用，里面含有对不上的平台包。

`pnpm` 不需要出现在 `PATH` 里。只要它是全局安装的（nvm、npm 前缀、Desktop 自带运行时），dsh-vault 会用当前的 `node` 直接运行它的 `bin/pnpm.mjs`。

Ubuntu 上用 nvm 装 Node 时，`sudo npm install -g pnpm` 会失败——`sudo` 拿不到 nvm 的路径，报 `sudo: 'npm': command not found`。去掉 `sudo` 重装即可：

```bash
npm install -g pnpm
hash -r
```

装完 `pnpm -v` 仍然可能提示「找不到命令」，因为 nvm 的 bin 目录有时没有被每个 shell 重新加载。这不影响恢复：找不到 `pnpm` 命令时，dsh-vault 会自己去 `<node 前缀>/lib/node_modules/pnpm` 里找它。

**改动之前做的快照里没有插件副本。** 那些只存在于旧机器上的本地插件，没有任何文件可还原。请回原机用当前版本重新备份一次（这样才会带上 `plugin-sources/`），再拿新快照恢复。

命令行等价操作：

```bash
# 旧电脑
dsh-vault backup --to-file /media/usb/dsh.dshvault --encrypt --secrets --password '…'
# 新电脑
dsh-vault restore --from /media/usb/dsh.dshvault --password '…' --profile all
```

## 备份内容

| 内容 | 是否备份 | 说明 |
|---|---|---|
| 插件列表（精确来源和版本） | 是 | 各 profile 的 `package.json` |
| 插件配置 | 是 | 各 profile 的 `cordis.patch.yml` |
| 插件包副本 | 可选 | 逐个插件选择 |
| MCP 服务 | 是 | `mcp.json`、`mcp/` |
| 技能 | 是 | `$DSH_HOME/skills` 和 `$DSH_AGENTS_HOME/skills` |
| 设置和模型服务商 | 是 | `settings.yaml` |
| Agent 预设 | 是 | |
| 全局指令 | 是 | `AGENTS.md` |
| API Key 和凭据 | 仅加密备份 | 需要同时使用 `--secrets` 和 `--encrypt` |
| `node_modules` | 否 | 按记录的版本重装 |
| 聊天记录 | 否 | 刻意不迁移 |
| 工作区 | 否 | 刻意不迁移，里面是本机路径 |
| 缓存和日志 | 否 | |
| dsh-vault 自己的存储位置和快照 | 否 | 存储位置含凭据，新电脑上重新添加 |

## 安全

- 凭据永远不会写进明文备份。只有同时选择加密并勾选包含凭据时才会带上。
- 加密方式为 AES-256-GCM，密钥由密码派生（默认 scrypt）。密码不会保存在任何地方，忘了就打不开。
- 存储位置的配置和令牌（GitHub、WebDAV、S3）只留在本机，不会进入快照。新电脑上重新添加，或直接从文件/文件夹恢复。
- 设置页不会把已保存的密码或令牌回传给浏览器。
- 每个快照都带有 SHA-256 校验清单，`dsh-vault verify` 可以检查。

### 安全加固（2026-10-20 审计）

每个问题的修复方式和对应测试见 [docs/SECURITY-FIXES-2026-10-20.md](docs/SECURITY-FIXES-2026-10-20.md)。

- **HTTP 接口要求 dsh 登录。** 所有 `/api/dsh-vault/*` 路由（包括只读的）都先经过 dsh 自己的登录校验：打开启动链接（`/?token=…`）后拿到的签名 Cookie，带 `HttpOnly` 和 `SameSite=Strict`。插件在此之上还有自己的检查：
  - `Host` 必须是本机回环地址，防 DNS 重绑定；
  - 跨站的 `Origin` 或 `Sec-Fetch-Site` 一律拒绝；
  - 每个请求都要带 `x-dsh-vault-request: 1` 请求头，写操作必须是 `application/json`。

  如果某个 dsh 版本没有登录服务，接口直接关闭（`503`）。命令行和模型工具不走 HTTP，不受影响。
- **浏览器传来的路径只能在批准的文件夹内。** 导出文件、一次性文件夹、导入文件和文件夹浏览器只能用这些位置：
  - 主目录；
  - 可移动或额外的磁盘（`/media`、`/mnt`、`/Volumes`，以及 Windows 上除系统盘以外的所有盘）；
  - 你在系统对话框里选过的文件夹。

  路径在解析链接之后才检查。系统目录、凭据目录（`~/.ssh`、`~/.gnupg`、`~/.aws`、`~/.kube`、`~/.docker` 等）和大肥鱼备份自己的数据目录一律拒绝，浏览和读取也不行，文件夹列表里也不会显示。导入文件必须是 `.tar.gz` 或 `.dshvault` 归档（解析链接之后检查）。已有的导出文件不会被悄悄覆盖，界面会先问你。
- **恢复不跟随链接，而且要么全部成功、要么完全不改。** 写入前会先检查每个目标路径。只要遇到符号链接、Junction，或者本该是文件夹的位置是个文件，整个恢复就停下，什么都不改。写到一半出错时，已做的修改全部撤销。插件安装失败按设计算部分成功：已恢复的配置保留，失败项会列出并可重试；如果插件阶段本身中断，已恢复的文件也会回滚（`RESTORE_ROLLED_BACK`）。包含链接或设备条目的归档会被拒绝，解压也有大小和条目数上限。
- **写入凭据必须三个条件同时满足：** 你打开「恢复凭据」、清单声明快照包含凭据、快照确实是加密的。明文快照无法冒充。凭据文件由同一套不区分大小写的规则识别：`.env*`、`.npmrc`、`.pypirc`、`.netrc`、`credentials.*`、`auth.json`、`*.pem`、`*.key`、SSH 私钥等。会写入凭据时，恢复前的回滚快照一定加密。结果里会列出写入了哪些凭据文件。
- **明文备份会去掉 URL 里的凭据。** 插件来源、档案 `package.json` 和锁文件中的 `https://user:TOKEN@…` 会改成 `https://…`。任务结果和插件日志同样脱敏。私有 git 插件到新电脑后需要重新配置凭据。
- **快照里的插件来源要你确认。** 要从 git、压缩包或 URL 下载的插件会列在恢复对话框里。快照来自你自己的存储位置时默认勾选，来自导入文件时默认不勾选。没勾选的插件，快照里有副本就用副本安装，没有就跳过。命令行对应 `--allow-plugin-source profile:name` 或 `--allow-remote-plugins`。所有 `pnpm` 安装都带 `--ignore-scripts`。 浏览器里的确认绑定到当时显示的具体来源，快照之后改了来源就不算数。npm / npmmirror 和 github.com 以外的来源会标出警告，默认不勾选。恢复时不再通过宿主的插件管理器安装（它无法关闭安装脚本），所有安装进程还会带上 `npm_config_ignore_scripts=true`。不做签名校验。
- **恢复中途崩溃。** 如果恢复写文件时进程意外退出，下次打开会显示横幅，可以直接打开恢复前的回滚快照（或忽略）。
- **导入大小上限。** 快照在内存中解压，上限为本机内存的四分之一（256 MiB 到 2 GiB，可用 `DSH_VAULT_MAX_ARCHIVE_BYTES` 覆盖），恢复页会显示当前上限。
- **从文件夹导入。** 文件夹里可以是 `.tar.gz` / `.dshvault` 快照，也可以是解压后的明文快照（`manifest.json` + `files/`），其中的链接会被拒绝。不是快照的文件或文件夹会给出明确提示，而不是 HTTP 500。
- **同一时间只做一个操作。** 界面、定时任务、模型工具和命令行发起的备份、恢复、插件重试共用一个锁文件。第二个操作会等待，超时后报 `VAULT_BUSY`。锁文件写明持有者（主机、pid、随机 id），运行期间持续刷新；只有持有进程已退出（同一台机器）或长时间未刷新（其他机器）时才会被接管，而且每个操作只删除自己的锁。

## 命令行参考

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

全局选项：`--home <path>` 指定另一个 `$DSH_HOME`（agents 目录随之变为 `<home>/../.agents`，也可用 `--agents-home <dir>` 指定），方便在沙盒里试恢复。

`restore` 在文件已恢复但有插件安装失败时退出码为 2；`diff` 在两个目录不同时退出码为 1；`installers` 显示恢复时会用到哪个 node、pnpm、git 和 dsh。

## 常见问题

**恢复后插件显示「包不可用」。**
Desktop 在启动时加载插件。从托盘完全退出 Desktop（不只是关窗口），再重新打开。

**dsh-purge 之类的插件在新电脑上没生效。**
有些插件要在自己的页面里点一次 **应用** 才会写入设置。打开它，点一次应用。

**国内网络下 GitHub 存储位置或 `github:` 插件超时。**
配置代理，例如 `git config --global http.proxy http://127.0.0.1:7897`，或在启动 dsh 前设置 `HTTPS_PROXY`。保存了插件副本的话，恢复时可以完全不访问 GitHub。

**插件被跳过，提示「备份中没有记录该插件的安装来源」。**
备份时只看到了插件名（在 bundles 列表或 `cordis.patch.yml` 里），没有记录它是从哪装的，也没有副本。大肥鱼备份不会只凭名字去 npm 安装，因为可能装到同名的另一个包。请手动安装，或开启插件副本后重新备份。

**恢复会更新大肥鱼备份自己吗？**
不会。恢复时会跳过 dsh-vault，保留本机已安装的版本和它的 `link:` 路径。更新请在插件页卸载后重新添加 `github:guobingke/dsh-vault`。

**新电脑上已经有 dsh 配置了，还能恢复吗？**
可以。差异预览会列出所有变更，冲突逐项选择，恢复前还会自动做回滚快照。

## 参与贡献

欢迎提 issue 和 PR。

```bash
npm install
npm test        # 需要 Node 24
npm run build
npm run check:lib   # lib/ 已提交到仓库，改动后请一并提交重新构建的 lib/
```

架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，界面约定见 [docs/FRONTEND_CONTRACT.md](docs/FRONTEND_CONTRACT.md)。

如果它帮你省下了一下午重装插件的时间，点个 star 能让更多人看到。

## 许可证

[MIT](./LICENSE) © 2026 dsh-vault contributors
