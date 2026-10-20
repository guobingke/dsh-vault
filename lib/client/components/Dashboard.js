import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { targetName } from '../lib/format.js';
import { useMemo } from 'react';
import { useLocale, useT } from '../i18n.js';
import { formatBytes, formatWhen, scheduleLabel } from '../lib/format.js';
import { newestFirst, summarizeSnapshotsByTarget } from '../lib/targets.js';
import { Banner, Button, DotText, EmptyState, ErrorState, LoadingState, Rows, SettingRow, } from './ui.js';
function emptyStatus() {
    const settings = {
        retention: { keepLast: 0 },
        preferredKdf: 'scrypt',
        pluginCopies: { enabled: true, exclude: [] },
        pluginRestoreOrder: 'source-first',
        schedule: {
            enabled: false,
            intervalMinutes: 1440,
            targetId: '',
            encrypt: false,
            includeSecrets: false,
            retention: { keepLast: 0 },
        },
    };
    return { dshHome: '', dataDir: '', targets: [], settings, recentSnapshots: [] };
}
/**
 * Overview — plain status lines like the host's own General rows:
 * last backup, snapshot count, auto backup, one text row per storage
 * location (dot + name, not a card grid), and "Back up now" on its own row.
 */
export function Overview({ status, loading, error, onRefresh, onBackup, snapshots, onBackupNow, backupBusy, onNavigate, message, }) {
    const tr = useT();
    const locale = useLocale();
    const data = status ?? (loading ? null : emptyStatus());
    const list = useMemo(() => snapshots ?? data?.recentSnapshots ?? [], [snapshots, data]);
    if (!data) {
        return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", children: tr('overview.desc') }), error ? _jsx(ErrorState, { error: error, onRetry: onRefresh }) : _jsx(LoadingState, { label: tr('app.loading') })] }));
    }
    const settings = data.settings;
    const targets = data.targets;
    const summaries = summarizeSnapshotsByTarget(targets, list);
    const latest = [...list].sort(newestFirst)[0];
    const targetLabel = (id) => targetName(targets.find((t) => t.id === id), tr, id);
    const encrypted = list.filter((s) => s.encrypted).length;
    const totalBytes = list.reduce((acc, s) => acc + (s.bytes || 0), 0);
    const schedule = settings.schedule;
    const defaultTargetId = settings.defaultTargetId && targets.some((t) => t.id === settings.defaultTargetId)
        ? settings.defaultTargetId
        : targets[0]?.id;
    const defaultTarget = targets.find((t) => t.id === defaultTargetId);
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", children: tr('overview.desc') }), error ? _jsx(ErrorState, { error: error, onRetry: onRefresh }) : null, message ? _jsx(Banner, { tone: "ok", children: message }) : null, targets.length === 0 && !loading ? (_jsx(EmptyState, { title: tr('overview.emptyTitle'), body: tr('overview.emptyBody'), actions: onNavigate ? _jsx(Button, { variant: "primary", onClick: () => onNavigate('storage'), children: tr('overview.goStorage') }) : null })) : null, _jsxs(Rows, { label: tr('overview.desc'), children: [_jsx(SettingRow, { title: tr('overview.lastTitle'), description: latest?.notes, control: latest ? (_jsx("span", { className: "dv-truncate", title: `${latest.id} · ${targetLabel(latest.targetId)}`, children: tr('overview.lastValue', {
                                target: targetLabel(latest.targetId),
                                time: formatWhen(latest.createdAt, locale),
                            }) })) : (_jsx("span", { className: "dv-muted", children: tr('overview.lastEmpty') })) }), _jsx(SettingRow, { title: tr('overview.snapshotsTitle'), description: list.length ? tr('overview.snapshotsDesc', { encrypted, plain: list.length - encrypted }) : undefined, control: _jsx("span", { className: "dv-num", children: list.length ? tr('overview.snapshotsValue', { count: list.length, size: formatBytes(totalBytes) }) : tr('overview.snapshotsEmpty') }) }), _jsx(SettingRow, { title: tr('overview.scheduleTitle'), control: schedule.enabled ? (_jsx("span", { children: schedule.nextRunAt
                                ? tr('overview.scheduleValue', { interval: scheduleLabel(locale, schedule.intervalMinutes), time: formatWhen(schedule.nextRunAt, locale) })
                                : tr('overview.scheduleNoNext', { interval: scheduleLabel(locale, schedule.intervalMinutes) }) })) : (_jsx("span", { className: "dv-muted", children: tr('overview.scheduleOff') })) }), summaries.map(({ target, count, latest: tLatest }) => (_jsx(SettingRow, { title: _jsxs("span", { className: "dv-inline", children: [_jsx(DotText, { tone: count > 0 ? 'ok' : 'neutral', children: targetName(target, tr) }), target.id === defaultTargetId ? _jsx("span", { className: "dv-tag", children: tr('common.default') }) : null] }), description: count > 0 && tLatest
                            ? tr('storage.lastBackup', { time: formatWhen(tLatest.createdAt, locale) })
                            : tr('storage.noSnapshots'), control: _jsx("span", { className: "dv-num dv-muted", children: tr('storage.snapshots', { count }) }) }, target.id))), _jsx(SettingRow, { title: tr('overview.backupRow'), description: defaultTarget
                            ? tr('overview.backupDescTarget', { target: targetName(defaultTarget, tr) })
                            : tr('overview.backupDesc'), control: onBackupNow ? (_jsx(Button, { variant: "primary", onClick: targets.length ? onBackupNow : onBackup, loading: backupBusy, children: tr('overview.backupButton') })) : (_jsx(Button, { variant: "primary", onClick: onBackup, disabled: targets.length === 0, children: tr('overview.backupButton') })) })] }), _jsx("p", { className: "dv-hint", children: tr('overview.secretsNote') }), loading ? _jsx(LoadingState, { label: tr('app.loading') }) : null] }));
}
//# sourceMappingURL=Dashboard.js.map