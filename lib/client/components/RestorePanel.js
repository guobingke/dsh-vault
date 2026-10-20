import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { targetName } from '../lib/format.js';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useT } from '../i18n.js';
import { buildRestoreRequest } from '../lib/requests.js';
import { formatBytes, formatDateTime, relativeLabel } from '../lib/format.js';
import { newestFirst } from '../lib/targets.js';
const ROLLBACK_TARGET_ID = 'local-rollback';
import { localizeNotice, pluginRawDetail, pluginReasonText } from '../notices.js';
import { PathPicker } from './PathPicker.js';
import { DiffGroups } from './DiffGroups.js';
import { RestoreSummary, pluginCounts } from './ResultSummary.js';
import { Banner, Button, Card, CardHead, Checkbox, Collapsible, ConfirmDialog, EmptyState, Field, LoadingInline, OptionTile, PasswordInput, Rows, SearchInput, Select, SettingRow, Switch, Tag, TextInput, } from './ui.js';
const MAX_ROWS = 200;
/** Global default sent with preview/restore; per-path choices override it. */
const DEFAULT_CONFLICT = 'use-backup';
function sameConflicts(a, b) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}
/** How a diff row will be handled by restore, mirroring the backend rules. */
function outcomeOf(item, strategy) {
    if (item.change === 'add')
        return 'apply';
    if (item.change === 'change')
        return strategy === 'use-backup' ? 'apply' : 'skip';
    return 'noop';
}
function changeLabel(tr, change) {
    switch (change) {
        case 'add': return tr('restore.added');
        case 'change': return tr('restore.changed');
        case 'remove': return tr('restore.removed');
        default: return tr('restore.unchanged');
    }
}
function strategyLabel(tr, strategy) {
    return strategy === 'use-backup' ? tr('restore.useBackup') : tr('restore.keepCurrent');
}
export function RestorePanel({ targets, snapshots, preview, archiveLimitBytes, onSourceChange, busy, message, error, onPreview, onRestore, loading, initialTargetId, initialSnapshotId, onNavigateStorage, fs, result, onRetryFailed, retrying, }) {
    const tr = useT();
    const locale = useLocale();
    const groupId = useId();
    const [pickerOpen, setPickerOpen] = useState(false);
    const topRef = useRef(null);
    // The restore button sits far below the banners; bring the outcome into view.
    useEffect(() => {
        if (result || message || error)
            topRef.current?.scrollIntoView?.({ block: 'start' });
    }, [result, message, error]);
    const [sourceMode, setSourceMode] = useState(initialTargetId || initialSnapshotId || snapshots.length ? 'target' : 'import');
    const [targetId, setTargetId] = useState(initialTargetId ?? '');
    const [snapshotId, setSnapshotId] = useState(initialSnapshotId ?? '');
    const [importPath, setImportPath] = useState('');
    const [search, setSearch] = useState('');
    const [password, setPassword] = useState('');
    const [showPasswordError, setShowPasswordError] = useState(false);
    const [ack, setAck] = useState(false);
    const [rollback, setRollback] = useState(true);
    const [reinstall, setReinstall] = useState(true);
    const [withSecrets, setWithSecrets] = useState(true);
    /** Non-registry plugin sources the user allowed (H-06); reset per preview. */
    const [approvedSources, setApprovedSources] = useState({});
    const [dialogOpen, setDialogOpen] = useState(false);
    const [choices, setChoices] = useState({});
    const [diffFilter, setDiffFilter] = useState('all');
    const targetLabel = (id) => targetName(targets.find((t) => t.id === id), tr, id);
    const usingImport = sourceMode === 'import';
    // Keep the target filter valid. "" (all locations) is a valid user choice; only the
    // first default skips rollback snapshots so the newest real backup is preselected.
    const filterInit = useRef(false);
    useEffect(() => {
        if (usingImport || !snapshots.length)
            return;
        if (filterInit.current && (targetId === '' || snapshots.some((s) => s.targetId === targetId)))
            return;
        filterInit.current = true;
        const has = (id) => Boolean(id) && snapshots.some((s) => s.targetId === id);
        const realFirst = [...snapshots].sort(newestFirst).find((s) => s.targetId !== ROLLBACK_TARGET_ID);
        setTargetId(has(initialTargetId) ? initialTargetId : realFirst?.targetId ?? '');
    }, [snapshots, targetId, initialTargetId, usingImport]);
    const extraTargetIds = useMemo(() => [...new Set(snapshots.map((s) => s.targetId))].filter((id) => !targets.some((t) => t.id === id)), [snapshots, targets]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return snapshots
            .filter((s) => !targetId || s.targetId === targetId)
            .filter((s) => !q || s.id.toLowerCase().includes(q) || (s.notes ?? '').toLowerCase().includes(q))
            .sort(newestFirst);
    }, [snapshots, targetId, search]);
    useEffect(() => {
        if (usingImport)
            return;
        if (snapshotId && filtered.some((s) => s.id === snapshotId))
            return;
        setSnapshotId(filtered[0]?.id ?? '');
    }, [filtered, snapshotId, usingImport]);
    const selected = usingImport
        ? null
        : snapshots.find((s) => s.id === snapshotId && (!targetId || s.targetId === targetId))
            ?? snapshots.find((s) => s.id === snapshotId);
    /** Target snapshots declare encryption; import paths always offer an optional password field. */
    const needsPassword = usingImport ? false : Boolean(selected?.encrypted);
    const showPasswordField = usingImport || needsPassword;
    const canStartPreview = usingImport ? Boolean(importPath.trim()) : Boolean(selected);
    // Reset per-path choices whenever a new preview arrives.
    const previewKey = preview ? `${preview.snapshotId}:${preview.added}:${preview.changed}:${preview.removed}` : null;
    useEffect(() => {
        setChoices({});
        setAck(false);
        setDiffFilter('all');
        // Imported files are untrusted: their git/URL plugin sources start unchecked.
        const next = {};
        for (const r of preview?.remotePluginSources ?? [])
            next[r.key] = !usingImport && r.trusted !== false;
        setApprovedSources(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewKey]);
    const changes = useMemo(() => (preview ? preview.items.filter((i) => i.change === 'add' || i.change === 'change') : []), [preview]);
    const choiceFor = (path) => choices[path] ?? DEFAULT_CONFLICT;
    const setChoice = (path, value) => setChoices((prev) => ({ ...prev, [path]: value }));
    const setAll = (value) => {
        const next = {};
        for (const c of changes)
            next[c.path] = value;
        setChoices(next);
    };
    const keepCount = changes.filter((c) => choiceFor(c.path) === 'keep-current').length;
    const useCount = changes.length - keepCount;
    // Global default (as last sent) + per-path map for the next request.
    const requestedConflict = preview?.conflict ?? DEFAULT_CONFLICT;
    const requestedConflicts = useMemo(() => preview?.conflicts ?? {}, [preview]);
    /**
     * Re-fetch the preview when a per-path decision differs from what the current
     * preview was computed with, so `items[].resolution` stays in sync with what
     * `POST /restore` would do. Debounced.
     */
    useEffect(() => {
        if (!preview || busy)
            return;
        if (sameConflicts(choices, requestedConflicts))
            return;
        const timer = setTimeout(() => {
            onPreview({
                targetId: usingImport ? undefined : selected?.targetId,
                snapshotId: usingImport ? undefined : preview.snapshotId,
                importPath: usingImport ? importPath.trim() : undefined,
                password: password || undefined,
                conflict: requestedConflict,
                conflicts: choices,
            });
        }, 350);
        return () => clearTimeout(timer);
    }, [preview, busy, choices, requestedConflicts, onPreview, selected, password, requestedConflict, usingImport, importPath]);
    const applyCount = changes.filter((c) => outcomeOf(c, c.resolution ?? choiceFor(c.path)) === 'apply').length;
    function startPreview() {
        setAck(false);
        setShowPasswordError(false);
        if (!canStartPreview)
            return;
        if (needsPassword && !password) {
            setShowPasswordError(true);
            return;
        }
        onPreview({
            targetId: usingImport ? undefined : selected?.targetId,
            snapshotId: usingImport ? undefined : selected?.id,
            importPath: usingImport ? importPath.trim() : undefined,
            password: password || undefined,
            conflict: DEFAULT_CONFLICT,
            conflicts: choices,
        });
    }
    function submitRestore() {
        if (!preview)
            return;
        if (!ack)
            return;
        onRestore(buildRestoreRequest({
            usingImport,
            targetId: selected?.targetId,
            snapshotId: preview.snapshotId,
            importPath,
            password,
            conflict: requestedConflict,
            conflicts: choices,
            rollback,
            reinstall,
            withSecrets,
            secretsAvailable: Boolean(preview.secretsAvailable),
            approvedSources,
        }));
    }
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", ref: topRef, children: tr('restore.desc') }), error ? _jsx(Banner, { tone: "error", title: tr('restore.failedTitle'), children: error }) : null, result ? (_jsx(RestoreSummary, { result: result, onRetry: onRetryFailed, retrying: retrying })) : message ? (_jsxs(Banner, { tone: "ok", title: tr('restore.successTitle'), children: [_jsx("div", { children: message }), _jsx("div", { className: "dv-hint", children: tr('restore.restartHint') })] })) : null, result?.pluginResults?.length ? (_jsx(Collapsible, { summary: tr('restore.resultTitle'), defaultOpen: false, children: _jsx(PluginResults, { result: result }) })) : null, _jsxs(Card, { children: [_jsx(CardHead, { title: tr('restore.sourceTitle'), sub: tr('restore.sourceDesc') }), _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" }), _jsx(Rows, { children: _jsx(SettingRow, { title: tr('restore.sourceMode'), description: tr('restore.sourceModeDesc'), children: _jsxs("select", { className: "dv-input", value: sourceMode, onChange: (e) => {
                                    setSourceMode(e.target.value);
                                    setAck(false);
                                    onSourceChange?.();
                                }, "aria-label": tr('restore.sourceMode'), children: [_jsx("option", { value: "target", children: tr('restore.source.target') }), _jsx("option", { value: "import", children: tr('restore.source.import') })] }) }) }), usingImport ? (_jsxs(Field, { label: tr('restore.importPath'), htmlFor: "dv-restore-import", hint: tr('restore.importPathHint') + (archiveLimitBytes ? ' ' + tr('restore.archiveLimit', { size: formatBytes(archiveLimitBytes) }) : ''), children: [_jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(TextInput, { id: "dv-restore-import", value: importPath, onChange: (e) => setImportPath(e.target.value), placeholder: tr('restore.importPathPlaceholder'), mono: true }), fs ? (_jsx(Button, { variant: "quiet", onClick: () => setPickerOpen(true), children: tr('restore.browse') })) : null] }), fs ? (_jsx(PathPicker, { open: pickerOpen, mode: "open", fs: fs, initialPath: importPath, onClose: () => setPickerOpen(false), onSelect: (p) => { setImportPath(p); setAck(false); setPickerOpen(false); } })) : null] })) : targets.length === 0 && snapshots.length === 0 ? (_jsx(EmptyState, { title: tr('restore.noTargetsTitle'), body: tr('restore.noTargetsBody'), actions: onNavigateStorage ? _jsx(Button, { variant: "primary", onClick: onNavigateStorage, children: tr('backup.goStorage') }) : null })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }, children: [_jsxs(Select, { "aria-label": tr('restore.filterTarget'), value: targetId, onChange: (e) => setTargetId(e.target.value), children: [_jsx("option", { value: "", children: tr('common.allTargets') }), targets.map((t) => (_jsx("option", { value: t.id, children: targetName(t, tr) }, t.id))), extraTargetIds.map((id) => (_jsx("option", { value: id, children: id === ROLLBACK_TARGET_ID ? tr('restore.rollbackTarget') : id }, id)))] }), _jsx("div", { style: { width: 180 }, children: _jsx(SearchInput, { value: search, onChange: setSearch, placeholder: tr('restore.search'), label: tr('restore.search') }) })] }), loading && snapshots.length === 0 ? (_jsx(LoadingInline, { label: tr('app.loading') })) : filtered.length === 0 ? (_jsx(EmptyState, { title: snapshots.length === 0 ? tr('restore.emptyTitle') : tr('restore.noMatch'), body: snapshots.length === 0 ? tr('restore.emptyBody') : undefined })) : (_jsx("div", { className: "dv-options", role: "radiogroup", "aria-label": tr('restore.select'), style: { maxHeight: 320, overflowY: 'auto' }, children: filtered.slice(0, 50).map((s) => (_jsx(OptionTile, { name: `${groupId}-snapshot`, checked: s.id === snapshotId && (!targetId || s.targetId === targetId), onChange: () => {
                                        setSnapshotId(s.id);
                                        setAck(false);
                                    }, title: _jsxs(_Fragment, { children: [_jsx("span", { className: "dv-mono", children: s.id }), _jsx(Tag, { tone: s.encrypted ? 'ok' : 'neutral', children: s.encrypted ? tr('common.encrypted') : tr('common.plaintext') }), s.includeSecrets ? _jsx(Tag, { tone: "warn", children: tr('common.secrets') }) : null] }), description: _jsxs(_Fragment, { children: [targetLabel(s.targetId), " \u00B7 ", formatDateTime(s.createdAt, locale), "\uFF08", relativeLabel(tr, s.createdAt), "\uFF09 \u00B7 ", formatBytes(s.bytes), s.notes ? ` · ${s.notes}` : ''] }) }, `${s.targetId}:${s.id}`))) }))] })), showPasswordField ? (_jsx(Field, { label: tr('restore.password'), htmlFor: "dv-restore-password", hint: usingImport ? tr('restore.importPasswordHint') : tr('restore.passwordHint'), error: showPasswordError && !password ? tr('restore.passwordRequired') : null, children: _jsx(PasswordInput, { id: "dv-restore-password", value: password, onChange: (e) => setPassword(e.target.value), onKeyDown: (e) => {
                                if (e.key === 'Enter')
                                    startPreview();
                            } }) })) : null, _jsx("div", { className: "dv-card-foot", children: _jsx(Button, { variant: "primary", onClick: startPreview, disabled: !canStartPreview || busy, loading: busy && !preview, children: busy && !preview ? tr('restore.previewing') : tr('restore.preview') }) })] }), preview?.crossPlatform ? (_jsxs(Banner, { tone: "warn", title: tr('restore.crossPlatformTitle'), children: [_jsx("div", { children: tr('restore.crossPlatformDesc', { source: preview.sourcePlatform ?? '?', target: preview.targetPlatform ?? '?' }) }), _jsx("div", { className: "dv-hint", style: { marginTop: 6 }, children: tr('restore.crossPlatformLocalSources') })] })) : null, preview ? (_jsxs(Card, { children: [_jsx(CardHead, { title: tr('restore.diffTitle'), sub: tr('restore.diffDesc', {
                            added: preview.added,
                            changed: preview.changed,
                            removed: preview.removed,
                            unchanged: preview.unchanged,
                        }) }), _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" }), _jsx("span", { className: "dv-card-sub dv-mono", children: preview.snapshotId }), preview.items.length === 0 ? (_jsx("span", { className: "dv-hint", children: tr('restore.diffEmpty') })) : (_jsx(DiffGroups, { items: preview.items, renderOutcome: (i) => {
                            if (i.change !== 'add' && i.change !== 'change')
                                return _jsx("span", { className: "dv-muted", children: tr('restore.noChange') });
                            const strategy = i.resolution ?? choiceFor(i.path);
                            const outcome = outcomeOf(i, strategy);
                            return (_jsxs("span", { className: outcome === 'skip' ? 'dv-muted' : undefined, children: [strategyLabel(tr, strategy), " \u00B7 ", outcome === 'skip' ? tr('restore.willSkip') : tr('restore.willApply')] }));
                        } })), preview.removed > 0 ? _jsx("span", { className: "dv-hint", children: tr('restore.removedNote') }) : null] })) : null, preview && changes.length > 0 ? (_jsxs(Card, { children: [_jsx(CardHead, { title: tr('restore.conflictTitle'), sub: tr('restore.conflictDesc'), actions: _jsxs(_Fragment, { children: [_jsx("span", { className: "dv-hint dv-num", children: tr('restore.conflictsSummary', { use: useCount, keep: keepCount }) }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setAll('use-backup'), children: tr('restore.useBackup') }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setAll('keep-current'), children: tr('restore.keepCurrent') })] }) }), _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" }), _jsx("div", { style: { maxHeight: 320, overflowY: 'auto' }, children: changes.slice(0, MAX_ROWS).map((c) => (_jsxs("div", { className: "dv-conflict-row", children: [_jsxs("span", { className: "dv-conflict-main", children: [_jsx(Tag, { children: changeLabel(tr, c.change) }), _jsx("span", { className: "dv-conflict-path", title: c.path, children: c.path })] }), _jsxs("fieldset", { className: "dv-segment", style: { border: 0, margin: 0, padding: 2, flex: 'none' }, children: [_jsx("legend", { className: "dv-sr-only", children: tr('restore.perItem', { path: c.path }) }), _jsx("button", { type: "button", "aria-pressed": choiceFor(c.path) === 'use-backup', onClick: () => setChoice(c.path, 'use-backup'), children: tr('restore.useBackup') }), _jsx("button", { type: "button", "aria-pressed": choiceFor(c.path) === 'keep-current', onClick: () => setChoice(c.path, 'keep-current'), children: tr('restore.keepCurrent') })] })] }, c.path))) }), changes.length > MAX_ROWS ? _jsx("span", { className: "dv-hint", children: tr('restore.truncated', { shown: MAX_ROWS }) }) : null] })) : null, preview && preview.pluginsToReinstall.length > 0 ? (_jsxs(Collapsible, { summary: tr('restore.pluginsTitle', { count: preview.pluginsToReinstall.length }), defaultOpen: true, children: [_jsx("div", { children: tr('restore.pluginsDesc') }), _jsx("ul", { style: { margin: '6px 0 0', paddingLeft: 18 }, children: preview.pluginsToReinstall.map((p) => (_jsxs("li", { children: [_jsx("span", { className: "dv-mono", children: p.name }), p.version ? _jsxs("span", { className: "dv-muted", children: ["@", p.version] }) : null, p.profile ? _jsxs("span", { className: "dv-muted", children: [" \u00B7 ", p.profile] }) : null] }, `${p.profile ?? ''}:${p.name}`))) })] })) : null, preview && preview.manualActions.length > 0 ? (_jsx(Banner, { tone: "warn", title: tr('restore.manualTitle'), children: _jsx("ul", { children: preview.manualActions.map((m) => _jsx("li", { children: localizeNotice(m, tr) }, m)) }) })) : null, preview ? (_jsxs(_Fragment, { children: [_jsxs(Rows, { label: tr('restore.confirmTitle'), children: [_jsx(SettingRow, { title: tr('restore.confirmTitle'), description: tr('restore.confirmDesc'), htmlFor: "dv-restore-ack", control: _jsx(Switch, { id: "dv-restore-ack", checked: ack, onChange: () => setAck((v) => !v) }) }), _jsx(SettingRow, { title: tr('restore.rollback'), htmlFor: "dv-restore-rollback", control: _jsx(Switch, { id: "dv-restore-rollback", checked: rollback, onChange: () => setRollback((v) => !v) }) }), _jsx(SettingRow, { title: tr('restore.managePlugins'), htmlFor: "dv-restore-reinstall", control: _jsx(Switch, { id: "dv-restore-reinstall", checked: reinstall, onChange: () => setReinstall((v) => !v) }) }), preview.secretsAvailable ? (_jsx(SettingRow, { title: tr('restore.withSecrets'), description: tr('restore.withSecretsDesc'), htmlFor: "dv-restore-secrets", control: _jsx(Switch, { id: "dv-restore-secrets", checked: withSecrets, onChange: () => setWithSecrets((v) => !v) }) })) : null] }), reinstall && preview.remotePluginSources?.length ? (_jsxs("div", { className: "dv-plugin-sources", role: "group", "aria-label": tr('restore.remoteSourcesTitle'), children: [_jsx("div", { className: "dv-check-title", children: tr('restore.remoteSourcesTitle') }), _jsx("div", { className: "dv-hint", children: tr(usingImport ? 'restore.remoteSourcesImportHint' : 'restore.remoteSourcesHint') }), preview.remotePluginSources.map((r) => (_jsx(Checkbox, { title: `${r.name} (${r.profile})`, description: r.trusted === false ? `${r.source} — ${tr('restore.untrustedSource')}` : r.source, checked: Boolean(approvedSources[r.key]), onChange: () => setApprovedSources((prev) => ({ ...prev, [r.key]: !prev[r.key] })) }, r.key)))] })) : null, _jsx("div", { className: "dv-card-foot", children: _jsx(Button, { variant: "danger", disabled: !ack || busy, onClick: () => {
                                if (preview.removed > 0 || preview.changed > 0)
                                    setDialogOpen(true);
                                else
                                    submitRestore();
                            }, children: tr('restore.submit') }) }), !ack ? _jsx("span", { className: "dv-hint", children: tr('restore.needConfirm') }) : null] })) : null, _jsx(ConfirmDialog, { open: dialogOpen, title: tr('restore.dialogTitle', { id: preview?.snapshotId ?? '' }), description: tr('restore.dialogBody', { apply: applyCount, keep: keepCount, removed: preview?.removed ?? 0 }), confirmLabel: busy ? tr('restore.submitting') : tr('restore.dialogConfirm'), busy: busy, onConfirm: () => {
                    setDialogOpen(false);
                    submitRestore();
                }, onClose: () => { if (!busy)
                    setDialogOpen(false); }, children: busy ? _jsx(LoadingInline, { label: tr('restore.submitting') }) : null })] }));
}
const STATUS_TONE = { installed: 'ok', 'installed-from-backup': 'warn', 'already-present': 'ok', failed: 'danger', skipped: 'neutral' };
/** Per-plugin outcome of the last restore — a failure is never folded into "success". */
function PluginResults({ result, onRetry, retrying, }) {
    const tr = useT();
    const locale = useLocale();
    const rows = result.pluginResults ?? [];
    const { ok, failed, skipped } = pluginCounts(result);
    return (_jsxs(Card, { children: [_jsx(CardHead, { title: tr('restore.resultTitle'), sub: skipped
                    ? tr('restore.resultDescWithSkipped', { ok, failed, skipped })
                    : tr('restore.resultDesc', { ok, failed }), actions: failed && onRetry ? (_jsx(Button, { size: "sm", onClick: onRetry, loading: retrying, disabled: retrying, title: tr('restore.retryDesc'), children: retrying ? tr('restore.retrying') : tr('restore.retryFailed') })) : undefined }), _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" }), rows.some((r) => r.status === 'installed-from-backup') ? (_jsx("p", { className: "dv-small dv-muted", style: { margin: '0 0 8px', padding: '0 4px' }, children: tr('restore.legend.fromBackup') })) : null, _jsx("ul", { className: "dv-list", "aria-label": tr('restore.resultTitle'), children: rows.map((r) => {
                    const raw = pluginRawDetail(r, tr);
                    return (_jsxs("li", { className: "dv-list-item", children: [_jsxs("div", { className: "dv-list-main", children: [_jsx("span", { className: "dv-list-title dv-mono", children: r.name }), _jsx("span", { className: r.status === 'failed' ? 'dv-small dv-error-text' : 'dv-small dv-muted', style: { overflowWrap: 'anywhere' }, children: pluginReasonText(r, tr) }), raw ? (_jsxs("details", { className: "dv-details", children: [_jsx("summary", { children: tr('restore.details') }), _jsx("pre", { className: "dv-log", children: raw })] })) : null] }), _jsxs("div", { className: "dv-list-meta", children: [_jsx(Tag, { children: r.profile }), _jsx(Tag, { tone: STATUS_TONE[r.status], children: tr(`restore.status.${r.status}`) })] })] }, `${r.profile}:${r.name}`));
                }) })] }));
}
//# sourceMappingURL=RestorePanel.js.map