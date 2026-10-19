# dsh-vault

备份并恢复完整的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）环境：已安装插件、MCP、技能、设置/模型提供商、Agent 预设、profile 补丁与全局指令。重装、重置 profile 或换机后可一键导入。

同时支持 **`dsh web` 与 DeepSeek Harness Desktop**（同一套设置页 / Host API；每个 profile 需分别安装）。

English: [README.md](./README.md).

## 安装

需要 Node `^22.19.0 || >=24`（与 dsh 相同）。

### DeepSeek Harness Desktop（用桌面端时推荐）

Desktop 独占 `$DSH_HOME/profiles/desktop`，**不会**与 `web` 共用已启用的插件。

1. 先启动一次 Desktop（初始化 profile），再**完全退出**。
2. 用 **Desktop 自带的** `dsh`（托盘 → 终端，或应用旁的 `dsh` / `dsh.cmd`）安装。npm 全局安装的 `dsh` 会拒绝 `--profile desktop`。

```bash
dsh plugin --profile desktop add dsh-vault
```

3. 重新打开 Desktop → **设置 → dsh Vault**。

也可在 Desktop 运行时：打开 **插件** 页添加 `dsh-vault`。

本地开发：

```bash
dsh plugin --profile desktop add link:/absolute/path/to/dsh-vault
```

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

界面起不来时也能用（Windows / macOS / Linux 共用 `$DSH_HOME`）：

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
