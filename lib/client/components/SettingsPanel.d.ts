import type { StorageTargetConfig, VaultSettings } from '../../core/types.js';
export interface SettingsPanelProps {
    settings: VaultSettings | null;
    busy: boolean;
    error: string | null;
    message: string | null;
    onSave: (patch: Partial<VaultSettings>) => void;
    onRunSchedule: () => void;
    targets?: StorageTargetConfig[];
    loading?: boolean;
    onRetry?: () => void;
    /** Active host locale (read-only; the UI follows the host). */
    locale: 'zh' | 'en';
}
/**
 * Auto backup — the former Settings panel: schedule, retention, defaults and
 * one plain language row (read-only, follows the host).
 */
export declare function SettingsPanel({ settings, busy, error, message, onSave, onRunSchedule, targets, loading, onRetry, locale, }: SettingsPanelProps): import("react").JSX.Element;
//# sourceMappingURL=SettingsPanel.d.ts.map