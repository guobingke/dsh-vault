/**
 * dsh-vault — host plugin entry (Cordis).
 *
 * Registers:
 *  - VaultService on the host
 *  - /api/dsh-vault/* HTTP routes (when webServer is present)
 *  - model-facing tools (when tools + defineTool are present)
 *  - /vault slash command (when commands service is present)
 *
 * Browser UI lives in ./client and is loaded via package.json `dsh.client`.
 */
import { VaultService } from './core/vault-service.js'
import { registerVaultRoutes } from './api/routes.js'
import { buildVaultTools } from './tools/register.js'
import { buildVaultCommands } from './commands/register.js'
import type { VaultPluginConfig } from './core/types.js'

export const name = 'dsh-vault'

/**
 * No hard inject list: webServer/tools/commands/credentials are optional and
 * probed at runtime. Declaring them as required would prevent the plugin from
 * loading in headless/CLI-only profiles.
 */
export const inject: string[] = []

export interface HostContext {
  effect: (fn: () => (() => void) | void, label?: string) => void
  on?: (event: string, listener: (...args: unknown[]) => void) => () => void
  tools?: { register: (tool: unknown) => unknown }
  commands?: { register: (cmd: { name: string; description: string; execute: (args: string) => unknown }) => unknown }
  webServer?: { register: (route: { kind: string; path: string; handler: (...args: never[]) => unknown }) => (() => void) | void; port?: number }
  credentials?: { get?: (ref: string) => Promise<string | undefined> | string | undefined }
  logger?: { info?: (m: string) => void; warn?: (m: string) => void; error?: (m: string) => void }
  [key: string]: unknown
}

export function apply(ctx: HostContext, config: VaultPluginConfig = {}): void {
  const resolveSecret = async (ref: string): Promise<string | undefined> => {
    try {
      const v = await ctx.credentials?.get?.(ref)
      return typeof v === 'string' ? v : undefined
    } catch {
      return undefined
    }
  }

  const service = new VaultService({
    dataDir: config.dataDir,
    // Picks up $DSH_PROFILE from the Host (desktop → "desktop", dsh web → "web").
    resolveSecret,
  })

  ctx.effect(() => {
    let stopped = false
    void service.init().then(() => {
      if (stopped) return
      if (config.targets?.length) {
        for (const t of config.targets) void service.upsertTarget(t)
      }
      if (config.settings) void service.updateSettings(config.settings)
    }).catch((err: unknown) => {
      ctx.logger?.warn?.(`[dsh-vault] init failed: ${err instanceof Error ? err.message : String(err)}`)
    })
    return () => {
      stopped = true
      service.stopSchedule()
    }
  }, 'dsh-vault:service')

  // Expose for other plugins / debugging without claiming a Cordis service name collision.
  ;(ctx as { dshVault?: VaultService }).dshVault = service

  if (ctx.webServer) {
    const webServer = ctx.webServer
    ctx.effect(() => registerVaultRoutes(webServer as Parameters<typeof registerVaultRoutes>[0], service), 'dsh-vault:routes')
  } else {
    ctx.logger?.warn?.('[dsh-vault] webServer unavailable: HTTP API not registered (CLI/tools still work)')
  }

  if (ctx.tools) {
    void loadDefineTool()
      .then((defineTool) => {
        if (!defineTool || !ctx.tools) return
        for (const def of buildVaultTools(service)) {
          ctx.tools.register(defineTool(def))
        }
      })
      .catch(() => {
        // tools package missing — skip
      })
  }

  if (ctx.commands) {
    for (const cmd of buildVaultCommands(service)) {
      ctx.commands.register(cmd)
    }
  }
}

async function loadDefineTool(): Promise<((def: unknown) => unknown) | null> {
  try {
    // Optional peer — resolved at runtime inside a dsh profile, not at build time.
    const mod = await (Function('return import("@deepseek-ai/dsh-tools")')() as Promise<{
      defineTool?: (def: unknown) => unknown
    }>)
    return mod.defineTool ?? null
  } catch {
    return null
  }
}

export { VaultService } from './core/vault-service.js'
export { buildVaultRoutes, API_PREFIX } from './api/routes.js'
export type { VaultPluginConfig } from './core/types.js'
