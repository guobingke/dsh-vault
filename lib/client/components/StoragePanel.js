import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useId, useMemo, useRef, useState } from 'react';
import { VaultApiError } from '../api.js';
import { useT } from '../i18n.js';
import { formatDateTime, relativeLabel } from '../lib/format.js';
import { hasStoredSecret, summarizeSnapshotsByTarget, targetKindLabel, targetLocation } from '../lib/targets.js';
import { Banner, Button, Card, CardHead, CardList, ConfirmDialog, DotText, EmptyState, Field, PasswordInput, Rows, SettingRow, Switch, Tag, TextInput, } from './ui.js';
import { PathPicker } from './PathPicker.js';
const EMPTY_FORM = {
    kind: 'local',
    id: '',
    label: '',
    directory: '',
    owner: '',
    repo: '',
    branch: '',
    pathPrefix: '',
    tokenCredential: 'GITHUB_TOKEN',
    token: '',
    url: '',
    username: '',
    password: '',
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: true,
    encryptByDefault: false,
};
const KINDS = ['local', 'github', 'webdav', 's3'];
const KIND_LABEL = {
    local: 'storage.kind.local',
    github: 'storage.kind.github',
    webdav: 'storage.kind.webdav',
    s3: 'storage.kind.s3',
};
/** Button labels use the shorter kind names ("添加 GitHub"), not "GitHub 仓库". */
const KIND_ADD = {
    local: 'kind.local',
    github: 'kind.github',
    webdav: 'kind.webdav',
    s3: 'kind.s3',
};
function blankIdFor(kind, existing) {
    const base = kind === 'local' ? 'local' : kind;
    let n = 1;
    let id = `${base}-${n}`;
    while (existing.some((t) => t.id === id)) {
        n += 1;
        id = `${base}-${n}`;
    }
    return id;
}
function formFromTarget(t) {
    // Secrets (password / token / secret key) are never loaded back into the form.
    const base = {
        ...EMPTY_FORM,
        kind: t.kind,
        id: t.id,
        label: t.label,
        encryptByDefault: Boolean(t.encryptByDefault),
    };
    if (t.kind === 'local') {
        return { ...base, directory: t.directory, encryptByDefault: t.encryptByDefault ?? base.encryptByDefault };
    }
    if (t.kind === 'github') {
        return {
            ...base,
            owner: t.owner,
            repo: t.repo,
            branch: t.branch ?? '',
            pathPrefix: t.pathPrefix ?? '',
            tokenCredential: t.tokenCredential ?? 'GITHUB_TOKEN',
        };
    }
    if (t.kind === 'webdav') {
        return { ...base, url: t.url, username: t.username ?? '', pathPrefix: t.pathPrefix ?? '' };
    }
    return {
        ...base,
        endpoint: t.endpoint,
        region: t.region ?? '',
        bucket: t.bucket,
        accessKeyId: t.accessKeyId,
        pathPrefix: t.pathPrefix ?? '',
        forcePathStyle: t.forcePathStyle ?? true,
    };
}
function buildTarget(form, existing) {
    const id = form.id.trim();
    const label = form.label.trim() || id;
    const trimOr = (v) => (v.trim() ? v.trim() : undefined);
    const encryptByDefault = form.encryptByDefault;
    switch (form.kind) {
        case 'local':
            return { kind: 'local', id, label, directory: form.directory.trim(), encryptByDefault };
        case 'github':
            return {
                kind: 'github',
                id,
                label,
                owner: form.owner.trim(),
                repo: form.repo.trim(),
                branch: trimOr(form.branch),
                pathPrefix: trimOr(form.pathPrefix),
                tokenCredential: trimOr(form.tokenCredential),
                token: trimOr(form.token) ?? (existing?.kind === 'github' ? existing.token : undefined),
                encryptByDefault,
            };
        case 'webdav':
            return {
                kind: 'webdav',
                id,
                label,
                url: form.url.trim(),
                username: trimOr(form.username),
                // Empty secret fields keep the previously saved value (write-only inputs).
                password: trimOr(form.password) ?? (existing?.kind === 'webdav' ? existing.password : undefined),
                pathPrefix: trimOr(form.pathPrefix),
                encryptByDefault,
            };
        default:
            return {
                kind: 's3',
                id,
                label,
                endpoint: form.endpoint.trim(),
                region: trimOr(form.region),
                bucket: form.bucket.trim(),
                accessKeyId: form.accessKeyId.trim(),
                secretAccessKey: form.secretAccessKey.trim() || (existing?.kind === 's3' ? existing.secretAccessKey : ''),
                pathPrefix: trimOr(form.pathPrefix),
                forcePathStyle: form.forcePathStyle,
                encryptByDefault,
            };
    }
}
function requiredFields(form, tr) {
    const out = [];
    if (!form.id.trim())
        out.push(tr('storage.id'));
    if (!form.label.trim())
        out.push(tr('storage.label'));
    switch (form.kind) {
        case 'local':
            if (!form.directory.trim())
                out.push(tr('storage.directory'));
            break;
        case 'github':
            if (!form.owner.trim())
                out.push(tr('storage.owner'));
            if (!form.repo.trim())
                out.push(tr('storage.repo'));
            break;
        case 'webdav':
            if (!form.url.trim())
                out.push(tr('storage.url'));
            break;
        case 's3':
            if (!form.endpoint.trim())
                out.push(tr('storage.endpoint'));
            if (!form.bucket.trim())
                out.push(tr('storage.bucket'));
            if (!form.accessKeyId.trim())
                out.push(tr('storage.accessKey'));
            break;
    }
    return out;
}
function errorText(err) {
    if (err instanceof VaultApiError)
        return `${err.message} (HTTP ${err.status})`;
    return err instanceof Error ? err.message : String(err);
}
/** Strip any configured secret value that might leak into adapter error text. */
function redactError(message, target) {
    let out = message;
    const secrets = [];
    if (target.kind === 'webdav') {
        if (target.password)
            secrets.push(target.password);
    }
    else if (target.kind === 's3') {
        if (target.secretAccessKey)
            secrets.push(target.secretAccessKey);
    }
    else if (target.kind === 'github') {
        if (target.token)
            secrets.push(target.token);
    }
    for (const s of secrets) {
        if (s && s.length >= 3)
            out = out.split(s).join('***');
    }
    return out.length > 300 ? `${out.slice(0, 300)}…` : out;
}
export function StoragePanel({ targets, busy, error, message, onUpsert, onDelete, snapshots, loading, testConnection, fs }) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const tr = useT();
    const ids = useId();
    const [form, setForm] = useState(null);
    const [editing, setEditing] = useState(false);
    const [touched, setTouched] = useState(false);
    const [deleteId, setDeleteId] = useState(null);
    const [tests, setTests] = useState({});
    const editorRef = useRef(null);
    const summaries = useMemo(() => summarizeSnapshotsByTarget(targets, snapshots ?? []), [targets, snapshots]);
    const deleteTarget = targets.find((t) => t.id === deleteId) ?? null;
    const missing = form ? requiredFields(form, tr) : [];
    const duplicate = Boolean(form && targets.some((t) => t.id === form.id.trim()) && !editing);
    function openNew(kind = 'local') {
        setForm({ ...EMPTY_FORM, kind, id: blankIdFor(kind, targets) });
        setEditing(false);
        setTouched(false);
        requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest' }));
    }
    function openEdit(t) {
        setForm(formFromTarget(t));
        setEditing(true);
        setTouched(false);
        requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest' }));
    }
    function patch(part) {
        setForm((prev) => (prev ? { ...prev, ...part } : prev));
    }
    function save() {
        setTouched(true);
        if (!form)
            return;
        if (requiredFields(form, tr).length > 0)
            return;
        onUpsert(buildTarget(form, targets.find((t) => t.id === form.id.trim())));
    }
    async function runTest(t) {
        if (!testConnection)
            return;
        setTests((prev) => ({ ...prev, [t.id]: { status: 'testing' } }));
        try {
            const r = await testConnection(t);
            setTests((prev) => ({
                ...prev,
                [t.id]: r.ok
                    ? { status: 'ok', count: r.count ?? 0 }
                    : { status: 'fail', error: redactError(r.error ?? tr('app.error'), t) },
            }));
        }
        catch (err) {
            setTests((prev) => ({ ...prev, [t.id]: { status: 'fail', error: redactError(errorText(err), t) } }));
        }
    }
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", children: tr('storage.desc') }), error ? _jsx(Banner, { tone: "error", children: error }) : null, message ? _jsx(Banner, { tone: "ok", children: message }) : null, loading && targets.length === 0 ? (_jsxs("span", { className: "dv-loading-inline", role: "status", children: [_jsx("span", { className: "dv-spinner", "aria-hidden": "true" }), tr('app.loading')] })) : targets.length === 0 ? (_jsx(EmptyState, { title: tr('storage.emptyTitle'), body: tr('storage.emptyBody'), actions: _jsx(Button, { variant: "primary", onClick: () => openNew('local'), children: tr('storage.addTitle') }) })) : (_jsx(CardList, { label: tr('storage.targetsLabel'), children: summaries.map(({ target, count, latest }) => {
                    const test = tests[target.id] ?? { status: 'idle' };
                    return (_jsxs(Card, { children: [_jsx(CardHead, { title: _jsxs("span", { className: "dv-inline", children: [_jsx(DotText, { tone: test.status === 'fail' ? 'danger' : count > 0 ? 'ok' : 'neutral', children: target.label }), _jsx("span", { className: "dv-card-sub dv-mono", children: target.id })] }), sub: targetKindLabel(target, tr), actions: _jsxs(_Fragment, { children: [_jsx(Tag, { tone: target.encryptByDefault ? 'ok' : 'neutral', children: target.encryptByDefault ? tr('storage.encDefault') : tr('common.plaintext') }), hasStoredSecret(target) ? _jsx(Tag, { children: tr('storage.storedCredentials') }) : null] }) }), _jsx("span", { className: "dv-card-sub dv-mono", style: { overflowWrap: 'anywhere' }, children: targetLocation(target) }), _jsxs("span", { className: "dv-card-sub", children: [tr('storage.snapshots', { count }), ' · ', latest
                                        ? tr('storage.lastBackup', { time: `${formatDateTime(latest.createdAt)}（${relativeLabel(tr, latest.createdAt)}）` })
                                        : tr('storage.noSnapshots')] }), test.status === 'ok' ? _jsx("span", { className: "dv-small", style: { color: 'var(--dv-ok-label)' }, children: tr('storage.testOk', { count: test.count }) }) : null, test.status === 'fail' ? _jsx("span", { className: "dv-error-text", children: tr('storage.testFail', { error: test.error }) }) : null, _jsxs("div", { className: "dv-card-actions", children: [testConnection ? (_jsx(Button, { size: "sm", onClick: () => void runTest(target), loading: test.status === 'testing', children: test.status === 'testing' ? tr('storage.testing') : tr('storage.test') })) : null, _jsx(Button, { size: "sm", onClick: () => openEdit(target), disabled: busy, children: tr('storage.edit') }), _jsx(Button, { size: "sm", variant: "danger", onClick: () => setDeleteId(target.id), disabled: busy, children: tr('storage.delete') })] })] }, target.id));
                }) })), !form ? (_jsx("div", { className: "dv-add-row", children: KINDS.map((k) => (_jsxs(Button, { variant: "dashed", onClick: () => openNew(k), disabled: busy, children: ["+ ", tr('storage.addKind', { kind: tr(KIND_ADD[k]) })] }, k))) })) : null, form ? (_jsx("div", { ref: editorRef, children: _jsxs(Card, { children: [_jsx(CardHead, { title: editing ? tr('storage.editTitle') : tr('storage.addTitle'), sub: tr('storage.addDesc'), actions: _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setForm(null), children: tr('storage.cancel') }) }), _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" }), _jsx("div", { className: "dv-chip-row", role: "radiogroup", "aria-label": tr('storage.kind'), children: KINDS.map((k) => (_jsx("button", { type: "button", role: "radio", className: "dv-chip", "aria-checked": form.kind === k, disabled: editing && form.kind !== k, onClick: () => patch({ kind: k, id: editing ? form.id : blankIdFor(k, targets) }), children: tr(KIND_LABEL[k]) }, k))) }), _jsxs("div", { className: "dv-grid-2", children: [_jsx(Field, { label: tr('storage.id'), htmlFor: `${ids}-id`, hint: tr('storage.idHint'), children: _jsx(TextInput, { id: `${ids}-id`, mono: true, value: form.id, placeholder: "local-default", maxLength: 64, onChange: (e) => patch({ id: e.target.value.replace(/\s+/g, '-').toLowerCase() }), disabled: editing, invalid: touched && !form.id.trim() }) }), _jsx(Field, { label: tr('storage.label'), htmlFor: `${ids}-label`, children: _jsx(TextInput, { id: `${ids}-label`, value: form.label, maxLength: 80, placeholder: targetLabelPlaceholder(form.kind, tr), onChange: (e) => patch({ label: e.target.value }), invalid: touched && !form.label.trim() }) })] }), duplicate ? _jsx("span", { className: "dv-hint", style: { color: 'var(--dv-warn)' }, children: tr('storage.idExists') }) : null, form.kind === 'local' ? (_jsxs(Field, { label: tr('storage.directory'), htmlFor: `${ids}-dir`, hint: tr('storage.directoryHint'), children: [_jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(TextInput, { id: `${ids}-dir`, mono: true, value: form.directory, placeholder: "~/dsh-vault-backups", onChange: (e) => patch({ directory: e.target.value }), invalid: touched && !form.directory.trim() }), fs ? _jsx(Button, { variant: "quiet", onClick: () => setPickerOpen(true), children: tr('backup.browse') }) : null] }), fs ? (_jsx(PathPicker, { open: pickerOpen, mode: "directory", fs: fs, initialPath: form.directory, onClose: () => setPickerOpen(false), onSelect: (p) => { patch({ directory: p }); setPickerOpen(false); } })) : null] })) : null, form.kind === 'github' ? (_jsx(_Fragment, { children: _jsxs("div", { className: "dv-grid-2", children: [_jsx(Field, { label: tr('storage.owner'), htmlFor: `${ids}-owner`, children: _jsx(TextInput, { id: `${ids}-owner`, mono: true, value: form.owner, onChange: (e) => patch({ owner: e.target.value }), placeholder: "octocat" }) }), _jsx(Field, { label: tr('storage.repo'), htmlFor: `${ids}-repo`, children: _jsx(TextInput, { id: `${ids}-repo`, mono: true, value: form.repo, onChange: (e) => patch({ repo: e.target.value }), placeholder: "dsh-backups" }) }), _jsx(Field, { label: tr('storage.branch'), htmlFor: `${ids}-branch`, optional: true, children: _jsx(TextInput, { id: `${ids}-branch`, mono: true, value: form.branch, onChange: (e) => patch({ branch: e.target.value }), placeholder: "main" }) }), _jsx(Field, { label: tr('storage.pathPrefix'), htmlFor: `${ids}-prefix`, optional: true, children: _jsx(TextInput, { id: `${ids}-prefix`, mono: true, value: form.pathPrefix, onChange: (e) => patch({ pathPrefix: e.target.value }) }) }), _jsx(Field, { label: tr('storage.tokenCredential'), htmlFor: `${ids}-cred`, optional: true, children: _jsx(TextInput, { id: `${ids}-cred`, mono: true, value: form.tokenCredential, onChange: (e) => patch({ tokenCredential: e.target.value }) }) }), _jsx(Field, { label: tr('storage.token'), htmlFor: `${ids}-token`, hint: tr('storage.tokenHint'), optional: true, children: _jsx(PasswordInput, { id: `${ids}-token`, value: form.token, onChange: (e) => patch({ token: e.target.value }), autoComplete: "off" }) })] }) })) : null, form.kind === 'webdav' ? (_jsxs(_Fragment, { children: [_jsx(Field, { label: tr('storage.url'), htmlFor: `${ids}-url`, children: _jsx(TextInput, { id: `${ids}-url`, mono: true, value: form.url, onChange: (e) => patch({ url: e.target.value }), placeholder: "https://dav.example.com/dsh" }) }), _jsxs("div", { className: "dv-grid-2", children: [_jsx(Field, { label: tr('storage.username'), htmlFor: `${ids}-user`, optional: true, children: _jsx(TextInput, { id: `${ids}-user`, value: form.username, onChange: (e) => patch({ username: e.target.value }), autoComplete: "username" }) }), _jsx(Field, { label: tr('storage.password'), htmlFor: `${ids}-pass`, hint: editing ? tr('storage.passwordKeep') : undefined, optional: true, children: _jsx(PasswordInput, { id: `${ids}-pass`, value: form.password, onChange: (e) => patch({ password: e.target.value }), autoComplete: "new-password" }) })] }), _jsx(Field, { label: tr('storage.pathPrefix'), htmlFor: `${ids}-wprefix`, optional: true, children: _jsx(TextInput, { id: `${ids}-wprefix`, mono: true, value: form.pathPrefix, onChange: (e) => patch({ pathPrefix: e.target.value }) }) })] })) : null, form.kind === 's3' ? (_jsx(_Fragment, { children: _jsxs("div", { className: "dv-grid-2", children: [_jsx(Field, { label: tr('storage.endpoint'), htmlFor: `${ids}-s3e`, children: _jsx(TextInput, { id: `${ids}-s3e`, mono: true, value: form.endpoint, onChange: (e) => patch({ endpoint: e.target.value }), placeholder: "https://s3.example.com" }) }), _jsx(Field, { label: tr('storage.bucket'), htmlFor: `${ids}-bucket`, children: _jsx(TextInput, { id: `${ids}-bucket`, mono: true, value: form.bucket, onChange: (e) => patch({ bucket: e.target.value }), placeholder: "dsh-vault" }) }), _jsx(Field, { label: tr('storage.region'), htmlFor: `${ids}-region`, optional: true, children: _jsx(TextInput, { id: `${ids}-region`, mono: true, value: form.region, onChange: (e) => patch({ region: e.target.value }), placeholder: "auto" }) }), _jsx(Field, { label: tr('storage.pathPrefix'), htmlFor: `${ids}-sprefix`, optional: true, children: _jsx(TextInput, { id: `${ids}-sprefix`, mono: true, value: form.pathPrefix, onChange: (e) => patch({ pathPrefix: e.target.value }) }) }), _jsx(Field, { label: tr('storage.accessKey'), htmlFor: `${ids}-ak`, children: _jsx(TextInput, { id: `${ids}-ak`, mono: true, value: form.accessKeyId, onChange: (e) => patch({ accessKeyId: e.target.value }), autoComplete: "off" }) }), _jsx(Field, { label: tr('storage.secretKey'), htmlFor: `${ids}-sk`, hint: editing ? tr('storage.secretKeep') : undefined, children: _jsx(PasswordInput, { id: `${ids}-sk`, value: form.secretAccessKey, onChange: (e) => patch({ secretAccessKey: e.target.value }), autoComplete: "new-password" }) })] }) })) : null, _jsxs(Rows, { children: [form.kind === 's3' ? (_jsx(SettingRow, { title: tr('storage.forcePathStyle'), description: tr('storage.forcePathStyleDesc'), htmlFor: `${ids}-pathstyle`, control: _jsx(Switch, { id: `${ids}-pathstyle`, checked: form.forcePathStyle, onChange: () => patch({ forcePathStyle: !form.forcePathStyle }) }) })) : null, _jsx(SettingRow, { title: tr('storage.encDefault'), description: tr('storage.encDefaultDesc'), htmlFor: `${ids}-enc`, control: _jsx(Switch, { id: `${ids}-enc`, checked: form.encryptByDefault, onChange: () => patch({ encryptByDefault: !form.encryptByDefault }) }) })] }), touched && missing.length > 0 ? (_jsx("span", { className: "dv-error-text", children: tr('storage.missing', { fields: missing.join(' / ') }) })) : null, _jsxs("div", { className: "dv-card-foot", children: [_jsx(Button, { onClick: () => setForm(null), children: tr('storage.cancel') }), _jsx(Button, { variant: "primary", onClick: save, loading: busy, children: editing ? tr('storage.saveEdit') : tr('storage.saveNew') })] })] }) })) : null, _jsx(ConfirmDialog, { open: Boolean(deleteTarget), onClose: () => setDeleteId(null), title: tr('storage.deleteTitle', { label: deleteTarget?.label ?? '' }), description: tr('storage.deleteBody'), confirmLabel: tr('storage.deleteConfirm'), busy: busy, onConfirm: () => {
                    if (!deleteTarget)
                        return;
                    onDelete(deleteTarget.id);
                    setDeleteId(null);
                } })] }));
}
function targetLabelPlaceholder(kind, tr) {
    switch (kind) {
        case 'local': return tr('storage.kind.local');
        case 'github': return tr('storage.kind.github');
        case 'webdav': return tr('storage.kind.webdav');
        default: return tr('storage.kind.s3');
    }
}
//# sourceMappingURL=StoragePanel.js.map