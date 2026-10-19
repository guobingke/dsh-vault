import { homedir } from 'node:os';
import { isAbsolute, normalize, resolve, sep } from 'node:path';
/**
 * Expand user-facing path input for Windows / macOS / Linux.
 * Handles drive letters, backslashes, `%VAR%` / `$VAR`, and `~`.
 */
export function expandUserPath(input, env = process.env) {
    let p = (input ?? '').trim();
    if (!p)
        return p;
    // Windows %USERPROFILE% / %DSH_HOME% etc.
    p = p.replace(/%([^%]+)%/g, (_, name) => {
        const v = env[name] ?? env[name.toUpperCase()] ?? env[name.toLowerCase()];
        return v && v.trim() ? v : `%${name}%`;
    });
    // $VAR or ${VAR} (skip bare $ at end)
    p = p.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => env[name] ?? '');
    p = p.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => env[name] ?? '');
    if (p === '~')
        return homedir();
    if (p.startsWith('~/') || p.startsWith('~\\')) {
        return joinHome(p.slice(2));
    }
    // Normalize slashes but keep Windows drive prefix (C:\ or C:/)
    const drive = p.match(/^([A-Za-z]:)([\\/].*)?$/);
    if (drive) {
        const rest = (drive[2] ?? '\\').replace(/\//g, sep);
        return normalize(drive[1] + rest);
    }
    if (isAbsolute(p))
        return normalize(p.replace(/\//g, sep));
    return resolve(p.replace(/\//g, sep));
}
function joinHome(rel) {
    const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
    return normalize([homedir(), ...parts].join(sep));
}
/** True when a path looks like a Windows absolute path (even on POSIX hosts / in tests). */
export function looksLikeWindowsAbsPath(p) {
    return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]+\\/.test(p);
}
//# sourceMappingURL=win-paths.js.map