/**
 * Expand user-facing path input for Windows / macOS / Linux.
 * Handles drive letters, backslashes, `%VAR%` / `$VAR`, and `~`.
 */
export declare function expandUserPath(input: string, env?: NodeJS.ProcessEnv): string;
/** True when a path looks like a Windows absolute path (even on POSIX hosts / in tests). */
export declare function looksLikeWindowsAbsPath(p: string): boolean;
//# sourceMappingURL=win-paths.d.ts.map