/**
 * User-correctable vault errors. Mapped to HTTP 4xx by the API layer.
 * Prefer this over bare `Error` for validation, missing resources, and remote auth failures.
 */
export declare class VaultUserError extends Error {
    readonly status: number;
    readonly code?: string;
    constructor(message: string, status?: number, code?: string);
}
/** Map a thrown value to a VaultUserError when it looks like a client/config/auth problem. */
export declare function asVaultUserError(error: unknown): VaultUserError | null;
//# sourceMappingURL=errors.d.ts.map