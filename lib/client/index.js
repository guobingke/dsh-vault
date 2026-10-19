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
import { createElement } from 'react';
import { VaultApp } from './VaultApp.js';
import { VaultApi } from './api.js';
import { dictionaries } from './i18n.js';
export const name = 'dsh-vault-client';
export const inject = ['slots', 'locale'];
const NS = 'dsh-vault';
/** Host-registered dictionary (section label + all panel strings). */
const zh = { ...dictionaries.zh, 'section.label': '大肥鱼备份' };
const en = { ...dictionaries.en, 'section.label': '大肥鱼备份' };
function currentLocale(ctx) {
    try {
        return ctx.locale.getLocale?.().active;
    }
    catch {
        return undefined;
    }
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-vault:locale');
    const t = ctx.locale.bind(NS);
    const api = new VaultApi();
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dsh-vault',
        order: 65,
        label: () => t('section.label'),
        locale: NS,
        inject: () => ({ api }),
    }, createVaultSection(ctx)));
}
/** Settings section wrapper — receives injected `{ api }` from the host slot. */
export function VaultSection(props) {
    return createElement(VaultApp, { api: props.api, hostLocale: props.locale });
}
/** Build a VaultSection bound to the host locale at mount time. */
export function createVaultSection(ctx) {
    return (props) => createElement(VaultApp, { api: props.api, hostLocale: currentLocale(ctx) });
}
export { VaultApp } from './VaultApp.js';
export { VaultApi } from './api.js';
export { I18nContext, translate, dictionaries } from './i18n.js';
//# sourceMappingURL=index.js.map