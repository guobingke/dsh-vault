import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VaultApi, VaultApiError } from './api.js';
import { Overview } from './components/Dashboard.js';
import { BackupPanel } from './components/BackupPanel.js';
import { JobProgress } from './components/JobProgress.js';
import { RestorePanel } from './components/RestorePanel.js';
import { StoragePanel } from './components/StoragePanel.js';
import { SnapshotsPanel } from './components/SnapshotsPanel.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { Banner, Button, SectionHead, SectionTabs } from './components/ui.js';
import { I18nContext, detectInitialLocale, normalizeLocale, translate } from './i18n.js';
import { failedPluginLabels, localizeNotice } from './notices.js';
import './theme.css';
const TABS = ['overview', 'backup', 'restore', 'storage', 'snapshots', 'schedule'];
function errorText(err) {
    if (err instanceof VaultApiError) {
        return err.status ? `${err.message} (HTTP ${err.status})` : err.message;
    }
    return err instanceof Error ? err.message : String(err);
}
export function VaultApp({ api: apiProp, hostLocale, initialTab = 'overview' }) {
    const api = useMemo(() => apiProp ?? new VaultApi(), [apiProp]);
    // Browse… always opens the in-app browser; the native chooser is an extra when dsh exposes one.
    const fsBrowser = useMemo(() => ({
        list: (path) => api.listFs(path),
        mkdir: (path, name) => api.mkdir(path, name),
        pickNative: () => api.pickDirectory(),
    }), [api]);
    /* ---------------- locale: follow the host, no in-app switch ---------------- */
    const locale = useMemo(() => (hostLocale ? normalizeLocale(hostLocale) : detectInitialLocale()), [hostLocale]);
    const t = useMemo(() => (key, vars) => translate(locale, key, vars), [locale]);
    /* ---------------- data ---------------- */
    const [tab, setTab] = useState(initialTab);
    const [status, setStatus] = useState(null);
    const [snapshots, setSnapshots] = useState([]);
    const [preview, setPreview] = useState(null);
    const [restoreResult, setRestoreResult] = useState(null);
    const [lastBackup, setLastBackup] = useState(null);
    const [retrying, setRetrying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [snapshotsReliable, setSnapshotsReliable] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [backupTargetId, setBackupTargetId] = useState(undefined);
    const [restorePreset, setRestorePreset] = useState(null);
    const [job, setJob] = useState(null);
    const pollTimer = useRef(null);
    const restoreResultRef = useRef(null);
    restoreResultRef.current = restoreResult;
    const jobDone = useRef(null);
    /** Poll a server job until it settles; survives tab switches (state lives here). */
    const followJob = useCallback((first, onDone) => {
        if (pollTimer.current)
            clearTimeout(pollTimer.current);
        jobDone.current = onDone;
        setJob(first);
        setBusy(true);
        const tick = async (id) => {
            try {
                const { job: j } = await api.getJob(id);
                if (!j)
                    throw new Error('job lost');
                setJob(j);
                if (j.status === 'running') {
                    pollTimer.current = setTimeout(() => void tick(id), 500);
                    return;
                }
                setBusy(false);
                setRetrying(false);
                setJob(null);
                if (j.status === 'error')
                    setError(j.error?.message ?? 'failed');
                else
                    await jobDone.current?.(j);
            }
            catch (err) {
                // Transient (e.g. host busy): keep polling a little slower.
                pollTimer.current = setTimeout(() => void tick(id), 1500);
                if (err instanceof Error && /not found/.test(err.message)) {
                    setBusy(false);
                    setRetrying(false);
                    setJob(null);
                    if (pollTimer.current)
                        clearTimeout(pollTimer.current);
                }
            }
        };
        if (first.status === 'running')
            pollTimer.current = setTimeout(() => void tick(first.id), 400);
        else
            void tick(first.id);
    }, [api]);
    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const s = await api.status();
            setStatus(s);
            try {
                const snap = await api.listSnapshots();
                setSnapshots(snap.snapshots);
                setSnapshotsReliable(true);
            }
            catch (snapErr) {
                // Partial failure: the overview still renders; the snapshot list shows the error.
                setSnapshotsReliable(false);
                setError(errorText(snapErr));
            }
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setLoading(false);
        }
    }, [api]);
    /** Banner text for a restore (or retry) result; plugin rows themselves are in the results card. */
    const showRestoreOutcome = async (r, isRetry) => {
        const failed = (r.pluginResults ?? []).some((row) => row.status === 'failed') || r.ok === false;
        const parts = [];
        if (!isRetry) {
            parts.push(failed
                ? t('restore.partialBody', { applied: r.applied.length, skipped: r.skipped.length })
                : t('restore.successBody', { applied: r.applied.length, skipped: r.skipped.length }));
            if (r.rollbackSnapshotId)
                parts.push(t('restore.rollbackCreated', { id: r.rollbackSnapshotId }));
        }
        if (failed)
            parts.push(t('restore.pluginsFailed', { list: failedPluginLabels(r.pluginResults, r.pluginsFailed) }));
        else if (!r.pluginResults?.length && r.pluginsReinstalled.length) {
            parts.push(t('restore.pluginsReinstalled', { list: [...new Set(r.pluginsReinstalled)].join('、') }));
        }
        if (r.restartRequired)
            parts.push(t('restore.restartRequired'));
        for (const m of r.manualActions) {
            // Plugin failures are listed per row; the restart hint is already localized above.
            if (r.pluginResults?.some((row) => m.startsWith(`${row.name} (`)))
                continue;
            if (r.restartRequired && /^Restart /.test(m))
                continue;
            // Per-row reasons already say which local sources are missing.
            if (r.pluginResults?.length && /^Some plugins used local link:\/file: sources/.test(m))
                continue;
            parts.push(localizeNotice(m, t));
        }
        const text = [...new Set(parts)].join(' · ');
        setNotice({ kind: failed ? 'error' : 'ok', text });
        // refresh() clears `error`, so raise the failure banner after it.
        await refresh();
        // The failure is shown by the completion summary (RestoreSummary), not a second error banner.
    };
    // Load once on mount, keyed by the API instance: `refresh` is re-created on
    // every render, so depending on it here would re-run on every render.
    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api]);
    useEffect(() => () => { if (pollTimer.current)
        clearTimeout(pollTimer.current); }, []);
    const run = useCallback(async (fn) => {
        setBusy(true);
        setError(null);
        try {
            return await fn();
        }
        catch (err) {
            setError(errorText(err));
            return undefined;
        }
        finally {
            setBusy(false);
        }
    }, []);
    const targets = status?.targets ?? [];
    const settings = status?.settings ?? null;
    const targetLabel = useCallback((id) => targets.find((x) => x.id === id)?.label ?? id, [targets]);
    const navigate = useCallback((next) => {
        setTab(next);
        setError(null);
        setNotice(null);
        if (next !== 'restore')
            setPreview(null);
    }, []);
    const tabItems = useMemo(() => TABS.map((id) => ({ id, label: t(`section.tab.${id}`), panelId: `dv-panel-${id}` })), [t]);
    const showOutcomeRef = useRef(showRestoreOutcome);
    showOutcomeRef.current = showRestoreOutcome;
    const finishBackup = useCallback(async (j) => {
        setLastBackup(j.result);
        await refresh();
    }, [refresh]);
    const finishRestore = useCallback(async (j) => {
        const r = j.result;
        setRestoreResult(r);
        setPreview(null);
        await showOutcomeRef.current(r, false);
    }, []);
    const finishRetry = useCallback(async (j) => {
        const r = j.result;
        const prev = restoreResultRef.current;
        // Replace the retried rows in place; keep the rest of the original result.
        const merged = new Map((prev?.pluginResults ?? []).map((row) => [`${row.profile}:${row.name}`, row]));
        for (const row of r.pluginResults ?? [])
            merged.set(`${row.profile}:${row.name}`, row);
        const rows = [...merged.values()];
        const next = {
            ...(prev ?? r),
            pluginResults: rows,
            pluginsFailed: rows.filter((row) => row.status === 'failed').map((row) => row.name),
            pluginsReinstalled: rows.filter((row) => row.status === 'installed' || row.status === 'installed-from-backup').map((row) => row.name),
            restartRequired: Boolean(prev?.restartRequired || r.restartRequired),
            ok: rows.every((row) => row.status !== 'failed'),
            manualActions: r.manualActions,
        };
        setRestoreResult(next);
        await showOutcomeRef.current(next, true);
    }, []);
    // Re-attach to a job still running on the server (page re-opened mid-backup/restore).
    useEffect(() => {
        let alive = true;
        api.getJob().then(({ job: j }) => {
            if (!alive || !j || j.status !== 'running')
                return;
            if (j.kind === 'retry-plugins')
                setRetrying(true);
            followJob(j, j.kind === 'backup' ? finishBackup : j.kind === 'restore' ? finishRestore : finishRetry);
        }).catch(() => { });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api]);
    const backupTo = useCallback((input) => {
        setError(null);
        setNotice(null);
        setLastBackup(null);
        setBusy(true);
        void api.startBackupJob(input)
            .then((j) => followJob(j, finishBackup))
            .catch((err) => {
            // C-02: an existing export file is never replaced silently.
            if (err instanceof VaultApiError && err.code === 'EXPORT_EXISTS' && !input.overwrite
                && typeof window !== 'undefined' && window.confirm(t('backup.overwriteConfirm'))) {
                backupTo({ ...input, overwrite: true });
                return;
            }
            setBusy(false);
            setError(errorText(err));
        });
    }, [api, followJob, finishBackup, t]);
    const i18nValue = useMemo(() => ({ locale, t }), [locale, t]);
    return (_jsx(I18nContext.Provider, { value: i18nValue, children: _jsx("div", { className: "dsh-vault-root", lang: locale === 'zh' ? 'zh-CN' : 'en', children: _jsxs("div", { className: "dv-section", children: [_jsx(SectionHead, { title: t('section.title'), description: t('section.description'), id: "dv-section-title" }), _jsx(SectionTabs, { label: t('section.tabs'), value: tab, onChange: navigate, items: tabItems }), _jsxs("main", { tabIndex: -1, className: "dv-section-body", children: [job ? _jsx(JobProgress, { job: job }) : null, status?.unfinishedRestore ? (_jsxs(Banner, { tone: "error", role: "alert", title: t('unfinished.title'), actions: _jsxs(_Fragment, { children: [status.unfinishedRestore.rollbackSnapshotId ? (_jsx(Button, { variant: "danger", disabled: busy, onClick: () => {
                                                const u = status.unfinishedRestore;
                                                setRestorePreset({ targetId: u.rollbackTargetId ?? 'local-rollback', snapshotId: u.rollbackSnapshotId, nonce: Date.now() });
                                                setPreview(null);
                                                navigate('restore');
                                            }, children: t('unfinished.rollback') })) : null, _jsx(Button, { disabled: busy, onClick: () => {
                                                void api.dismissUnfinishedRestore().then(() => refresh(), () => refresh());
                                            }, children: t('unfinished.dismiss') })] }), children: [t(status.unfinishedRestore.rollbackSnapshotId ? 'unfinished.body' : 'unfinished.bodyNoRollback', {
                                        snapshot: status.unfinishedRestore.snapshotId,
                                        time: status.unfinishedRestore.startedAt,
                                    }), status.unfinishedRestore.rollbackEncrypted ? ' ' + t('unfinished.encrypted') : ''] })) : null, tab === 'overview' ? (_jsx(Overview, { status: status, loading: loading, error: error, snapshots: snapshotsReliable ? snapshots : undefined, onRefresh: () => void refresh(), onBackup: () => navigate('backup'), onBackupNow: () => {
                                    const targetId = settings?.defaultTargetId && targets.some((x) => x.id === settings.defaultTargetId)
                                        ? settings.defaultTargetId
                                        : targets[0]?.id;
                                    if (!targetId) {
                                        navigate('storage');
                                        return;
                                    }
                                    backupTo({
                                        targetId,
                                        encrypt: Boolean(targets.find((x) => x.id === targetId)?.encryptByDefault),
                                        includeSecrets: false,
                                    });
                                }, backupBusy: busy, onNavigate: navigate, message: notice?.kind === 'ok' ? notice.text : null })) : null, tab === 'backup' ? (_jsx(BackupPanel, { targets: targets, busy: busy, message: notice?.kind === 'ok' ? notice.text : null, error: error, defaultTargetId: backupTargetId ?? settings?.defaultTargetId, onBackup: backupTo, onNavigateStorage: () => navigate('storage'), fs: fsBrowser, pluginDataEntries: status?.pluginDataEntries, copiesApi: api, result: lastBackup, resultLocation: lastBackup ? lastBackup.exportPath ?? targetLabel(lastBackup.targetId) : '' }, backupTargetId ?? 'default')) : null, tab === 'restore' ? (_jsx(RestorePanel, { targets: targets, snapshots: snapshotsReliable ? snapshots : [], preview: preview, busy: busy, message: notice?.kind === 'ok' ? notice.text : null, error: error, loading: loading, initialTargetId: restorePreset?.targetId, initialSnapshotId: restorePreset?.snapshotId, archiveLimitBytes: status?.archiveLimitBytes, onNavigateStorage: () => navigate('storage'), onPreview: (input) => {
                                    setBusy(true);
                                    setError(null);
                                    setNotice(null);
                                    setPreview(null);
                                    // Global default + per-path overrides so every item comes back
                                    // annotated with its `resolution`.
                                    void api.previewRestore(input.targetId, input.snapshotId, input.password, input.conflict, input.conflicts, input.importPath)
                                        .then(setPreview)
                                        .catch((err) => setError(errorText(err)))
                                        .finally(() => setBusy(false));
                                }, result: restoreResult, retrying: retrying, onRetryFailed: () => {
                                    const failedRows = (restoreResult?.pluginResults ?? []).filter((row) => row.status === 'failed');
                                    setRetrying(true);
                                    setError(null);
                                    setNotice(null);
                                    void api.startRetryPluginsJob(failedRows.map((row) => ({ name: row.name, profile: row.profile })))
                                        .then((j) => followJob(j, finishRetry))
                                        .catch((err) => {
                                        setRetrying(false);
                                        setError(errorText(err));
                                    });
                                }, onRestore: (input) => {
                                    setRestoreResult(null);
                                    setBusy(true);
                                    setError(null);
                                    setNotice(null);
                                    void api.startRestoreJob({
                                        targetId: input.targetId,
                                        snapshotId: input.snapshotId,
                                        importPath: input.importPath,
                                        password: input.password,
                                        conflict: input.conflict,
                                        conflicts: input.conflicts,
                                        reinstallPlugins: input.reinstallPlugins,
                                        createRollbackSnapshot: input.createRollbackSnapshot,
                                    })
                                        .then((j) => followJob(j, finishRestore))
                                        .catch((err) => {
                                        setBusy(false);
                                        setError(errorText(err));
                                    });
                                }, fs: fsBrowser }, restorePreset?.nonce ?? 'restore')) : null, tab === 'storage' ? (_jsx(StoragePanel, { fs: fsBrowser, targets: targets, busy: busy, error: error, message: notice?.kind === 'ok' ? notice.text : null, loading: loading, snapshots: snapshotsReliable ? snapshots : [], testConnection: async (target) => {
                                    try {
                                        const r = await api.listSnapshots(target.id);
                                        return { ok: true, count: r.snapshots.length };
                                    }
                                    catch (err) {
                                        return { ok: false, error: errorText(err) };
                                    }
                                }, onUpsert: (target) => {
                                    void run(async () => {
                                        await api.upsertTarget(target);
                                        setNotice({ kind: 'ok', text: t('storage.saved', { label: target.label }) });
                                        await refresh();
                                    });
                                }, onDelete: (id) => {
                                    const label = targetLabel(id);
                                    void run(async () => {
                                        await api.deleteTarget(id);
                                        setNotice({ kind: 'ok', text: t('storage.deleted', { label }) });
                                        await refresh();
                                    });
                                } })) : null, tab === 'snapshots' ? (_jsx(SnapshotsPanel, { snapshots: snapshotsReliable ? snapshots : [], busy: busy, loading: loading, error: error, message: notice?.kind === 'ok' ? notice.text : null, targets: targets, onRefresh: () => void refresh(), onNavigateBackup: () => navigate('backup'), onRestoreRequest: (targetId, snapshotId) => {
                                    setRestorePreset({ targetId, snapshotId, nonce: Date.now() });
                                    setPreview(null);
                                    navigate('restore');
                                }, onDelete: (targetId, snapshotId) => {
                                    void run(async () => {
                                        await api.deleteSnapshot(targetId, snapshotId);
                                        setNotice({ kind: 'ok', text: t('snapshots.deleted', { id: snapshotId }) });
                                        if (preview?.snapshotId === snapshotId)
                                            setPreview(null);
                                        await refresh();
                                    });
                                }, onVerify: async (targetId, snapshotId, password) => {
                                    try {
                                        await api.verify(targetId, snapshotId, password);
                                        setNotice({ kind: 'ok', text: t('snapshots.verifyOk') });
                                        return { ok: true };
                                    }
                                    catch (err) {
                                        return { ok: false, error: errorText(err) };
                                    }
                                } })) : null, tab === 'schedule' ? (_jsx(SettingsPanel, { settings: settings, busy: busy, loading: loading, error: error, message: notice?.kind === 'ok' ? notice.text : null, targets: targets, locale: locale, onRetry: () => void refresh(), onSave: (patch) => {
                                    void run(async () => {
                                        const s = await api.updateSettings(patch);
                                        setStatus((prev) => (prev ? { ...prev, settings: s } : prev));
                                        setNotice({ kind: 'ok', text: t('schedule.saved') });
                                    });
                                }, onRunSchedule: () => {
                                    void run(async () => {
                                        const r = await api.runSchedule();
                                        setNotice({
                                            kind: 'ok',
                                            text: r.result ? t('schedule.runDone', { id: r.result.snapshotId }) : t('schedule.runSkipped'),
                                        });
                                        await refresh();
                                    });
                                } })) : null] })] }) }) }));
}
//# sourceMappingURL=VaultApp.js.map