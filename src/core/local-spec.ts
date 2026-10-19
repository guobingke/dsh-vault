import path from 'node:path'
import { homedir } from 'node:os'

/**
 * Dependency specs that point at the local filesystem (or a workspace) and so
 * cannot be resolved by a registry on another machine.
 *
 * pnpm resolves relative `file:` / `link:` paths against the profile directory
 * (the folder that holds package.json), never against the process cwd.
 */
export type LocalSpec =
  | { kind: 'path'; protocol: 'link' | 'file' | 'portal'; raw: string; path: string; tarball: boolean }
  | { kind: 'unsupported'; protocol: 'workspace' | 'catalog'; raw: string }

const TARBALL_RE = /\.(tgz|tar\.gz|tar)$/i

export function isTarballPath(p: string): boolean {
  return TARBALL_RE.test(p.trim())
}

/** `C:\x`, `C:/x`, `\\server\share`. */
export function isWindowsAbsPath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\[^\\]/.test(p)
}

export function parseLocalSpec(spec: string | undefined | null): LocalSpec | null {
  if (!spec) return null
  const raw = spec.trim()
  const m = raw.match(/^(link|file|portal|workspace|catalog):(.*)$/i)
  if (!m) {
    // Bare tarball paths ("./x.tgz", "C:\\x.tgz") are also local installs.
    if (isTarballPath(raw) && (isWindowsAbsPath(raw) || /^(\.{1,2}[\\/]|[\\/]|~[\\/])/.test(raw))) {
      return { kind: 'path', protocol: 'file', raw, path: raw, tarball: true }
    }
    return null
  }
  const protocol = m[1]!.toLowerCase()
  let rest = m[2]!
  if (protocol === 'workspace' || protocol === 'catalog') return { kind: 'unsupported', protocol, raw }
  // file:///C:/x or file:///home/x (URL form)
  if (/^\/\/\//.test(rest)) {
    rest = rest.slice(2)
    if (/^\/[a-zA-Z]:[\\/]/.test(rest)) rest = rest.slice(1)
    try {
      rest = decodeURIComponent(rest)
    } catch {
      // keep as is
    }
  }
  return { kind: 'path', protocol: protocol as 'link' | 'file' | 'portal', raw, path: rest, tarball: isTarballPath(rest) }
}

/**
 * Absolute path a local spec refers to, as pnpm would resolve it from `profileDir`.
 * Works on Windows-style strings even when running on POSIX (tests), and vice versa.
 */
export function resolveLocalSpecPath(
  specPath: string,
  profileDir: string,
  opts: { home?: string; platform?: NodeJS.Platform } = {},
): string {
  const platform = opts.platform ?? process.platform
  const win = platform === 'win32' || isWindowsAbsPath(profileDir)
  const P = win ? path.win32 : path.posix
  let p = specPath.trim()
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = P.join(opts.home ?? homedir(), p.slice(1))
  if (win) {
    if (isWindowsAbsPath(p)) return P.normalize(p)
    if (p.startsWith('/') && !p.startsWith('//')) return P.normalize(p) // drive-relative; rare
    return P.resolve(profileDir, p)
  }
  if (isWindowsAbsPath(p)) return path.win32.normalize(p) // a machine-1 Windows path seen on POSIX: keep it, it just won't exist
  return P.resolve(profileDir, p)
}

/** Path string for a spec written into package.json (pnpm accepts forward slashes everywhere). */
export function specPath(abs: string): string {
  return abs.replace(/\\/g, '/')
}

/* --------------------------------------------------------------------------
 * Failure classification: one short reason per plugin, raw log kept separately.
 * ------------------------------------------------------------------------ */

export type PluginFailureReason =
  | 'local-source-missing'
  | 'tarball-missing'
  | 'unsupported-spec'
  | 'blocked-by-other'
  | 'registry-not-found'
  | 'network'
  | 'installer-missing'
  | 'missing-deps'
  | 'version-mismatch'
  | 'incompatible'
  | 'git-missing'
  | 'git-unavailable'
  | 'no-backup-copy'
  | 'not-resolvable'
  | 'no-recorded-source'
  | 'integrity-mismatch'
  | 'self'
  | 'unknown'

export interface ClassifiedFailure {
  reason: PluginFailureReason
  /** Path / spec / package named by the failure, when there is one. */
  subject?: string
  /** One-line English summary (the UI localizes `reason`). */
  summary: string
}

function firstMatch(text: string, re: RegExp): string | undefined {
  const m = text.match(re)
  return m?.[1]
}

/**
 * Classify raw pnpm / dsh output for one plugin. `ownPaths` are this plugin's own
 * local source paths; an ENOENT for any other path means another dependency in the
 * same manifest broke the install.
 */
export function classifyInstallFailure(detail: string, ownPaths: string[] = [], name?: string): ClassifiedFailure {
  const text = detail ?? ''
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
  const own = ownPaths.map(norm)
  const enoent =
    firstMatch(text, /ENOENT[^'"\n]*?['"]([^'"\n]+)['"]/) ??
    firstMatch(text, /Could not install from ["']([^"'\n]+)["'] as it does not exist/)
  if (enoent) {
    const n = norm(enoent)
    const isOwn = own.some((p) => n === p || n.startsWith(`${p}/`))
    if (!isOwn) {
      return { reason: 'blocked-by-other', subject: enoent, summary: `blocked by another dependency that cannot be resolved here: ${enoent}` }
    }
    return { reason: isTarballPath(enoent) ? 'tarball-missing' : 'local-source-missing', subject: enoent, summary: `local source missing: ${enoent}` }
  }
  if (/spawn git ENOENT|Command failed with ENOENT: git|'git' 不是内部或外部命令|'git' is not recognized|git: (command )?not found|git: No such file/i.test(text)) {
    return { reason: 'git-missing', subject: name, summary: 'git is required to install this plugin from GitHub but was not found' }
  }
  const gitRepo = firstMatch(text, /git ls-remote (\S+)/) ?? firstMatch(text, /(https:\/\/codeload\.github\.com\/[^\s/]+\/[^\s/]+)/)
  if (gitRepo && /ERR_PNPM_FETCH_404|404|Repository not found|could not read Username|Authentication failed|exit code 128|fatal:/i.test(text)) {
    return { reason: 'git-unavailable', subject: gitRepo, summary: `the git repository is not reachable: ${gitRepo}` }
  }
  if (/ERR_PNPM_NO_MATCHING_VERSION|No matching version found|npm ERR! 404|ERR_PNPM_FETCH_404|E404|is not in the npm registry|404 Not Found|Not Found - 404/i.test(text)) {
    const pkg = firstMatch(text, /GET https?:\/\/[^/\s]+\/([^\s:]+)/) ?? name
    let subject = pkg
    try { subject = pkg ? decodeURIComponent(pkg) : pkg } catch { /* keep */ }
    return { reason: 'registry-not-found', subject, summary: `not found in the npm registry${subject ? `: ${subject}` : ''}` }
  }
  if (/不是内部或外部命令|is not recognized as an internal or external command|command not found|spawn \S+ ENOENT|pnpm was not found|no dsh carrier/i.test(text)) {
    return { reason: 'installer-missing', summary: 'pnpm / dsh installer not found on this machine' }
  }
  if (/ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ERR_PNPM_META_FETCH_FAIL|socket hang up|network/i.test(text)) {
    return { reason: 'network', summary: 'network error while contacting the npm registry' }
  }
  if (/allow-version|incompatible/i.test(text)) {
    return { reason: 'incompatible', summary: 'plugin version is not compatible with this dsh version' }
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const err = lines.find((l) => /ERR_|error|failed/i.test(l)) ?? lines[0] ?? 'install failed'
  return { reason: 'unknown', summary: err.slice(0, 200) }
}

/* --------------------------------------------------------------------------
 * Windows console output: cmd.exe / pnpm on a Chinese system print GBK (cp936).
 * ------------------------------------------------------------------------ */
export function decodeConsoleOutput(buf: Buffer, platform: NodeJS.Platform = process.platform): string {
  if (buf.length === 0) return ''
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    if (platform === 'win32') {
      try {
        return new TextDecoder('gb18030').decode(buf)
      } catch {
        // ICU without gb18030 — fall through
      }
    }
    return buf.toString('utf8')
  }
}

/** git+…, github:/gitlab:/bitbucket:, owner/repo shorthand, or an http(s) tarball URL. */
export function isRemoteNonRegistrySpec(spec: string | undefined): boolean {
  if (!spec) return false
  const s = spec.replace(/^npm:[^@]+@/, '')
  if (/^(git\+|git:|github:|gitlab:|bitbucket:|gist:)/i.test(s)) return true
  if (/^https?:\/\//i.test(s)) return true
  return /^[\w.-]+\/[\w.-]+(#.*)?$/.test(s) && !s.startsWith('@')
}

