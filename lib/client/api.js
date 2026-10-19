const BASE = '/api/dsh-vault';
export class VaultApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'VaultApiError';
    }
}
async function request(path, init) {
    const { acceptConflictBody, ...fetchInit } = init ?? {};
    const res = await fetch(`${BASE}${path}`, {
        ...fetchInit,
        headers: {
            accept: 'application/json',
            ...(fetchInit.body ? { 'content-type': 'application/json' } : {}),
            ...fetchInit.headers,
        },
    });
    const text = await res.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    }
    catch {
        throw new VaultApiError(text || `HTTP ${res.status}`, res.status);
    }
    // Restore returns 409 with a full RestoreResult when plugins failed.
    if (res.status === 409 && acceptConflictBody && body && typeof body === 'object' && 'snapshotId' in body) {
        return body;
    }
    if (!res.ok) {
        const msg = body && typeof body === 'object' && 'error' in body
            ? String(body.error)
            : `HTTP ${res.status}`;
        throw new VaultApiError(msg, res.status);
    }
    return body;
}
function hasConflicts(conflicts) {
    return Boolean(conflicts) && Object.keys(conflicts).length > 0;
}
export class VaultApi {
    startBackupJob(body) {
        return request('/jobs/backup', { method: 'POST', body: JSON.stringify(body) });
    }
    startRestoreJob(body) {
        return request('/jobs/restore', { method: 'POST', body: JSON.stringify(body) });
    }
    startRetryPluginsJob(plugins) {
        return request('/jobs/retry-plugins', { method: 'POST', body: JSON.stringify(plugins ? { plugins } : {}) });
    }
    /** A job by id, or the running / most recent one. */
    getJob(id) {
        return request(id ? `/jobs?id=${encodeURIComponent(id)}` : '/jobs');
    }
    listPlugins(checkRegistry = true) {
        return request(`/plugins?registry=${checkRegistry ? '1' : '0'}`);
    }
    status() {
        return request('/status');
    }
    getSettings() {
        return request('/settings');
    }
    updateSettings(patch) {
        return request('/settings', { method: 'PUT', body: JSON.stringify(patch) });
    }
    listTargets() {
        return request('/targets');
    }
    upsertTarget(target) {
        return request('/targets', { method: 'POST', body: JSON.stringify(target) });
    }
    deleteTarget(id) {
        return request('/targets/delete', { method: 'POST', body: JSON.stringify({ id }) });
    }
    backup(body) {
        return request('/backup', { method: 'POST', body: JSON.stringify(body) });
    }
    listFs(path) {
        return request(`/fs/list?path=${encodeURIComponent(path)}`);
    }
    mkdir(path, name) {
        return request('/fs/mkdir', { method: 'POST', body: JSON.stringify({ path, name }) });
    }
    pickDirectory() {
        return request('/fs/pick-directory', { method: 'POST', body: '{}' });
    }
    listSnapshots(targetId) {
        const q = targetId ? `?targetId=${encodeURIComponent(targetId)}` : '';
        return request(`/snapshots${q}`);
    }
    deleteSnapshot(targetId, snapshotId) {
        return request('/snapshots/delete', { method: 'POST', body: JSON.stringify({ targetId, snapshotId }) });
    }
    verify(targetId, snapshotId, password) {
        return request('/verify', { method: 'POST', body: JSON.stringify({ targetId, snapshotId, password }) });
    }
    /**
     * Preview a restore diff. When `conflict` is set, every item in the response
     * carries a `resolution` for that path (global default + optional overrides).
     */
    previewRestore(targetId, snapshotId, password, conflict, conflicts, importPath) {
        return request('/restore/preview', {
            method: 'POST',
            body: JSON.stringify({
                targetId,
                snapshotId,
                importPath,
                password,
                ...(conflict ? { conflict } : {}),
                ...(hasConflicts(conflicts) ? { conflicts } : {}),
            }),
        });
    }
    restore(body) {
        return request('/restore', { method: 'POST', body: JSON.stringify(body), acceptConflictBody: true });
    }
    /** Re-attempt only the given failed plugins (or all failed ones of the last restore). */
    retryPlugins(plugins) {
        return request('/restore/retry-plugins', { method: 'POST', body: JSON.stringify(plugins ? { plugins } : {}), acceptConflictBody: true });
    }
    getSchedule() {
        return request('/schedule');
    }
    updateSchedule(patch) {
        return request('/schedule', { method: 'PUT', body: JSON.stringify(patch) });
    }
    runSchedule() {
        return request('/schedule/run', { method: 'POST', body: '{}' });
    }
}
//# sourceMappingURL=api.js.map