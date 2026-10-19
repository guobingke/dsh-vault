export const DEFAULT_RETENTION = { keepLast: 10 };
/** Return snapshot ids that should be deleted to satisfy keep-last-N. */
export function snapshotsToDelete(snapshots, policy) {
    const keep = Math.max(0, Math.floor(policy.keepLast));
    if (keep === 0)
        return snapshots.map((s) => s.id);
    const sorted = [...snapshots].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return sorted.slice(keep).map((s) => s.id);
}
//# sourceMappingURL=retention.js.map