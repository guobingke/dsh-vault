import { asVaultUserError, VaultUserError } from '../core/errors.js';
export class ApiError extends Error {
    status;
    code;
    constructor(message, status = 500, code) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'ApiError';
    }
}
export function writeJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'referrer-policy': 'no-referrer',
        'cache-control': 'no-store',
    });
    res.end(payload);
}
export function writeError(res, error) {
    if (error instanceof ApiError) {
        writeJson(res, error.status, error.code ? { error: error.message, code: error.code } : { error: error.message });
        return;
    }
    if (error instanceof VaultUserError) {
        writeJson(res, error.status, error.code ? { error: error.message, code: error.code } : { error: error.message });
        return;
    }
    const mapped = asVaultUserError(error);
    if (mapped) {
        writeJson(res, mapped.status, mapped.code ? { error: mapped.message, code: mapped.code } : { error: mapped.message });
        return;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeJson(res, 500, { error: message });
}
export async function readJsonBody(req, limit = 4 * 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buf.length;
        if (size > limit)
            throw new ApiError('request body too large', 413);
        chunks.push(buf);
    }
    if (chunks.length === 0)
        return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new ApiError('invalid JSON body', 400);
    }
}
export function isLoopback(req) {
    const addr = req.socket.remoteAddress ?? '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
/** Header every dsh-vault UI request carries; a cross-origin page cannot send it without a CORS preflight (which we never grant). */
export const VAULT_REQUEST_HEADER = 'x-dsh-vault-request';
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
function header(req, name) {
    const v = req.headers[name];
    if (Array.isArray(v))
        return v[0];
    return typeof v === 'string' ? v : undefined;
}
/** Parse a Host header ("127.0.0.1:4790", "[::1]:4790"); undefined when malformed. */
function parseHost(host) {
    if (!host || /[\s/@?#\\]/.test(host))
        return undefined;
    try {
        return new URL(`http://${host}`);
    }
    catch {
        return undefined;
    }
}
/**
 * Transport-level checks shared by every /api/dsh-vault route (C-01).
 * Returns [status, message] when the request must be refused.
 */
export function rejectRequest(req, method, guard) {
    if (!isLoopback(req))
        return [403, 'forbidden: loopback only'];
    // DNS rebinding: the Host must name loopback, not an attacker domain resolving to 127.0.0.1.
    const host = parseHost(header(req, 'host'));
    if (!host || !LOOPBACK_HOSTNAMES.has(host.hostname.toLowerCase()))
        return [403, 'forbidden: Host must be a loopback address'];
    const site = header(req, 'sec-fetch-site')?.toLowerCase();
    if (site && site !== 'same-origin' && site !== 'none')
        return [403, 'forbidden: cross-site request'];
    const origin = header(req, 'origin');
    if (origin !== undefined) {
        let ok = false;
        try {
            ok = new URL(origin).host === host.host;
        }
        catch {
            ok = false;
        }
        if (!ok)
            return [403, 'forbidden: cross-origin request'];
    }
    if (header(req, VAULT_REQUEST_HEADER) !== '1')
        return [403, `forbidden: missing ${VAULT_REQUEST_HEADER} header`];
    if (method !== 'GET') {
        const type = (header(req, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (type !== 'application/json')
            return [415, 'content-type must be application/json'];
    }
    if (!guard.authorize)
        return [503, 'dsh session authentication is unavailable on this host; the dsh-vault API is disabled'];
    let status;
    try {
        status = guard.authorize(req);
    }
    catch {
        status = 401;
    }
    if (status === 401)
        return [401, 'unauthorized: sign in to dsh (open the launch URL) first'];
    if (status === 403)
        return [403, 'forbidden'];
    if (status === 503)
        return [503, 'dsh session authentication is unavailable on this host; the dsh-vault API is disabled'];
    if (typeof status === 'number')
        return [401, 'unauthorized'];
    return undefined;
}
export function endpoint(spec, handler, guard = {}) {
    return {
        kind: spec.kind ?? 'exact',
        path: spec.path,
        async handler(req, res) {
            try {
                const method = (req.method ?? 'GET').toUpperCase();
                if (!spec.methods.includes(method)) {
                    writeJson(res, 405, { error: `method not allowed: ${method}` });
                    return;
                }
                const rejection = rejectRequest(req, method, guard);
                if (rejection) {
                    writeJson(res, rejection[0], { error: rejection[1], code: rejection[0] === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' });
                    return;
                }
                await handler(req, res);
            }
            catch (error) {
                writeError(res, error);
            }
        },
    };
}
//# sourceMappingURL=http.js.map