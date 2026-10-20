/**
 * Path boundaries for paths that arrive over the HTTP API (C-02, C-03, H-08).
 *
 * The browser UI may only read, list, create folders in, or write archives to
 * locations under an approved root:
 *   - the user's home directory,
 *   - removable / extra-drive mount points (/media, /mnt, /run/media, /Volumes,
 *     and on Windows every drive letter),
 *   - folders the user chose in dsh's native OS picker during this session,
 *   - extra roots passed by the host (tests).
 * Everything is checked after resolving symlinks / junctions (realpath of the
 * nearest existing ancestor), and system directories, credential folders and the
 * plugin's own data directory are always refused. The CLI is not subject to this.
 */
import { lstat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { VaultUserError } from './errors.js'
import { expandUserPath } from './win-paths.js'

export type ApiPathUse = 'list' | 'read' | 'mkdir' | 'write-dir' | 'write-file'

const POSIX_SYSTEM = ['/etc', '/bin', '/sbin', '/usr', '/lib', '/lib32', '/lib64', '/libx32', '/boot', '/proc', '/sys', '/dev', '/run', '/var', '/opt', '/srv', '/snap', '/root', '/System', '/Library', '/private', '/Applications', '/cores']
const POSIX_MOUNTS = ['/media', '/mnt', '/run/media', '/Volumes']
const HOME_SENSITIVE = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker', '.config/gcloud', '.config/gh', '.password-store', '.netrc', '.npmrc', '.pypirc', '.git-credentials']

function key(p: string, platform: NodeJS.Platform): string {
  const n = resolve(p)
  return platform === 'win32' ? n.toLowerCase() : n
}

export function isWithin(root: string, p: string, platform: NodeJS.Platform = process.platform): boolean {
  const r = key(root, platform).replace(/[\\/]+$/, '')
  const k = key(p, platform)
  if (k === r) return true
  return k.startsWith(r + sep) || (platform === 'win32' && k.startsWith(r + '/')) || (r === '' && k.startsWith(sep))
}

/** Resolve symlinks/junctions on the longest existing prefix, then re-append the rest. */
export async function realpathLoose(p: string): Promise<string> {
  let cur = resolve(p)
  const rest: string[] = []
  for (;;) {
    try {
      const real = await realpath(cur)
      return rest.length ? join(real, ...rest.reverse()) : real
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return resolve(p)
      rest.push(cur.slice(parent.length).replace(/^[\\/]+/, ''))
      cur = parent
    }
  }
}

export interface PathPolicyOptions {
  /** Extra approved roots (tests, host config). */
  extraRoots?: string[]
  /** Always refused (plugin data dir with targets.json, rollback snapshots). */
  protectedDirs?: string[]
  home?: string
  platform?: NodeJS.Platform
}

export class PathPolicy {
  private readonly approved = new Set<string>()
  private readonly platform: NodeJS.Platform
  private readonly home: string

  constructor(private readonly options: PathPolicyOptions = {}) {
    this.platform = options.platform ?? process.platform
    this.home = options.home ?? homedir()
  }

  /** Remember a folder the user picked in the native OS dialog. */
  approve(path: string | null | undefined): void {
    if (path && isAbsolute(path)) this.approved.add(resolve(path))
  }

  /** Approved roots (unresolved) for the in-app browser's sidebar. */
  async roots(): Promise<string[]> {
    const out = [this.home, ...(this.options.extraRoots ?? []), ...this.approved]
    if (this.platform === 'win32') {
      // Other drives (USB sticks, D:\ data disks) are approved whole; on the system drive
      // only the home folder (and picked folders) are.
      const sysDrive = (process.env.SystemDrive || 'C:').slice(0, 1).toUpperCase()
      for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (l !== sysDrive) out.push(`${l}:\\`)
    } else {
      out.push(...POSIX_MOUNTS)
    }
    return [...new Set(out)]
  }

  private systemDirs(): string[] {
    if (this.platform === 'win32') {
      const sys = (process.env.SystemRoot || process.env.windir || 'C:\\Windows')
      const drive = sys.slice(0, 3)
      return [
        sys,
        process.env.ProgramFiles || `${drive}Program Files`,
        process.env['ProgramFiles(x86)'] || `${drive}Program Files (x86)`,
        process.env.ProgramData || `${drive}ProgramData`,
        `${drive}$Recycle.Bin`,
        `${drive}System Volume Information`,
      ]
    }
    return POSIX_SYSTEM
  }

  /**
   * Validate an API-supplied path for `use`; returns the realpath-resolved absolute path.
   * Throws VaultUserError 403 PATH_NOT_ALLOWED otherwise.
   */
  async check(input: string, use: ApiPathUse): Promise<string> {
    const raw = (input ?? '').trim()
    if (!raw || raw.includes('\0')) throw deny(input, 'empty path')
    const expanded = expandUserPath(raw)
    if (!isAbsolute(expanded)) throw deny(input, 'path must be absolute')
    const real = await realpathLoose(expanded)
    const realHome = await realpathLoose(this.home)
    const inHome = isWithin(realHome, real, this.platform) || isWithin(this.home, real, this.platform)
    for (const dir of this.options.protectedDirs ?? []) {
      if (isWithin(await realpathLoose(dir), real, this.platform)) throw deny(input, 'the dsh-vault data folder is private')
    }
    let trusted = inHome
    for (const r of [...(this.options.extraRoots ?? []), ...this.approved]) {
      if (trusted) break
      trusted = isWithin(r, real, this.platform) || isWithin(await realpathLoose(r), real, this.platform)
    }
    if (!trusted) {
      for (const dir of this.systemDirs()) {
        if (isWithin(dir, real, this.platform) || isWithin(await realpathLoose(dir), real, this.platform)) throw deny(input, 'system folders are off limits')
      }
    }
    // Credential folders are off limits for every use, listing and reading included.
    for (const s of HOME_SENSITIVE) {
      if (isWithin(join(realHome, s), real, this.platform) || isWithin(join(this.home, s), real, this.platform)) {
        throw deny(input, 'credential folders are off limits')
      }
    }
    let rooted = false
    for (const root of await this.roots()) {
      if (isWithin(root, real, this.platform) || isWithin(await realpathLoose(root), real, this.platform)) { rooted = true; break }
    }
    if (!rooted) throw deny(input, 'outside the approved folders (home, removable drives, or a folder picked in the system dialog)')
    if (use === 'read') {
      // Only snapshot archives (judged on the resolved file) or folders of them may be read.
      const st = await lstat(real).catch(() => null)
      if (st && !st.isDirectory()) {
        const lower = real.toLowerCase()
        if (!st.isFile() || !(lower.endsWith('.tar.gz') || lower.endsWith('.dshvault'))) {
          throw deny(input, 'only .tar.gz / .dshvault snapshot files can be imported')
        }
      }
    }
    if (use === 'write-file') {
      // An existing symlink/junction as the export file itself would redirect the write.
      const st = await lstat(expanded).catch(() => null)
      if (st && !st.isFile()) throw deny(input, 'export target exists and is not a regular file')
    }
    return real
  }
}

function deny(input: string, why: string): VaultUserError {
  return new VaultUserError(`path not allowed (${why}): ${input}`, 403, 'PATH_NOT_ALLOWED')
}

