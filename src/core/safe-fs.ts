/**
 * Link-safe writes under a root (H-01) with an undo journal (H-03, M-01).
 *
 * Every path component below the root is lstat'ed: symlinks, Windows junctions and
 * other reparse points (Node reports both as symbolic links) are refused, as is a
 * non-directory where a directory is needed. After creating parents the realpath of
 * the parent must still be inside the realpath of the root, and on POSIX the file is
 * opened with O_NOFOLLOW so a link swapped in at the last moment is not followed.
 */
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rmdir, unlink } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { isWithin } from './path-policy.js'

export class UnsafePathError extends Error {
  readonly code = 'UNSAFE_PATH'
  constructor(message: string) {
    super(message)
    this.name = 'UnsafePathError'
  }
}

function segmentsBelow(root: string, abs: string): string[] {
  const rel = relative(root, abs)
  if (!rel || rel.startsWith('..') || /^[a-zA-Z]:/.test(rel)) throw new UnsafePathError(`path escapes root: ${abs}`)
  return rel.split(/[\\/]+/).filter(Boolean)
}

export type TargetState = 'missing' | 'file'

/**
 * Validate that `abs` (a file to be written or deleted below `root`) is reachable without
 * following links and without a type conflict. Returns whether the file exists now.
 */
export async function checkTarget(root: string, abs: string): Promise<TargetState> {
  const segs = segmentsBelow(root, abs)
  let cur = root
  for (let i = 0; i < segs.length; i++) {
    cur = join(cur, segs[i]!)
    const last = i === segs.length - 1
    let st
    try {
      st = await lstat(cur)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
      throw err
    }
    if (st.isSymbolicLink()) {
      throw new UnsafePathError(`refusing to follow a symlink/junction: ${cur}`)
    }
    if (!last && !st.isDirectory()) {
      throw new UnsafePathError(`type conflict: ${cur} is a file but the snapshot needs a folder there`)
    }
    if (last && !st.isFile()) {
      throw new UnsafePathError(`type conflict: ${cur} exists and is not a regular file`)
    }
  }
  return 'file'
}

async function assertRealInside(root: string, dir: string): Promise<void> {
  const realRoot = await realpath(root)
  const realDir = await realpath(dir)
  if (!isWithin(realRoot, realDir)) throw new UnsafePathError(`resolved path escapes root: ${dir}`)
}

interface JournalEntry {
  abs: string
  /** Previous bytes, or null when the file did not exist. */
  prev: Buffer | null
  prevMode?: number
}

/** Writes/deletes below roots that can be undone in reverse order. */
export class WriteJournal {
  private readonly entries: JournalEntry[] = []
  private readonly createdDirs: string[] = []

  constructor(private readonly roots: string[]) {}

  private rootFor(abs: string): string {
    const root = this.roots.find((r) => isWithin(r, abs) && abs !== r)
    if (!root) throw new UnsafePathError(`path outside restore roots: ${abs}`)
    return root
  }

  /** Make missing parent folders one by one (each checked) and remember them for undo. */
  private async ensureParents(root: string, abs: string): Promise<void> {
    await mkdir(root, { recursive: true })
    const parent = dirname(abs)
    const segs = parent === root ? [] : segmentsBelow(root, parent)
    let cur = root
    for (const seg of segs) {
      cur = join(cur, seg)
      try {
        await mkdir(cur)
        this.createdDirs.push(cur)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      }
      const st = await lstat(cur)
      if (st.isSymbolicLink() || !st.isDirectory()) throw new UnsafePathError(`refusing to write through ${cur}`)
    }
    await assertRealInside(root, dirname(abs))
  }

  async write(abs: string, data: Buffer, mode: number): Promise<void> {
    const root = this.rootFor(abs)
    const state = await checkTarget(root, abs)
    let prev: Buffer | null = null
    let prevMode: number | undefined
    if (state === 'file') {
      prev = await readFile(abs)
      prevMode = (await lstat(abs)).mode & 0o777
    }
    await this.ensureParents(root, abs)
    this.entries.push({ abs, prev, prevMode })
    await writeNoFollow(abs, data, mode)
  }

  async remove(abs: string): Promise<boolean> {
    const root = this.rootFor(abs)
    const state = await checkTarget(root, abs)
    if (state === 'missing') return false
    await assertRealInside(root, dirname(abs))
    const prev = await readFile(abs)
    const prevMode = (await lstat(abs)).mode & 0o777
    this.entries.push({ abs, prev, prevMode })
    await unlink(abs)
    return true
  }

  /** Undo everything in reverse order. Returns paths that could not be restored. */
  async rollback(): Promise<string[]> {
    const failed: string[] = []
    for (const e of [...this.entries].reverse()) {
      try {
        if (e.prev === null) {
          await unlink(e.abs).catch((err: NodeJS.ErrnoException) => { if (err.code !== 'ENOENT') throw err })
        } else {
          const st = await lstat(e.abs).catch(() => null)
          if (st?.isSymbolicLink()) await unlink(e.abs)
          await writeNoFollow(e.abs, e.prev, e.prevMode ?? 0o644)
        }
      } catch {
        failed.push(e.abs)
      }
    }
    for (const d of [...this.createdDirs].reverse()) {
      await rmdir(d).catch(() => {})
    }
    this.entries.length = 0
    this.createdDirs.length = 0
    return failed
  }
}

const NOFOLLOW = (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0

async function writeNoFollow(abs: string, data: Buffer, mode: number): Promise<void> {
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | NOFOLLOW
  const fh = await open(abs, flags, mode)
  try {
    await fh.writeFile(data)
    await fh.chmod(mode).catch(() => {})
  } finally {
    await fh.close()
  }
}

