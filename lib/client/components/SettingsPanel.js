import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { formatDateTime, relativeLabel, scheduleLabel } from '../lib/format.js';
import { targetKindLabel } from '../lib/targets.js';
import { Banner, Button, Chips, ErrorState, Field, LoadingState, Rows, Segmented, Select, SettingRow, Switch, TextInput, } from './ui.js';
/** Mirrors core DEFAULT_SCHEDULE; kept local so the browser bundle never pulls node-only core modules. */
const DEFAULT_SCHEDULE = {
    enabled: false,
    intervalMinutes: 1440,
    targetId: 'local-default',
    encrypt: false,
    includeSecrets: false,
    retention: { keepLast: 10 },
};
const INTERVAL_PRESETS = [60, 360, 720, 1440, 10080];
const KEEP_PRESETS = [5, 10, 20, 50, 100];
/** Merge a partial schedule patch without dropping nested retention. */
function mergeSchedule(base, patch) {
    return {
        ...base,
        ...patch,
        retention: { ...base.retention, ...(patch.retention ?? {}) },
    };
}
/**
 * Auto backup — the former Settings panel: schedule, retention, defaults and
 * one plain language row (read-only, follows the host).
 */
export function SettingsPanel({ settings, busy, error, message, onSave, onRunSchedule, targets = [], loading, onRetry, locale, }) {
    const tr = useT();
    const ids = useId();
    // Initialise from the loaded settings so the first render never shows the
    // placeholder schedule (local-default) — the values are synced again below.
    const [keepLast, setKeepLast] = useState(() => String(settings?.retention.keepLast ?? 10));
    const [schedule, setSchedule] = useState(() => settings?.schedule ?? DEFAULT_SCHEDULE);
    const [defaultTargetId, setDefaultTargetId] = useState(() => settings?.defaultTargetId ?? '');
    const [kdf, setKdf] = useState(() => settings?.preferredKdf ?? 'scrypt');
    const [dirty, setDirty] = useState(false);
    const [customInterval, setCustomInterval] = useState('');
    useEffect(() => {
        if (!settings)
            return;
        setKeepLast(String(settings.retention.keepLast));
        setSchedule(settings.schedule);
        setDefaultTargetId(settings.defaultTargetId ?? '');
        setKdf(settings.preferredKdf);
        setDirty(false);
    }, [settings]);
    const validTargetIds = useMemo(() => new Set(targets.map((t) => t.id)), [targets]);
    if (!settings && loading) {
        return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", children: tr('schedule.desc') }), _jsx(LoadingState, { label: tr('schedule.loading') })] }));
    }
    if (!settings) {
        return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", children: tr('schedule.desc') }), _jsx(ErrorState, { error: error ?? tr('app.error'), onRetry: onRetry })] }));
    }
    const updateSchedule = (patch) => {
        setSchedule((prev) => mergeSchedule(prev, patch));
        setDirty(true);
    };
    const scheduleTargetMissing = Boolean(schedule.targetId) && targets.length > 0 && !validTargetIds.has(schedule.targetId);
    const intervalTooSmall = schedule.intervalMinutes < 15;
    const isPreset = INTERVAL_PRESETS.includes(schedule.intervalMinutes);
    function save() {
        const keep = Math.min(200, Math.max(1, Number(keepLast) || 10));
        const interval = Math.max(15, Math.round(Number(schedule.intervalMinutes) || 15));
        onSave({
            retention: { keepLast: keep },
            schedule: mergeSchedule(schedule, { intervalMinutes: interval, retention: { keepLast: keep } }),
            ...(defaultTargetId ? { defaultTargetId } : {}),
            preferredKdf: kdf,
        });
        setDirty(false);
        setCustomInterval('');
    }
    function discard() {
        setKeepLast(String(settings.retention.keepLast));
        setSchedule(settings.schedule);
        setDefaultTargetId(settings.defaultTargetId ?? '');
        setKdf(settings.preferredKdf);
        setCustomInterval('');
        setDirty(false);
    }
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", children: tr('schedule.desc') }), error ? _jsx(Banner, { tone: "error", children: error }) : null, message ? _jsx(Banner, { tone: "ok", children: message }) : null, _jsxs(Rows, { label: tr('schedule.desc'), children: [_jsx(SettingRow, { title: tr('schedule.enabled'), description: tr('schedule.enabledDesc'), htmlFor: `${ids}-on`, control: _jsx(Switch, { id: `${ids}-on`, checked: schedule.enabled, onChange: () => updateSchedule({ enabled: !schedule.enabled }) }) }), _jsx(SettingRow, { stacked: true, title: tr('schedule.interval'), htmlFor: `${ids}-interval`, description: schedule.enabled
                            ? (schedule.nextRunAt
                                ? tr('schedule.interval.desc', { next: `${formatDateTime(schedule.nextRunAt)}（${relativeLabel(tr, schedule.nextRunAt)}）` })
                                : scheduleLabel(locale, schedule.intervalMinutes))
                            : undefined, children: _jsxs("div", { className: "dv-wrap", children: [_jsx(Chips, { label: tr('schedule.intervalLabel'), value: isPreset ? schedule.intervalMinutes : undefined, options: [
                                        ...INTERVAL_PRESETS.map((m) => ({ value: m, label: scheduleLabel(locale, m) })),
                                        { value: -1, label: tr('schedule.custom') },
                                    ], onChange: (v) => {
                                        if (v === -1) {
                                            setCustomInterval(String(schedule.intervalMinutes));
                                            return;
                                        }
                                        setCustomInterval('');
                                        updateSchedule({ intervalMinutes: v });
                                    } }), !isPreset || customInterval !== '' ? (_jsx(Field, { label: _jsx("span", { className: "dv-sr-only", children: tr('schedule.custom') }), htmlFor: `${ids}-interval`, error: intervalTooSmall ? tr('schedule.intervalMin') : null, children: _jsxs("span", { className: "dv-inline", children: [_jsx(TextInput, { id: `${ids}-interval`, type: "number", min: 15, step: 1, className: "dv-input dv-num-input", value: customInterval || String(schedule.intervalMinutes), onChange: (e) => {
                                                    setCustomInterval(e.target.value);
                                                    updateSchedule({ intervalMinutes: Number(e.target.value) || 0 });
                                                }, onBlur: () => {
                                                    const v = Math.max(15, Math.round(Number(customInterval) || schedule.intervalMinutes || 15));
                                                    updateSchedule({ intervalMinutes: v });
                                                    setCustomInterval('');
                                                }, invalid: intervalTooSmall }), _jsx("span", { className: "dv-hint", children: tr('schedule.customUnit') })] }) })) : null] }) }), _jsx(SettingRow, { stacked: true, title: tr('schedule.target'), description: scheduleTargetMissing ? tr('schedule.targetMissing') : undefined, htmlFor: `${ids}-target`, control: _jsxs(Select, { id: `${ids}-target`, value: schedule.targetId, onChange: (e) => updateSchedule({ targetId: e.target.value }), children: [targets.length === 0 ? _jsx("option", { value: "", children: "\u2014" }) : null, scheduleTargetMissing ? _jsx("option", { value: schedule.targetId, children: schedule.targetId }) : null, targets.map((t) => (_jsxs("option", { value: t.id, children: [t.label, " \u00B7 ", targetKindLabel(t, tr)] }, t.id)))] }) }), _jsx(SettingRow, { title: tr('schedule.encrypt'), description: tr('schedule.encryptDesc'), htmlFor: `${ids}-enc`, control: _jsx(Switch, { id: `${ids}-enc`, checked: schedule.encrypt, onChange: () => updateSchedule({ encrypt: !schedule.encrypt, includeSecrets: schedule.encrypt ? false : schedule.includeSecrets }) }) }), _jsx(SettingRow, { title: tr('schedule.secrets'), description: schedule.encrypt ? tr('schedule.secretsDescEncrypted') : tr('schedule.secretsDescHalted'), htmlFor: `${ids}-secrets`, control: _jsx(Switch, { id: `${ids}-secrets`, checked: schedule.includeSecrets && schedule.encrypt, disabled: !schedule.encrypt, onChange: () => updateSchedule({ includeSecrets: !schedule.includeSecrets }) }) }), _jsx(SettingRow, { title: tr('schedule.lastRun'), control: _jsx("span", { className: "dv-muted", children: schedule.lastRunAt
                                ? `${formatDateTime(schedule.lastRunAt)}（${relativeLabel(tr, schedule.lastRunAt)}）`
                                : tr('common.never') }) }), _jsx(SettingRow, { title: tr('schedule.runNow'), description: schedule.enabled ? tr('schedule.runNowDesc') : tr('schedule.runDisabled'), control: _jsx(Button, { onClick: onRunSchedule, disabled: busy || !schedule.enabled, loading: busy, children: tr('schedule.runNow') }) }), _jsx(SettingRow, { stacked: true, title: tr('schedule.retentionTitle'), description: tr('schedule.retentionDesc'), htmlFor: `${ids}-keep`, children: _jsx(Field, { label: _jsx("span", { className: "dv-sr-only", children: tr('schedule.keepLast') }), htmlFor: `${ids}-keep`, hint: tr('schedule.keepLastHint'), children: _jsxs("div", { className: "dv-wrap", children: [_jsxs("span", { className: "dv-inline", children: [_jsx(TextInput, { id: `${ids}-keep`, type: "number", min: 1, max: 200, className: "dv-input dv-num-input", value: keepLast, onChange: (e) => {
                                                    setKeepLast(e.target.value);
                                                    setDirty(true);
                                                } }), _jsx("span", { className: "dv-hint", children: tr('schedule.keepLastUnit') })] }), _jsx(Chips, { label: tr('schedule.keepLast'), value: KEEP_PRESETS.includes(Number(keepLast)) ? Number(keepLast) : undefined, options: KEEP_PRESETS.map((n) => ({ value: n, label: String(n) })), onChange: (n) => {
                                            setKeepLast(String(n));
                                            setDirty(true);
                                        } })] }) }) }), _jsx(SettingRow, { stacked: true, title: tr('schedule.defaultTarget'), description: tr('schedule.defaultTargetDesc'), htmlFor: `${ids}-default`, control: _jsxs(Select, { id: `${ids}-default`, value: defaultTargetId, onChange: (e) => {
                                setDefaultTargetId(e.target.value);
                                setDirty(true);
                            }, children: [_jsx("option", { value: "", children: tr('common.none') }), targets.map((t) => (_jsx("option", { value: t.id, children: t.label }, t.id)))] }) }), _jsx(SettingRow, { title: tr('schedule.kdf'), description: tr('schedule.kdfDesc'), htmlFor: `${ids}-kdf`, control: _jsx(Segmented, { label: tr('schedule.kdf'), value: kdf, onChange: (v) => {
                                setKdf(v);
                                setDirty(true);
                            }, options: [
                                { value: 'scrypt', label: tr('schedule.kdf.scrypt') },
                                { value: 'argon2id', label: tr('schedule.kdf.argon2id') },
                            ] }) }), _jsx(SettingRow, { title: tr('schedule.language'), description: tr('schedule.languageDesc'), control: _jsxs("span", { className: "dv-muted", children: [(locale === 'zh' ? tr('schedule.lang.zh') : tr('schedule.lang.en')), " \u00B7 ", tr('schedule.lang.auto')] }) })] }), _jsxs("div", { className: "dv-card-foot", style: { justifyContent: 'space-between' }, children: [_jsx("span", { className: "dv-hint", children: dirty ? tr('schedule.dirty') : '' }), _jsxs("span", { className: "dv-inline", children: [dirty ? _jsx(Button, { onClick: discard, disabled: busy, children: tr('schedule.discard') }) : null, _jsx(Button, { variant: "primary", onClick: save, loading: busy, children: busy ? tr('schedule.saving') : tr('schedule.save') })] })] })] }));
}
//# sourceMappingURL=SettingsPanel.js.map