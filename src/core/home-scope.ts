import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { SECRET_BASENAMES } from './paths.js'

/**
 * What a backup covers: everything under $DSH_HOME except the denylist below.
 * Plugins keep their own data directly under $DSH_HOME (dsh-purge/, redteam/,
 * skin-center/, llm-deepseek/, backups/, …), so an allowlist always misses some.
 *
 * The same rules drive collect (backup), `dsh-vault diff`, and the UI scope list.
 */
export type ExcludeReason =
  | 'chat-history'
  | 'attachments'
  | 'vault-own'
  | 'node-modules'
  | 'git'
  | 'plugin-manager-logs'
  | 'cache'
  | 'machine-id'
  | 'secret'
  | 'machine-state'
  | 'restored-plugin-sources'
  | 'runtime'

/** Root directories never backed up. */
const ROOT_DIRS: Record<string, ExcludeReason> = {
  sessions: 'chat-history',
  attachments: 'attachments',
  'dsh-vault': 'vault-own',
  // Re-bundled from the profile specs on every backup; the live copy is machine-local.
  'plugin-sources': 'restored-plugin-sources',
  // Desktop's installed node/python/pnpm payload (re-created by Desktop).
  'primary-runtime': 'runtime',
  'primary-runtime.previous': 'runtime',
}

/** Directory names skipped at any depth. */
const ANY_DIRS: Record<string, ExcludeReason> = {
  node_modules: 'node-modules',
  '.git': 'git',
  cache: 'cache',
  '.cache': 'cache',
  caches: 'cache',
  tmp: 'cache',
  '.tmp': 'cache',
  temp: 'cache',
  // dsh session projection cache (rebuilt from sessions, which are not backed up)
  session_projcache: 'cache',
  // dsh-config-manager's own snapshot folder (another backup tool's archives)
  'config-backups': 'cache',
}

/** Root files never backed up (secrets are handled separately). */
const ROOT_FILES: Record<string, ExcludeReason> = {
  '.anonymous-user-id': 'machine-id',
}

/**
 * dsh-purge's record of how it patched *this* machine's Desktop install. Copied to
 * another machine it claims patches that are not there (applied.json / installed-rev),
 * pins the wrong app.asar identity (unpacked-asar.json → needless re-extract), or
 * suppresses its one-time settle restart (settle-restart.guard). dsh-purge re-creates
 * them on the new machine after you press 应用 once.
 */
const MACHINE_STATE_FILES = new Set([
  'dsh-purge/applied.json',
  'dsh-purge/installed-rev',
  'dsh-purge/unpacked-asar.json',
  'dsh-purge/settle-restart.guard',
  'storages/session_projcache.json',
])

export interface ScopeOptions {
  /** Include .credentials.yaml / .env* (only allowed for encrypted backups). */
  includeSecrets?: boolean
}

function isSecretName(base: string): boolean {
  return SECRET_BASENAMES.has(base) || /^\.env(\..+)?$/.test(base)
}

/** Why `rel` (POSIX, relative to $DSH_HOME) is not backed up, or null when it is. */
export function homeExcludeReason(rel: string, isDir: boolean, opts: ScopeOptions = {}): ExcludeReason | null {
  const p = rel.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!p) return null
  const segs = p.split('/')
  const first = segs[0]!
  if (segs.length === 1 && isDir && ROOT_DIRS[first]) return ROOT_DIRS[first]!
  if (segs.length > 1 && ROOT_DIRS[first]) return ROOT_DIRS[first]!
  if (first.startsWith('.primary-runtime-')) return 'runtime'
  const dirSegs = isDir ? segs : segs.slice(0, -1)
  for (const s of dirSegs) if (ANY_DIRS[s]) return ANY_DIRS[s]!
  for (let i = 0; i + 1 < dirSegs.length; i++) {
    if (dirSegs[i] === '.plugin-manager' && dirSegs[i + 1] === 'logs') return 'plugin-manager-logs'
  }
  if (isDir) return null
  const base = segs[segs.length - 1]!
  if (segs.length === 1 && ROOT_FILES[base]) return ROOT_FILES[base]!
  if (MACHINE_STATE_FILES.has(p)) return 'machine-state'
  if (isSecretName(base) && !opts.includeSecrets) return 'secret'
  return null
}

export function isSecretPath(rel: string): boolean {
  return isSecretName(rel.replace(/\\/g, '/').split('/').pop() ?? '')
}

export interface HomeFile {
  rel: string
  abs: string
}

/** Every backed-up regular file under `root` (symlinked files followed, symlinked dirs not). */
export async function walkHome(root: string, opts: ScopeOptions = {}, relPrefix = ''): Promise<HomeFile[]> {
  const out: HomeFile[] = []
  async function walk(absDir: string, rel: string): Promise<void> {
    let entries
    try {
      entries = await readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      const abs = join(absDir, e.name)
      if (e.isDirectory()) {
        if (homeExcludeReason(childRel, true, opts)) continue
        await walk(abs, childRel)
        continue
      }
      if (!e.isFile() && !e.isSymbolicLink()) continue
      if (e.isSymbolicLink()) {
        try {
          if (!(await stat(abs)).isFile()) continue
        } catch {
          continue
        }
      }
      if (homeExcludeReason(childRel, false, opts)) continue
      out.push({ rel: relPrefix ? `${relPrefix}/${childRel}` : childRel, abs })
    }
  }
  await walk(root, '')
  return out
}

/** Root entries owned by dsh itself (everything else under $DSH_HOME counts as plugin data). */
const DSH_OWNED_ROOT = new Set([
  'settings.yaml',
  'settings.yaml.imported',
  'cordis.patch.yml',
  'storages',
  '.credentials.yaml',
  'credentials.yaml',
  'profiles',
  '.agent-presets',
  'agent-presets',
  'skills',
  'AGENTS.md',
  'mcp.json',
  'mcp',
])

export function isPluginDataRoot(first: string): boolean {
  return !DSH_OWNED_ROOT.has(first)
}

/** Top-level plugin data entries present in a home (for the UI scope list). */
export async function listPluginDataEntries(dshHome: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dshHome, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    if (!isPluginDataRoot(e.name)) continue
    const isDir = e.isDirectory()
    if (!isDir && !e.isFile()) continue
    if (homeExcludeReason(e.name, isDir, {})) continue
    out.push(isDir ? `${e.name}/` : e.name)
  }
  return out.sort()
}

/** Human-readable list of what is never backed up (docs / CLI / UI). */
export const DOCUMENTED_EXCLUDES: Array<{ pattern: string; reason: ExcludeReason; why: string }> = [
  { pattern: 'sessions/', reason: 'chat-history', why: 'chat history (owner decision)' },
  { pattern: 'attachments/', reason: 'attachments', why: 'chat attachments' },
  { pattern: 'dsh-vault/', reason: 'vault-own', why: "dsh-vault's own snapshots, rollback, tmp and storage targets (targets hold credentials; re-add them per machine)" },
  { pattern: 'plugin-sources/', reason: 'restored-plugin-sources', why: 'plugin sources restored by dsh-vault; re-bundled from the profile specs' },
  { pattern: '**/node_modules/', reason: 'node-modules', why: 'reinstalled from package.json + pnpm-lock.yaml' },
  { pattern: '**/.git/', reason: 'git', why: 'git metadata' },
  { pattern: '**/.plugin-manager/logs/', reason: 'plugin-manager-logs', why: 'plugin manager operation logs' },
  { pattern: '**/{cache,.cache,caches,tmp,.tmp,temp,session_projcache,config-backups}/', reason: 'cache', why: 'caches / temp / other backup tools' },
  { pattern: 'storages/session_projcache.json', reason: 'machine-state', why: 'session projection index (sessions are not backed up)' },
  { pattern: 'primary-runtime*/', reason: 'runtime', why: "Desktop's installed runtime payload" },
  { pattern: '.anonymous-user-id', reason: 'machine-id', why: 'per-install anonymous id' },
  { pattern: '.credentials.yaml, .env*', reason: 'secret', why: 'only in encrypted backups with secrets enabled' },
  { pattern: 'dsh-purge/{applied.json,installed-rev,unpacked-asar.json,settle-restart.guard}', reason: 'machine-state', why: "dsh-purge's patch state of this machine's Desktop install" },
]
