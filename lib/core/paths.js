import { homedir } from 'node:os';
import { join, normalize, resolve, sep } from 'node:path';
import { expandUserPath } from './win-paths.js';
/** Resolve $DSH_HOME with the same precedence as @deepseek-ai/dsh-home-paths. */
export function resolveDshHome(configured, env = process.env) {
    return resolveRoot(configured, env, 'DSH_HOME', () => join(homedir(), '.dsh'));
}
/** Resolve $DSH_AGENTS_HOME (shared agents root outside DSH_HOME). */
export function resolveAgentsHome(configured, env = process.env) {
    return resolveRoot(configured, env, 'DSH_AGENTS_HOME', () => join(homedir(), '.agents'));
}
function resolveRoot(configured, env, envKey, fallback) {
    const raw = (configured && configured.trim()) || (env[envKey] && env[envKey].trim()) || '';
    if (!raw)
        return fallback();
    return resolve(expandUserPath(raw, env));
}
/** Plugin-owned data directory under $DSH_HOME. */
export function vaultDataDir(dshHome, override) {
    if (override && override.trim())
        return resolve(expandUserPath(override.trim()));
    return join(dshHome, 'dsh-vault');
}
export function vaultConfigPath(dataDir) {
    return join(dataDir, 'config.json');
}
export function vaultTargetsPath(dataDir) {
    return join(dataDir, 'targets.json');
}
export function vaultSchedulePath(dataDir) {
    return join(dataDir, 'schedule.json');
}
export function vaultTempDir(dataDir) {
    return join(dataDir, 'tmp');
}
export function vaultRollbackDir(dataDir) {
    return join(dataDir, 'rollback');
}
/** Normalize to POSIX relative path and reject traversal. */
export function toSafeRelPath(rel) {
    const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!norm || norm.includes('\0'))
        throw new Error(`unsafe path: ${rel}`);
    const segments = norm.split('/');
    for (const seg of segments) {
        if (!seg || seg === '.' || seg === '..')
            throw new Error(`unsafe path: ${rel}`);
    }
    return segments.join('/');
}
/** Ensure absPath stays inside root (case-insensitive on Windows). */
export function assertInside(root, absPath) {
    const resolvedRoot = resolve(root);
    const resolved = resolve(absPath);
    if (process.platform === 'win32') {
        const rootKey = resolvedRoot.replace(/[/\\]+$/, '').toLowerCase();
        const pathKey = resolved.toLowerCase();
        if (pathKey !== rootKey && !pathKey.startsWith(rootKey + '\\') && !pathKey.startsWith(rootKey + '/')) {
            throw new Error(`path escapes root: ${absPath}`);
        }
        return resolved;
    }
    const withSep = resolvedRoot.endsWith(sep) ? resolvedRoot : resolvedRoot + sep;
    if (resolved !== resolvedRoot && !resolved.startsWith(withSep)) {
        throw new Error(`path escapes root: ${absPath}`);
    }
    return resolved;
}
export function joinRel(root, rel) {
    return assertInside(root, join(root, ...toSafeRelPath(rel).split('/')));
}
/** Paths that must never be packed unless explicitly opted into secrets mode. */
export const SECRET_BASENAMES = new Set([
    '.credentials.yaml',
    'credentials.yaml',
    '.env',
    '.env.local',
]);
export function isSecretRelPath(rel) {
    const base = rel.replace(/\\/g, '/').split('/').pop() ?? '';
    if (SECRET_BASENAMES.has(base))
        return true;
    if (rel.replace(/\\/g, '/').includes('/.credentials.yaml'))
        return true;
    return false;
}
/** Directories skipped while collecting (reinstallable artifacts). */
export const SKIP_DIR_NAMES = new Set([
    'node_modules',
    '.git',
    'cache',
    'dsh-vault',
    'dsh-config-manager',
    'config-backups',
    // dsh plugin-manager operation logs (profiles/*/.plugin-manager/logs) — noise, not config.
    '.plugin-manager',
    // dsh session projection cache under $DSH_HOME/storages (rebuilt from sessions).
    'session_projcache',
]);
export function shouldSkipDir(name) {
    return SKIP_DIR_NAMES.has(name);
}
export function normalizePathKey(p) {
    return normalize(p).replace(/\\/g, '/');
}
//# sourceMappingURL=paths.js.map