import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { resolveDshHome } from './paths.js';
/** Reserved Electron Desktop profile name (application-owned). */
export const DESKTOP_PROFILE = 'desktop';
/** Shipped browser GUI profile name (`dsh web`). */
export const WEB_PROFILE = 'web';
/** GUI-facing profiles users typically install settings plugins into. */
export const GUI_PROFILES = [WEB_PROFILE, DESKTOP_PROFILE];
/**
 * Active profile of the running dsh Host.
 * dsh's shell-env injects `DSH_PROFILE` / `DSH_PROFILE_DIR` into the process
 * (verified in `@deepseek-ai/dsh-shell-env`). Desktop sets `DSH_PROFILE=desktop`.
 */
export function resolveActiveProfile(env = process.env) {
    const named = env.DSH_PROFILE?.trim();
    if (named)
        return named;
    const dir = env.DSH_PROFILE_DIR?.trim();
    if (dir) {
        // Normalize Windows separators so basename works on POSIX hosts too
        // (Desktop may inject `DSH_PROFILE_DIR` with `\` on Windows).
        const trimmed = dir.replace(/[\\/]+$/, '').replace(/\\/g, '/');
        const base = basename(trimmed);
        if (base)
            return base;
    }
    return WEB_PROFILE;
}
/** Absolute path of a profile directory under $DSH_HOME. */
export function resolveProfileDir(profile, dshHome) {
    return join(dshHome ?? resolveDshHome(), 'profiles', profile);
}
/** True when the profile directory has been initialized (has package.json). */
export function isProfileInitialized(profile, dshHome) {
    return existsSync(join(resolveProfileDir(profile, dshHome), 'package.json'));
}
/** GUI profiles that currently exist on disk. */
export function listInitializedGuiProfiles(dshHome) {
    const home = dshHome ?? resolveDshHome();
    return GUI_PROFILES.filter((p) => isProfileInitialized(p, home));
}
/**
 * User-facing install guidance for a profile.
 * Desktop cannot be initialized by npm `dsh`; the Electron app must create it first,
 * and only Desktop's bundled CLI (or in-app Plugins page) may mutate it when
 * `manageDesktopProfile` is enabled.
 */
export function installCommandForProfile(profile, packageSpec = 'dsh-vault') {
    if (profile === DESKTOP_PROFILE) {
        return {
            profile,
            command: `dsh plugin --profile desktop add ${packageSpec}`,
            notes: [
                'Launch DeepSeek Harness Desktop once so `$DSH_HOME/profiles/desktop` is created, then fully quit it.',
                'Run the command with Desktop\'s bundled `dsh` (Tray → Terminal, or the `dsh`/`dsh.cmd` next to the app). npm-global `dsh` refuses `--profile desktop`.',
                'Or install from Desktop → Plugins (same Web Plugin Manager) while Desktop is running.',
                'Reopen Desktop after installing so the bundle loads.',
            ],
        };
    }
    return {
        profile,
        command: `dsh plugin --profile ${profile} add ${packageSpec}`,
        notes: [
            `Installs into $DSH_HOME/profiles/${profile}. Restart \`dsh ${profile === WEB_PROFILE ? 'web' : `--profile ${profile}`}\` (or reopen the app) to load the bundle.`,
        ],
    };
}
/** Guidance for installing into every initialized GUI profile (web + desktop when present). */
export function multiProfileInstallPlan(packageSpec = 'dsh-vault', dshHome) {
    const initialized = listInitializedGuiProfiles(dshHome);
    const targets = initialized.length > 0 ? initialized : [WEB_PROFILE];
    // Always mention desktop when the directory exists OR as an optional second step.
    const plans = targets.map((p) => installCommandForProfile(p, packageSpec));
    if (!targets.includes(DESKTOP_PROFILE)) {
        plans.push(installCommandForProfile(DESKTOP_PROFILE, packageSpec));
    }
    return plans;
}
//# sourceMappingURL=profiles.js.map