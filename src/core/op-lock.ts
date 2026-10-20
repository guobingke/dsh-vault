/**
 * One writer at a time (M-02): an in-process queue plus a cross-process lock file in the
 * vault data dir, so the web UI, scheduled backups, model tools and the CLI never pack,
 * restore or install plugins concurrently against the same DSH_HOME.
 */
import { open, readFile, stat, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { VaultUserError } from './errors.js'

export interface LockInfo {
  pid: number
  host: string
  op: string
  startedAt: string
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export class OperationLock {
  private tail: Promise<unknown> = Promise.resolve()
  private holder: string | null = null

  constructor(
    private readonly dir: string,
    private readonly opts: { timeoutMs?: number; staleMs?: number; pollMs?: number } = {},
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
      await this.acquireFile(op)
      this.holder = op
      try {
        return await fn()
      } finally {
        this.holder = null
        await unlink(this.path).catch(() => {})
      }
    })
    this.tail = next.catch(() => {})
    return next
  }

  private async acquireFile(op: string): Promise<void> {
    const timeoutMs = this.opts.timeoutMs ?? 30 * 60_000
    const staleMs = this.opts.staleMs ?? 6 * 60 * 60_000
    const pollMs = this.opts.pollMs ?? 250
    const deadline = Date.now() + timeoutMs
    const info: LockInfo = { pid: process.pid, host: hostname(), op, startedAt: new Date().toISOString() }
    for (;;) {
      try {
        const fh = await open(this.path, 'wx', 0o600)
        try {
          await fh.writeFile(JSON.stringify(info))
        } finally {
          await fh.close()
        }
        return
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      }
      if (await this.isStale(staleMs)) {
        await unlink(this.path).catch(() => {})
        continue
      }
      if (Date.now() >= deadline) {
        const other = await this.read()
        throw new VaultUserError(
          `another dsh-vault operation is running${other ? ` (${other.op}, pid ${other.pid}, since ${other.startedAt})` : ''}; try again when it finishes`,
          409,
          'VAULT_BUSY',
        )
      }
      await new Promise((r) => setTimeout(r, pollMs))
    }
  }

  private async read(): Promise<LockInfo | null> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as LockInfo
    } catch {
      return null
    }
  }

  private async isStale(staleMs: number): Promise<boolean> {
    const info = await this.read()
    if (info && info.host === hostname() && typeof info.pid === 'number' && !alive(info.pid)) return true
    try {
      const st = await stat(this.path)
      return Date.now() - st.mtimeMs > staleMs
    } catch {
      return false
    }
  }
}
