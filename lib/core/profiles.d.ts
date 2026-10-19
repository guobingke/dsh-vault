/** Reserved Electron Desktop profile name (application-owned). */
export declare const DESKTOP_PROFILE = "desktop";
/** Shipped browser GUI profile name (`dsh web`). */
export declare const WEB_PROFILE = "web";
/** GUI-facing profiles users typically install settings plugins into. */
export declare const GUI_PROFILES: readonly ["web", "desktop"];
export type GuiProfile = (typeof GUI_PROFILES)[number];
/**
 * Active profile of the running dsh Host.
 * dsh's shell-env injects `DSH_PROFILE` / `DSH_PROFILE_DIR` into the process
 * (verified in `@deepseek-ai/dsh-shell-env`). Desktop sets `DSH_PROFILE=desktop`.
 */
export declare function resolveActiveProfile(env?: NodeJS.ProcessEnv): string;
/** Absolute path of a profile directory under $DSH_HOME. */
export declare function resolveProfileDir(profile: string, dshHome?: string): string;
/** True when the profile directory has been initialized (has package.json). */
export declare function isProfileInitialized(profile: string, dshHome?: string): boolean;
/** GUI profiles that currently exist on disk. */
export declare function listInitializedGuiProfiles(dshHome?: string): GuiProfile[];
/**
 * User-facing install guidance for a profile.
 * Desktop cannot be initialized by npm `dsh`; the Electron app must create it first,
 * and only Desktop's bundled CLI (or in-app Plugins page) may mutate it when
 * `manageDesktopProfile` is enabled.
 */
export declare function installCommandForProfile(profile: string, packageSpec?: string): {
    profile: string;
    command: string;
    notes: string[];
};
/** Guidance for installing into every initialized GUI profile (web + desktop when present). */
export declare function multiProfileInstallPlan(packageSpec?: string, dshHome?: string): Array<ReturnType<typeof installCommandForProfile>>;
//# sourceMappingURL=profiles.d.ts.map