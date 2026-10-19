/**
 * User-correctable vault errors. Mapped to HTTP 4xx by the API layer.
 * Prefer this over bare `Error` for validation, missing resources, and remote auth failures.
 */
export class VaultUserError extends Error {
    status;
    code;
    constructor(message, status = 400, code) {
        super(message);
        this.name = 'VaultUserError';
        this.status = status;
        this.code = code;
    }
}
/** Map a thrown value to a VaultUserError when it looks like a client/config/auth problem. */
export function asVaultUserError(error) {
    if (error instanceof VaultUserError)
        return error;
    if (!(error instanceof Error))
        return null;
    if (error.name === 'VaultDecryptError') {
        return new VaultUserError(error.message, 400, error.code);
    }
    const message = error.message;
    if (message.includes('secrets may only be included when encryption is enabled')) {
        return new VaultUserError(message, 400, 'SECRETS_REQUIRE_ENCRYPT');
    }
    if (/^password required/i.test(message) || /password is required/i.test(message)) {
        return new VaultUserError(message, 400, 'PASSWORD_REQUIRED');
    }
    if (/storage target not found/i.test(message)) {
        return new VaultUserError(message, 404, 'TARGET_NOT_FOUND');
    }
    if (/snapshot not found/i.test(message)) {
        return new VaultUserError(message, 404, 'SNAPSHOT_NOT_FOUND');
    }
    if (/GitHub token not available/i.test(message)) {
        return new VaultUserError(message, 400, 'BAD_CONFIG');
    }
    if (/unknown storage kind/i.test(message) || /id and kind are required/i.test(message)) {
        return new VaultUserError(message, 400, 'BAD_CONFIG');
    }
    const statusMatch = message.match(/\b(401|403|404)\b/);
    if (statusMatch) {
        const status = Number(statusMatch[1]);
        const code = status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'NOT_FOUND';
        return new VaultUserError(message, status, code);
    }
    if (/^conflicts /i.test(message) || /^invalid conflict/i.test(message)) {
        return new VaultUserError(message, 400, 'BAD_REQUEST');
    }
    return null;
}
//# sourceMappingURL=errors.js.map