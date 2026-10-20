/**
 * One writer at a time (M-02): an in-process queue plus a cross-process lock file in the
 * vault data dir, so the web UI, scheduled backups, model tools and the CLI never pack,
 * restore or install plugins concurrently against the same DSH_HOME.
 *
 * Ownership is explicit: the lock file names its owner (host + pid + random nonce) and a
 * heartbeat the owner refreshes while it runs. A lock is only taken over when its owner is
 * provably gone (same host and the pid is dead) or its heartbeat stopped long ago; the
 * takeover itself goes through rename-to-tombstone + exclusive create, so two contenders
 * cannot both win. Release only removes the file if it still carries our nonce.
 */
import { randomBytes } from 'node:crypto'
import { open, readFile, rename, stat, unlink, utimes } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { VaultUserError } from './errors.js'

export interface LockInfo {
  pid: number
  host: string
  nonce: string
  op: string
  startedAt: string
  /** Acquisition time (ms since epoch); later heartbeats touch the file mtime. */
  heartbeatAt: number
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export interface OperationLockOptions {
  /** How long to wait for another operation (default 30 min). */
  timeoutMs?: number
  /** Heartbeat age after which a lock from another host / live-looking pid counts as abandoned (default 10 min). */
  staleMs?: number
  /** Heartbeat interval (default 30 s). */
  heartbeatMs?: number
  pollMs?: number
}

export class OperationLock {
  private tail: Promise<unknown> = Promise.resolve()
  private holder: string | null = null

  constructor(
    private readonly dir: string,
    private readonly opts: OperationLockOptions = {},
  ) {}

  get path(): string {
    return join(this.dir, 'operation.lock')
  }

  /** Name of the operation holding the in-process lock, if any. */
  current(): string | null {
    return this.holder
  }

  /** Run `fn` exclusively (queued behind earlier calls in this process and other processes). */
  run<T>(op: string, fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      const mine = await this.acquire(op)
      this.holder = op
      const beat = setInterval(() => { void this.heartbeat(mine) }, this.opts.heartbeatMs ?? 30_000)
      beat.unref?.()
      try {
        return await fn()
      } finally {
        clearInterval(beat)
        this.holder = null
        await this.release(mine)
      }
    })
    this.tail = next.catch(() => {})
    return next
  }

  /** Read the current owner record (null when absent or unreadable). */
  async read(): Promise<LockInfo | null> {
    try {
      const info = JSON.parse(await readFile(this.path, 'utf8')) as LockInfo
      return info && typeof info.nonce === 'string' ? info : null
    } catch {
      return null
    }
  }

  private async tryCreate(info: LockInfo): Promise<boolean> {
    try {
      const fh = await open(this.path, 'wx', 0o600)
      try {
        await fh.writeFile(JSON.stringify(info))
      } finally {
        await fh.close()
      }
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
      throw err
    }
  }

  private async acquire(op: string): Promise<LockInfo> {
    const timeoutMs = this.opts.timeoutMs ?? 30 * 60_000
    const pollMs = this.opts.pollMs ?? 250
    const deadline = Date.now() + timeoutMs
    const info: LockInfo = {
      pid: process.pid,
      host: hostname(),
      nonce: randomBytes(16).toString('hex'),
      op,
      startedAt: new Date().toISOString(),
      heartbeatAt: Date.now(),
    }
    let unreadableSince: number | null = null
    for (;;) {
      info.heartbeatAt = Date.now()
      if (await this.tryCreate(info)) return info
      const other = await this.read()
      if (!other) {
        // Being written right now, or garbage: give a writer a moment before judging it.
        unreadableSince ??= Date.now()
        if (Date.now() - unreadableSince > Math.max(5_000, pollMs * 8)) await this.evict(null)
      } else {
        unreadableSince = null
        if (await this.abandoned(other)) await this.evict(other.nonce)
      }
      if (Date.now() >= deadline) {
        const cur = await this.read()
        throw new VaultUserError(
          `another dsh-vault operation is running${cur ? ` (${cur.op}, pid ${cur.pid}, since ${cur.startedAt})` : ''}; try again when it finishes`,
          409,
          'VAULT_BUSY',
        )
      }
      await new Promise((r) => setTimeout(r, pollMs))
    }
  }

  /** Owner provably gone: same host and dead pid, or no heartbeat for staleMs. A live same-host owner is never evicted. */
  async abandoned(info: LockInfo): Promise<boolean> {
    if (info.host === hostname()) return !alive(info.pid)
    const staleMs = this.opts.staleMs ?? 10 * 60_000
    const mtime = await stat(this.path).then((s) => s.mtimeMs, () => 0)
    return Date.now() - Math.max(Number(info.heartbeatAt) || 0, mtime) > staleMs
  }

  /**
   * Move the lock aside only if it is still the one we judged (same nonce); the rename is
   * atomic, so of two contenders only one moves it, and a fresh lock is never removed.
   */
  private async evict(expectedNonce: string | null): Promise<void> {
    const tomb = `${this.path}.${randomBytes(6).toString('hex')}.stale`
    try {
      await rename(this.path, tomb)
    } catch {
      return
    }
    let moved: LockInfo | null = null
    try {
      moved = JSON.parse(await readFile(tomb, 'utf8')) as LockInfo
    } catch {
      moved = null
    }
    const matches = expectedNonce === null ? moved === null : moved?.nonce === expectedNonce
    if (!matches) {
      // We raced and moved someone's fresh lock: put it back unless a new one already exists.
      try {
        const fh = await open(this.path, 'wx', 0o600)
        try {
          await fh.writeFile(await readFile(tomb))
        } finally {
          await fh.close()
        }
      } catch {
        // a newer lock exists; leave it
      }
    }
    await unlink(tomb).catch(() => {})
  }

  /** Heartbeat = file mtime (touching is atomic; the owner record itself is never rewritten). */
  private async heartbeat(mine: LockInfo): Promise<void> {
    const cur = await this.read()
    if (cur?.nonce !== mine.nonce) return
    const now = new Date()
    await utimes(this.path, now, now).catch(() => {})
  }

  /** Remove the lock only if it is still ours (compare, then rename-to-tombstone, then re-check). */
  private async release(mine: LockInfo): Promise<void> {
    const cur = await this.read()
    if (cur?.nonce !== mine.nonce) return
    const tomb = `${this.path}.${mine.nonce}.release`
    try {
      await rename(this.path, tomb)
    } catch {
      return
    }
    let moved: LockInfo | null = null
    try {
      moved = JSON.parse(await readFile(tomb, 'utf8')) as LockInfo
    } catch {
      moved = null
    }
    if (moved && moved.nonce !== mine.nonce) {
      // Not ours after all (taken over between read and rename): restore it.
      try {
        const fh = await open(this.path, 'wx', 0o600)
        try {
          await fh.writeFile(JSON.stringify(moved))
        } finally {
          await fh.close()
        }
      } catch {
        // a newer lock exists
      }
    }
    await unlink(tomb).catch(() => {})
  }
}
