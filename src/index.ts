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
import type { PluginManagerLike } from './core/plugin-install.js'
import type { VaultPluginConfig } from './core/types.js'

export const name = 'dsh-vault'

/**
 * No hard inject list: webServer/tools/commands/credentials/pluginManager are
 * optional and probed at runtime.
 */
export const inject: string[] = []

export interface HostContext {
  effect: (fn: () => (() => void) | void, label?: string) => void
  on?: (event: string, listener: (...args: unknown[]) => void) => () => void
  tools?: { register: (tool: unknown) => unknown }
  commands?: { register: (cmd: unknown) => unknown }
  webServer?: { register: (route: { kind: string; path: string; handler: (...args: never[]) => unknown }) => (() => void) | void; port?: number }
  credentials?: { get?: (ref: string) => Promise<string | undefined> | string | undefined }
  pluginManager?: PluginManagerLike
  directoryPicker?: {
    capability: () =>
      | { kind: 'native'; pick: (signal?: AbortSignal) => Promise<string | null> }
      | { kind: 'browse'; list: (path?: string) => Promise<unknown> }
  }
  logger?: { info?: (m: string) => void; warn?: (m: string) => void; error?: (m: string) => void }
  get?: (name: string) => unknown
  inject?: (deps: string[], callback: (sub: HostContext) => void) => unknown
  [key: string]: unknown
}

function optionalService<T>(
  ctx: HostContext,
  name: 'webServer' | 'tools' | 'commands' | 'credentials' | 'pluginManager' | 'directoryPicker',
): T | undefined {
  if (typeof ctx.get === 'function') {
    try {
      return (ctx.get(name) ?? undefined) as T | undefined
    } catch {
      return undefined
    }
  }
  return ctx[name] as T | undefined
}

function bindDirectoryPicker(picker: HostContext['directoryPicker']): (() => Promise<string | null>) | undefined {
  if (!picker?.capability) return undefined
  try {
    const cap = picker.capability()
    if (cap.kind === 'native') return () => cap.pick()
  } catch {
    return undefined
  }
  return undefined
}

export function apply(ctx: HostContext, config: VaultPluginConfig = {}): void {
  let credentials = optionalService<HostContext['credentials']>(ctx, 'credentials')
  const webServerSvc = optionalService<HostContext['webServer']>(ctx, 'webServer')
  const toolsSvc = optionalService<HostContext['tools']>(ctx, 'tools')
  const commandsSvc = optionalService<HostContext['commands']>(ctx, 'commands')
  const pluginManagerSvc = optionalService<PluginManagerLike>(ctx, 'pluginManager')
  const directoryPickerSvc = optionalService<HostContext['directoryPicker']>(ctx, 'directoryPicker')
  const resolveSecret = async (ref: string): Promise<string | undefined> => {
    try {
      const v = await credentials?.get?.(ref)
      return typeof v === 'string' ? v : undefined
    } catch {
      return undefined
    }
  }

  const service = new VaultService({
    dataDir: config.dataDir,
    resolveSecret,
    pluginManager: pluginManagerSvc ?? null,
    pickDirectory: bindDirectoryPicker(directoryPickerSvc),
    // Match Desktop's China mainland install source; plugin-manager still falls back.
    preferredRegistry: 'https://registry.npmmirror.com/',
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

  if (webServerSvc) {
    const webServer = webServerSvc
    ctx.effect(() => registerVaultRoutes(webServer as Parameters<typeof registerVaultRoutes>[0], service), 'dsh-vault:routes')
  } else if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (sub) => {
      const webServer = (typeof sub.get === 'function' ? sub.get('webServer') : sub.webServer) as Parameters<typeof registerVaultRoutes>[0]
      sub.effect(() => registerVaultRoutes(webServer, service), 'dsh-vault:routes')
    })
  } else {
    ctx.logger?.warn?.('[dsh-vault] webServer unavailable: HTTP API not registered (CLI/tools still work)')
  }

  if (!credentials && typeof ctx.inject === 'function') {
    ctx.inject(['credentials'], (sub) => {
      credentials = (typeof sub.get === 'function' ? sub.get('credentials') : sub.credentials) as HostContext['credentials']
      sub.effect(() => () => { credentials = undefined }, 'dsh-vault:credentials')
    })
  }

  if (!pluginManagerSvc && typeof ctx.inject === 'function') {
    ctx.inject(['pluginManager'], (sub) => {
      const mgr = (typeof sub.get === 'function' ? sub.get('pluginManager') : sub.pluginManager) as PluginManagerLike
      service.setPluginManager(mgr)
      sub.effect(() => () => service.setPluginManager(null), 'dsh-vault:pluginManager')
    })
  }

  if (!directoryPickerSvc && typeof ctx.inject === 'function') {
    ctx.inject(['directoryPicker'], (sub) => {
      const picker = (typeof sub.get === 'function' ? sub.get('directoryPicker') : sub.directoryPicker) as HostContext['directoryPicker']
      service.setPickDirectory(bindDirectoryPicker(picker))
      sub.effect(() => () => service.setPickDirectory(undefined), 'dsh-vault:directoryPicker')
    })
  }

  if (toolsSvc) {
    const tools = toolsSvc
    void loadDefineTool()
      .then((defineTool) => {
        if (!defineTool) return
        for (const def of buildVaultTools(service)) {
          tools.register(defineTool(def))
        }
      })
      .catch(() => {
        // tools package missing — skip
      })
  }

  if (commandsSvc) {
    for (const cmd of buildVaultCommands(service)) {
      commandsSvc.register(toDshCommand(cmd) as never)
    }
  }
}

/** Adapt a plain slash command to the @deepseek-ai/dsh-commands definition shape. */
export function toDshCommand(cmd: { name: string; description: string; execute: (args: string) => Promise<string> | string }) {
  return {
    name: cmd.name,
    description: cmd.description,
    input: { hint: 'status | backup [targetId] | list | restore <snapshotId>' },
    async handler(invocation: { rawInput?: string }) {
      try {
        const text = await cmd.execute(invocation?.rawInput ?? '')
        return { kind: 'success' as const, text }
      } catch (err) {
        return { kind: 'error' as const, text: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}

async function loadDefineTool(): Promise<((def: unknown) => unknown) | null> {
  try {
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
