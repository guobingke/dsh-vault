import { isWorkspaceStatePath } from './home-scope.js';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveItemConflict, shouldApplyChange } from './conflict.js';
import { previewRestoreDiff, resolveLivePath } from './diff.js';
export async function applyRestore(input) {
    const preview = await previewRestoreDiff({
        manifest: input.manifest,
        dshHome: input.dshHome,
        agentsHome: input.agentsHome,
        conflict: input.conflict,
        conflicts: input.conflicts,
    });
    input.onProgress?.({ phase: 'apply', message: 'Applying files', percent: 10, total: preview.items.length });
    const applied = [];
    const skipped = [];
    let i = 0;
    for (const item of preview.items) {
        i++;
        const strategy = item.resolution
            ?? resolveItemConflict(item.path, input.conflict, input.conflicts);
        if (!shouldApplyChange(item.change, strategy)) {
            // remove / unchanged always skipped; change+keep-current skipped.
            // (Prune-on-remove is intentionally not implemented.)
            skipped.push(item.path);
            continue;
        }
        const meta = input.manifest.files.find((f) => f.path === item.path);
        if (meta?.secret && !input.includeSecrets && !input.manifest.includeSecrets) {
            skipped.push(item.path);
            continue;
        }
        if (isWorkspaceStatePath(item.path)) {
            skipped.push(item.path);
            continue;
        }
        const data = input.files.get(item.path);
        if (!data) {
            skipped.push(item.path);
            continue;
        }
        const abs = resolveLivePath(item.path, input.dshHome, input.agentsHome);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, data, { mode: meta?.secret ? 0o600 : 0o644 });
        applied.push(item.path);
        input.onProgress?.({
            phase: 'apply',
            message: `Wrote ${item.path}`,
            current: i,
            total: preview.items.length,
            percent: Math.round((i / Math.max(preview.items.length, 1)) * 80),
        });
    }
    return {
        snapshotId: input.manifest.id,
        applied,
        skipped,
        rollbackSnapshotId: input.rollbackSnapshotId,
        pluginsReinstalled: [],
        pluginsFailed: [],
        manualActions: preview.manualActions,
    };
}
export async function deletePathSafe(abs) {
    try {
        await unlink(abs);
    }
    catch {
        // ignore
    }
}
//# sourceMappingURL=restore-apply.js.map