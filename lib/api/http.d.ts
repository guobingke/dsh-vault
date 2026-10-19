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
export declare function endpoint(spec: {
    path: string;
    methods: readonly HttpMethod[];
    kind?: 'exact' | 'prefix';
}, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): WebRoute;
//# sourceMappingURL=http.d.ts.map