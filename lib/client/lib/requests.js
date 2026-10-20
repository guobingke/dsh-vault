export function buildRestoreRequest(s) {
    const approved = Object.entries(s.approvedSources).filter(([, v]) => v).map(([k]) => k);
    return {
        targetId: s.usingImport ? undefined : s.targetId,
        snapshotId: s.usingImport ? undefined : s.snapshotId,
        importPath: s.usingImport ? s.importPath.trim() : undefined,
        password: s.password || undefined,
        conflict: s.conflict,
        conflicts: s.conflicts,
        createRollbackSnapshot: s.rollback,
        reinstallPlugins: s.reinstall,
        includeSecrets: Boolean(s.secretsAvailable && s.withSecrets),
        // Only meaningful when plugins are reinstalled.
        approvedPluginSources: s.reinstall ? approved : [],
    };
}
//# sourceMappingURL=requests.js.map