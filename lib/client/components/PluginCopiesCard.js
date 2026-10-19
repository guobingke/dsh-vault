import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { Button, Card, CardHead, Checkbox, LoadingInline, Rows, Select, SettingRow, Switch, Tag } from './ui.js';
/**
 * 保存插件副本: which plugins get a copy of their installed package in the snapshot
 * (default: all), and how restore uses those copies. Choices persist in settings.
 */
export function PluginCopiesCard({ api }) {
    const tr = useT();
    const [plugins, setPlugins] = useState(null);
    const [enabled, setEnabled] = useState(true);
    const [exclude, setExclude] = useState(new Set());
    const [order, setOrder] = useState('source-first');
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        let alive = true;
        // Fast list first, then the registry check (non-blocking, bounded server-side).
        api.listPlugins(false).then((r) => {
            if (!alive)
                return;
            setPlugins(r.plugins);
            setEnabled(r.settings?.enabled !== false);
            setExclude(new Set(r.settings?.exclude ?? []));
            setOrder(r.restoreOrder ?? 'source-first');
            setChecking(true);
            return api.listPlugins(true).then((full) => { if (alive)
                setPlugins(full.plugins); });
        }).catch((e) => { if (alive)
            setError(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (alive)
            setChecking(false); });
        return () => { alive = false; };
    }, [api]);
    const save = (patch) => {
        api.updateSettings(patch).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    };
    const setCopies = (nextEnabled, nextExclude) => {
        setEnabled(nextEnabled);
        setExclude(nextExclude);
        save({ pluginCopies: { enabled: nextEnabled, exclude: [...nextExclude].sort() } });
    };
    const toggle = (key) => {
        const next = new Set(exclude);
        if (next.has(key))
            next.delete(key);
        else
            next.add(key);
        setCopies(enabled, next);
    };
    const selected = useMemo(() => (plugins ?? []).filter((p) => !exclude.has(p.key)).length, [plugins, exclude]);
    return (_jsxs(Card, { children: [_jsx(CardHead, { title: tr('copies.title'), sub: tr('copies.desc'), actions: enabled && plugins?.length ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "dv-small dv-muted dv-num", children: tr('backup.scopeSummary', { selected, total: plugins.length }) }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setCopies(true, new Set()), children: tr('backup.scopeAll') }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setCopies(true, new Set(plugins.map((p) => p.key))), children: tr('backup.scopeNone') })] })) : null }), _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" }), _jsxs(Rows, { children: [_jsx(SettingRow, { title: tr('copies.enable'), description: tr('copies.enableDesc'), htmlFor: "dv-copies-enable", control: _jsx(Switch, { id: "dv-copies-enable", checked: enabled, onChange: () => setCopies(!enabled, exclude) }) }), _jsx(SettingRow, { title: tr('copies.order'), description: tr('copies.orderDesc'), htmlFor: "dv-copies-order", children: _jsxs(Select, { id: "dv-copies-order", value: order, onChange: (e) => {
                                const v = e.target.value === 'copy-first' ? 'copy-first' : 'source-first';
                                setOrder(v);
                                save({ pluginRestoreOrder: v });
                            }, children: [_jsx("option", { value: "source-first", children: tr('copies.order.source-first') }), _jsx("option", { value: "copy-first", children: tr('copies.order.copy-first') })] }) })] }), error ? _jsx("p", { className: "dv-hint", style: { color: 'var(--dv-danger)' }, children: error }) : null, enabled ? (plugins === null ? (_jsx(LoadingInline, { label: tr('copies.loading') })) : plugins.length === 0 ? (_jsx("p", { className: "dv-hint", children: tr('copies.none') })) : (_jsxs("div", { className: "dv-card-list", style: { gap: 6 }, children: [checking ? _jsx("span", { className: "dv-small dv-muted", children: tr('copies.checking') }) : null, plugins.map((p) => (_jsx(Checkbox, { id: `dv-copy-${p.key}`, checked: !exclude.has(p.key), onChange: () => toggle(p.key), title: _jsxs(_Fragment, { children: [_jsx("span", { className: "dv-mono", children: p.name }), p.version ? _jsxs("span", { className: "dv-muted dv-num", children: [" @", p.version] }) : null, ' ', _jsx(Tag, { children: p.profile }), ' ', _jsx(Tag, { children: tr(`copies.kind.${p.kind}`) }), p.recommended ? _jsxs(_Fragment, { children: [' ', _jsx(Tag, { tone: "warn", children: tr('copies.recommended') })] }) : null] }), description: p.kind === 'local'
                            ? tr('copies.hint.local')
                            : p.registry === 'missing'
                                ? tr('copies.hint.missing', { version: p.version ?? '' })
                                : p.cordisOnly
                                    ? tr('copies.hint.cordisOnly')
                                    : undefined }, p.key)))] }))) : null] }));
}
//# sourceMappingURL=PluginCopiesCard.js.map