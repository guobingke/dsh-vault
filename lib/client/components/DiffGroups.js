import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { Button, SearchInput, Switch } from './ui.js';
const ORDER = [
    'plugins', 'profiles', 'mcp', 'skills', 'settings', 'providers', 'agent-presets',
    'instructions', 'plugin-config', 'plugin-data', 'credentials',
];
const CHANGES = ['add', 'change', 'remove', 'unchanged'];
/** Rows per group before 「显示更多」. */
export const GROUP_PAGE = 50;
/** Group preview items by category (plugins, profiles, MCP, …), hide 相同 unless asked, filter by path. */
export function groupDiffItems(items, opts) {
    const q = opts.query.trim().toLowerCase();
    const by = new Map();
    for (const i of items) {
        if (q && !i.path.toLowerCase().includes(q))
            continue;
        const id = ORDER.includes(i.category) ? i.category : 'other';
        let g = by.get(id);
        if (!g) {
            g = { id, items: [], counts: { add: 0, change: 0, remove: 0, unchanged: 0 } };
            by.set(id, g);
        }
        g.counts[i.change]++;
        if (i.change === 'unchanged' && !opts.showUnchanged)
            continue;
        g.items.push(i);
    }
    const rank = { add: 0, change: 1, remove: 2, unchanged: 3 };
    const out = [...by.values()];
    for (const g of out)
        g.items.sort((a, b) => rank[a.change] - rank[b.change] || a.path.localeCompare(b.path));
    return out
        .filter((g) => g.items.length > 0 || opts.showUnchanged)
        .sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
}
export function DiffGroups({ items, renderOutcome, }) {
    const tr = useT();
    const [query, setQuery] = useState('');
    const [showUnchanged, setShowUnchanged] = useState(false);
    const [open, setOpen] = useState(new Set());
    const [limit, setLimit] = useState({});
    const groups = useMemo(() => groupDiffItems(items, { showUnchanged, query }), [items, showUnchanged, query]);
    const hiddenUnchanged = showUnchanged ? 0 : items.filter((i) => i.change === 'unchanged').length;
    const searching = query.trim().length > 0;
    const label = (id) => (id === 'other' ? tr('restore.group.other') : tr(`backup.cat.${id}`));
    const toggle = (id) => setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        return next;
    });
    const countsText = (g) => CHANGES
        .filter((c) => g.counts[c] > 0)
        .map((c) => `${tr(`restore.filter.${c}`)} ${g.counts[c]}`)
        .join(' · ');
    return (_jsxs("div", { className: "dv-diff-groups", children: [_jsxs("div", { className: "dv-diff-toolbar", children: [_jsx("div", { style: { flex: '1 1 180px', maxWidth: 260 }, children: _jsx(SearchInput, { value: query, onChange: setQuery, placeholder: tr('restore.diffSearch'), label: tr('restore.diffSearch') }) }), _jsxs("label", { className: "dv-small dv-muted dv-diff-toggle", htmlFor: "dv-diff-unchanged", children: [_jsx(Switch, { id: "dv-diff-unchanged", checked: showUnchanged, onChange: () => setShowUnchanged(!showUnchanged) }), tr('restore.showUnchanged')] }), _jsx("span", { style: { flex: 1 } }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setOpen(new Set(groups.map((g) => g.id))), children: tr('restore.expandAll') }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setOpen(new Set()), children: tr('restore.collapseAll') })] }), groups.length === 0 ? (_jsx("span", { className: "dv-hint", children: searching ? tr('restore.diffNoMatch') : tr('restore.diffOnlyUnchanged', { count: hiddenUnchanged }) })) : null, _jsx("ul", { className: "dv-diff-list", children: groups.map((g) => {
                    const isOpen = open.has(g.id) || searching;
                    const max = limit[g.id] ?? GROUP_PAGE;
                    return (_jsxs("li", { className: "dv-diff-group", children: [_jsxs("button", { type: "button", className: "dv-diff-head", "aria-expanded": isOpen, onClick: () => toggle(g.id), children: [_jsx("span", { className: "dv-diff-chevron", "aria-hidden": "true", children: isOpen ? '▾' : '▸' }), _jsx("span", { className: "dv-diff-title", children: label(g.id) }), _jsx("span", { className: "dv-small dv-muted dv-num", children: countsText(g) })] }), isOpen ? (_jsxs("div", { className: "dv-diff-body", children: [g.items.length === 0 ? _jsx("span", { className: "dv-hint", children: tr('restore.diffGroupAllSame') }) : null, g.items.slice(0, max).map((i) => (_jsxs("div", { className: "dv-diff-row", "data-change": i.change, children: [_jsx("span", { className: "dv-diff-badge", children: tr(`restore.filter.${i.change}`) }), _jsx("span", { className: "dv-path dv-mono", children: i.path }), _jsx("span", { className: "dv-small", children: renderOutcome(i) })] }, `${i.change}:${i.path}`))), g.items.length > max ? (_jsx(Button, { size: "sm", variant: "quiet", onClick: () => setLimit((p) => ({ ...p, [g.id]: max + GROUP_PAGE * 4 })), children: tr('restore.showMore', { count: g.items.length - max }) })) : null] })) : null] }, g.id));
                }) }), hiddenUnchanged > 0 ? _jsx("span", { className: "dv-hint", children: tr('restore.unchangedHidden', { count: hiddenUnchanged }) }) : null] }));
}
//# sourceMappingURL=DiffGroups.js.map