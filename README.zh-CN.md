# dsh-vault

备份并恢复完整的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）环境：已安装插件、MCP、技能、设置/模型提供商、Agent 预设、profile 补丁与全局指令。重装、重置 profile 或换机后可一键导入。

同时支持 **`dsh web` 与 DeepSeek Harness Desktop**（同一套设置页 / Host API；每个 profile 需分别安装）。

English: [README.md](./README.md).

## 安装

需要 Node `^22.19.0 || >=24`（与 dsh 相同）。

### DeepSeek Harness Desktop（用桌面端时推荐）

Desktop 独占 `%USERPROFILE%\.dsh\profiles\desktop`（即 `$DSH_HOME/profiles/desktop`），**不会**与 `web` 共用已启用的插件。

1. 先启动一次 Desktop（初始化 profile），再**完全退出**。
2. 用 **Desktop 自带的** `dsh`（托盘 → 终端，或应用旁的 `dsh` / `dsh.cmd`）安装。npm 全局安装的 `dsh` 会拒绝 `--profile desktop`。
3. 重新打开 Desktop → **设置 → dsh Vault**；也可在运行时打开 **插件** 页，用本地目录路径添加本插件。

**Windows（cmd）** — 不要用 `~`（cmd 不会展开）；用完整路径或 `%USERPROFILE%`：

```bat
dsh plugin --profile desktop add dsh-vault
dsh plugin --profile desktop add link:C:\Users\你的用户名\src\dsh-vault
dsh plugin --profile desktop add link:%USERPROFILE%\src\dsh-vault
```

**macOS / Linux：**

```bash
dsh plugin --profile desktop add dsh-vault
dsh plugin --profile desktop add link:/absolute/path/to/dsh-vault
```

安装源若使用中国大陆镜像（npmmirror），在 Desktop 的插件安装源里选大陆镜像即可；恢复时 vault 会优先走该镜像。

### 浏览器 / `dsh web`

```bash
dsh plugin --profile web add dsh-vault
dsh plugin --profile web add link:/absolute/path/to/dsh-vault
```

重启 `dsh web` 后打开 **设置 → dsh Vault**。

### 两个界面都要用

```bash
dsh plugin --profile web add dsh-vault
dsh plugin --profile desktop add dsh-vault   # 须用 Desktop 自带的 dsh
```

或：

```bash
npx dsh-vault setup --dry-run
npx dsh-vault setup --profile web
npx dsh-vault setup --profile desktop
```

### 独立 CLI

界面起不来时也能用（Windows / macOS / Linux 共用 `$DSH_HOME`，Windows 默认为 `%USERPROFILE%\.dsh`）：

```bash
npm install -g dsh-vault
dsh-vault status
```

## 备份范围

| 内容 | 说明 |
|---|---|
| 已安装插件（名称 / 版本 / 来源）及其配置 | 各 profile 的 `package.json` 与 `cordis.patch.yml`（含 `desktop` / `web`） |
| MCP 服务器 | `mcp.json` / `mcp/**` |
| 技能 | `$DSH_HOME/skills` 与 `$DSH_AGENTS_HOME/skills` |
| 设置与模型提供商 | `settings.yaml` + profile 补丁 |
| Agent 预设 | `.agent-presets/**` |
| Profile 补丁 | `profiles/**`（排除 `node_modules`） |
| 全局指令 | `AGENTS.md` |
| 凭据 / API Key | **默认排除**；仅在启用加密并主动选择时写入密文包 |

排除：`node_modules`、缓存等可重装产物。路径遵循 `$DSH_HOME` / `$DSH_AGENTS_HOME`（默认 `~/.dsh` 与 `~/.agents`）。

## 使用

### 设置页（web + Desktop）

**设置 → dsh Vault**。Desktop 嵌入共享 Web UI；浏览器半声明 `dsh.client.platform: "web"`（Desktop 同样需要该值）。

#### 备份到任意位置 / 导出文件

不必只用「存储位置」里已配置的目标：

- **任意本地文件夹**：每次备份可选盘符路径、USB、同步盘等（支持空格与中文用户名）。
- **导出到文件**：生成单个 `.tar.gz`（明文）或 `.dshvault`（加密）可移植归档，拷到另一台机器再导入。

Windows 路径示例：`D:\Backups\dsh`、`C:\Users\张三\Documents\vault.dshvault`。

#### 从任意路径恢复 / 导入文件

恢复页可选：

- 已配置存储位置中的快照；或
- **导入路径**：另一台机器拷来的快照文件夹，或单个归档文件——**无需先创建存储位置**。

恢复会把 `profiles/desktop`（及当前主机活跃 profile）的插件、MCP、技能、设置等写回，并尝试用 **运行中 Host 的 pluginManager**（其次 Desktop 自带的 `dsh`、`pnpm install`）按记录版本安装缺失插件。本地 `link:` / `file:` 插件若源目录在本机不存在，结果里会标明失败原因；备份时若源目录存在会打进归档的 `plugin-sources/`。 npm / GitHub 插件也会把本机已装副本打进 `plugin-sources/`：若恢复时注册表已无该精确版本（例如被下架），会自动改用备份副本，结果标为「已从备份安装」。cordis.patch.yml 里引用、但 package.json 未列出的插件（如 dsh-vscode-bridge）同样会检测并打包。任一插件失败时恢复结果为**不成功**（HTTP 409），请按列表处理后重启 Desktop。

### CLI / 工具

见英文 README；斜杠命令 `/vault`，模型工具 `dsh_vault_*`。

## 开发

```bash
npm install
npm test
npm run build
```

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)  
- [docs/FRONTEND_CONTRACT.md](./docs/FRONTEND_CONTRACT.md)

## 许可证

MIT
