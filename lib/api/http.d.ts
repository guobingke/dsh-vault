import type { IncomingMessage, ServerResponse } from 'node:http';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export interface WebRoute {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}
export declare class ApiError extends Error {
    readonly status: number;
    readonly code?: string | undefined;
    constructor(message: string, status?: number, code?: string | undefined);
}
export declare function writeJson(res: ServerResponse, status: number, body: unknown): void;
export declare function writeError(res: ServerResponse, error: unknown): void;
export declare function readJsonBody<T = unknown>(req: IncomingMessage, limit?: number): Promise<T>;
export declare function isLoopback(req: IncomingMessage): boolean;
/**
 * Authenticates one request. Returns undefined to admit, or an HTTP status (401/403) to reject.
 * In the host this is dsh's own browser-session check (`connection.requestRejection`):
 * Host/Origin fence + the HttpOnly SameSite=Strict `dsh-auth-*` session cookie.
 */
export type RequestAuthorizer = (req: IncomingMessage) => number | undefined | null | void;
export interface RouteGuard {
    /** Session authenticator. Absent / null → every request is refused (fail closed). */
    authorize?: RequestAuthorizer | null;
}
/** Header every dsh-vault UI request carries; a cross-origin page cannot send it without a CORS preflight (which we never grant). */
export declare const VAULT_REQUEST_HEADER = "x-dsh-vault-request";
/**
 * Transport-level checks shared by every /api/dsh-vault route (C-01).
 * Returns [status, message] when the request must be refused.
 */
export declare function rejectRequest(req: IncomingMessage, method: HttpMethod, guard: RouteGuard): [number, string] | undefined;
export declare function endpoint(spec: {
    path: string;
    methods: readonly HttpMethod[];
    kind?: 'exact' | 'prefix';
}, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>, guard?: RouteGuard): WebRoute;
//# sourceMappingURL=http.d.ts.map