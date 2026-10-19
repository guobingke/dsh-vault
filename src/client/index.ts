/**
 * dsh-vault browser client — registers a Settings section.
 *
 * Uses the same slots.inject('settings.section') pattern as community plugins
 * (dsh-config-manager / dsh-backup). Host packages are optional peers; when
 * unavailable this module still typechecks and exports VaultApp for tests.
 */
import { createElement, type ReactNode } from 'react'
import { VaultApp } from './VaultApp.js'
import { VaultApi } from './api.js'

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

const zh: Record<string, string> = {
  'section.label': 'dsh Vault',
}

const en: Record<string, string> = {
  'section.label': 'dsh Vault',
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
  }, VaultSection))
}

/** Settings section wrapper — receives injected `{ api }` from the host slot. */
export function VaultSection(props: { api?: VaultApi; close?: () => void }): ReactNode {
  return createElement(VaultApp, { api: props.api })
}

export { VaultApp } from './VaultApp.js'
export { VaultApi } from './api.js'
export type { VaultTab } from './VaultApp.js'
