/**
 * Shared dsh-vault UI primitives.
 *
 * Every panel is composed from these small building blocks so buttons,
 * form fields, cards, badges, alerts and state placeholders stay consistent.
 * All styling lives in `theme.css` under `.dv-*` class names.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n.js'
import {
  IconAlert,
  IconCheck,
  IconCheckCircle,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconHelp,
  IconInfo,
  IconInbox,
  IconRefresh,
  IconSearch,
  IconX,
} from './Icons.js'

/* ==========================================================================
   Layout helpers
   ========================================================================== */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="dv-page-head">
      <div className="dv-page-title">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="dv-page-actions">{actions}</div> : null}
    </div>
  )
}

export interface CardProps {
  children: ReactNode
  className?: string
  hero?: boolean
  interactive?: boolean
  selected?: boolean
  as?: 'div' | 'section' | 'article'
  'aria-labelledby'?: string
}

export function Card({ children, className, hero, interactive, selected, as: Tag = 'section', ...rest }: CardProps) {
  return (
    <Tag
      className={cx('dv-card', className)}
      data-hero={hero ? 'true' : undefined}
      data-interactive={interactive ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export interface CardHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  iconKind?: string
  actions?: ReactNode
  id?: string
}

export function CardHeader({ title, subtitle, icon, iconKind, actions, id }: CardHeaderProps) {
  return (
    <div className="dv-card-head">
      <div className="dv-card-head-main">
        {icon ? <span className="dv-icon-tile" data-kind={iconKind} aria-hidden="true">{icon}</span> : null}
        <div className="dv-stack" style={{ gap: 2 }}>
          <h2 className="dv-card-title" id={id}>{title}</h2>
          {subtitle ? <p className="dv-card-sub">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="dv-row dv-gap-2">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('dv-card-body', className)}>{children}</div>
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="dv-card-foot">{children}</div>
}

/* ==========================================================================
   Button
   ========================================================================== */

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'outline' | 'danger' | 'danger-solid' | 'ok' | 'info'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  block?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  iconRight,
  loading,
  block,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('dv-btn', className)}
      data-variant={variant}
      data-size={size}
      data-block={block ? 'true' : undefined}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading ? <span className="dv-spinner" aria-hidden="true" /> : icon}
      {children}
      {!loading ? iconRight : null}
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
    <button type={type} className={cx('dv-icon-btn', className)} data-variant={variant} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  )
}

export interface CtaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  block?: boolean
  loading?: boolean
}

export function CtaButton({ icon, block, loading, children, className, type = 'button', disabled, ...rest }: CtaButtonProps) {
  return (
    <button
      type={type}
      className={cx('dv-cta', className)}
      data-block={block ? 'true' : undefined}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading ? <span className="dv-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  )
}

/* ==========================================================================
   Form fields
   ========================================================================== */

export interface FieldProps {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  required?: boolean
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, hint, error, optional, required, children, className }: FieldProps) {
  const t = useT()
  return (
    <div className={cx('dv-field', className)}>
      <label htmlFor={htmlFor} data-optional={optional ? t('common.optional') : undefined}>
        {label}
        {required ? <span className="dv-req" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <span className="dv-hint" data-tone="error">{error}</span>
      ) : hint ? (
        <span className="dv-hint">{hint}</span>
      ) : null}
    </div>
  )
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
  invalid?: boolean
}

export function TextInput({ mono, invalid, className, ...rest }: TextInputProps) {
  return <input className={cx('dv-input', mono && 'dv-input-mono', className)} aria-invalid={invalid || undefined} {...rest} />
}

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  return (
    <div className="dv-input-group">
      <input type={visible ? 'text' : 'password'} className={cx('dv-input', className)} autoComplete="off" spellCheck={false} {...rest} />
      <button
        type="button"
        className="dv-icon-btn"
        aria-label={visible ? t('app.hidePassword') : t('app.showPassword')}
        aria-pressed={visible}
        title={visible ? t('app.hidePassword') : t('app.showPassword')}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <IconEyeOffGlyph /> : <IconEyeGlyph />}
      </button>
    </div>
  )
}

// Tiny local glyphs so PasswordInput stays self-contained.
function IconEyeGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function IconEyeOffGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" /><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode
  hint?: ReactNode
  optional?: boolean
  fieldClassName?: string
}

export function SelectField({ label, hint, optional, fieldClassName, id, children, ...rest }: SelectFieldProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  const select = <select id={selectId} className="dv-select" {...rest}>{children}</select>
  if (!label) return select
  return (
    <Field label={label} htmlFor={selectId} hint={hint} optional={optional} className={fieldClassName}>
      {select}
    </Field>
  )
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function TextArea({ className, ...rest }: TextAreaProps) {
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

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'title'> {
  title?: ReactNode
}

export function Switch({ title, disabled, id, ...rest }: SwitchProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <label className="dv-switch" data-disabled={disabled ? 'true' : undefined} htmlFor={inputId}>
      <input id={inputId} type="checkbox" role="switch" disabled={disabled} {...rest} />
      <span className="dv-switch-track" aria-hidden="true" />
      {title ? <span className="dv-check-title">{title}</span> : null}
    </label>
  )
}

export interface OptionTileProps {
  checked: boolean
  onChange: () => void
  name?: string
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  shape?: 'round' | 'square'
  disabled?: boolean
  trailing?: ReactNode
}

/** Radio-like selectable tile. Uses a native input for keyboard + SR support. */
export function OptionTile({ checked, onChange, name, title, description, icon, shape = 'round', disabled, trailing }: OptionTileProps) {
  return (
    <label className="dv-option" data-selected={checked ? 'true' : undefined} data-shape={shape}>
      <input type={shape === 'square' ? 'checkbox' : 'radio'} name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <span className="dv-option-mark" aria-hidden="true">
        {checked ? (shape === 'square' ? <IconCheck size={11} strokeWidth={3} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />) : null}
      </span>
      {icon ? <span className="dv-nav-icon" aria-hidden="true" style={{ marginTop: 1 }}>{icon}</span> : null}
      <span className="dv-option-body">
        <span className="dv-option-title">{title}</span>
        {description ? <span className="dv-option-desc">{description}</span> : null}
      </span>
      {trailing}
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

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  id?: string
}

export function SearchInput({ value, onChange, placeholder, label, id }: SearchInputProps) {
  return (
    <div className="dv-input-group" style={{ position: 'relative' }}>
      <input
        id={id}
        type="search"
        className="dv-input"
        style={{ paddingLeft: 32 }}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
      />
      <span style={{ position: 'absolute', left: 10, display: 'flex', color: 'var(--dv-text-faint)', pointerEvents: 'none' }} aria-hidden="true">
        <IconSearch size={14} />
      </span>
    </div>
  )
}

/* ==========================================================================
   Badges & status
   ========================================================================== */

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'add' | 'change' | 'remove'

export function Badge({ tone = 'neutral', children, icon, title }: { tone?: BadgeTone; children: ReactNode; icon?: ReactNode; title?: string }) {
  return (
    <span className="dv-badge" data-tone={tone} title={title}>
      {icon}
      {children}
    </span>
  )
}

export function StatusDot({ tone = 'neutral', pulse }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand'; pulse?: boolean }) {
  return <span className="dv-status-dot" data-tone={tone} data-pulse={pulse ? 'true' : undefined} aria-hidden="true" />
}

export function Tag({ tone, children }: { tone?: 'ok' | 'brand'; children: ReactNode }) {
  return <span className="dv-tag" data-tone={tone}>{children}</span>
}

/* ==========================================================================
   Banners
   ========================================================================== */

export type BannerTone = 'info' | 'ok' | 'warn' | 'error'

export interface BannerProps {
  tone?: BannerTone
  title?: ReactNode
  children?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  onDismiss?: () => void
  role?: 'status' | 'alert'
  live?: 'polite' | 'assertive' | 'off'
}

const toneIcon = {
  info: <IconInfo size={16} />,
  ok: <IconCheckCircle size={16} />,
  warn: <IconAlert size={16} />,
  error: <IconAlert size={16} />,
}

export function Banner({ tone = 'info', title, children, icon, actions, onDismiss, role, live }: BannerProps) {
  const t = useT()
  const autoRole = role ?? (tone === 'error' ? 'alert' : undefined)
  return (
    <div
      className="dv-banner"
      data-tone={tone}
      role={autoRole}
      aria-live={live ?? (tone === 'error' ? 'assertive' : 'polite')}
    >
      <span className="dv-banner-icon">{icon ?? toneIcon[tone]}</span>
      <div className="dv-banner-body">
        {title ? <div className="dv-banner-title">{title}</div> : null}
        {children ? <div>{children}</div> : null}
        {actions ? <div className="dv-banner-actions">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="dv-banner-close" onClick={onDismiss} aria-label={t('common.dismiss')} title={t('app.close')}>
          <IconX size={13} />
        </button>
      ) : null}
    </div>
  )
}

/* ==========================================================================
   State placeholders: loading / empty / error
   ========================================================================== */

export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="dv-stack-3" aria-hidden="true">
      <div className="dv-skeleton dv-skeleton-title" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="dv-skeleton dv-skeleton-line" style={{ width: `${90 - i * 14}%` }} />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="dv-card" aria-hidden="true">
      <div className="dv-card-body">
        <SkeletonLines />
      </div>
    </div>
  )
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="dv-loading-state" role="status" aria-live="polite">
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
  icon?: ReactNode
  actions?: ReactNode
  compact?: boolean
}

export function EmptyState({ title, body, icon, actions, compact }: EmptyStateProps) {
  return (
    <div className="dv-state" data-compact={compact ? 'true' : undefined}>
      <span className="dv-state-icon" aria-hidden="true">{icon ?? <IconInbox size={22} />}</span>
      <div className="dv-state-title">{title}</div>
      {body ? <div className="dv-state-body">{body}</div> : null}
      {actions ? <div className="dv-state-actions">{actions}</div> : null}
    </div>
  )
}

export interface ErrorStateProps {
  title?: ReactNode
  error: string
  onRetry?: () => void
  compact?: boolean
  children?: ReactNode
}

export function ErrorState({ title, error, onRetry, compact, children }: ErrorStateProps) {
  const t = useT()
  return (
    <div className="dv-state" data-tone="error" data-compact={compact ? 'true' : undefined} role="alert">
      <span className="dv-state-icon" aria-hidden="true"><IconAlert size={22} /></span>
      <div className="dv-state-title">{title ?? t('app.error')}</div>
      <div className="dv-state-body" style={{ overflowWrap: 'anywhere' }}>{children ?? error}</div>
      {onRetry ? (
        <div className="dv-state-actions">
          <Button variant="outline" size="sm" icon={<IconRefresh size={14} />} onClick={onRetry}>
            {t('app.retry')}
          </Button>
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
  stages?: Array<{ key: string; label: string }>
  activeStage?: string
}

export function ProgressBar({ value, label, detail, stages, activeStage }: ProgressBarProps) {
  const indeterminate = typeof value !== 'number' || !Number.isFinite(value)
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, value))
  const activeIdx = stages && activeStage ? stages.findIndex((s) => s.key === activeStage) : -1
  return (
    <div className="dv-progress-wrap">
      <div className="dv-progress-meta">
        <span aria-live="polite">{label}</span>
        <span className="dv-num">{indeterminate ? '…' : `${Math.round(pct)}%`}</span>
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
      {stages ? (
        <div className="dv-steps" aria-hidden="true">
          {stages.map((s, i) => {
            const state = activeIdx < 0 ? 'idle' : i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'idle'
            return (
              <span key={s.key} className="dv-step" data-state={state}>
                <span className="dv-step-num">{i < activeIdx ? '✓' : i + 1}</span>
                {s.label}
              </span>
            )
          })}
        </div>
      ) : null}
      {detail ? <div className="dv-hint">{detail}</div> : null}
    </div>
  )
}

export interface MeterProps {
  level: 0 | 1 | 2 | 3 | 4
  label: string
  segments?: number
}

export function Meter({ level, label, segments = 4 }: MeterProps) {
  return (
    <div className="dv-meter" data-level={level} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={segments} aria-valuenow={level} aria-valuetext={label}>
      {Array.from({ length: segments }, (_, i) => <i key={i} />)}
    </div>
  )
}

/* ==========================================================================
   Stats
   ========================================================================== */

export interface StatProps {
  label: ReactNode
  value: ReactNode
  foot?: ReactNode
  icon?: ReactNode
  valueSize?: 'md' | 'sm'
}

export function Stat({ label, value, foot, icon, valueSize = 'md' }: StatProps) {
  return (
    <div className="dv-stat">
      <div className="dv-stat-head">
        {icon ? <span className="dv-nav-icon">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className="dv-stat-value" data-size={valueSize} title={typeof value === 'string' ? value : undefined}>{value}</div>
      {foot ? <div className="dv-stat-foot">{foot}</div> : null}
    </div>
  )
}

/* ==========================================================================
   Collapsible
   ========================================================================== */

export function Collapsible({ summary, children, defaultOpen, open, onToggle }: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onToggle?: (open: boolean) => void
}) {
  const controlled = typeof open === 'boolean'
  // `defaultOpen` is a controlled-vs-uncontrolled hint, not a DOM attribute.
  const openAttr = controlled ? { open } : defaultOpen ? { open: true } : {}
  return (
    <details
      className="dv-details"
      {...openAttr}
      onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined}
    >
      <summary>{summary}</summary>
      <div className="dv-details-body">{children}</div>
    </details>
  )
}

export function ChevronDown() {
  return <IconChevronDown size={14} />
}
export { IconChevronRight, IconHelp, IconCopy }

/* ==========================================================================
   Confirm dialog / Modal
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
  icon?: ReactNode
  labelledBy?: string
}

/**
 * Accessible modal: focus trap, Escape closes, restores focus on close.
 */
export function Dialog({ open, onClose, title, description, children, actions, tone = 'default', icon }: DialogProps) {
  const t = useT()
  const autoId = useId()
  const titleId = `dv-dialog-title-${autoId}`
  const descId = `dv-dialog-desc-${autoId}`
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
        <div className="dv-dialog-head">
          <span className="dv-icon-tile" data-tone={tone === 'danger' ? 'danger' : undefined} aria-hidden="true">
            {icon ?? (tone === 'danger' ? <IconAlert size={18} /> : <IconInfo size={18} />)}
          </span>
          <div className="dv-stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <div className="dv-dialog-title" id={titleId}>{title}</div>
            {description ? <div className="dv-dialog-desc" id={descId}>{description}</div> : null}
          </div>
          <IconButton label={t('app.close')} onClick={onClose}><IconX size={15} /></IconButton>
        </div>
        {children}
        <div className="dv-dialog-actions">
          {actions ?? (
            <Button variant="outline" onClick={onClose}>{t('app.cancel')}</Button>
          )}
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
  tone?: 'default' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}

/** Two-step confirmation for destructive actions. */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, tone = 'danger', busy, onConfirm, onClose, children }: ConfirmDialogProps) {
  const t = useT()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      tone={tone}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>{cancelLabel ?? t('app.cancel')}</Button>
          <Button variant={tone === 'danger' ? 'danger-solid' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}

/* ==========================================================================
   Misc: copy button, relative time
   ========================================================================== */

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copy = useCallback(() => {
    const done = () => {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    }
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).then(done).catch(() => undefined)
      }
    } catch {
      // clipboard unavailable — silently ignore
    }
  }, [text])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return (
    <IconButton label={copied ? t('app.copied') : (label ?? t('app.copy'))} onClick={copy}>
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </IconButton>
  )
}
