import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * In-app file / folder browser for "Browse…" buttons.
 *
 * dsh's native OS chooser only exists on some hosts (loopback web / Desktop on
 * Windows and macOS) and only picks folders, so Browse always opens this
 * dialog, backed by the vault's /fs/list + /fs/mkdir endpoints. When the host
 * exposes the native chooser, a "System dialog…" action is offered too.
 */
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { IconFile, IconFolder } from './Icons.js';
import { Banner, Button, Checkbox, Dialog, LoadingInline, Select, TextInput } from './ui.js';
const ARCHIVE_RE = /\.(tar\.gz|tgz|dshvault)$/i;
export function isArchiveName(name) {
    return ARCHIVE_RE.test(name);
}
/** Join a directory and a single name with the host separator. */
export function joinPath(dir, name, sep = '/') {
    if (!dir)
        return name;
    return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${name}` : `${dir}${sep}${name}`;
}
/** Parent of a path (either separator); null at a root. */
export function parentOf(p) {
    const trimmed = p.replace(/[\\/]+$/, '');
    const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    if (idx < 0)
        return null;
    if (idx === 0)
        return trimmed.slice(0, 1);
    const head = trimmed.slice(0, idx);
    return /^[A-Za-z]:$/.test(head) ? `${head}\\` : head;
}
function baseName(p) {
    const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts[parts.length - 1] ?? '';
}
function formatBytes(n) {
    if (n === undefined)
        return '';
    if (n < 1024)
        return `${n} B`;
    if (n < 1024 * 1024)
        return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export function PathPicker({ open, mode, fs, initialPath, defaultFileName, onSelect, onClose }) {
    const tr = useT();
    const [listing, setListing] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pathInput, setPathInput] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [showHidden, setShowHidden] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [fileName, setFileName] = useState('');
    const [nativeBusy, setNativeBusy] = useState(false);
    const load = useCallback(async (path, fallbacks = []) => {
        setLoading(true);
        setError(null);
        const tries = [path, ...fallbacks];
        let lastErr = null;
        for (const p of tries) {
            try {
                const next = await fs.list(p);
                setListing(next);
                setPathInput(next.path);
                setSelectedFile(null);
                setLoading(false);
                return;
            }
            catch (err) {
                lastErr = err;
            }
        }
        setLoading(false);
        setError(lastErr instanceof Error ? lastErr.message : String(lastErr));
    }, [fs]);
    useEffect(() => {
        if (!open)
            return;
        setCreating(false);
        setNewName('');
        setError(null);
        const start = (initialPath ?? '').trim();
        const isFileLike = mode !== 'directory' && (isArchiveName(start) || /\.[A-Za-z0-9]{1,8}$/.test(baseName(start)));
        if (mode === 'save')
            setFileName(isFileLike ? baseName(start) : (defaultFileName ?? ''));
        const parent = start ? parentOf(start) : null;
        const first = isFileLike ? (parent ?? '') : start;
        const fallbacks = [parent, ''].filter((x) => x !== null && x !== first);
        void load(first, fallbacks);
    }, [open, mode, initialPath, defaultFileName, load]);
    if (!open)
        return null;
    const sep = listing?.sep ?? '/';
    const entries = (listing?.entries ?? []).filter((e) => showHidden || !e.hidden);
    const visible = mode === 'open' ? entries.filter((e) => e.kind === 'directory' || isArchiveName(e.name)) : entries;
    const title = mode === 'directory' ? tr('picker.title.directory') : mode === 'open' ? tr('picker.title.open') : tr('picker.title.save');
    async function createFolder() {
        if (!listing || !newName.trim())
            return;
        try {
            const r = await fs.mkdir(listing.path, newName.trim());
            setCreating(false);
            setNewName('');
            await load(r.path);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }
    async function useNative() {
        if (!fs.pickNative)
            return;
        setNativeBusy(true);
        setError(null);
        try {
            const r = await fs.pickNative();
            if (r.path)
                onSelect(r.path);
        }
        catch (err) {
            setError(tr('picker.nativeFailed', { error: err instanceof Error ? err.message : String(err) }));
        }
        finally {
            setNativeBusy(false);
        }
    }
    const cwd = listing?.path ?? '';
    const savePath = mode === 'save' && cwd && fileName.trim() ? joinPath(cwd, fileName.trim(), sep) : null;
    const actions = (_jsxs(_Fragment, { children: [mode === 'directory' && listing?.nativePicker && fs.pickNative ? (_jsx(Button, { variant: "quiet", onClick: () => { void useNative(); }, loading: nativeBusy, style: { marginRight: 'auto' }, children: tr('picker.native') })) : null, _jsx(Button, { onClick: onClose, children: tr('app.cancel') }), mode === 'directory' ? (_jsx(Button, { variant: "primary", disabled: !cwd || loading, onClick: () => onSelect(cwd), children: tr('picker.selectFolder') })) : null, mode === 'open' ? (_jsxs(_Fragment, { children: [_jsx(Button, { disabled: !cwd || loading, onClick: () => onSelect(cwd), children: tr('picker.selectFolder') }), _jsx(Button, { variant: "primary", disabled: !selectedFile, onClick: () => { if (selectedFile)
                            onSelect(selectedFile); }, children: tr('picker.selectFile') })] })) : null, mode === 'save' ? (_jsx(Button, { variant: "primary", disabled: !savePath, onClick: () => { if (savePath)
                    onSelect(savePath); }, children: tr('picker.saveHere') })) : null] }));
    return (_jsxs(Dialog, { open: open, onClose: onClose, title: title, size: "wide", actions: actions, children: [_jsxs("div", { className: "dv-picker-bar", children: [listing?.roots && listing.roots.length > 0 ? (_jsx(Select, { "aria-label": tr('picker.roots'), value: listing.roots.find((r) => cwd.toLowerCase().startsWith(r.toLowerCase())) ?? '', onChange: (e) => { if (e.target.value)
                            void load(e.target.value); }, children: listing.roots.map((r) => _jsx("option", { value: r, children: r }, r)) })) : null, _jsx(Button, { size: "sm", variant: "quiet", onClick: () => void load(listing?.home ?? ''), disabled: loading, children: tr('picker.home') }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => { if (listing?.parent)
                            void load(listing.parent); }, disabled: loading || !listing?.parent, children: tr('picker.up') }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setCreating((v) => !v), disabled: !listing, children: tr('picker.newFolder') })] }), _jsxs("form", { className: "dv-picker-bar", onSubmit: (e) => { e.preventDefault(); void load(pathInput); }, children: [_jsx(TextInput, { "aria-label": tr('picker.path'), value: pathInput, onChange: (e) => setPathInput(e.target.value), mono: true }), _jsx(Button, { size: "sm", type: "submit", disabled: loading, children: tr('picker.go') })] }), creating ? (_jsxs("form", { className: "dv-picker-bar", onSubmit: (e) => { e.preventDefault(); void createFolder(); }, children: [_jsx(TextInput, { "aria-label": tr('picker.newFolderName'), placeholder: tr('picker.newFolderName'), value: newName, onChange: (e) => setNewName(e.target.value), autoFocus: true }), _jsx(Button, { size: "sm", type: "submit", variant: "primary", disabled: !newName.trim(), children: tr('picker.create') }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => { setCreating(false); setNewName(''); }, children: tr('app.cancel') })] })) : null, error ? _jsx(Banner, { tone: "error", role: "alert", children: error }) : null, _jsxs("div", { className: "dv-picker-list", role: "listbox", "aria-label": title, "aria-busy": loading || undefined, children: [loading && !listing ? _jsx("div", { className: "dv-picker-empty", children: _jsx(LoadingInline, { label: tr('picker.loading') }) }) : null, listing && visible.length === 0 && !loading ? _jsx("div", { className: "dv-picker-empty", children: tr('picker.empty') }) : null, visible.map((e) => {
                        const isDir = e.kind === 'directory';
                        const disabled = !isDir && mode === 'directory';
                        const selected = !isDir && (selectedFile === e.path || (mode === 'save' && fileName === e.name));
                        return (_jsxs("button", { type: "button", role: "option", "aria-selected": selected, className: "dv-picker-item", "data-selected": selected ? 'true' : undefined, "data-hidden": e.hidden ? 'true' : undefined, disabled: disabled, onClick: () => {
                                if (isDir) {
                                    void load(e.path);
                                    return;
                                }
                                if (mode === 'open')
                                    setSelectedFile(e.path);
                                if (mode === 'save')
                                    setFileName(e.name);
                            }, onDoubleClick: () => { if (!isDir && mode === 'open')
                                onSelect(e.path); }, children: [_jsx("span", { className: "dv-picker-icon", children: isDir ? _jsx(IconFolder, {}) : _jsx(IconFile, {}) }), _jsx("span", { className: "dv-picker-name", children: e.name }), !isDir ? _jsx("span", { className: "dv-picker-size dv-num", children: formatBytes(e.bytes) }) : null] }, e.path));
                    })] }), _jsxs("div", { className: "dv-picker-foot", children: [_jsx(Checkbox, { title: tr('picker.showHidden'), checked: showHidden, onChange: (e) => setShowHidden(e.target.checked) }), mode === 'open' ? _jsx("span", { className: "dv-small dv-muted", children: tr('picker.archiveOnly') }) : null] }), mode === 'save' ? (_jsx(TextInput, { "aria-label": tr('picker.fileName'), placeholder: tr('picker.fileName'), value: fileName, onChange: (e) => setFileName(e.target.value), mono: true })) : null, mode === 'save' && savePath ? _jsx("span", { className: "dv-small dv-muted dv-mono", style: { overflowWrap: 'anywhere' }, children: savePath }) : null] }));
}
//# sourceMappingURL=PathPicker.js.map