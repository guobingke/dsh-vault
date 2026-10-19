import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useT } from '../i18n.js';
import { ProgressBar } from './ui.js';
import { formatDuration } from './ResultSummary.js';
/** Thin native bar with the real server-side stage, current item and elapsed time. */
export function JobProgress({ job }) {
    const tr = useT();
    const p = job.progress;
    const stage = tr(`job.stage.${job.kind === 'backup' ? 'backup' : 'restore'}.${p.stage}`);
    const title = tr(`job.title.${job.kind}`);
    const count = p.total ? ` (${p.current ?? 0}/${p.total})` : '';
    const detail = (_jsxs(_Fragment, { children: [p.item ? _jsx("span", { className: "dv-mono", style: { overflowWrap: 'anywhere' }, children: p.item }) : null, p.item ? ' · ' : null, tr('job.elapsed', { time: formatDuration(job.elapsedMs) })] }));
    return (_jsx("div", { className: "dv-job", role: "status", children: _jsx(ProgressBar, { value: p.percent, label: `${title} · ${stage}${count}`, detail: detail }) }));
}
//# sourceMappingURL=JobProgress.js.map