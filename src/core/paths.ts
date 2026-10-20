import { homedir } from 'node:os'
import { join, normalize, resolve, sep } from 'node:path'
import { expandUserPath } from './win-paths.js'

/** Resolve $DSH_HOME with the same precedence as @deepseek-ai/dsh-home-paths. */
export function resolveDshHome(configured?: string, env: NodeJS.ProcessEnv = process.env): string {
  return resolveRoot(configured, env, 'DSH_HOME', () => join(homedir(), '.dsh'))
}

/** Resolve $DSH_AGENTS_HOME (shared agents root outside DSH_HOME). */
export function resolveAgentsHome(configured?: string, env: NodeJS.ProcessEnv = process.env): string {
  return resolveRoot(configured, env, 'DSH_AGENTS_HOME', () => join(homedir(), '.agents'))
}

function resolveRoot(
  configured: string | undefined,
  env: NodeJS.ProcessEnv,
  envKey: string,
  fallback: () => string,
): string {
  const raw = (configured && configured.trim()) || (env[envKey] && env[envKey]!.trim()) || ''
  if (!raw) return fallback()
  return resolve(expandUserPath(raw, env))
}

/** Plugin-owned data directory under $DSH_HOME. */
export function vaultDataDir(dshHome: string, override?: string): string {
  if (override && override.trim()) return resolve(expandUserPath(override.trim()))
  return join(dshHome, 'dsh-vault')
}

export function vaultConfigPath(dataDir: string): string {
  return join(dataDir, 'config.json')
}

export function vaultTargetsPath(dataDir: string): string {
  return join(dataDir, 'targets.json')
}

export function vaultSchedulePath(dataDir: string): string {
  return join(dataDir, 'schedule.json')
}

export function vaultTempDir(dataDir: string): string {
  return join(dataDir, 'tmp')
}

export function vaultRollbackDir(dataDir: string): string {
  return join(dataDir, 'rollback')
}

/** Normalize to POSIX relative path and reject traversal. */
export function toSafeRelPath(rel: string): string {
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!norm || norm.includes('\0')) throw new Error(`unsafe path: ${rel}`)
  const segments = norm.split('/')
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') throw new Error(`unsafe path: ${rel}`)
  }
  return segments.join('/')
}

/** Ensure absPath stays inside root (case-insensitive on Windows). */
export function assertInside(root: string, absPath: string): string {
  const resolvedRoot = resolve(root)
  const resolved = resolve(absPath)
  if (process.platform === 'win32') {
    const rootKey = resolvedRoot.replace(/[/\\]+$/, '').toLowerCase()
    const pathKey = resolved.toLowerCase()
    if (pathKey !== rootKey && !pathKey.startsWith(rootKey + '\\') && !pathKey.startsWith(rootKey + '/')) {
      throw new Error(`path escapes root: ${absPath}`)
    }
    return resolved
  }
  const withSep = resolvedRoot.endsWith(sep) ? resolvedRoot : resolvedRoot + sep
  if (resolved !== resolvedRoot && !resolved.startsWith(withSep)) {
    throw new Error(`path escapes root: ${absPath}`)
  }
  return resolved
}

export function joinRel(root: string, rel: string): string {
  return assertInside(root, join(root, ...toSafeRelPath(rel).split('/')))
}

/** Paths that must never be packed unless explicitly opted into secrets mode. */
export const SECRET_BASENAMES = new Set([
  '.credentials.yaml',
  'credentials.yaml',
  '.env',
  '.env.local',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.pypirc',
  '.netrc',
  '_netrc',
  '.git-credentials',
  '.pgpass',
  '.dockercfg',
  'auth.json',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
])

/** Case-insensitive name patterns for credential files (M-06). */
const SECRET_NAME_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i, // .env, .env.local, .env.production …
  /^.+\.env$/i, // prod.env
  /^\.?credentials(\..*)?$/i, // credentials, credentials.json, .credentials.yaml …
  /^\.?secrets?\.(json|ya?ml|toml|env|txt)$/i,
  /^.+\.(pem|key|p12|pfx|jks|keystore|ppk)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^service[-_]?account.*\.json$/i,
  /^token(s)?\.(json|txt)$/i,
]

/**
 * The single credential classifier used by backup, preview and restore (M-06).
 * Matches on the basename, case-insensitively, plus any `.credentials.yaml` component.
 */
export function isSecretRelPath(rel: string): boolean {
  const norm = rel.replace(/\\/g, '/')
  const base = (norm.split('/').pop() ?? '').trim()
  const lower = base.toLowerCase()
  if (SECRET_BASENAMES.has(lower)) return true
  if (SECRET_NAME_PATTERNS.some((re) => re.test(base))) return true
  return /(^|\/)\.credentials\.ya?ml(\/|$)/i.test(norm)
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
])

export function shouldSkipDir(name: string): boolean {
  return SKIP_DIR_NAMES.has(name)
}

export function normalizePathKey(p: string): string {
  return normalize(p).replace(/\\/g, '/')
}
