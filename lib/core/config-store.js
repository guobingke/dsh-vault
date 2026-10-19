import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_RETENTION } from './retention.js';
import { vaultConfigPath, vaultTargetsPath } from './paths.js';
export const DEFAULT_SCHEDULE = {
    enabled: false,
    intervalMinutes: 1440,
    targetId: 'local-default',
    encrypt: false,
    includeSecrets: false,
    retention: { ...DEFAULT_RETENTION },
};
export const DEFAULT_SETTINGS = {
    retention: { ...DEFAULT_RETENTION },
    schedule: { ...DEFAULT_SCHEDULE },
    preferredKdf: 'scrypt',
    pluginCopies: { enabled: true, exclude: [] },
    pluginRestoreOrder: 'source-first',
};
export async function readJsonFile(path, fallback) {
    try {
        const raw = await readFile(path, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
export async function writeJsonFile(path, value) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
export async function loadSettings(dataDir) {
    const stored = await readJsonFile(vaultConfigPath(dataDir), {});
    return {
        ...DEFAULT_SETTINGS,
        ...stored,
        retention: { ...DEFAULT_RETENTION, ...stored.retention },
        pluginCopies: { enabled: stored.pluginCopies?.enabled !== false, exclude: Array.isArray(stored.pluginCopies?.exclude) ? stored.pluginCopies.exclude.filter((x) => typeof x === 'string') : [] },
        pluginRestoreOrder: stored.pluginRestoreOrder === 'copy-first' ? 'copy-first' : 'source-first',
        schedule: { ...DEFAULT_SCHEDULE, ...stored.schedule, retention: { ...DEFAULT_RETENTION, ...stored.schedule?.retention } },
    };
}
export async function saveSettings(dataDir, settings) {
    await writeJsonFile(vaultConfigPath(dataDir), settings);
}
export async function loadTargets(dataDir) {
    return readJsonFile(vaultTargetsPath(dataDir), []);
}
export async function saveTargets(dataDir, targets) {
    // Strip inline tokens/secrets from persisted GitHub/WebDAV/S3 where possible? We persist what the user configured;
    // file mode is 0600. Never log these values.
    await writeJsonFile(vaultTargetsPath(dataDir), targets);
}
export function defaultLocalTarget(directory) {
    return {
        kind: 'local',
        id: 'local-default',
        label: 'Local folder',
        directory,
        encryptByDefault: false,
    };
}
//# sourceMappingURL=config-store.js.map