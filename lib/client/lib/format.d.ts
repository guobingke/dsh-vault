/** Shared formatting helpers for the Settings UI (bytes, dates, schedule, password strength). */
export declare function formatBytes(n: number): string;
export declare function formatDateTime(iso: string, locale?: string): string;
/** Short relative/absolute label for overview rows. */
export declare function formatWhen(iso: string, locale?: string): string;
export declare function relativeLabel(tr: (key: 'time.justNow' | 'time.minutesAgo' | 'time.hoursAgo' | 'time.daysAgo' | 'time.inMinutes' | 'time.inHours' | 'time.inDays', vars?: Record<string, string | number>) => string, iso: string, now?: number): string;
export declare function scheduleLabel(locale: string | undefined, intervalMinutes: number): string;
export interface PasswordStrength {
    level: 0 | 1 | 2 | 3 | 4;
    score: number;
}
/** Lightweight password strength heuristic (UI hint only). */
export declare function passwordStrength(password: string): PasswordStrength;
//# sourceMappingURL=format.d.ts.map