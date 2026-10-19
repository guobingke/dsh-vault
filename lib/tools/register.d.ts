import type { VaultService } from '../core/vault-service.js';
/** Minimal tool definition shape compatible with @deepseek-ai/dsh-tools defineTool. */
export interface VaultToolDef {
    name: string;
    description: string;
    parameters: Record<string, {
        type: string;
        required?: boolean;
        description?: string;
        enum?: string[];
    }>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}
export declare function buildVaultTools(service: VaultService): VaultToolDef[];
export declare function registerVaultTools(tools: {
    register: (tool: unknown) => unknown;
}, service: VaultService, defineTool: (def: VaultToolDef) => unknown): void;
//# sourceMappingURL=register.d.ts.map