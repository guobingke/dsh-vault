# dsh-vault

备份并恢复完整的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）环境：已安装插件、MCP、技能、设置/模型提供商、Agent 预设、profile 补丁与全局指令。重装、重置 profile 或换机后可一键导入。

English: [README.md](./README.md).

## 安装

需要 Node `^22.19.0 || >=24`（与 dsh 相同）。

```bash
dsh plugin --profile web add dsh-vault

# 本地开发
dsh plugin --profile web add link:/absolute/path/to/dsh-vault
```

也可使用独立 CLI（即使 dsh 界面起不来也能用）：

```bash
npm install -g dsh-vault
dsh-vault status
```

## 备份范围

| 内容 | 说明 |
|---|---|
| 已安装插件（名称 / 版本 / 来源）及其配置 | 来自 profile 的 `package.json` 与 `cordis.patch.yml` |
| MCP 服务器 | `mcp.json` / `mcp/**` |
| 技能 | `$DSH_HOME/skills` 与 `$DSH_AGENTS_HOME/skills` |
| 设置与模型提供商 | `settings.yaml` + profile 补丁 |
| Agent 预设 | `.agent-presets/**` |
| Profile 补丁 | `profiles/**` |
| 全局指令 | `AGENTS.md` |
| 凭据 / API Key | **默认排除**；仅在启用加密并主动选择时写入密文包 |

排除：`node_modules`、缓存等可重装产物。快照含带 schema 版本的 manifest 与 SHA-256 校验。

## 存储目标

统一实现 `StorageAdapter`：

1. **本地** — `.tar.gz`（明文）或 `.dshvault`（加密）
2. **本地加密** — 口令 + scrypt（默认）或 argon2id + AES-256-GCM
3. **GitHub** — 推送到指定私有仓库（token 来自 dsh 凭据或 `GITHUB_TOKEN`）
4. **云存储** — WebDAV 与 S3 兼容端点（S3 / R2 / MinIO / OSS 等）

远端目标也可开启加密。

## 使用

### 设置页

dsh web → **设置 → dsh Vault**（仪表盘 / 备份 / 恢复 / 存储 / 快照 / 设置）。

### CLI

```bash
dsh-vault backup --target local-default
dsh-vault backup --encrypt --password '…' --secrets
dsh-vault list
dsh-vault restore vault-20261019T025600Z --use-backup
```

### 模型工具 / 斜杠命令

- 工具：`dsh_vault_status` / `dsh_vault_backup` / `dsh_vault_list` / `dsh_vault_restore_preview` / `dsh_vault_restore`
- 斜杠：`/vault status|backup|list|restore …`

## 恢复流程

选快照 → 预览差异 → 冲突策略（保留当前 / 使用备份）→ 自动打回滚快照 → 写入文件并尝试重装缺失插件 → 提示需手动处理的项（如重新填写 API Key）。

## 开发

```bash
npm install
npm test
npm run build
```

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)  
- [docs/FRONTEND_CONTRACT.md](./docs/FRONTEND_CONTRACT.md)（供后续前端改版）

## 许可证

MIT
