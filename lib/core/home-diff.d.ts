/**
 * Compare two dsh homes file by file (SHA-256), honoring the backup denylist, so a
 * restore can be verified byte-for-byte. Files dsh-vault rewrites on purpose during a
 * restore are reported separately as `expected`.
 */
export interface HomeDiffResult {
    homeA: string;
    homeB: string;
    identical: number;
    onlyInA: string[];
    onlyInB: string[];
    changed: string[];
    expected: Array<{
        path: string;
        why: string;
    }>;
    clean: boolean;
}
export declare function diffHomes(input: {
    homeA: string;
    homeB: string;
    agentsA?: string;
    agentsB?: string;
    includeSecrets?: boolean;
}): Promise<HomeDiffResult>;
export declare function formatHomeDiff(d: HomeDiffResult): string;
//# sourceMappingURL=home-diff.d.ts.map