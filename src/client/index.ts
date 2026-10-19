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
import { createElement, type ReactNode } from 'react'
import { VaultApp } from './VaultApp.js'
import { VaultApi } from './api.js'
import { dictionaries } from './i18n.js'

export const name = 'dsh-vault-client'
export const inject = ['slots', 'locale']

export interface ClientContext {
  effect: (fn: () => (() => void) | void, label?: string) => void
  slots: {
    inject: (name: string, factory: () => unknown) => void
    register: (meta: Record<string, unknown>, component: unknown) => unknown
  }
  locale: {
    register: (ns: string, dicts: Record<string, Record<string, string>>) => (() => void) | void
    bind: (ns: string) => (key: string) => string
    getLocale?: () => { active: string }
  }
  logger?: { warn?: (m: string) => void }
}

const NS = 'dsh-vault'

/** Host-registered dictionary (section label + all panel strings). */
const zh: Record<string, string> = { ...dictionaries.zh, 'section.label': '大肥鱼备份' }
const en: Record<string, string> = { ...dictionaries.en, 'section.label': '大肥鱼备份' }

function currentLocale(ctx: ClientContext): string | undefined {
  try {
    return ctx.locale.getLocale?.().active
  } catch {
    return undefined
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-vault:locale')
  const t = ctx.locale.bind(NS)
  const api = new VaultApi()

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-vault',
    order: 65,
    label: () => t('section.label'),
    locale: NS,
    inject: () => ({ api }),
  }, createVaultSection(ctx)))
}

/** Settings section wrapper — receives injected `{ api }` from the host slot. */
export function VaultSection(props: { api?: VaultApi; close?: () => void; locale?: string }): ReactNode {
  return createElement(VaultApp, { api: props.api, hostLocale: props.locale })
}

/** Build a VaultSection bound to the host locale at mount time. */
export function createVaultSection(ctx: ClientContext): (props: { api?: VaultApi }) => ReactNode {
  return (props) => createElement(VaultApp, { api: props.api, hostLocale: currentLocale(ctx) })
}

export { VaultApp } from './VaultApp.js'
export { VaultApi } from './api.js'
export { I18nContext, translate, dictionaries } from './i18n.js'
export type { VaultTab } from './VaultApp.js'
export type { Locale, MessageKey } from './i18n.js'
