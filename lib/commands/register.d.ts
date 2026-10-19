import type { VaultService } from '../core/vault-service.js';
/** Slash-command registration compatible with @deepseek-ai/dsh-commands when present. */
export interface SlashCommand {
    name: string;
    description: string;
    execute: (args: string) => Promise<string> | string;
}
export declare function buildVaultCommands(service: VaultService): SlashCommand[];
export declare function registerVaultCommands(commands: {
    register: (cmd: SlashCommand) => unknown;
}, service: VaultService): void;
//# sourceMappingURL=register.d.ts.map