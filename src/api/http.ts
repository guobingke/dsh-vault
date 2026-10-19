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

export function endpoint(
  spec: { path: string; methods: readonly HttpMethod[]; kind?: 'exact' | 'prefix' },
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): WebRoute {
  return {
    kind: spec.kind ?? 'exact',
    path: spec.path,
    async handler(req, res) {
      try {
        if (!isLoopback(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback only' })
          return
        }
        const method = (req.method ?? 'GET').toUpperCase() as HttpMethod
        if (!spec.methods.includes(method)) {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
          return
        }
        await handler(req, res)
      } catch (error) {
        writeError(res, error)
      }
    },
  }
}
