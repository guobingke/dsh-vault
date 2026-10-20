import type { VaultService } from '../core/vault-service.js';
import { type RouteGuard, type WebRoute } from './http.js';
import type { JobState } from '../core/progress.js';
/** H-04: API responses never carry a full manifest or credential-looking strings. */
export declare function publicResult<T>(result: T): T;
export declare function publicJob(job: JobState | null): JobState | null;
export declare const API_PREFIX = "/api/dsh-vault";
export declare function buildVaultRoutes(service: VaultService, guard?: RouteGuard): WebRoute[];
export declare function registerVaultRoutes(webServer: {
    register: (route: WebRoute) => (() => void) | void;
}, service: VaultService, guard?: RouteGuard): () => void;
//# sourceMappingURL=routes.d.ts.map