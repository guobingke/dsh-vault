import type { IncomingMessage, ServerResponse } from 'node:http'
import { asVaultUserError, VaultUserError } from '../core/errors.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof ApiError) {
    writeJson(res, error.status, error.code ? { error: error.message, code: error.code } : { error: error.message })
    return
  }
  if (error instanceof VaultUserError) {
    writeJson(res, error.status, error.code ? { error: error.message, code: error.code } : { error: error.message })
    return
  }
  const mapped = asVaultUserError(error)
  if (mapped) {
    writeJson(res, mapped.status, mapped.code ? { error: mapped.message, code: mapped.code } : { error: mapped.message })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeJson(res, 500, { error: message })
}

export async function readJsonBody<T = unknown>(req: IncomingMessage, limit = 4 * 1024 * 1024): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > limit) throw new ApiError('request body too large', 413)
    chunks.push(buf)
  }
  if (chunks.length === 0) return {} as T
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw new ApiError('invalid JSON body', 400)
  }
}

export function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

/**
 * Authenticates one request. Returns undefined to admit, or an HTTP status (401/403) to reject.
 * In the host this is dsh's own browser-session check (`connection.requestRejection`):
 * Host/Origin fence + the HttpOnly SameSite=Strict `dsh-auth-*` session cookie.
 */
export type RequestAuthorizer = (req: IncomingMessage) => number | undefined | null | void

export interface RouteGuard {
  /** Session authenticator. Absent / null → every request is refused (fail closed). */
  authorize?: RequestAuthorizer | null
}

/** Header every dsh-vault UI request carries; a cross-origin page cannot send it without a CORS preflight (which we never grant). */
export const VAULT_REQUEST_HEADER = 'x-dsh-vault-request'

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name]
  if (Array.isArray(v)) return v[0]
  return typeof v === 'string' ? v : undefined
}

/** Parse a Host header ("127.0.0.1:4790", "[::1]:4790"); undefined when malformed. */
function parseHost(host: string | undefined): URL | undefined {
  if (!host || /[\s/@?#\\]/.test(host)) return undefined
  try {
    return new URL(`http://${host}`)
  } catch {
    return undefined
  }
}

/**
 * Transport-level checks shared by every /api/dsh-vault route (C-01).
 * Returns [status, message] when the request must be refused.
 */
export function rejectRequest(req: IncomingMessage, method: HttpMethod, guard: RouteGuard): [number, string] | undefined {
  if (!isLoopback(req)) return [403, 'forbidden: loopback only']
  // DNS rebinding: the Host must name loopback, not an attacker domain resolving to 127.0.0.1.
  const host = parseHost(header(req, 'host'))
  if (!host || !LOOPBACK_HOSTNAMES.has(host.hostname.toLowerCase())) return [403, 'forbidden: Host must be a loopback address']
  const site = header(req, 'sec-fetch-site')?.toLowerCase()
  if (site && site !== 'same-origin' && site !== 'none') return [403, 'forbidden: cross-site request']
  const origin = header(req, 'origin')
  if (origin !== undefined) {
    let ok = false
    try {
      ok = new URL(origin).host === host.host
    } catch {
      ok = false
    }
    if (!ok) return [403, 'forbidden: cross-origin request']
  }
  if (header(req, VAULT_REQUEST_HEADER) !== '1') return [403, `forbidden: missing ${VAULT_REQUEST_HEADER} header`]
  if (method !== 'GET') {
    const type = (header(req, 'content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (type !== 'application/json') return [415, 'content-type must be application/json']
  }
  if (!guard.authorize) return [503, 'dsh session authentication is unavailable on this host; the dsh-vault API is disabled']
  let status: number | undefined | null | void
  try {
    status = guard.authorize(req)
  } catch {
    status = 401
  }
  if (status === 401) return [401, 'unauthorized: sign in to dsh (open the launch URL) first']
  if (status === 403) return [403, 'forbidden']
  if (status === 503) return [503, 'dsh session authentication is unavailable on this host; the dsh-vault API is disabled']
  if (typeof status === 'number') return [401, 'unauthorized']
  return undefined
}

export function endpoint(
  spec: { path: string; methods: readonly HttpMethod[]; kind?: 'exact' | 'prefix' },
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  guard: RouteGuard = {},
): WebRoute {
  return {
    kind: spec.kind ?? 'exact',
    path: spec.path,
    async handler(req, res) {
      try {
        const method = (req.method ?? 'GET').toUpperCase() as HttpMethod
        if (!spec.methods.includes(method)) {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
          return
        }
        const rejection = rejectRequest(req, method, guard)
        if (rejection) {
          writeJson(res, rejection[0], { error: rejection[1], code: rejection[0] === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' })
          return
        }
        await handler(req, res)
      } catch (error) {
        writeError(res, error)
      }
    },
  }
}
