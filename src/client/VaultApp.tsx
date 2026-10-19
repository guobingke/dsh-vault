import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VaultApi, VaultApiError, type VaultStatusResponse } from './api.js'
import { Overview } from './components/Dashboard.js'
import { BackupPanel } from './components/BackupPanel.js'
import { RestorePanel } from './components/RestorePanel.js'
import { StoragePanel } from './components/StoragePanel.js'
import { SnapshotsPanel, type VerifyResult } from './components/SnapshotsPanel.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import { SectionHead, SectionTabs } from './components/ui.js'
import type { FsBrowser } from './components/PathPicker.js'
import { I18nContext, detectInitialLocale, normalizeLocale, translate, type Locale, type MessageKey } from './i18n.js'
import { formatBytes } from './lib/format.js'
import type { BackupCategory, RestorePreview, RestoreResult, SnapshotInfo, StorageTargetConfig, VaultSettings } from '../core/types.js'
import { failedPluginLabels, localizeNotice } from './notices.js'
import './theme.css'

export type VaultTab = 'overview' | 'backup' | 'restore' | 'storage' | 'snapshots' | 'schedule'

export interface BackupInput {
  targetId?: string
  directory?: string
  exportFile?: string
  encrypt: boolean
  password?: string
  includeSecrets: boolean
  notes?: string
  categories?: BackupCategory[]
}

export interface RestoreInput {
  targetId?: string
  snapshotId?: string
  importPath?: string
  password?: string
  conflict: 'keep-current' | 'use-backup'
  conflicts?: Record<string, 'keep-current' | 'use-backup'>
  reinstallPlugins?: boolean
  createRollbackSnapshot?: boolean
}

export interface PreviewInput {
  targetId?: string
  snapshotId?: string
  importPath?: string
  password?: string
  conflict?: 'keep-current' | 'use-backup'
  conflicts?: Record<string, 'keep-current' | 'use-backup'>
}

export interface VaultAppProps {
  api?: VaultApi
  /** Host locale tag e.g. "zh-CN" / "en-US"; the UI follows it. */
  hostLocale?: string
  initialTab?: VaultTab
}

type Notice = { kind: 'ok' | 'error'; text: string }

const TABS: VaultTab[] = ['overview', 'backup', 'restore', 'storage', 'snapshots', 'schedule']

function errorText(err: unknown): string {
  if (err instanceof VaultApiError) {
    return err.status ? `${err.message} (HTTP ${err.status})` : err.message
  }
  return err instanceof Error ? err.message : String(err)
}

export function VaultApp({ api: apiProp, hostLocale, initialTab = 'overview' }: VaultAppProps) {
  const api = useMemo(() => apiProp ?? new VaultApi(), [apiProp])
  // Browse… always opens the in-app browser; the native chooser is an extra when dsh exposes one.
  const fsBrowser = useMemo<FsBrowser>(() => ({
    list: (path) => api.listFs(path),
    mkdir: (path, name) => api.mkdir(path, name),
    pickNative: () => api.pickDirectory(),
  }), [api])

  /* ---------------- locale: follow the host, no in-app switch ---------------- */
  const locale: Locale = useMemo(() => (hostLocale ? normalizeLocale(hostLocale) : detectInitialLocale()), [hostLocale])
  const t = useMemo(
    () => (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  /* ---------------- data ---------------- */
  const [tab, setTab] = useState<VaultTab>(initialTab)
  const [status, setStatus] = useState<VaultStatusResponse | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
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
   * The HTTP API is request/response, so backup progress is optimistic: it
   * advances asymptotically toward 92% through named stages while the request
   * is in flight and completes when the promise settles.
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
        // Partial failure: the overview still renders; the snapshot list shows the error.
        setSnapshotsReliable(false)
        setError(errorText(snapErr))
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [api])

  /** Banner text for a restore (or retry) result; plugin rows themselves are in the results card. */
  const showRestoreOutcome = async (r: RestoreResult, isRetry: boolean): Promise<void> => {
    const failed = (r.pluginResults ?? []).some((row) => row.status === 'failed') || r.ok === false
    const parts: string[] = []
    if (!isRetry) {
      parts.push(failed
        ? t('restore.partialBody', { applied: r.applied.length, skipped: r.skipped.length })
        : t('restore.successBody', { applied: r.applied.length, skipped: r.skipped.length }))
      if (r.rollbackSnapshotId) parts.push(t('restore.rollbackCreated', { id: r.rollbackSnapshotId }))
    }
    if (failed) parts.push(t('restore.pluginsFailed', { list: failedPluginLabels(r.pluginResults, r.pluginsFailed) }))
    else if (!r.pluginResults?.length && r.pluginsReinstalled.length) {
      parts.push(t('restore.pluginsReinstalled', { list: [...new Set(r.pluginsReinstalled)].join('、') }))
    }
    if (r.restartRequired) parts.push(t('restore.restartRequired'))
    for (const m of r.manualActions) {
      // Plugin failures are listed per row; the restart hint is already localized above.
      if (r.pluginResults?.some((row) => m.startsWith(`${row.name} (`))) continue
      if (r.restartRequired && /^Restart /.test(m)) continue
      // Per-row reasons already say which local sources are missing.
      if (r.pluginResults?.length && /^Some plugins used local link:\/file: sources/.test(m)) continue
      parts.push(localizeNotice(m, t))
    }
    const text = [...new Set(parts)].join(' · ')
    setNotice({ kind: failed ? 'error' : 'ok', text })
    // refresh() clears `error`, so raise the failure banner after it.
    await refresh()
    if (failed) setError(text)
  }

  // Load once on mount, keyed by the API instance: `refresh` is re-created on
  // every render, so depending on it here would re-run on every render.
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  useEffect(() => () => { if (progressTimer.current) clearInterval(progressTimer.current) }, [])

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

  const tabItems = useMemo(
    () => TABS.map((id) => ({ id, label: t(`section.tab.${id}` as MessageKey), panelId: `dv-panel-${id}` })),
    [t],
  )

  const backupTo = useCallback((input: BackupInput) => {
    const stages = input.encrypt ? ['collect', 'pack', 'encrypt', 'upload'] : ['collect', 'pack', 'upload']
    setBusy(true)
    setError(null)
    setNotice(null)
    startProgress(stages, 5000)
    void api.backup(input)
      .then((r) => {
        setNotice({
          kind: 'ok',
          text: `${t('backup.successTitle', { id: r.snapshotId })} · ${formatBytes(r.bytes)} · ${targetLabel(r.targetId)}`,
        })
        return refresh()
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => {
        stopProgress()
        setBusy(false)
      })
  }, [api, refresh, startProgress, stopProgress, t, targetLabel])

  const i18nValue = useMemo(() => ({ locale, t }), [locale, t])

  return (
    <I18nContext.Provider value={i18nValue}>
      <div className="dsh-vault-root" lang={locale === 'zh' ? 'zh-CN' : 'en'}>
                <div className="dv-section">
          <SectionHead title={t('section.title')} description={t('section.description')} id="dv-section-title" />
          <SectionTabs label={t('section.tabs')} value={tab} onChange={navigate} items={tabItems} />
          {/* No fixed id here: panels may mount their own regions with ids. */}
          <main tabIndex={-1} className="dv-section-body">
            {tab === 'overview' ? (
              <Overview
                status={status}
                loading={loading}
                error={error}
                snapshots={snapshotsReliable ? snapshots : undefined}
                onRefresh={() => void refresh()}
                onBackup={() => navigate('backup')}
                onBackupNow={() => {
                  const targetId = settings?.defaultTargetId && targets.some((x) => x.id === settings.defaultTargetId)
                    ? settings.defaultTargetId
                    : targets[0]?.id
                  if (!targetId) {
                    navigate('storage')
                    return
                  }
                  backupTo({
                    targetId,
                    encrypt: Boolean(targets.find((x) => x.id === targetId)?.encryptByDefault),
                    includeSecrets: false,
                  })
                }}
                backupBusy={busy}
                onNavigate={navigate}
                message={notice?.kind === 'ok' ? notice.text : null}
              />
            ) : null}

            {tab === 'backup' ? (
              <BackupPanel
                key={backupTargetId ?? 'default'}
                targets={targets}
                busy={busy}
                message={notice?.kind === 'ok' ? notice.text : null}
                error={error}
                progress={busy ? progress?.value : undefined}
                stage={busy ? progress?.stage : undefined}
                defaultTargetId={backupTargetId ?? settings?.defaultTargetId}
                onBackup={backupTo}
                onNavigateStorage={() => navigate('storage')}
                fs={fsBrowser}
              />
            ) : null}

            {tab === 'restore' ? (
              <RestorePanel
                key={restorePreset?.nonce ?? 'restore'}
                targets={targets}
                snapshots={snapshotsReliable ? snapshots : []}
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
                  // Global default + per-path overrides so every item comes back
                  // annotated with its `resolution`.
                  void api.previewRestore(input.targetId, input.snapshotId, input.password, input.conflict, input.conflicts, input.importPath)
                    .then(setPreview)
                    .catch((err: unknown) => setError(errorText(err)))
                    .finally(() => setBusy(false))
                }}
                result={restoreResult}
                retrying={retrying}
                onRetryFailed={() => {
                  const failedRows = (restoreResult?.pluginResults ?? []).filter((row) => row.status === 'failed')
                  setRetrying(true)
                  setError(null)
                  setNotice(null)
                  void api.retryPlugins(failedRows.map((row) => ({ name: row.name, profile: row.profile })))
                    .then((r) => {
                      // Replace the retried rows in place; keep the rest of the original result.
                      const merged = new Map((restoreResult?.pluginResults ?? []).map((row) => [`${row.profile}:${row.name}`, row]))
                      for (const row of r.pluginResults ?? []) merged.set(`${row.profile}:${row.name}`, row)
                      const rows = [...merged.values()]
                      const next = {
                        ...(restoreResult ?? r),
                        pluginResults: rows,
                        pluginsFailed: rows.filter((row) => row.status === 'failed').map((row) => row.name),
                        pluginsReinstalled: rows.filter((row) => row.status === 'installed').map((row) => row.name),
                        restartRequired: Boolean(restoreResult?.restartRequired || r.restartRequired),
                        ok: rows.every((row) => row.status !== 'failed'),
                        manualActions: r.manualActions,
                      }
                      setRestoreResult(next)
                      return showRestoreOutcome(next, true)
                    })
                    .catch((err: unknown) => setError(errorText(err)))
                    .finally(() => setRetrying(false))
                }}
                onRestore={(input) => {
                  setRestoreResult(null)
                  setBusy(true)
                  setError(null)
                  setNotice(null)
                  void api.restore({
                    targetId: input.targetId,
                    snapshotId: input.snapshotId,
                    importPath: input.importPath,
                    password: input.password,
                    conflict: input.conflict,
                    conflicts: input.conflicts,
                    reinstallPlugins: input.reinstallPlugins,
                    createRollbackSnapshot: input.createRollbackSnapshot,
                  })
                    .then((r) => {
                      setRestoreResult(r)
                      setPreview(null)
                      return showRestoreOutcome(r, false)
                    })
                    .catch((err: unknown) => setError(errorText(err)))
                    .finally(() => setBusy(false))
                }}
                fs={fsBrowser}
              />
            ) : null}

            {tab === 'storage' ? (
              <StoragePanel
                fs={fsBrowser}
                targets={targets}
                busy={busy}
                error={error}
                message={notice?.kind === 'ok' ? notice.text : null}
                loading={loading}
                snapshots={snapshotsReliable ? snapshots : []}
                testConnection={async (target) => {
                  try {
                    const r = await api.listSnapshots(target.id)
                    return { ok: true, count: r.snapshots.length }
                  } catch (err) {
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
                error={error}
                message={notice?.kind === 'ok' ? notice.text : null}
                targets={targets}
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
                    await api.verify(targetId, snapshotId, password)
                    setNotice({ kind: 'ok', text: t('snapshots.verifyOk') })
                    return { ok: true }
                  } catch (err) {
                    return { ok: false, error: errorText(err) }
                  }
                }}
              />
            ) : null}

            {tab === 'schedule' ? (
              <SettingsPanel
                settings={settings}
                busy={busy}
                loading={loading}
                error={error}
                message={notice?.kind === 'ok' ? notice.text : null}
                targets={targets}
                locale={locale}
                onRetry={() => void refresh()}
                onSave={(patch) => {
                  void run(async () => {
                    const s = await api.updateSettings(patch)
                    setStatus((prev) => (prev ? { ...prev, settings: s } : prev))
                    setNotice({ kind: 'ok', text: t('schedule.saved') })
                  })
                }}
                onRunSchedule={() => {
                  void run(async () => {
                    const r = await api.runSchedule()
                    setNotice({
                      kind: 'ok',
                      text: r.result ? t('schedule.runDone', { id: r.result.snapshotId }) : t('schedule.runSkipped'),
                    })
                    await refresh()
                  })
                }}
              />
            ) : null}
          </main>
        </div>
      </div>
    </I18nContext.Provider>
  )
}
