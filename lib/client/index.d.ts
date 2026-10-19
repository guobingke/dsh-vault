/**
 * dsh-vault browser client — registers a Settings section.
 *
 * Renders inside the host's Settings modal (slot `settings.section`, id
 * `dsh-vault`); the host supplies the left navigation and the theme. The UI
 * follows the host locale and has no shell, sidebar, branding or theme switch
 * of its own.
 *
 * Host packages are optional peers; when unavailable this module still
 * typechecks and exports VaultApp for tests.
 */
import { type ReactNode } from 'react';
import { VaultApi } from './api.js';
export declare const name = "dsh-vault-client";
export declare const inject: string[];
export interface ClientContext {
    effect: (fn: () => (() => void) | void, label?: string) => void;
    slots: {
        inject: (name: string, factory: () => unknown) => void;
        register: (meta: Record<string, unknown>, component: unknown) => unknown;
    };
    locale: {
        register: (ns: string, dicts: Record<string, Record<string, string>>) => (() => void) | void;
        bind: (ns: string) => (key: string) => string;
        getLocale?: () => {
            active: string;
        };
    };
    logger?: {
        warn?: (m: string) => void;
    };
}
export declare function apply(ctx: ClientContext): void;
/** Settings section wrapper — receives injected `{ api }` from the host slot. */
export declare function VaultSection(props: {
    api?: VaultApi;
    close?: () => void;
    locale?: string;
}): ReactNode;
/** Build a VaultSection bound to the host locale at mount time. */
export declare function createVaultSection(ctx: ClientContext): (props: {
    api?: VaultApi;
}) => ReactNode;
export { VaultApp } from './VaultApp.js';
export { VaultApi } from './api.js';
export { I18nContext, translate, dictionaries } from './i18n.js';
export type { VaultTab } from './VaultApp.js';
export type { Locale, MessageKey } from './i18n.js';
//# sourceMappingURL=index.d.ts.map