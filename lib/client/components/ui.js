import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Shared building blocks for the dsh-vault settings section.
 *
 * These mirror the host's native settings chrome (rows, gray pickers, black
 * primary buttons, provider cards) using only --dv-* aliases of --dsw-* tokens.
 * They are local re-creations, not imports from any host primitives package.
 */
import { useEffect, useId, useRef, useState, } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n.js';
import { IconEye, IconEyeOff } from './Icons.js';
export function cx(...parts) {
    return parts.filter(Boolean).join(' ');
}
/** 16px plain title + one plain sentence, no icon. */
export function SectionHead({ title, description, id }) {
    return (_jsxs("header", { className: "dv-section-head", children: [_jsx("h2", { className: "dv-section-title", id: id, children: title }), description ? _jsx("p", { className: "dv-section-desc", children: description }) : null] }));
}
/**
 * One row of small tabs. Roving tabindex + arrow keys, per the WAI-ARIA tabs
 * pattern. Selected tab = gray rounded pill (native nav highlight).
 */
export function SectionTabs({ label, value, onChange, items }) {
    const refs = useRef([]);
    const idx = Math.max(0, items.findIndex((i) => i.id === value));
    const move = (delta) => {
        const next = (idx + delta + items.length) % items.length;
        const item = items[next];
        if (!item)
            return;
        onChange(item.id);
        refs.current[next]?.focus();
    };
    return (_jsx("div", { className: "dv-tabs", role: "tablist", "aria-label": label, children: items.map((item, i) => (_jsx("button", { ref: (el) => { refs.current[i] = el; }, type: "button", role: "tab", id: `dv-tab-${item.id}`, "aria-selected": value === item.id, "aria-controls": item.panelId, tabIndex: value === item.id ? 0 : -1, className: "dv-tab", onClick: () => onChange(item.id), onKeyDown: (e) => {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    move(1);
                }
                else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    move(-1);
                }
                else if (e.key === 'Home') {
                    e.preventDefault();
                    move(-idx);
                }
                else if (e.key === 'End') {
                    e.preventDefault();
                    move(items.length - 1 - idx);
                }
            }, children: item.label }, item.id))) }));
}
export function SectionPanel({ id, labelledBy, children }) {
    return (_jsx("div", { className: "dv-section-body", role: "tabpanel", id: id, "aria-labelledby": labelledBy, tabIndex: -1, children: children }));
}
/* ==========================================================================
   Setting rows
   ========================================================================== */
export function Rows({ children, label }) {
    return _jsx("div", { className: "dv-rows", role: "group", "aria-label": label, children: children });
}
/** Native setting row: title 14px + desc 12px on the left, control on the right. */
export function SettingRow({ title, description, control, stacked, htmlFor, children }) {
    return (_jsxs("div", { className: "dv-row", "data-stack": stacked ? 'true' : undefined, children: [_jsxs("div", { className: "dv-row-text", children: [htmlFor ? (_jsx("label", { className: "dv-row-title", htmlFor: htmlFor, children: title })) : (_jsx("span", { className: "dv-row-title", children: title })), description ? _jsx("span", { className: "dv-row-desc", children: description }) : null] }), control !== undefined ? _jsx("div", { className: "dv-row-control", children: control }) : null, children] }));
}
/* ==========================================================================
   Provider card
   ========================================================================== */
export function Card({ children, className }) {
    return _jsx("div", { className: cx('dv-card', className), children: children });
}
export function CardList({ children, label }) {
    return _jsx("div", { className: "dv-card-list", role: label ? 'group' : undefined, "aria-label": label, children: children });
}
export function CardHead({ title, sub, actions }) {
    return (_jsxs("div", { className: "dv-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: "dv-card-title", children: title }), sub ? _jsx("span", { className: "dv-card-sub", children: sub }) : null] }), actions ? _jsx("div", { className: "dv-card-actions", children: actions }) : null] }));
}
export function CardSeparator() {
    return _jsx("div", { className: "dv-card-sep", "aria-hidden": "true" });
}
export function Button({ variant = 'secondary', size = 'md', loading, block, icon, disabled, children, className, type = 'button', ...rest }) {
    return (_jsxs("button", { type: type, className: cx('dv-btn', className), "data-variant": variant, "data-size": size, "data-block": block ? 'true' : undefined, disabled: disabled || loading, "aria-busy": loading || undefined, ...rest, children: [loading ? _jsx("span", { className: "dv-spinner", "aria-hidden": "true" }) : icon, children] }));
}
export function IconButton({ label, variant = 'default', children, className, type = 'button', ...rest }) {
    return (_jsx("button", { type: type, className: cx('dv-iconbtn', className), "data-variant": variant, "aria-label": label, title: label, ...rest, children: children }));
}
/** Row of small toggle chips (interval / retention presets). */
export function Chips({ label, value, options, onChange }) {
    return (_jsx("div", { className: "dv-chip-row", role: "group", "aria-label": label, children: options.map((o) => (_jsx("button", { type: "button", className: "dv-chip", "aria-pressed": o.value === value, onClick: () => onChange(o.value), children: o.label }, String(o.value)))) }));
}
export function Field({ label, htmlFor, hint, error, optional, children, className }) {
    const t = useT();
    return (_jsxs("div", { className: cx('dv-field', className), children: [_jsxs("label", { className: "dv-label", htmlFor: htmlFor, children: [label, optional ? _jsx("span", { className: "dv-muted", children: t('common.optional') }) : null] }), children, error ? (_jsx("span", { className: "dv-hint", id: htmlFor ? `${htmlFor}-error` : undefined, "data-tone": "error", style: { color: 'var(--dv-danger)' }, children: error })) : hint ? (_jsx("span", { className: "dv-hint", id: htmlFor ? `${htmlFor}-hint` : undefined, children: hint })) : null] }));
}
export function TextInput({ mono, invalid, className, ...rest }) {
    return _jsx("input", { className: cx('dv-input', mono && 'dv-mono', className), "aria-invalid": invalid || undefined, ...rest });
}
export function PasswordInput({ className, ...rest }) {
    const t = useT();
    const [visible, setVisible] = useState(false);
    return (_jsxs("div", { className: "dv-input-group", children: [_jsx("input", { type: visible ? 'text' : 'password', className: cx('dv-input', className), autoComplete: "off", spellCheck: false, ...rest }), _jsx(IconButton, { label: visible ? t('app.hidePassword') : t('app.showPassword'), "aria-pressed": visible, onClick: () => setVisible((v) => !v), children: visible ? _jsx(IconEyeOff, { size: 15 }) : _jsx(IconEye, { size: 15 }) })] }));
}
export function TextArea({ className, ...rest }) {
    return _jsx("textarea", { className: cx('dv-textarea', className), ...rest });
}
export function Checkbox({ title, description, disabled, id, ...rest }) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (_jsxs("label", { className: "dv-check", "data-disabled": disabled ? 'true' : undefined, htmlFor: inputId, children: [_jsx("input", { id: inputId, type: "checkbox", disabled: disabled, ...rest }), _jsxs("span", { className: "dv-check-body", children: [_jsx("span", { className: "dv-check-title", children: title }), description ? _jsx("span", { className: "dv-check-desc", children: description }) : null] })] }));
}
/** Native switch: no label of its own — put it in a SettingRow. */
export function Switch({ disabled, id, ...rest }) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (_jsxs("label", { className: "dv-switch", "data-disabled": disabled ? 'true' : undefined, htmlFor: inputId, children: [_jsx("input", { id: inputId, type: "checkbox", role: "switch", disabled: disabled, ...rest }), _jsx("span", { className: "dv-switch-track", "aria-hidden": "true" })] }));
}
/** Selectable row backed by a real radio/checkbox input. */
export function OptionTile({ checked, onChange, name, title, description, shape = 'round', disabled }) {
    return (_jsxs("label", { className: "dv-option", "data-selected": checked ? 'true' : undefined, "data-shape": shape, children: [_jsx("input", { type: shape === 'square' ? 'checkbox' : 'radio', name: name, checked: checked, disabled: disabled, onChange: onChange }), _jsx("span", { className: "dv-option-mark", "aria-hidden": "true", children: checked ? _jsx("span", {}) : null }), _jsxs("span", { className: "dv-option-body", children: [_jsx("span", { className: "dv-option-title", children: title }), description ? _jsx("span", { className: "dv-option-desc", children: description }) : null] })] }));
}
export function Segmented({ value, onChange, options, label }) {
    return (_jsx("div", { className: "dv-segment", role: "group", "aria-label": label, children: options.map((o) => (_jsxs("button", { type: "button", "aria-pressed": value === o.value, onClick: () => onChange(o.value), children: [o.label, typeof o.count === 'number' ? _jsx("span", { className: "dv-count", children: o.count }) : null] }, o.value))) }));
}
/** Native picker styled like the host (gray fill, small chevron). */
export function Select({ children, className, block, ...rest }) {
    return (_jsx("select", { className: cx('dv-select', className), "data-block": block ? 'true' : undefined, ...rest, children: children }));
}
export function SearchInput({ value, onChange, placeholder, label, id }) {
    return (_jsx("input", { id: id, type: "search", className: "dv-input", placeholder: placeholder, "aria-label": label, value: value, onChange: (e) => onChange(e.target.value), maxLength: 200 }));
}
export function StatusDot({ tone = 'neutral' }) {
    return _jsx("span", { className: "dv-dot", "data-tone": tone, "aria-hidden": "true" });
}
/** Dot + text status line. */
export function DotText({ tone = 'neutral', children }) {
    return (_jsxs("span", { className: "dv-dottext", children: [_jsx(StatusDot, { tone: tone }), _jsx("span", { children: children })] }));
}
export function Tag({ tone = 'neutral', children, title }) {
    return _jsx("span", { className: "dv-tag", "data-tone": tone, title: title, children: children });
}
export function Banner({ tone = 'info', title, children, actions, role }) {
    const autoRole = role ?? (tone === 'error' ? 'alert' : 'status');
    return (_jsx("div", { className: "dv-banner", "data-tone": tone, role: autoRole, "aria-live": tone === 'error' ? 'assertive' : 'polite', children: _jsxs("div", { className: "dv-banner-body", children: [title ? _jsx("div", { className: "dv-banner-title", children: title }) : null, children ? _jsx("div", { children: children }) : null, actions ? _jsx("div", { className: "dv-card-actions", children: actions }) : null] }) }));
}
/* ==========================================================================
   States: loading / empty / error
   ========================================================================== */
export function Skeleton({ lines = 3 }) {
    return (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, "aria-hidden": "true", children: Array.from({ length: lines }, (_, i) => (_jsx("div", { className: "dv-skeleton", style: { width: `${90 - i * 14}%` } }, i))) }));
}
export function LoadingState({ label }) {
    return (_jsxs("div", { className: "dv-loading-inline", role: "status", "aria-live": "polite", children: [_jsx("span", { className: "dv-spinner", "aria-hidden": "true" }), _jsx("span", { children: label })] }));
}
export function LoadingInline({ label }) {
    return (_jsxs("span", { className: "dv-loading-inline", role: "status", children: [_jsx("span", { className: "dv-spinner", "aria-hidden": "true" }), label] }));
}
/** Plain empty state: a sentence, an optional hint and a next action. */
export function EmptyState({ title, body, actions }) {
    return (_jsxs("div", { className: "dv-state", children: [_jsx("div", { className: "dv-state-title", children: title }), body ? _jsx("div", { children: body }) : null, actions ? _jsx("div", { className: "dv-state-actions", children: actions }) : null] }));
}
export function ErrorState({ error, title, onRetry }) {
    const t = useT();
    return (_jsxs("div", { className: "dv-state", "data-tone": "error", role: "alert", children: [_jsx("div", { className: "dv-state-title", children: title ?? t('app.error') }), _jsx("div", { style: { overflowWrap: 'anywhere' }, children: error }), onRetry ? (_jsx("div", { className: "dv-state-actions", children: _jsx(Button, { size: "sm", onClick: onRetry, children: t('app.retry') }) })) : null] }));
}
export function ProgressBar({ value, label, detail }) {
    const indeterminate = typeof value !== 'number' || !Number.isFinite(value);
    const pct = indeterminate ? 0 : Math.max(0, Math.min(100, value));
    return (_jsxs("div", { children: [_jsxs("div", { className: "dv-progress-meta", children: [_jsx("span", { "aria-live": "polite", children: label }), _jsx("span", { className: "dv-num", children: indeterminate ? '' : `${Math.round(pct)}%` })] }), _jsx("div", { className: "dv-progress", "data-indeterminate": indeterminate ? 'true' : undefined, role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": indeterminate ? undefined : Math.round(pct), "aria-valuetext": indeterminate ? label : `${Math.round(pct)}%`, children: _jsx("span", { style: indeterminate ? undefined : { width: `${pct}%` } }) }), detail ? _jsx("div", { className: "dv-hint", style: { marginTop: 6 }, children: detail }) : null] }));
}
/* ==========================================================================
   Collapsible (native <details>)
   ========================================================================== */
export function Collapsible({ summary, children, defaultOpen }) {
    return (_jsxs("details", { className: "dv-details", open: defaultOpen ? true : undefined, children: [_jsx("summary", { children: summary }), _jsx("div", { className: "dv-details-body", children: children })] }));
}
/* ==========================================================================
   Dialog (confirmation only) + ConfirmDialog
   ========================================================================== */
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
/** Accessible modal: focus trap, Escape closes, focus restored on close. */
export function Dialog({ open, onClose, title, description, children, actions, tone = 'default', size = 'default' }) {
    const t = useT();
    const autoId = useId();
    const baseId = autoId.replace(/[^a-zA-Z0-9_-]/g, '') || 'x';
    const titleId = `dv-dialog-title-${baseId}`;
    const descId = `dv-dialog-desc-${baseId}`;
    const panelRef = useRef(null);
    const restoreRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        restoreRef.current = document.activeElement;
        const panel = panelRef.current;
        if (!panel)
            return;
        const first = panel.querySelector(FOCUSABLE);
        (first ?? panel).focus();
        function onKeyDown(e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key !== 'Tab' || !panel)
                return;
            const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
            if (nodes.length === 0)
                return;
            const firstNode = nodes[0];
            const lastNode = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === firstNode) {
                e.preventDefault();
                lastNode.focus();
            }
            else if (!e.shiftKey && document.activeElement === lastNode) {
                e.preventDefault();
                firstNode.focus();
            }
        }
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            const prev = restoreRef.current;
            if (prev instanceof HTMLElement && prev.isConnected)
                prev.focus();
        };
    }, [open, onClose]);
    if (!open || typeof document === 'undefined')
        return null;
    return createPortal(
    // Portaled outside the section: re-apply the root class so --dv-* tokens resolve.
    _jsx("div", { className: "dsh-vault-root dv-dialog-backdrop", onMouseDown: (e) => {
            if (e.target === e.currentTarget)
                onClose();
        }, children: _jsxs("div", { ref: panelRef, className: "dv-dialog", "data-size": size === 'wide' ? 'wide' : undefined, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": description ? descId : undefined, tabIndex: -1, children: [_jsx("h2", { className: "dv-dialog-title", id: titleId, children: title }), description ? _jsx("p", { className: "dv-dialog-desc", id: descId, children: description }) : null, children ? _jsx("div", { className: "dv-dialog-body", children: children }) : null, _jsx("div", { className: "dv-dialog-actions", children: actions ?? _jsx(Button, { onClick: onClose, children: t('app.cancel') }) })] }) }), document.body);
}
/** Second confirmation gate for destructive actions (delete snapshot / target, restore). */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, danger = true, busy, onConfirm, onClose, children }) {
    const t = useT();
    return (_jsx(Dialog, { open: open, onClose: () => { if (!busy)
            onClose(); }, title: title, description: description, actions: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: busy, children: cancelLabel ?? t('app.cancel') }), _jsx(Button, { variant: danger ? 'danger-solid' : 'primary', onClick: onConfirm, loading: busy, children: confirmLabel })] }), children: children }));
}
//# sourceMappingURL=ui.js.map