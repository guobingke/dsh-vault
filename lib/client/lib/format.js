/** Shared formatting helpers for the Settings UI (bytes, dates, schedule, password strength). */
export function formatBytes(n) {
    if (!Number.isFinite(n) || n < 0)
        return '0 B';
    if (n < 1024)
        return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n;
    let i = -1;
    do {
        v /= 1024;
        i++;
    } while (v >= 1024 && i < units.length - 1);
    return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
function localeTag(locale) {
    return locale && /^zh/i.test(locale) ? 'zh-CN' : 'en-US';
}
export function formatDateTime(iso, locale) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return iso;
    return new Intl.DateTimeFormat(localeTag(locale), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}
/** Short relative/absolute label for overview rows. */
export function formatWhen(iso, locale) {
    return formatDateTime(iso, locale);
}
export function relativeLabel(tr, iso, now = Date.now()) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t))
        return iso;
    const delta = t - now;
    const abs = Math.abs(delta);
    const mins = Math.round(abs / 60_000);
    if (mins < 1)
        return tr('time.justNow');
    if (mins < 60) {
        return delta < 0
            ? tr('time.minutesAgo', { n: mins })
            : tr('time.inMinutes', { n: mins });
    }
    const hours = Math.round(mins / 60);
    if (hours < 48) {
        return delta < 0
            ? tr('time.hoursAgo', { n: hours })
            : tr('time.inHours', { n: hours });
    }
    const days = Math.round(hours / 24);
    return delta < 0
        ? tr('time.daysAgo', { n: days })
        : tr('time.inDays', { n: days });
}
export function scheduleLabel(locale, intervalMinutes) {
    const zh = Boolean(locale && /^zh/i.test(locale));
    const m = Math.max(1, Math.round(intervalMinutes) || 1);
    if (m < 60)
        return zh ? `每 ${m} 分钟` : `every ${m} min`;
    if (m % 1440 === 0) {
        const d = m / 1440;
        return zh ? (d === 1 ? '每天' : `每 ${d} 天`) : (d === 1 ? 'daily' : `every ${d} days`);
    }
    if (m % 60 === 0) {
        const h = m / 60;
        return zh ? (h === 1 ? '每小时' : `每 ${h} 小时`) : (h === 1 ? 'hourly' : `every ${h} hours`);
    }
    return zh ? `每 ${m} 分钟` : `every ${m} min`;
}
/** Lightweight password strength heuristic (UI hint only). */
export function passwordStrength(password) {
    if (!password)
        return { level: 0, score: 0 };
    let score = 0;
    if (password.length >= 8)
        score++;
    if (password.length >= 12)
        score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password))
        score++;
    if (/\d/.test(password))
        score++;
    if (/[^A-Za-z0-9]/.test(password))
        score++;
    const level = Math.min(4, score);
    return { level, score };
}
//# sourceMappingURL=format.js.map