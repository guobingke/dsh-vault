import type { PluginManagerLike } from './core/plugin-install.js';
import type { VaultPluginConfig } from './core/types.js';
export declare const name = "dsh-vault";
/**
 * No hard inject list: webServer/tools/commands/credentials/pluginManager are
 * optional and probed at runtime.
 */
export declare const inject: string[];
export interface HostContext {
    effect: (fn: () => (() => void) | void, label?: string) => void;
    on?: (event: string, listener: (...args: unknown[]) => void) => () => void;
    tools?: {
        register: (tool: unknown) => unknown;
    };
    commands?: {
        register: (cmd: unknown) => unknown;
    };
    webServer?: {
        register: (route: {
            kind: string;
            path: string;
            handler: (...args: never[]) => unknown;
        }) => (() => void) | void;
        port?: number;
    };
    credentials?: {
        get?: (ref: string) => Promise<string | undefined> | string | undefined;
    };
    pluginManager?: PluginManagerLike;
    directoryPicker?: {
        capability: () => {
            kind: 'native';
            pick: (signal: AbortSignal) => Promise<string | null>;
        } | {
            kind: 'browse';
            list: (path?: string) => Promise<unknown>;
        };
    };
    logger?: {
        info?: (m: string) => void;
        warn?: (m: string) => void;
        error?: (m: string) => void;
    };
    get?: (name: string) => unknown;
    inject?: (deps: string[], callback: (sub: HostContext) => void) => unknown;
    [key: string]: unknown;
}
/**
 * Bind dsh's `ctx.directoryPicker` when it is the `native` backend (Desktop /
 * loopback web on Windows/macOS, Linux with zenity/kdialog). dsh's `pick`
 * dereferences `signal.aborted`, so a signal must always be forwarded — calling
 * it without one threw a TypeError and made "Browse" silently do nothing.
 * The `browse` backend is directories-only, so the vault uses its own
 * in-app browser (/fs/list) for that case and for file selection.
 */
export declare function bindDirectoryPicker(picker: HostContext['directoryPicker']): ((signal: AbortSignal) => Promise<string | null>) | undefined;
export declare function apply(ctx: HostContext, config?: VaultPluginConfig): void;
/** Adapt a plain slash command to the @deepseek-ai/dsh-commands definition shape. */
export declare function toDshCommand(cmd: {
    name: string;
    description: string;
    execute: (args: string) => Promise<string> | string;
}): {
    name: string;
    description: string;
    input: {
        hint: string;
    };
    handler(invocation: {
        rawInput?: string;
    }): Promise<{
        kind: "success";
        text: string;
    } | {
        kind: "error";
        text: string;
    }>;
};
export { VaultService } from './core/vault-service.js';
export { buildVaultRoutes, API_PREFIX } from './api/routes.js';
export type { VaultPluginConfig } from './core/types.js';
//# sourceMappingURL=index.d.ts.map