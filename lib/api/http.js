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
export function endpoint(spec, handler) {
    return {
        kind: spec.kind ?? 'exact',
        path: spec.path,
        async handler(req, res) {
            try {
                if (!isLoopback(req)) {
                    writeJson(res, 403, { error: 'forbidden: loopback only' });
                    return;
                }
                const method = (req.method ?? 'GET').toUpperCase();
                if (!spec.methods.includes(method)) {
                    writeJson(res, 405, { error: `method not allowed: ${method}` });
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