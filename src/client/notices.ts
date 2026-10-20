import type { PluginInstallResultRow } from '../core/types.js'
import type { MessageKey, Translate } from './i18n.js'

/** Backend notices are English; map the known ones to the UI language. */
const PATTERNS: Array<[RegExp, MessageKey]> = [
  [/^Re-enter API keys/i, 'notice.reenterSecrets'],
  [/^Some plugins used local link:\/file: sources/i, 'notice.localSources'],
  [/^Restart DeepSeek Harness Desktop/i, 'notice.restartDesktop'],
  [/^Restart dsh web/i, 'notice.restartWeb'],
  [/^Restore finished with plugin failures/i, 'notice.partialRestore'],
  [/^Launch DeepSeek Harness Desktop once/i, 'notice.launchDesktopOnce'],
  [/^Run the command with Desktop's bundled/i, 'notice.useBundledDsh'],
  [/^Or install from Desktop → Plugins/i, 'notice.installFromPlugins'],
  [/^Reopen Desktop after installing/i, 'notice.reopenDesktop'],
]

export function localizeNotice(text: string, t: Translate): string {
  for (const [re, key] of PATTERNS) if (re.test(text.trim())) return t(key)
  return text
}

/** One short localized line for a plugin row. */
export function pluginReasonText(row: PluginInstallResultRow, t: Translate): string {
  if (row.status === 'skipped' && row.reason) return t(`restore.reason.${row.reason}` as MessageKey, { subject: row.subject ?? row.name })
  if (row.status !== 'failed') return pluginOkText(row, t)
  if (!row.reason) return row.detail
  const subject = row.reason === 'unknown' ? row.detail : row.subject ?? row.name
  return t(`restore.reason.${row.reason}` as MessageKey, { subject })
}

/** `name（profile）`, each once — a plugin shows twice only when it is in two profiles. */
export function failedPluginLabels(rows: PluginInstallResultRow[] | undefined, fallback: string[]): string {
  const failed = (rows ?? []).filter((r) => r.status === 'failed')
  if (!failed.length) return [...new Set(fallback)].join('、')
  const profilesOf = new Map<string, Set<string>>()
  for (const r of failed) profilesOf.set(r.name, (profilesOf.get(r.name) ?? new Set()).add(r.profile))
  return [...profilesOf].map(([name, ps]) => `${name}（${[...ps].join(' / ')}）`).join('、')
}

/** Successful rows: the backend detail is English and technical; keep it for 详情. */
function pluginOkText(row: PluginInstallResultRow, t: Translate): string {
  const d = row.detail ?? ''
  if (/^linked bundled source .*\.(tgz|tar\.gz)$/i.test(d)) return t('restore.ok.bundledTarball')
  if (/^linked bundled source/.test(d)) return t('restore.ok.linkedBundled')
  const local = /^linked local source (.+)$/.exec(d)
  if (local) return t('restore.ok.linkedLocal', { subject: local[1] ?? '' })
  const v = /@(\S+)\s*$/.exec(d)
  const version = v ? ` @${v[1]}` : ''
  if (row.status === 'already-present' || /^already/.test(d)) return t('restore.ok.present', { version })
  if (row.status === 'installed-from-backup' || /installed from backup|registry version unavailable|locked tarball/i.test(d)) {
    return t('restore.ok.fromBackup', { version })
  }
  if (row.status === 'installed') return t('restore.ok.installed', { version })
  return d
}

/** Raw text for 详情: the install log for failures, the technical detail for successes. */
export function pluginRawDetail(row: PluginInstallResultRow, t: Translate): string | undefined {
  if (row.log) return row.log
  if (row.status !== 'failed' && row.detail && row.detail !== pluginReasonText(row, t)) return row.detail
  return undefined
}

const PATH_REASONS: Array<[RegExp, MessageKey]> = [
  [/the dsh-vault data folder is private/, 'error.path.private'],
  [/credential folders are off limits/, 'error.path.credentials'],
  [/system folders are off limits/, 'error.path.system'],
  [/outside the approved folders/, 'error.path.outside'],
  [/only \.tar\.gz \/ \.dshvault snapshot files/, 'error.path.notArchive'],
  [/path must be absolute/, 'error.path.relative'],
]

/** Server errors are English; show the known ones in the UI language (the raw text stays in the message). */
export function localizeError(err: unknown, t: Translate): string {
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: unknown } | null)?.code
  const status = (err as { status?: unknown } | null)?.status
  const suffix = typeof status === 'number' && status ? ` (HTTP ${status})` : ''
  if (code === 'PATH_NOT_ALLOWED') {
    const path = /\): (.*)$/.exec(message)?.[1] ?? ''
    const hit = PATH_REASONS.find(([re]) => re.test(message))
    if (hit) return `${t(hit[1], { path })}${suffix}`
  }
  if (code === 'BAD_SNAPSHOT') return `${t('error.badSnapshot')}${suffix}`
  if (code === 'SNAPSHOT_NOT_FOUND' && /no snapshot in folder/.test(message)) return `${t('error.noSnapshotInFolder')}${suffix}`
  return `${message}${suffix}`
}
