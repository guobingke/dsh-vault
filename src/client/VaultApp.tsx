import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { VaultApi, VaultApiError, type VaultStatusResponse } from './api.js'
import { Dashboard } from './components/Dashboard.js'
import { BackupPanel } from './components/BackupPanel.js'
import { RestorePanel } from './components/RestorePanel.js'
import { StoragePanel } from './components/StoragePanel.js'
import { SnapshotsPanel, type VerifyResult } from './components/SnapshotsPanel.js'
import { SettingsPanel, type ThemePreference } from './components/SettingsPanel.js'
import { IconButton } from './components/ui.js'
import {
  IconArchive,
  IconDatabase,
  IconGauge,
  IconGlobe,
  IconLock,
  IconMoon,
  IconRefresh,
  IconRestore,
  IconSettings,
  IconShield,
  IconSliders,
  IconSun,
} from './components/Icons.js'
import {
  I18nContext,
  detectInitialLocale,
  normalizeLocale,
  readStoredLocale,
  storeLocale,
  translate,
  type Locale,
} from './i18n.js'
import { formatBytes } from './lib/format.js'
import type { RestorePreview, SnapshotInfo, StorageTargetConfig, VaultSettings } from '../core/types.js'
import './theme.css'

export type VaultTab = 'dashboard' | 'backup' | 'restore' | 'storage' | 'snapshots' | 'settings'

export type { ThemePreference }

const TABS: Array<{ id: VaultTab; icon: ReactNode }> = [
  { id: 'dashboard', icon: <IconGauge size={16} /> },
  { id: 'backup', icon: <IconArchive size={16} /> },
  { id: 'restore', icon: <IconRestore size={16} /> },
  { id: 'storage', icon: <IconDatabase size={16} /> },
  { id: 'snapshots', icon: <IconSliders size={16} /> },
  { id: 'settings', icon: <IconSettings size={16} /> },
]

/** localStorage key for the theme preference (UI-only). */
export const THEME_STORAGE_KEY = 'dsh-vault.theme'

export interface VaultAppProps {
  api?: VaultApi
  /** Host locale tag e.g. "zh-CN" / "en-US"; drives the default language. */
  hostLocale?: string
  /** Child content (unused; composition only). */
  children?: ReactNode
}

type Kind = 'ok' | 'error'

export interface Notice {
  kind: Kind
  text: string
}

type TargetStatus = 'idle' | 'ok' | 'error'

function errorText(err: unknown): string {
  if (err instanceof VaultApiError) {
    return err.status ? `${err.message} (HTTP ${err.status})` : err.message
  }
  return err instanceof Error ? err.message : String(err)
}

function readStoredTheme(): ThemePreference {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null
    return v === 'dark' || v === 'light' || v === 'auto' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

function storeTheme(theme: ThemePreference): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // non-fatal
  }
}

function readHostTheme(): 'dark' | 'light' | undefined {
  try {
    if (typeof document === 'undefined') return undefined
    const attr = document.documentElement.getAttribute('data-theme') ?? document.documentElement.getAttribute('data-dsw-theme')
    if (attr === 'light' || attr === 'dark') return attr
    if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches) return 'light'
    if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    // SSR / restricted env
  }
  return undefined
}

export function VaultApp({ api: apiProp, hostLocale }: VaultAppProps) {
  const api = useMemo(() => apiProp ?? new VaultApi(), [apiProp])

  /* ---------------- language & theme ---------------- */
  const [locale, setLocaleState] = useState<Locale>(() => (hostLocale ? normalizeLocale(hostLocale) : detectInitialLocale()))
  const t = useMemo(() => (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate(locale, key, vars), [locale])
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredTheme())
  const [hostTheme, setHostTheme] = useState<'dark' | 'light' | undefined>(() => readHostTheme())
  const resolvedTheme: 'dark' | 'light' = theme === 'auto' ? (hostTheme ?? 'dark') : theme

  useEffect(() => {
    if (typeof document === 'undefined') return
    const target = document.documentElement
    const observer = new MutationObserver(() => setHostTheme(readHostTheme()))
    observer.observe(target, { attributes: true, attributeFilter: ['data-theme', 'data-dsw-theme', 'class'] })
    return () => observer.disconnect()
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    storeLocale(next)
  }, [])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    storeTheme(next)
  }, [])

  /* ---------------- data ---------------- */
  const [tab, setTab] = useState<VaultTab>('dashboard')
  const [status, setStatus] = useState<VaultStatusResponse | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [targetStatus, setTargetStatus] = useState<Record<string, TargetStatus>>({})
  const [snapshotsReliable, setSnapshotsReliable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [backupTargetId, setBackupTargetId] = useState<string | undefined>(undefined)
  const [restorePreset, setRestorePreset] = useState<{ targetId: string; snapshotId: string; nonce: number } | null>(null)
  const [progress, setProgress] = useState<{ value: number; stage: string } | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopProgress = useCallback(() => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
    setProgress(null)
  }, [])

  /**
   * Start an optimistic, time-based progress run. The HTTP API is
   * request/response, so the bar advances asymptotically toward 92% while the
   * request is in flight and completes when the promise settles.
   */
  const startProgress = useCallback((stages: string[], totalMs: number) => {
    if (progressTimer.current) clearInterval(progressTimer.current)
    const startedAt = Date.now()
    setProgress({ value: 3, stage: stages[0] ?? 'collect' })
    progressTimer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const ratio = Math.min(0.92, 0.92 * (1 - Math.exp(-elapsed / (totalMs * 0.55))))
      const stageIdx = Math.min(stages.length - 1, Math.floor(ratio * stages.length))
      setProgress({ value: Math.round(ratio * 100), stage: stages[stageIdx] ?? stages[0] ?? 'collect' })
    }, 180)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await api.status()
      setStatus(s)
      try {
        const snap = await api.listSnapshots()
        setSnapshots(snap.snapshots)
        setSnapshotsReliable(true)
      } catch (snapErr) {
        // Partial failure: the dashboard still renders, snapshots surface the error.
        setSnapshotsReliable(false)
        setError(errorText(snapErr))
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      setError(errorText(err))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])

  const targets: StorageTargetConfig[] = status?.targets ?? []
  const settings: VaultSettings | null = status?.settings ?? null
  const targetLabel = useCallback((id: string) => targets.find((x) => x.id === id)?.label ?? id, [targets])

  const navigate = useCallback((next: VaultTab) => {
    setTab(next)
    setError(null)
    setNotice(null)
    if (next !== 'restore') setPreview(null)
  }, [])

  const backupTargetPreset = useCallback((id: string) => {
    setBackupTargetId(id)
    navigate('backup')
  }, [navigate])

  /* ---------------- lifecycle: progress cleanup + tab title ---------------- */
  useEffect(() => () => { if (progressTimer.current) clearInterval(progressTimer.current) }, [])

  const tabLabels: Record<VaultTab, string> = useMemo(() => ({
    dashboard: t('nav.dashboard'),
    backup: t('nav.backup'),
    restore: t('nav.restore'),
    storage: t('nav.storage'),
    snapshots: t('nav.snapshots'),
    settings: t('nav.settings'),
  }), [t])

  const counts: Partial<Record<VaultTab, number>> = {
    storage: targets.length,
    snapshots: snapshots.length,
  }

  const i18nValue = useMemo(() => ({ locale, t }), [locale, t])

  return (
    <I18nContext.Provider value={i18nValue}>
      <div className="dsh-vault-root" data-dv-theme={resolvedTheme} lang={locale === 'zh' ? 'zh-CN' : 'en'}>
        <a className="dv-skip-link" href="#dv-main">{t('app.skipToContent')}</a>
        <div className="dv-shell">
          <aside className="dv-sidebar">
            <div className="dv-brand">
              <span className="dv-brand-mark" aria-hidden="true"><IconShield size={19} /></span>
              <span className="dv-brand-text">
                <span className="dv-brand-title">{t('app.title')}</span>
                <span className="dv-brand-sub">{t('app.subtitle')}</span>
              </span>
            </div>
            <nav className="dv-nav" aria-label={t('app.navLabel')}>
              {TABS.map((item) => {
                const badge = counts[item.id]
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-active={tab === item.id ? 'true' : undefined}
                    aria-current={tab === item.id ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <span className="dv-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span className="dv-nav-label">{tabLabels[item.id]}</span>
                    {typeof badge === 'number' && badge > 0 ? <span className="dv-nav-badge">{badge}</span> : null}
                  </button>
                )
              })}
            </nav>
            <div className="dv-sidebar-foot">
              <span className="dv-row dv-gap-1">
                {settings?.schedule.enabled ? <IconCalendarGlyph /> : <IconLock size={12} />}
                {settings?.schedule.enabled
                  ? `${t('dashboard.schedule')}: ${t('common.on')}`
                  : t('dashboard.scheduleOff')}
              </span>
              <span className="dv-row dv-gap-1">
                <IconArchive size={12} />
                {snapshots.length
                  ? t('dashboard.snapshotsCount', { count: snapshots.length })
                  : t('dashboard.snapshotFootEmpty')}
              </span>
              <div className="dv-sidebar-actions">
                <IconButton label={t('app.refresh')} onClick={() => void refresh()} disabled={loading}>
                  <IconRefresh size={14} />
                </IconButton>
                <IconButton
                  label={t('settings.themeTitle')}
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                >
                  {resolvedTheme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
                </IconButton>
                <IconButton
                  label={t('settings.languageTitle')}
                  onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
                >
                  <IconGlobe size={14} />
                </IconButton>
              </div>
            </div>
          </aside>

          <main className="dv-workspace" id="dv-main" tabIndex={-1}>
            {loading && !status ? (
              <div className="dv-panel">
                <div className="dv-page">
                  <div className="dv-loading-state" role="status" aria-live="polite">
                    <span className="dv-spinner" aria-hidden="true" />
                    <span>{t('app.loadingStatus')}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="dv-panel">
                {tab === 'dashboard' ? (
                  <Dashboard
                    status={status}
                    loading={loading}
                    error={error}
                    onRefresh={() => void refresh()}
                    onBackup={() => navigate('backup')}
                    onNavigate={navigate}
                    onBackupTo={backupTargetPreset}
                    recentSnapshots={snapshotsReliable ? snapshots.slice(0, 10) : undefined}
                  />
                ) : null}
                {tab === 'backup' ? (
                  <BackupPanel
                    key={backupTargetId ?? 'default'}
                    targets={targets}
                    busy={busy}
                    message={notice?.kind === 'ok' ? notice.text : null}
                    error={notice?.kind === 'error' ? null : error}
                    progress={busy ? progress?.value : undefined}
                    stage={busy ? progress?.stage : undefined}
                    onBackup={(input) => {
                      setBusy(true)
                      setError(null)
                      setNotice(null)
                      startProgress(input.encrypt ? ['collect', 'pack', 'encrypt', 'upload'] : ['collect', 'pack', 'upload'], 5000)
                      void api.backup(input)
                        .then((r) => {
                          setNotice({
                            kind: 'ok',
                            text: t('backup.successBody', {
                              id: r.snapshotId,
                              target: targetLabel(r.targetId),
                              size: formatBytes(r.bytes),
                            }),
                          })
                          return refresh()
                        })
                        .catch((err: unknown) => setError(errorText(err)))
                        .finally(() => {
                          stopProgress()
                          setBusy(false)
                        })
                    }}
                    defaultTargetId={backupTargetId}
                    onNavigateStorage={() => navigate('storage')}
                  />
                ) : null}
                {tab === 'restore' ? (
                  <RestorePanel
                    key={restorePreset?.nonce ?? 'restore'}
                    targets={targets}
                    snapshots={snapshots}
                    preview={preview}
                    busy={busy}
                    message={notice?.kind === 'ok' ? notice.text : null}
                    error={error}
                    loading={loading}
                    initialTargetId={restorePreset?.targetId}
                    initialSnapshotId={restorePreset?.snapshotId}
                    onNavigateStorage={() => navigate('storage')}
                    onPreview={(input) => {
                      setBusy(true)
                      setError(null)
                      setNotice(null)
                      setPreview(null)
                      // Send the global default plus per-path overrides so the
                      // response annotates every item with its `resolution`.
                      void api.previewRestore(
                        input.targetId,
                        input.snapshotId,
                        input.password,
                        input.conflict,
                        input.conflicts,
                      )
                        .then(setPreview)
                        .catch((err: unknown) => setError(errorText(err)))
                        .finally(() => setBusy(false))
                    }}
                    onRestore={(input) => {
                      setBusy(true)
                      setError(null)
                      setNotice(null)
                      void api.restore({
                        targetId: input.targetId,
                        snapshotId: input.snapshotId,
                        password: input.password,
                        conflict: input.conflict,
                        // Per-path overrides built by RestorePanel; unspecified
                        // paths fall back to `conflict`.
                        conflicts: input.conflicts,
                      })
                        .then((r) => {
                          const parts = [t('restore.successBody', { applied: r.applied.length, skipped: r.skipped.length })]
                          if (r.rollbackSnapshotId) parts.push(t('restore.rollbackCreated', { id: r.rollbackSnapshotId }))
                          if (r.pluginsReinstalled.length) parts.push(t('restore.pluginsReinstalled', { list: r.pluginsReinstalled.join(', ') }))
                          if (r.pluginsFailed.length) parts.push(t('restore.pluginsFailed', { list: r.pluginsFailed.join(', ') }))
                          for (const m of r.manualActions) parts.push(m)
                          setNotice({ kind: 'ok', text: parts.join(' · ') })
                          setPreview(null)
                          return refresh()
                        })
                        .catch((err: unknown) => setError(errorText(err)))
                        .finally(() => setBusy(false))
                    }}
                  />
                ) : null}
                {tab === 'storage' ? (
                  <StoragePanel
                    targets={targets}
                    busy={busy}
                    error={error}
                    message={notice?.kind === 'ok' ? notice.text : null}
                    loading={loading}
                    snapshots={snapshotsReliable ? snapshots : []}
                    testConnection={async (target) => {
                      try {
                        const r = await api.listSnapshots(target.id)
                        setTargetStatus((prev) => ({ ...prev, [target.id]: 'ok' }))
                        return { ok: true, count: r.snapshots.length }
                      } catch (err) {
                        setTargetStatus((prev) => ({ ...prev, [target.id]: 'error' }))
                        return { ok: false, error: errorText(err) }
                      }
                    }}
                    onUpsert={(target) => {
                      void run(async () => {
                        await api.upsertTarget(target)
                        setNotice({ kind: 'ok', text: t('storage.saved', { label: target.label }) })
                        await refresh()
                      })
                    }}
                    onDelete={(id) => {
                      const label = targetLabel(id)
                      void run(async () => {
                        await api.deleteTarget(id)
                        setNotice({ kind: 'ok', text: t('storage.deleted', { label }) })
                        await refresh()
                      })
                    }}
                  />
                ) : null}
                {tab === 'snapshots' ? (
                  <SnapshotsPanel
                    snapshots={snapshotsReliable ? snapshots : []}
                    busy={busy}
                    loading={loading}
                    error={snapshotsReliable ? error : error}
                    message={notice?.kind === 'ok' ? notice.text : null}
                    targets={targets}
                    currentRetention={settings?.retention}
                    onRefresh={() => void refresh()}
                    onNavigateBackup={() => navigate('backup')}
                    onRestoreRequest={(targetId, snapshotId) => {
                      setRestorePreset({ targetId, snapshotId, nonce: Date.now() })
                      setPreview(null)
                      navigate('restore')
                    }}
                    onDelete={(targetId, snapshotId) => {
                      void run(async () => {
                        await api.deleteSnapshot(targetId, snapshotId)
                        setNotice({ kind: 'ok', text: t('snapshots.deleted', { id: snapshotId }) })
                        if (preview?.snapshotId === snapshotId) setPreview(null)
                        await refresh()
                      })
                    }}
                    onVerify={async (targetId, snapshotId, password): Promise<VerifyResult> => {
                      try {
                        const r = await api.verify(targetId, snapshotId, password)
                        setNotice({ kind: 'ok', text: t('snapshots.verifyOk', { id: snapshotId, manifest: r.manifestId }) })
                        return { ok: true, manifestId: r.manifestId }
                      } catch (err) {
                        const msg = errorText(err)
                        if (err instanceof VaultApiError && err.status === 0) return { ok: false, error: msg }
                        setError(null)
                        return { ok: false, error: msg }
                      }
                    }}
                    onSaveRetention={(policy) => {
                      void run(async () => {
                        const s = await api.updateSettings({
                          retention: policy,
                          schedule: { ...(settings?.schedule ?? ({} as VaultSettings['schedule'])), retention: policy },
                        })
                        setStatus((prev) => (prev ? { ...prev, settings: s } : prev))
                        setNotice({ kind: 'ok', text: t('snapshots.retentionSaved') })
                      })
                    }}
                  />
                ) : null}
                {tab === 'settings' ? (
                  <SettingsPanel
                    settings={settings}
                    busy={busy}
                    loading={loading}
                    error={error}
                    message={notice?.kind === 'ok' ? notice.text : null}
                    targets={targets}
                    dshHome={status?.dshHome}
                    dataDir={status?.dataDir}
                    locale={locale}
                    onLocaleChange={setLocale}
                    theme={theme}
                    resolvedTheme={resolvedTheme}
                    onThemeChange={setTheme}
                    onRetry={() => void refresh()}
                    onSave={(patch) => {
                      void run(async () => {
                        const s = await api.updateSettings(patch)
                        setStatus((prev) => (prev ? { ...prev, settings: s } : prev))
                        setNotice({ kind: 'ok', text: t('settings.saved') })
                      })
                    }}
                    onRunSchedule={() => {
                      void run(async () => {
                        const r = await api.runSchedule()
                        setNotice({
                          kind: 'ok',
                          text: r.result ? t('settings.runDone', { id: r.result.snapshotId }) : t('settings.runSkipped'),
                        })
                        await refresh()
                      })
                    }}
                  />
                ) : null}
              </div>
            )}
          </main>
        </div>
      </div>
    </I18nContext.Provider>
  )
}

function IconCalendarGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

// Re-exported locale helpers so host code can bind the same namespace.
export { readStoredLocale }
