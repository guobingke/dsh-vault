/**
 * Shared building blocks for the dsh-vault settings section.
 *
 * These mirror the host's native settings chrome (rows, gray pickers, black
 * primary buttons, provider cards) using only --dv-* aliases of --dsw-* tokens.
 * They are local re-creations, not imports from any host primitives package.
 */
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
export declare function cx(...parts: Array<string | false | null | undefined>): string;
export interface SectionHeadProps {
    title: string;
    description?: ReactNode;
    id?: string;
}
/** 16px plain title + one plain sentence, no icon. */
export declare function SectionHead({ title, description, id }: SectionHeadProps): import("react").JSX.Element;
export interface SectionTabsProps<T extends string> {
    label: string;
    value: T;
    onChange: (value: T) => void;
    items: Array<{
        id: T;
        label: string;
        panelId: string;
    }>;
}
/**
 * One row of small tabs. Roving tabindex + arrow keys, per the WAI-ARIA tabs
 * pattern. Selected tab = gray rounded pill (native nav highlight).
 */
export declare function SectionTabs<T extends string>({ label, value, onChange, items }: SectionTabsProps<T>): import("react").JSX.Element;
export declare function SectionPanel({ id, labelledBy, children }: {
    id: string;
    labelledBy: string;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function Rows({ children, label }: {
    children: ReactNode;
    label?: string;
}): import("react").JSX.Element;
export interface SettingRowProps {
    title: ReactNode;
    description?: ReactNode;
    /** Right-hand control (omitted for pure text/status rows). */
    control?: ReactNode;
    /** Render the control below the text instead of beside it. */
    stacked?: boolean;
    /** Associate the row title with a form control inside `control`. */
    htmlFor?: string;
    children?: ReactNode;
}
/** Native setting row: title 14px + desc 12px on the left, control on the right. */
export declare function SettingRow({ title, description, control, stacked, htmlFor, children }: SettingRowProps): import("react").JSX.Element;
export declare function Card({ children, className }: {
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function CardList({ children, label }: {
    children: ReactNode;
    label?: string;
}): import("react").JSX.Element;
export declare function CardHead({ title, sub, actions }: {
    title: ReactNode;
    sub?: ReactNode;
    actions?: ReactNode;
}): import("react").JSX.Element;
export declare function CardSeparator(): import("react").JSX.Element;
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'danger-solid' | 'dashed';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: 'sm' | 'md';
    loading?: boolean;
    block?: boolean;
    icon?: ReactNode;
}
export declare function Button({ variant, size, loading, block, icon, disabled, children, className, type, ...rest }: ButtonProps): import("react").JSX.Element;
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    variant?: 'default' | 'danger';
    children: ReactNode;
}
export declare function IconButton({ label, variant, children, className, type, ...rest }: IconButtonProps): import("react").JSX.Element;
export interface ChipsProps<T extends string | number> {
    label: string;
    value: T | undefined;
    options: Array<{
        value: T;
        label: string;
    }>;
    onChange: (value: T) => void;
}
/** Row of small toggle chips (interval / retention presets). */
export declare function Chips<T extends string | number>({ label, value, options, onChange }: ChipsProps<T>): import("react").JSX.Element;
export interface FieldProps {
    label: ReactNode;
    htmlFor?: string;
    hint?: ReactNode;
    error?: string | null;
    optional?: boolean;
    children: ReactNode;
    className?: string;
}
export declare function Field({ label, htmlFor, hint, error, optional, children, className }: FieldProps): import("react").JSX.Element;
export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
    mono?: boolean;
    invalid?: boolean;
}
export declare function TextInput({ mono, invalid, className, ...rest }: TextInputProps): import("react").JSX.Element;
export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
}
export declare function PasswordInput({ className, ...rest }: PasswordInputProps): import("react").JSX.Element;
export declare function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>): import("react").JSX.Element;
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'title'> {
    title: ReactNode;
    description?: ReactNode;
}
export declare function Checkbox({ title, description, disabled, id, ...rest }: CheckboxProps): import("react").JSX.Element;
export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
}
/** Native switch: no label of its own — put it in a SettingRow. */
export declare function Switch({ disabled, id, ...rest }: SwitchProps): import("react").JSX.Element;
export interface OptionTileProps {
    checked: boolean;
    onChange: () => void;
    name?: string;
    title: ReactNode;
    description?: ReactNode;
    shape?: 'round' | 'square';
    disabled?: boolean;
}
/** Selectable row backed by a real radio/checkbox input. */
export declare function OptionTile({ checked, onChange, name, title, description, shape, disabled }: OptionTileProps): import("react").JSX.Element;
export interface SegmentedProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: Array<{
        value: T;
        label: string;
        count?: number;
    }>;
    label: string;
}
export declare function Segmented<T extends string>({ value, onChange, options, label }: SegmentedProps<T>): import("react").JSX.Element;
export interface SelectProps extends Omit<InputHTMLAttributes<HTMLSelectElement>, 'children'> {
    children: ReactNode;
    block?: boolean;
}
/** Native picker styled like the host (gray fill, small chevron). */
export declare function Select({ children, className, block, ...rest }: SelectProps): import("react").JSX.Element;
export interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    label: string;
    id?: string;
}
export declare function SearchInput({ value, onChange, placeholder, label, id }: SearchInputProps): import("react").JSX.Element;
export type DotTone = 'neutral' | 'ok' | 'warn' | 'danger';
export declare function StatusDot({ tone }: {
    tone?: DotTone;
}): import("react").JSX.Element;
/** Dot + text status line. */
export declare function DotText({ tone, children }: {
    tone?: DotTone;
    children: ReactNode;
}): import("react").JSX.Element;
export type TagTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
export declare function Tag({ tone, children, title }: {
    tone?: TagTone;
    children: ReactNode;
    title?: string;
}): import("react").JSX.Element;
export type BannerTone = 'info' | 'ok' | 'warn' | 'error';
export interface BannerProps {
    tone?: BannerTone;
    title?: ReactNode;
    children?: ReactNode;
    actions?: ReactNode;
    role?: 'status' | 'alert';
}
export declare function Banner({ tone, title, children, actions, role }: BannerProps): import("react").JSX.Element;
export declare function Skeleton({ lines }: {
    lines?: number;
}): import("react").JSX.Element;
export declare function LoadingState({ label }: {
    label: string;
}): import("react").JSX.Element;
export declare function LoadingInline({ label }: {
    label: string;
}): import("react").JSX.Element;
export interface EmptyStateProps {
    title: ReactNode;
    body?: ReactNode;
    actions?: ReactNode;
}
/** Plain empty state: a sentence, an optional hint and a next action. */
export declare function EmptyState({ title, body, actions }: EmptyStateProps): import("react").JSX.Element;
export interface ErrorStateProps {
    error: string;
    title?: ReactNode;
    onRetry?: () => void;
}
export declare function ErrorState({ error, title, onRetry }: ErrorStateProps): import("react").JSX.Element;
export interface ProgressBarProps {
    value?: number;
    label: string;
    detail?: ReactNode;
}
export declare function ProgressBar({ value, label, detail }: ProgressBarProps): import("react").JSX.Element;
export declare function Collapsible({ summary, children, defaultOpen }: {
    summary: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
}): import("react").JSX.Element;
export interface DialogProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    actions?: ReactNode;
    tone?: 'default' | 'danger';
    /** `wide` for content dialogs such as the path browser. */
    size?: 'default' | 'wide';
}
/** Accessible modal: focus trap, Escape closes, focus restored on close. */
export declare function Dialog({ open, onClose, title, description, children, actions, tone, size }: DialogProps): import("react").ReactPortal | null;
export interface ConfirmDialogProps {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    danger?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
    children?: ReactNode;
}
/** Second confirmation gate for destructive actions (delete snapshot / target, restore). */
export declare function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, danger, busy, onConfirm, onClose, children }: ConfirmDialogProps): import("react").JSX.Element;
//# sourceMappingURL=ui.d.ts.map