/** `dsh plugin --profile <p> add <spec>` for `dsh-vault setup`, through the shared safe runner (L-04). */
import { defaultRunCommand, isShellSafeArg } from '../core/plugin-install.js';
export async function runDshPluginAdd(profile, packageSpec, dshHome, opts = {}) {
    const args = ['plugin', '--profile', profile, 'add', packageSpec];
    // On Windows `dsh` is a .cmd shim run through cmd.exe: refuse metacharacters up front
    // (the shared runner checks again, and quotes arguments with spaces).
    if ((opts.platform ?? process.platform) === 'win32') {
        const bad = args.find((a) => !isShellSafeArg(a));
        if (bad !== undefined)
            return { ok: false, detail: `refusing to run through cmd.exe: unsafe argument ${JSON.stringify(bad)}` };
    }
    const run = opts.run ?? defaultRunCommand;
    // Honor --home: the child dsh must install into the same DSH_HOME.
    const r = await run('dsh', args, { env: dshHome ? { ...process.env, DSH_HOME: dshHome } : process.env });
    return { ok: r.ok, detail: r.detail.slice(0, 1200) };
}
//# sourceMappingURL=dsh-add.js.map