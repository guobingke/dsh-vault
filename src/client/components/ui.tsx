/**
 * Shared building blocks for the dsh-vault settings section.
 *
 * These mirror the host's native settings chrome (rows, gray pickers, black
 * primary buttons, provider cards) using only --dv-* aliases of --dsw-* tokens.
 * They are local re-creations, not imports from any host primitives package.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n.js'
import { IconEye, IconEyeOff } from './Icons.js'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ==========================================================================
   Section head + tabs
   ========================================================================== */

export interface SectionHeadProps {
  title: string
  description?: ReactNode
  id?: string
}

/** 16px plain title + one plain sentence, no icon. */
export function SectionHead({ title, description, id }: SectionHeadProps) {
  return (
    <header className="dv-section-head">
      <h2 className="dv-section-title" id={id}>{title}</h2>
      {description ? <p className="dv-section-desc">{description}</p> : null}
    </header>
  )
}

export interface SectionTabsProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  items: Array<{ id: T; label: string; panelId: string }>
}

/**
 * One row of small tabs. Roving tabindex + arrow keys, per the WAI-ARIA tabs
 * pattern. Selected tab = gray rounded pill (native nav highlight).
 */
export function SectionTabs<T extends string>({ label, value, onChange, items }: SectionTabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const idx = Math.max(0, items.findIndex((i) => i.id === value))

  const move = (delta: number) => {
    const next = (idx + delta + items.length) % items.length
    const item = items[next]
    if (!item) return
    onChange(item.id)
    refs.current[next]?.focus()
  }

  return (
    <div className="dv-tabs" role="tablist" aria-label={label}>
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => { refs.current[i] = el }}
          type="button"
          role="tab"
          id={`dv-tab-${item.id}`}
          aria-selected={value === item.id}
          aria-controls={item.panelId}
          tabIndex={value === item.id ? 0 : -1}
          className="dv-tab"
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
            else if (e.key === 'Home') { e.preventDefault(); move(-idx) }
            else if (e.key === 'End') { e.preventDefault(); move(items.length - 1 - idx) }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function SectionPanel({ id, labelledBy, children }: { id: string; labelledBy: string; children: ReactNode }) {
  return (
    <div className="dv-section-body" role="tabpanel" id={id} aria-labelledby={labelledBy} tabIndex={-1}>
      {children}
    </div>
  )
}

/* ==========================================================================
   Setting rows
   ========================================================================== */

export function Rows({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="dv-rows" role="group" aria-label={label}>{children}</div>
}

export interface SettingRowProps {
  title: ReactNode
  description?: ReactNode
  /** Right-hand control (omitted for pure text/status rows). */
  control?: ReactNode
  /** Render the control below the text instead of beside it. */
  stacked?: boolean
  /** Associate the row title with a form control inside `control`. */
  htmlFor?: string
  children?: ReactNode
}

/** Native setting row: title 14px + desc 12px on the left, control on the right. */
export function SettingRow({ title, description, control, stacked, htmlFor, children }: SettingRowProps) {
  return (
    <div className="dv-row" data-stack={stacked ? 'true' : undefined}>
      <div className="dv-row-text">
        {htmlFor ? (
          <label className="dv-row-title" htmlFor={htmlFor}>{title}</label>
        ) : (
          <span className="dv-row-title">{title}</span>
        )}
        {description ? <span className="dv-row-desc">{description}</span> : null}
      </div>
      {control !== undefined ? <div className="dv-row-control">{control}</div> : null}
      {children}
    </div>
  )
}

/* ==========================================================================
   Provider card
   ========================================================================== */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('dv-card', className)}>{children}</div>
}

export function CardList({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="dv-card-list" role={label ? 'group' : undefined} aria-label={label}>{children}</div>
}

export function CardHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="dv-card-head">
      <div>
        <span className="dv-card-title">{title}</span>
        {sub ? <span className="dv-card-sub">{sub}</span> : null}
      </div>
      {actions ? <div className="dv-card-actions">{actions}</div> : null}
    </div>
  )
}

export function CardSeparator() {
  return <div className="dv-card-sep" aria-hidden="true" />
}

/* ==========================================================================
   Button
   ========================================================================== */

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'danger-solid' | 'dashed'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
  block?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', loading, block, icon, disabled, children, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('dv-btn', className)}
      data-variant={variant}
      data-size={size}
      data-block={block ? 'true' : undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="dv-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: 'default' | 'danger'
  children: ReactNode
}

export function IconButton({ label, variant = 'default', children, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cx('dv-iconbtn', className)} data-variant={variant} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  )
}

export interface ChipsProps<T extends string | number> {
  label: string
  value: T | undefined
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}

/** Row of small toggle chips (interval / retention presets). */
export function Chips<T extends string | number>({ label, value, options, onChange }: ChipsProps<T>) {
  return (
    <div className="dv-chip-row" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="dv-chip"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ==========================================================================
   Form controls
   ========================================================================== */

export interface FieldProps {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, hint, error, optional, children, className }: FieldProps) {
  const t = useT()
  return (
    <div className={cx('dv-field', className)}>
      <label className="dv-label" htmlFor={htmlFor}>
        {label}
        {optional ? <span className="dv-muted">{t('common.optional')}</span> : null}
      </label>
      {children}
      {error ? (
        <span className="dv-hint" id={htmlFor ? `${htmlFor}-error` : undefined} data-tone="error" style={{ color: 'var(--dv-danger)' }}>{error}</span>
      ) : hint ? (
        <span className="dv-hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>{hint}</span>
      ) : null}
    </div>
  )
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
  invalid?: boolean
}

export function TextInput({ mono, invalid, className, ...rest }: TextInputProps) {
  return <input className={cx('dv-input', mono && 'dv-mono', className)} aria-invalid={invalid || undefined} {...rest} />
}

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  return (
    <div className="dv-input-group">
      <input type={visible ? 'text' : 'password'} className={cx('dv-input', className)} autoComplete="off" spellCheck={false} {...rest} />
      <IconButton
        label={visible ? t('app.hidePassword') : t('app.showPassword')}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <IconEyeOff size={15} /> : <IconEye size={15} />}
      </IconButton>
    </div>
  )
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('dv-textarea', className)} {...rest} />
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'title'> {
  title: ReactNode
  description?: ReactNode
}

export function Checkbox({ title, description, disabled, id, ...rest }: CheckboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <label className="dv-check" data-disabled={disabled ? 'true' : undefined} htmlFor={inputId}>
      <input id={inputId} type="checkbox" disabled={disabled} {...rest} />
      <span className="dv-check-body">
        <span className="dv-check-title">{title}</span>
        {description ? <span className="dv-check-desc">{description}</span> : null}
      </span>
    </label>
  )
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

/** Native switch: no label of its own — put it in a SettingRow. */
export function Switch({ disabled, id, ...rest }: SwitchProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <label className="dv-switch" data-disabled={disabled ? 'true' : undefined} htmlFor={inputId}>
      <input id={inputId} type="checkbox" role="switch" disabled={disabled} {...rest} />
      <span className="dv-switch-track" aria-hidden="true" />
    </label>
  )
}

export interface OptionTileProps {
  checked: boolean
  onChange: () => void
  name?: string
  title: ReactNode
  description?: ReactNode
  shape?: 'round' | 'square'
  disabled?: boolean
}

/** Selectable row backed by a real radio/checkbox input. */
export function OptionTile({ checked, onChange, name, title, description, shape = 'round', disabled }: OptionTileProps) {
  return (
    <label className="dv-option" data-selected={checked ? 'true' : undefined} data-shape={shape}>
      <input type={shape === 'square' ? 'checkbox' : 'radio'} name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <span className="dv-option-mark" aria-hidden="true">{checked ? <span /> : null}</span>
      <span className="dv-option-body">
        <span className="dv-option-title">{title}</span>
        {description ? <span className="dv-option-desc">{description}</span> : null}
      </span>
    </label>
  )
}

export interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; count?: number }>
  label: string
}

export function Segmented<T extends string>({ value, onChange, options, label }: SegmentedProps<T>) {
  return (
    <div className="dv-segment" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {typeof o.count === 'number' ? <span className="dv-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export interface SelectProps extends Omit<InputHTMLAttributes<HTMLSelectElement>, 'children'> {
  children: ReactNode
  block?: boolean
}

/** Native picker styled like the host (gray fill, small chevron). */
export function Select({ children, className, block, ...rest }: SelectProps) {
  return (
    <select className={cx('dv-select', className)} data-block={block ? 'true' : undefined} {...rest}>
      {children}
    </select>
  )
}

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  id?: string
}

export function SearchInput({ value, onChange, placeholder, label, id }: SearchInputProps) {
  return (
    <input
      id={id}
      type="search"
      className="dv-input"
      placeholder={placeholder}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={200}
    />
  )
}

/* ==========================================================================
   Status
   ========================================================================== */

export type DotTone = 'neutral' | 'ok' | 'warn' | 'danger'

export function StatusDot({ tone = 'neutral' }: { tone?: DotTone }) {
  return <span className="dv-dot" data-tone={tone} aria-hidden="true" />
}

/** Dot + text status line. */
export function DotText({ tone = 'neutral', children }: { tone?: DotTone; children: ReactNode }) {
  return (
    <span className="dv-dottext">
      <StatusDot tone={tone} />
      <span>{children}</span>
    </span>
  )
}

export type TagTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info'

export function Tag({ tone = 'neutral', children, title }: { tone?: TagTone; children: ReactNode; title?: string }) {
  return <span className="dv-tag" data-tone={tone} title={title}>{children}</span>
}

/* ==========================================================================
   Banners
   ========================================================================== */

export type BannerTone = 'info' | 'ok' | 'warn' | 'error'

export interface BannerProps {
  tone?: BannerTone
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  role?: 'status' | 'alert'
}

export function Banner({ tone = 'info', title, children, actions, role }: BannerProps) {
  const autoRole = role ?? (tone === 'error' ? 'alert' : 'status')
  return (
    <div className="dv-banner" data-tone={tone} role={autoRole} aria-live={tone === 'error' ? 'assertive' : 'polite'}>
      <div className="dv-banner-body">
        {title ? <div className="dv-banner-title">{title}</div> : null}
        {children ? <div>{children}</div> : null}
        {actions ? <div className="dv-card-actions">{actions}</div> : null}
      </div>
    </div>
  )
}

/* ==========================================================================
   States: loading / empty / error
   ========================================================================== */

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="dv-skeleton" style={{ width: `${90 - i * 14}%` }} />
      ))}
    </div>
  )
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="dv-loading-inline" role="status" aria-live="polite">
      <span className="dv-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function LoadingInline({ label }: { label: string }) {
  return (
    <span className="dv-loading-inline" role="status">
      <span className="dv-spinner" aria-hidden="true" />
      {label}
    </span>
  )
}

export interface EmptyStateProps {
  title: ReactNode
  body?: ReactNode
  actions?: ReactNode
}

/** Plain empty state: a sentence, an optional hint and a next action. */
export function EmptyState({ title, body, actions }: EmptyStateProps) {
  return (
    <div className="dv-state">
      <div className="dv-state-title">{title}</div>
      {body ? <div>{body}</div> : null}
      {actions ? <div className="dv-state-actions">{actions}</div> : null}
    </div>
  )
}

export interface ErrorStateProps {
  error: string
  title?: ReactNode
  onRetry?: () => void
}

export function ErrorState({ error, title, onRetry }: ErrorStateProps) {
  const t = useT()
  return (
    <div className="dv-state" data-tone="error" role="alert">
      <div className="dv-state-title">{title ?? t('app.error')}</div>
      <div style={{ overflowWrap: 'anywhere' }}>{error}</div>
      {onRetry ? (
        <div className="dv-state-actions">
          <Button size="sm" onClick={onRetry}>{t('app.retry')}</Button>
        </div>
      ) : null}
    </div>
  )
}

/* ==========================================================================
   Progress
   ========================================================================== */

export interface ProgressBarProps {
  value?: number
  label: string
  detail?: ReactNode
}

export function ProgressBar({ value, label, detail }: ProgressBarProps) {
  const indeterminate = typeof value !== 'number' || !Number.isFinite(value)
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="dv-progress-meta">
        <span aria-live="polite">{label}</span>
        <span className="dv-num">{indeterminate ? '' : `${Math.round(pct)}%`}</span>
      </div>
      <div
        className="dv-progress"
        data-indeterminate={indeterminate ? 'true' : undefined}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        aria-valuetext={indeterminate ? label : `${Math.round(pct)}%`}
      >
        <span style={indeterminate ? undefined : { width: `${pct}%` }} />
      </div>
      {detail ? <div className="dv-hint" style={{ marginTop: 6 }}>{detail}</div> : null}
    </div>
  )
}

/* ==========================================================================
   Collapsible (native <details>)
   ========================================================================== */

export function Collapsible({ summary, children, defaultOpen }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="dv-details" open={defaultOpen ? true : undefined}>
      <summary>{summary}</summary>
      <div className="dv-details-body">{children}</div>
    </details>
  )
}

/* ==========================================================================
   Dialog (confirmation only) + ConfirmDialog
   ========================================================================== */

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  tone?: 'default' | 'danger'
}

/** Accessible modal: focus trap, Escape closes, focus restored on close. */
export function Dialog({ open, onClose, title, description, children, actions, tone = 'default' }: DialogProps) {
  const t = useT()
  const autoId = useId()
  const baseId = autoId.replace(/[^a-zA-Z0-9_-]/g, '') || 'x'
  const titleId = `dv-dialog-title-${baseId}`
  const descId = `dv-dialog-desc-${baseId}`
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    const panel = panelRef.current
    if (!panel) return
    const first = panel.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel).focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null)
      if (nodes.length === 0) return
      const firstNode = nodes[0]!
      const lastNode = nodes[nodes.length - 1]!
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault()
        lastNode.focus()
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault()
        firstNode.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const prev = restoreRef.current
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus()
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="dv-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="dv-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <h2 className="dv-dialog-title" id={titleId}>{title}</h2>
        {description ? <p className="dv-dialog-desc" id={descId}>{description}</p> : null}
        {children ? <div className="dv-dialog-body">{children}</div> : null}
        <div className="dv-dialog-actions">
          {actions ?? <Button onClick={onClose}>{t('app.cancel')}</Button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}

/** Second confirmation gate for destructive actions (delete snapshot / target, restore). */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, danger = true, busy, onConfirm, onClose, children }: ConfirmDialogProps) {
  const t = useT()
  return (
    <Dialog
      open={open}
      onClose={() => { if (!busy) onClose() }}
      title={title}
      description={description}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>{cancelLabel ?? t('app.cancel')}</Button>
          <Button variant={danger ? 'danger-solid' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}

