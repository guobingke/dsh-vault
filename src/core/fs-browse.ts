import { mkdir, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'
import { expandUserPath } from './win-paths.js'
import { VaultUserError } from './errors.js'

export interface FsEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
  bytes?: number
  hidden?: boolean
}

export interface FsListing {
  path: string
  parent: string | null
  /** User home directory (the browser's "Home" shortcut). */
  home: string
  /** Filesystem roots: Windows drive letters (`C:\`, `D:\`…) or `/`. */
  roots: string[]
  /** Path separator of the host, so the browser can join names. */
  sep: string
  entries: FsEntry[]
  /** True when the host exposes dsh's native OS folder chooser. */
  nativePicker?: boolean
}

const DRIVE_PROBE_MS = 800

async function probe(path: string, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      stat(path).then((s) => s.isDirectory(), () => false),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Filesystem roots for the browser sidebar: mounted drive letters on Windows, `/` elsewhere. */
export async function listRoots(platform: NodeJS.Platform = process.platform): Promise<string[]> {
  if (platform !== 'win32') return ['/']
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  // Probe in parallel with a short timeout so empty card readers / stale network drives can't stall the dialog.
  const found = await Promise.all(letters.map(async (l) => ((await probe(`${l}:\\`, DRIVE_PROBE_MS)) ? `${l}:\\` : null)))
  return found.filter((d): d is string => d !== null)
}

/** List one directory level for the in-app path browser (Windows-safe). Empty input lists the home dir. */
export async function listDirectory(inputPath: string): Promise<FsListing> {
  const path = expandUserPath(inputPath || '~')
  let info
  try {
    info = await stat(path)
  } catch {
    throw new VaultUserError(`directory unreadable: ${path}`, 400, 'DIRECTORY_UNREADABLE')
  }
  if (!info.isDirectory()) {
    throw new VaultUserError(`not a directory: ${path}`, 400, 'NOT_A_DIRECTORY')
  }
  let names: string[]
  try {
    names = await readdir(path)
  } catch {
    throw new VaultUserError(`directory unreadable: ${path}`, 400, 'DIRECTORY_UNREADABLE')
  }
  const entries: FsEntry[] = []
  for (const name of names) {
    if (name === '.' || name === '..') continue
    const abs = join(path, name)
    try {
      const st = await stat(abs)
      entries.push({
        name,
        path: abs,
        kind: st.isDirectory() ? 'directory' : 'file',
        bytes: st.isFile() ? st.size : undefined,
        hidden: name.startsWith('.') || undefined,
      })
    } catch {
      // skip unreadable entries (broken links, locked system files)
    }
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const parent = dirname(path)
  return {
    path,
    parent: parent && parent !== path ? parent : null,
    home: homedir(),
    roots: await listRoots(),
    sep,
    entries,
  }
}

/** Create one new folder under `parent` for the in-app browser; returns its absolute path. */
export async function createDirectory(parentInput: string, name: string): Promise<string> {
  const trimmed = (name ?? '').trim()
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/:*?"<>|\0]/.test(trimmed)) {
    throw new VaultUserError(`invalid folder name: ${name}`, 400, 'INVALID_NAME')
  }
  const parent = expandUserPath(parentInput || '~')
  const info = await stat(parent).catch(() => null)
  if (!info?.isDirectory()) {
    throw new VaultUserError(`not a directory: ${parent}`, 400, 'NOT_A_DIRECTORY')
  }
  const target = join(parent, trimmed)
  try {
    await mkdir(target)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EEXIST') throw new VaultUserError(`already exists: ${target}`, 409, 'ALREADY_EXISTS')
    throw new VaultUserError(`cannot create ${target}: ${(err as Error).message}`, 400, 'CREATE_FAILED')
  }
  return target
}

export function isSnapshotArchiveName(name: string): boolean {
  const base = basename(name).toLowerCase()
  return base.endsWith('.tar.gz') || base.endsWith('.dshvault') || base.endsWith('.json')
}
