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
import { VaultService } from './core/vault-service.js';
import { registerVaultRoutes } from './api/routes.js';
import { buildVaultTools } from './tools/register.js';
import { buildVaultCommands } from './commands/register.js';
export const name = 'dsh-vault';
/**
 * No hard inject list: webServer/tools/commands/credentials/pluginManager are
 * optional and probed at runtime.
 */
export const inject = [];
function optionalService(ctx, name) {
    if (typeof ctx.get === 'function') {
        try {
            return (ctx.get(name) ?? undefined);
        }
        catch {
            return undefined;
        }
    }
    return ctx[name];
}
/**
 * Bind dsh's `ctx.directoryPicker` when it is the `native` backend (Desktop /
 * loopback web on Windows/macOS, Linux with zenity/kdialog). dsh's `pick`
 * dereferences `signal.aborted`, so a signal must always be forwarded — calling
 * it without one threw a TypeError and made "Browse" silently do nothing.
 * The `browse` backend is directories-only, so the vault uses its own
 * in-app browser (/fs/list) for that case and for file selection.
 */
export function bindDirectoryPicker(picker) {
    if (!picker?.capability)
        return undefined;
    try {
        const cap = picker.capability();
        if (cap?.kind === 'native' && typeof cap.pick === 'function') {
            return (signal) => cap.pick(signal);
        }
    }
    catch {
        return undefined;
    }
    return undefined;
}
export function apply(ctx, config = {}) {
    let credentials = optionalService(ctx, 'credentials');
    const webServerSvc = optionalService(ctx, 'webServer');
    const toolsSvc = optionalService(ctx, 'tools');
    const commandsSvc = optionalService(ctx, 'commands');
    const pluginManagerSvc = optionalService(ctx, 'pluginManager');
    const directoryPickerSvc = optionalService(ctx, 'directoryPicker');
    // dsh profile boot provides the running profile and, on Desktop, its bundled pnpm.
    const profileContext = optionalService(ctx, 'profileContext');
    const resolveSecret = async (ref) => {
        try {
            const v = await credentials?.get?.(ref);
            return typeof v === 'string' ? v : undefined;
        }
        catch {
            return undefined;
        }
    };
    const service = new VaultService({
        dataDir: config.dataDir,
        resolveSecret,
        pluginManager: pluginManagerSvc ?? null,
        ...(profileContext?.name ? { activeProfile: profileContext.name } : {}),
        ...(profileContext?.packageManager?.command ? { pnpm: profileContext.packageManager } : {}),
        pickDirectory: bindDirectoryPicker(directoryPickerSvc),
        // Match Desktop's China mainland install source; plugin-manager still falls back.
        preferredRegistry: 'https://registry.npmmirror.com/',
    });
    ctx.effect(() => {
        let stopped = false;
        void service.init().then(() => {
            if (stopped)
                return;
            if (config.targets?.length) {
                for (const t of config.targets)
                    void service.upsertTarget(t);
            }
            if (config.settings)
                void service.updateSettings(config.settings);
        }).catch((err) => {
            ctx.logger?.warn?.(`[dsh-vault] init failed: ${err instanceof Error ? err.message : String(err)}`);
        });
        return () => {
            stopped = true;
            service.stopSchedule();
        };
    }, 'dsh-vault:service');
    if (webServerSvc) {
        const webServer = webServerSvc;
        ctx.effect(() => registerVaultRoutes(webServer, service), 'dsh-vault:routes');
    }
    else if (typeof ctx.inject === 'function') {
        ctx.inject(['webServer'], (sub) => {
            const webServer = (typeof sub.get === 'function' ? sub.get('webServer') : sub.webServer);
            sub.effect(() => registerVaultRoutes(webServer, service), 'dsh-vault:routes');
        });
    }
    else {
        ctx.logger?.warn?.('[dsh-vault] webServer unavailable: HTTP API not registered (CLI/tools still work)');
    }
    if (!credentials && typeof ctx.inject === 'function') {
        ctx.inject(['credentials'], (sub) => {
            credentials = (typeof sub.get === 'function' ? sub.get('credentials') : sub.credentials);
            sub.effect(() => () => { credentials = undefined; }, 'dsh-vault:credentials');
        });
    }
    if (!pluginManagerSvc && typeof ctx.inject === 'function') {
        ctx.inject(['pluginManager'], (sub) => {
            const mgr = (typeof sub.get === 'function' ? sub.get('pluginManager') : sub.pluginManager);
            service.setPluginManager(mgr);
            sub.effect(() => () => service.setPluginManager(null), 'dsh-vault:pluginManager');
        });
    }
    if (!directoryPickerSvc && typeof ctx.inject === 'function') {
        ctx.inject(['directoryPicker'], (sub) => {
            const picker = (typeof sub.get === 'function' ? sub.get('directoryPicker') : sub.directoryPicker);
            service.setPickDirectory(bindDirectoryPicker(picker));
            sub.effect(() => () => service.setPickDirectory(undefined), 'dsh-vault:directoryPicker');
        });
    }
    if (toolsSvc) {
        const tools = toolsSvc;
        void loadDefineTool()
            .then((defineTool) => {
            if (!defineTool)
                return;
            for (const def of buildVaultTools(service)) {
                tools.register(defineTool(def));
            }
        })
            .catch(() => {
            // tools package missing — skip
        });
    }
    if (commandsSvc) {
        for (const cmd of buildVaultCommands(service)) {
            commandsSvc.register(toDshCommand(cmd));
        }
    }
}
/** Adapt a plain slash command to the @deepseek-ai/dsh-commands definition shape. */
export function toDshCommand(cmd) {
    return {
        name: cmd.name,
        description: cmd.description,
        input: { hint: 'status | backup [targetId] | list | restore <snapshotId>' },
        async handler(invocation) {
            try {
                const text = await cmd.execute(invocation?.rawInput ?? '');
                return { kind: 'success', text };
            }
            catch (err) {
                return { kind: 'error', text: err instanceof Error ? err.message : String(err) };
            }
        },
    };
}
async function loadDefineTool() {
    try {
        const mod = await Function('return import("@deepseek-ai/dsh-tools")')();
        return mod.defineTool ?? null;
    }
    catch {
        return null;
    }
}
export { VaultService } from './core/vault-service.js';
export { buildVaultRoutes, API_PREFIX } from './api/routes.js';
//# sourceMappingURL=index.js.map