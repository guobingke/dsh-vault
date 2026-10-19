/**
 * Exit code for `dsh-vault restore`. Files may have been applied while one or
 * more plugins failed to install; that must not look like success to scripts.
 */
export declare function restoreExitCode(result: {
    ok?: boolean;
}): number;
export declare function restoreFailureSummary(result: {
    ok?: boolean;
    pluginResults?: Array<{
        name: string;
        profile?: string;
        status: string;
    }>;
}): string;
//# sourceMappingURL=exit.d.ts.map