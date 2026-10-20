/** `dsh plugin --profile <p> add <spec>` for `dsh-vault setup`, through the shared safe runner (L-04). */
import { defaultRunCommand } from '../core/plugin-install.js';
export type RunCommand = typeof defaultRunCommand;
export declare function runDshPluginAdd(profile: string, packageSpec: string, dshHome?: string, opts?: {
    platform?: NodeJS.Platform;
    run?: RunCommand;
}): Promise<{
    ok: boolean;
    detail: string;
}>;
//# sourceMappingURL=dsh-add.d.ts.map