import type { VaultService } from '../core/vault-service.js';
import { type WebRoute } from './http.js';
export declare const API_PREFIX = "/api/dsh-vault";
export declare function buildVaultRoutes(service: VaultService): WebRoute[];
export declare function registerVaultRoutes(webServer: {
    register: (route: WebRoute) => (() => void) | void;
}, service: VaultService): () => void;
//# sourceMappingURL=routes.d.ts.map