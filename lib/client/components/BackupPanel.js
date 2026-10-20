import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { targetName } from '../lib/format.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n.js';
import { passwordStrength } from '../lib/format.js';
import { targetKindLabel, targetLocation } from '../lib/targets.js';
import { Banner, Button, Card, CardHead, EmptyState, Field, OptionTile, PasswordInput, Rows, SettingRow, Switch, Tag, TextInput, } from './ui.js';
import { PathPicker } from './PathPicker.js';
import { BackupSummary } from './ResultSummary.js';
import { PluginCopiesCard } from './PluginCopiesCard.js';
const CATEGORIES = [
    { id: 'plugins', label: 'backup.cat.plugins', desc: 'backup.cat.plugins.desc' },
    { id: 'plugin-config', label: 'backup.cat.plugin-config', desc: 'backup.cat.plugin-config.desc' },
    { id: 'mcp', label: 'backup.cat.mcp', desc: 'backup.cat.mcp.desc' },
    { id: 'skills', label: 'backup.cat.skills', desc: 'backup.cat.skills.desc' },
    { id: 'settings', label: 'backup.cat.settings', desc: 'backup.cat.settings.desc' },
    { id: 'providers', label: 'backup.cat.providers', desc: 'backup.cat.providers.desc' },
    { id: 'agent-presets', label: 'backup.cat.agent-presets', desc: 'backup.cat.agent-presets.desc' },
    { id: 'profiles', label: 'backup.cat.profiles', desc: 'backup.cat.profiles.desc' },
    { id: 'instructions', label: 'backup.cat.instructions', desc: 'backup.cat.instructions.desc' },
    { id: 'plugin-data', label: 'backup.cat.plugin-data', desc: 'backup.cat.plugin-data.desc' },
    { id: 'credentials', label: 'backup.cat.credentials', desc: 'backup.cat.credentials.desc', secret: true },
];
const ALL_IDS = CATEGORIES.map((c) => c.id);
/** Suggested export file name: dsh-vault-YYYYMMDD-HHMM.(dshvault|tar.gz). */
export function defaultExportName(encrypt, now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `dsh-vault-${stamp}.${encrypt ? 'dshvault' : 'tar.gz'}`;
}
function strengthLabel(tr, level) {
    return tr(`backup.strength.${level}`);
}
export function BackupPanel({ targets, busy, message, error, progress, onBackup, defaultTargetId, stage, onNavigateStorage, fs, pluginDataEntries, copiesApi, result, resultLocation, }) {
    const tr = useT();
    const [destMode, setDestMode] = useState(targets.length ? 'target' : 'directory');
    const destTouched = useRef(false);
    // Targets usually arrive after the first render: switch to them unless the user already chose.
    useEffect(() => {
        if (!destTouched.current && targets.length > 0)
            setDestMode('target');
    }, [targets.length]);
    const [targetId, setTargetId] = useState(defaultTargetId ?? targets[0]?.id ?? '');
    const [directory, setDirectory] = useState('');
    const [exportFile, setExportFile] = useState('');
    const [encrypt, setEncrypt] = useState(false);
    const [includeSecrets, setIncludeSecrets] = useState(false);
    const [password, setPassword] = useState('');
    const [notes, setNotes] = useState('');
    const [scope, setScope] = useState(() => new Set(ALL_IDS));
    const [touched, setTouched] = useState(false);
    const [picker, setPicker] = useState(null);
    // Keep the selection valid when targets load asynchronously or change.
    useEffect(() => {
        if (!targetId || !targets.some((t) => t.id === targetId)) {
            const next = (defaultTargetId && targets.some((t) => t.id === defaultTargetId) ? defaultTargetId : targets[0]?.id) ?? '';
            setTargetId(next);
        }
    }, [targets, targetId, defaultTargetId]);
    const target = targets.find((t) => t.id === targetId);
    useEffect(() => {
        if (target?.encryptByDefault)
            setEncrypt(true);
    }, [target?.id, target?.encryptByDefault]);
    const strength = passwordStrength(password);
    const selectedCats = CATEGORIES.filter((c) => scope.has(c.id) && (!c.secret || encrypt));
    const noScope = selectedCats.length === 0;
    const passwordMissing = encrypt && password.length === 0;
    const destOk = destMode === 'target'
        ? Boolean(targetId)
        : destMode === 'directory'
            ? Boolean(directory.trim())
            : Boolean(exportFile.trim());
    const canSubmit = destOk && !noScope && !passwordMissing && !busy;
    const toggleCategory = (id) => {
        setScope((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    };
    const progressLabel = useMemo(() => (stage ? tr('backup.progressStage', { stage: tr(`backup.progress.${stage}`) }) : tr('backup.progress')), [tr, stage]);
    const submit = () => {
        setTouched(true);
        if (!canSubmit)
            return;
        onBackup({
            targetId: destMode === 'target' ? targetId : undefined,
            directory: destMode === 'directory' ? directory.trim() : undefined,
            exportFile: destMode === 'file' ? exportFile.trim() : undefined,
            encrypt,
            password: encrypt ? password : undefined,
            includeSecrets: includeSecrets && encrypt,
            notes: notes.trim() || undefined,
            categories: selectedCats.length === CATEGORIES.length ? undefined : selectedCats.map((c) => c.id),
        });
    };
    return (_jsxs(_Fragment, { children: [_jsx("p", { className: "dv-section-desc", children: tr('backup.desc') }), error ? _jsx(Banner, { tone: "error", title: tr('backup.failedTitle'), children: error }) : null, result ? _jsx(BackupSummary, { result: result, location: resultLocation ?? '' }) : null, message ? _jsx(Banner, { tone: "ok", children: message }) : null, _jsxs(Card, { children: [_jsx(CardHead, { title: tr('backup.targetTitle'), sub: tr('backup.targetDesc') }), _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" }), _jsx(Rows, { children: _jsx(SettingRow, { title: tr('backup.destMode'), description: tr('backup.destModeDesc'), children: _jsxs("select", { className: "dv-input", value: destMode, onChange: (e) => { destTouched.current = true; setDestMode(e.target.value); }, "aria-label": tr('backup.destMode'), children: [_jsx("option", { value: "target", children: tr('backup.dest.target') }), _jsx("option", { value: "directory", children: tr('backup.dest.directory') }), _jsx("option", { value: "file", children: tr('backup.dest.file') })] }) }) }), destMode === 'target' ? (targets.length === 0 ? (_jsx(EmptyState, { title: tr('backup.noTargetsTitle'), body: tr('backup.noTargetsBody'), actions: onNavigateStorage ? _jsx(Button, { variant: "primary", onClick: onNavigateStorage, children: tr('backup.goStorage') }) : null })) : (_jsx("div", { className: "dv-options", role: "radiogroup", "aria-label": tr('backup.targetTitle'), children: targets.map((tg) => (_jsx(OptionTile, { name: "dv-backup-target", checked: tg.id === targetId, onChange: () => setTargetId(tg.id), title: _jsxs(_Fragment, { children: [targetName(tg, tr), tg.encryptByDefault ? _jsx(Tag, { tone: "ok", children: tr('backup.targetEncBadge') }) : null] }), description: _jsxs(_Fragment, { children: [targetKindLabel(tg, tr), _jsx("br", {}), _jsx("span", { className: "dv-mono", children: targetLocation(tg) })] }) }, tg.id))) }))) : null, destMode === 'directory' ? (_jsx(Field, { label: tr('backup.directory'), htmlFor: "dv-backup-dir", hint: tr('backup.directoryHint'), children: _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(TextInput, { id: "dv-backup-dir", value: directory, onChange: (e) => setDirectory(e.target.value), placeholder: tr('backup.directoryPlaceholder'), mono: true }), fs ? (_jsx(Button, { variant: "quiet", onClick: () => setPicker('directory'), children: tr('backup.browse') })) : null] }) })) : null, destMode === 'file' ? (_jsx(Field, { label: tr('backup.exportFile'), htmlFor: "dv-backup-file", hint: tr('backup.exportFileHint'), children: _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(TextInput, { id: "dv-backup-file", value: exportFile, onChange: (e) => setExportFile(e.target.value), placeholder: tr('backup.exportFilePlaceholder'), mono: true }), fs ? (_jsx(Button, { variant: "quiet", onClick: () => setPicker('save'), children: tr('backup.browse') })) : null] }) })) : null, fs ? (_jsx(PathPicker, { open: picker !== null, mode: picker ?? 'directory', fs: fs, initialPath: picker === 'save' ? exportFile : directory, defaultFileName: defaultExportName(encrypt), onClose: () => setPicker(null), onSelect: (p) => {
                            if (picker === 'save')
                                setExportFile(p);
                            else
                                setDirectory(p);
                            setPicker(null);
                        } })) : null] }), _jsxs(Card, { children: [_jsx(CardHead, { title: tr('backup.scopeTitle'), sub: tr('backup.scopeDesc'), actions: _jsxs(_Fragment, { children: [_jsx("span", { className: "dv-small dv-muted dv-num", children: tr('backup.scopeSummary', { selected: selectedCats.length, total: CATEGORIES.length }) }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setScope(new Set(ALL_IDS)), children: tr('backup.scopeAll') }), _jsx(Button, { size: "sm", variant: "quiet", onClick: () => setScope(new Set()), children: tr('backup.scopeNone') })] }) }), _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" }), _jsx("div", { className: "dv-card-list", style: { gap: 6 }, children: CATEGORIES.map((c) => (_jsx(OptionTile, { shape: "square", 
                            // Credentials can only go into an encrypted backup: off and locked otherwise.
                            checked: scope.has(c.id) && (!c.secret || encrypt), disabled: Boolean(c.secret) && !encrypt, onChange: () => toggleCategory(c.id), title: tr(c.label), description: c.id === 'plugin-data' && pluginDataEntries
                                ? pluginDataEntries.length
                                    ? tr('backup.cat.plugin-data.found', { list: pluginDataEntries.join('  ') })
                                    : tr('backup.cat.plugin-data.none')
                                : c.secret && !encrypt
                                    ? tr('backup.cat.credentials.plainBlocked')
                                    : tr(c.desc) }, c.id))) })] }), copiesApi && (scope.has('plugins') || scope.has('profiles')) ? _jsx(PluginCopiesCard, { api: copiesApi }) : null, _jsxs(Rows, { label: tr('backup.encTitle'), children: [_jsx(SettingRow, { title: tr('backup.encTitle'), description: tr('backup.encDesc'), htmlFor: "dv-backup-encrypt", control: _jsx(Switch, { id: "dv-backup-encrypt", checked: encrypt, onChange: () => {
                                const next = !encrypt;
                                setEncrypt(next);
                                if (!next) {
                                    setIncludeSecrets(false);
                                    setScope((prev) => {
                                        const copy = new Set(prev);
                                        copy.delete('credentials');
                                        return copy;
                                    });
                                }
                            } }) }), encrypt ? (_jsx(SettingRow, { stacked: true, title: tr('backup.password'), description: touched && passwordMissing ? tr('backup.passwordRequired') : tr('backup.passwordHint'), htmlFor: "dv-backup-password", children: _jsx(Field, { label: _jsx("span", { className: "dv-sr-only", children: tr('backup.password') }), htmlFor: "dv-backup-password", hint: password ? tr('backup.strength', { level: strengthLabel(tr, strength.level) }) : undefined, children: _jsx(PasswordInput, { id: "dv-backup-password", value: password, autoComplete: "new-password", placeholder: tr('backup.passwordPlaceholder'), onChange: (e) => setPassword(e.target.value) }) }) })) : null, _jsx(SettingRow, { title: tr('backup.secretsTitle'), description: encrypt ? tr('backup.secretsDesc') : tr('backup.secretsBlocked'), htmlFor: "dv-backup-secrets", control: _jsx(Switch, { id: "dv-backup-secrets", checked: includeSecrets && encrypt, disabled: !encrypt, onChange: () => {
                                const next = !includeSecrets;
                                setIncludeSecrets(next);
                                if (next)
                                    setScope((prev) => new Set(prev).add('credentials'));
                            } }) }), _jsx(SettingRow, { title: tr('backup.notes'), htmlFor: "dv-backup-notes", control: _jsx("div", { style: { width: 220, maxWidth: '100%' }, children: _jsx(TextInput, { id: "dv-backup-notes", value: notes, maxLength: 200, placeholder: tr('backup.notesPlaceholder'), onChange: (e) => setNotes(e.target.value) }) }) })] }), _jsxs("div", { className: "dv-card-foot", style: { justifyContent: 'space-between' }, children: [_jsx("span", { className: "dv-hint", style: { color: noScope ? 'var(--dv-danger)' : undefined }, children: noScope ? tr('backup.noScope') : '' }), _jsx(Button, { variant: "primary", onClick: submit, loading: busy, children: busy ? tr('backup.submitting') : tr('backup.submit') })] })] }));
}
//# sourceMappingURL=BackupPanel.js.map