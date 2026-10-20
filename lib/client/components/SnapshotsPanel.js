import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { targetName } from '../lib/format.js';
import { useId, useMemo, useState } from 'react';
import { useLocale, useT } from '../i18n.js';
import { formatBytes, formatDateTime, relativeLabel } from '../lib/format.js';
import { newestFirst } from '../lib/targets.js';
import { Button, Card, ConfirmDialog, Dialog, EmptyState, Field, LoadingInline, PasswordInput, SearchInput, Segmented, Select, Tag, } from './ui.js';
const MAX_RENDER = 300;
export function SnapshotsPanel({ snapshots, busy, error, message, onRefresh, onDelete, onVerify, targets = [], loading, onRestoreRequest, onNavigateBackup, }) {
    const tr = useT();
    const locale = useLocale();
    const ids = useId();
    const [targetFilter, setTargetFilter] = useState('');
    const [mode, setMode] = useState('all');
    const [query, setQuery] = useState('');
    const [deleteKey, setDeleteKey] = useState(null);
    const [verifyTarget, setVerifyTarget] = useState(null);
    const [verifyPassword, setVerifyPassword] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [results, setResults] = useState({});
    const targetLabel = (id) => targetName(targets.find((t) => t.id === id), tr, id);
    const sorted = useMemo(() => [...snapshots].sort(newestFirst), [snapshots]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return sorted.filter((s) => {
            if (targetFilter && s.targetId !== targetFilter)
                return false;
            if (mode === 'encrypted' && !s.encrypted)
                return false;
            if (mode === 'plaintext' && s.encrypted)
                return false;
            if (mode === 'secrets' && !s.includeSecrets)
                return false;
            if (q && !s.id.toLowerCase().includes(q) && !(s.notes ?? '').toLowerCase().includes(q) && !s.targetId.toLowerCase().includes(q))
                return false;
            return true;
        });
    }, [sorted, targetFilter, mode, query]);
    const deleteTarget = snapshots.find((s) => `${s.targetId}:${s.id}` === deleteKey) ?? null;
    const hasFilters = Boolean(query || targetFilter || mode !== 'all');
    async function runVerify(s, password) {
        const key = `${s.targetId}:${s.id}`;
        setResults((prev) => ({ ...prev, [key]: { status: 'running' } }));
        try {
            const r = await onVerify(s.targetId, s.id, password);
            if (r && typeof r === 'object' && 'ok' in r && !r.ok) {
                setResults((prev) => ({ ...prev, [key]: { status: 'fail', error: r.error ?? tr('app.error') } }));
                return false;
            }
            setResults((prev) => ({ ...prev, [key]: { status: 'ok' } }));
            return true;
        }
        catch (err) {
            setResults((prev) => ({ ...prev, [key]: { status: 'fail', error: err instanceof Error ? err.message : String(err) } }));
            return false;
        }
    }
    function requestVerify(s) {
        if (s.encrypted) {
            setVerifyTarget(s);
            setVerifyPassword('');
            return;
        }
        void runVerify(s);
    }
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", children: tr('snapshots.desc') }), error ? _jsx("span", { className: "dv-error-text", role: "alert", children: error }) : null, message ? _jsx("span", { className: "dv-hint", children: message }) : null, _jsxs("div", { className: "dv-wrap", children: [_jsx("div", { style: { flex: '1 1 200px', minWidth: 160 }, children: _jsx(SearchInput, { id: `${ids}-search`, value: query, onChange: setQuery, placeholder: tr('snapshots.search'), label: tr('snapshots.search') }) }), _jsxs(Select, { "aria-label": tr('snapshots.filterTarget'), value: targetFilter, onChange: (e) => setTargetFilter(e.target.value), children: [_jsx("option", { value: "", children: tr('common.allTargets') }), targets.map((t) => (_jsx("option", { value: t.id, children: targetName(t, tr) }, t.id)))] }), _jsx(Segmented, { label: tr('snapshots.filterMode'), value: mode, onChange: setMode, options: [
                            { value: 'all', label: tr('snapshots.mode.all') },
                            { value: 'encrypted', label: tr('snapshots.mode.encrypted') },
                            { value: 'plaintext', label: tr('snapshots.mode.plaintext') },
                            { value: 'secrets', label: tr('snapshots.mode.secrets') },
                        ] }), hasFilters ? (_jsx(Button, { size: "sm", variant: "quiet", onClick: () => { setQuery(''); setTargetFilter(''); setMode('all'); }, children: tr('snapshots.clear') })) : null, _jsx("span", { className: "dv-hint dv-num", style: { marginLeft: 'auto' }, children: tr('snapshots.count', { shown: filtered.length, total: snapshots.length }) }), _jsx(Button, { size: "sm", variant: "quiet", onClick: onRefresh, disabled: busy, children: tr('app.refresh') })] }), loading && snapshots.length === 0 ? (_jsx(LoadingInline, { label: tr('app.loading') })) : snapshots.length === 0 ? (_jsx(EmptyState, { title: tr('snapshots.emptyTitle'), body: tr('snapshots.emptyBody'), actions: onNavigateBackup ? _jsx(Button, { variant: "primary", onClick: onNavigateBackup, children: tr('snapshots.goBackup') }) : null })) : filtered.length === 0 ? (_jsx(EmptyState, { title: tr('snapshots.noMatch'), actions: _jsx(Button, { size: "sm", onClick: () => { setQuery(''); setTargetFilter(''); setMode('all'); }, children: tr('snapshots.clear') }) })) : (_jsxs(Card, { children: [_jsx("ul", { className: "dv-list", children: filtered.slice(0, MAX_RENDER).map((s) => {
                            const key = `${s.targetId}:${s.id}`;
                            const state = results[key] ?? { status: 'idle' };
                            return (_jsxs("li", { className: "dv-list-item", children: [_jsxs("div", { className: "dv-list-main", children: [_jsx("span", { className: "dv-list-title dv-mono", title: s.id, children: s.id }), _jsxs("span", { className: "dv-card-sub", children: [targetLabel(s.targetId), " \u00B7 ", formatDateTime(s.createdAt, locale), "\uFF08", relativeLabel(tr, s.createdAt), "\uFF09 \u00B7 ", formatBytes(s.bytes)] }), _jsxs("span", { className: "dv-tag-list", style: { marginTop: 4 }, children: [_jsx(Tag, { tone: s.encrypted ? 'ok' : 'neutral', children: s.encrypted ? tr('common.encrypted') : tr('common.plaintext') }), s.includeSecrets ? _jsx(Tag, { tone: "warn", children: tr('common.secrets') }) : null, state.status === 'ok' ? _jsx(Tag, { tone: "ok", children: tr('snapshots.verified') }) : null, s.notes ? _jsx("span", { className: "dv-hint dv-truncate", style: { maxWidth: 200 }, title: s.notes, children: s.notes }) : null] }), state.status === 'fail' ? (_jsx("span", { className: "dv-error-text", children: tr('snapshots.verifyFail', { error: state.error }) })) : null] }), _jsxs("div", { className: "dv-list-meta", children: [onRestoreRequest ? (_jsx(Button, { size: "sm", variant: "quiet", onClick: () => onRestoreRequest(s.targetId, s.id), children: tr('snapshots.restoreAction') })) : null, _jsx(Button, { size: "sm", variant: "quiet", onClick: () => requestVerify(s), loading: state.status === 'running', "aria-label": `${tr('snapshots.verify')} ${s.id}`, children: state.status === 'running' ? tr('snapshots.verifying') : tr('snapshots.verify') }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setDeleteKey(key), disabled: busy, "aria-label": `${tr('common.delete')} ${s.id}`, style: { color: 'var(--dv-danger)' }, children: tr('common.delete') })] })] }, key));
                        }) }), filtered.length > MAX_RENDER ? _jsx("span", { className: "dv-hint", children: tr('snapshots.truncated', { shown: MAX_RENDER }) }) : null] })), _jsx(ConfirmDialog, { open: Boolean(deleteTarget), onClose: () => setDeleteKey(null), title: tr('snapshots.deleteTitle', { id: deleteTarget?.id ?? '' }), description: deleteTarget ? tr('snapshots.deleteBody', { target: targetLabel(deleteTarget.targetId) }) : undefined, confirmLabel: tr('snapshots.deleteConfirm'), busy: busy, onConfirm: () => {
                    if (!deleteTarget)
                        return;
                    onDelete(deleteTarget.targetId, deleteTarget.id);
                    setDeleteKey(null);
                }, children: deleteTarget ? (_jsxs("dl", { className: "dv-kv", children: [_jsx("dt", { children: tr('common.size') }), _jsx("dd", { children: formatBytes(deleteTarget.bytes) }), _jsx("dt", { children: tr('common.createdAt') }), _jsx("dd", { children: formatDateTime(deleteTarget.createdAt, locale) }), deleteTarget.notes ? (_jsxs(_Fragment, { children: [_jsx("dt", { children: tr('common.notes') }), _jsx("dd", { children: deleteTarget.notes })] })) : null] })) : null }), _jsxs(Dialog, { open: Boolean(verifyTarget), onClose: () => { if (!verifying)
                    setVerifyTarget(null); }, title: tr('snapshots.verify'), description: tr('snapshots.verifyPasswordHint'), actions: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: () => setVerifyTarget(null), disabled: verifying, children: tr('app.cancel') }), _jsx(Button, { variant: "primary", loading: verifying, disabled: !verifyPassword, onClick: async () => {
                                if (!verifyTarget)
                                    return;
                                setVerifying(true);
                                const ok = await runVerify(verifyTarget, verifyPassword);
                                setVerifying(false);
                                if (ok) {
                                    setVerifyTarget(null);
                                    setVerifyPassword('');
                                }
                            }, children: tr('snapshots.verify') })] }), children: [_jsx(Field, { label: tr('snapshots.verifyPassword'), htmlFor: `${ids}-verify-pass`, children: _jsx(PasswordInput, { id: `${ids}-verify-pass`, value: verifyPassword, onChange: (e) => setVerifyPassword(e.target.value), autoComplete: "off", onKeyDown: (e) => {
                                if (e.key === 'Enter' && verifyPassword && verifyTarget && !verifying) {
                                    setVerifying(true);
                                    void runVerify(verifyTarget, verifyPassword).then((ok) => {
                                        setVerifying(false);
                                        if (ok) {
                                            setVerifyTarget(null);
                                            setVerifyPassword('');
                                        }
                                    });
                                }
                            } }) }), verifying ? _jsx(LoadingInline, { label: tr('snapshots.verifying') }) : null] })] }));
}
//# sourceMappingURL=SnapshotsPanel.js.map