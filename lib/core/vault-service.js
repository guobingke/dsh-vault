import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { collectBackupFiles, extractPluginsFromProfilePackage } from './collect.js';
import { listPluginDataEntries } from './home-scope.js';
import { JobRegistry } from './progress.js';
import { listDetectedPlugins, npmRegistryIntegrity, npmRegistryLookup, pluginKey, registryStatuses } from './plugin-copies.js';
import { normalizeConflicts, resolveItemConflict, shouldApplyChange } from './conflict.js';
import { DEFAULT_SETTINGS, defaultLocalTarget, loadSettings, loadTargets, saveSettings, saveTargets, } from './config-store.js';
import { previewRestoreDiff } from './diff.js';
import { VaultUserError } from './errors.js';
import { createDirectory, isSnapshotArchiveName, listDirectory } from './fs-browse.js';
import { resolveAgentsHome, resolveDshHome, isSecretRelPath, vaultDataDir, vaultRollbackDir, vaultTempDir, } from './paths.js';
import { DESKTOP_PROFILE, listInitializedGuiProfiles, multiProfileInstallPlan, resolveActiveProfile, WEB_PROFILE, } from './profiles.js';
import { reinstallMissingPlugins, } from './plugin-install.js';
import { snapshotsToDelete } from './retention.js';
import { applyRestore } from './restore-apply.js';
import { captureSelfEntries, reapplySelfEntries } from './self-entry.js';
import { packSnapshot, unpackSnapshot } from './snapshot-io.js';
import { maskTargetSecrets, mergeTargetSecrets } from './target-secrets.js';
import { expandUserPath } from './win-paths.js';
import { ARCHIVE_EXTENSION, ENCRYPTED_EXTENSION } from './types.js';
import { LocalStorageAdapter } from '../storage/local.js';
import { StorageRegistry } from '../storage/index.js';
export class VaultService {
    options;
    dshHome;
    agentsHome;
    dataDir;
    /** Profile this Host process is running as (`web`, `desktop`, …). */
    activeProfile;
    settings = DEFAULT_SETTINGS;
    /** Background backup / restore jobs with real progress (polled by the UI). */
    jobs = new JobRegistry();
    registry;
    rollbackAdapter = null;
    scheduleTimer = null;
    dshVersion;
    pluginManager;
    pnpmCommand;
    pnpm;
    preferredRegistry;
    pickDirectoryFn;
    runCommand;
    constructor(options = {}) {
        this.options = options;
        this.dshHome = options.dshHome ?? resolveDshHome();
        this.agentsHome = options.agentsHome ?? resolveAgentsHome();
        this.dataDir = vaultDataDir(this.dshHome, options.dataDir);
        this.activeProfile = options.activeProfile ?? resolveActiveProfile();
        this.dshVersion = options.dshVersion;
        this.registry = new StorageRegistry([], { resolveSecret: options.resolveSecret });
        this.pluginManager = options.pluginManager ?? null;
        this.pnpmCommand = options.pnpmCommand;
        this.pnpm = options.pnpm;
        this.preferredRegistry = options.preferredRegistry;
        this.pickDirectoryFn = options.pickDirectory;
        this.runCommand = options.runPluginInstall;
    }
    /** Hot-bind host services that may activate after the vault plugin. */
    setPluginManager(manager) {
        this.pluginManager = manager;
    }
    setPickDirectory(fn) {
        this.pickDirectoryFn = fn;
    }
    /** Whether dsh exposes a native OS folder chooser on this host. */
    hasNativePicker() {
        return Boolean(this.pickDirectoryFn);
    }
    async listFs(path) {
        return { ...(await listDirectory(path)), nativePicker: this.hasNativePicker() };
    }
    async createFsDirectory(parent, name) {
        return createDirectory(parent, name);
    }
    /**
     * Open dsh's native OS folder chooser. dsh's picker requires an AbortSignal
     * (it dereferences `signal.aborted`), so one is always passed.
     * Returns null when the user cancels; throws NO_NATIVE_PICKER when unavailable.
     */
    async pickDirectory(signal = new AbortController().signal) {
        if (!this.pickDirectoryFn) {
            throw new VaultUserError('native folder picker is not available on this host', 501, 'NO_NATIVE_PICKER');
        }
        return this.pickDirectoryFn(signal);
    }
    async init() {
        await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
        await mkdir(vaultTempDir(this.dataDir), { recursive: true, mode: 0o700 });
        await this.ensureRollbackDir();
        this.settings = await loadSettings(this.dataDir);
        let targets = await loadTargets(this.dataDir);
        // Drop a previously-persisted rollback target from user targets.json (now private).
        targets = targets.filter((t) => t.id !== ROLLBACK_TARGET_ID);
        if (targets.length === 0) {
            const localDir = join(this.dataDir, 'snapshots');
            targets = [defaultLocalTarget(localDir)];
            await saveTargets(this.dataDir, targets);
        }
        else {
            await saveTargets(this.dataDir, targets);
        }
        this.registry = new StorageRegistry(targets, { resolveSecret: this.options.resolveSecret });
        this.armSchedule();
    }
    getSettings() {
        return this.settings;
    }
    startBackupJob(req) {
        return this.jobs.start('backup', (onProgress) => this.backup(req, onProgress));
    }
    startRestoreJob(req) {
        return this.jobs.start('restore', (onProgress) => this.restore(req, onProgress));
    }
    startRetryPluginsJob(req = {}) {
        return this.jobs.start('retry-plugins', (onProgress) => this.retryFailedPlugins(req, onProgress));
    }
    registryLookup() {
        if (this.options.registryLookup !== undefined)
            return this.options.registryLookup;
        if (process.env.DSH_VAULT_NO_REGISTRY_CHECK === '1')
            return null;
        return npmRegistryLookup(this.preferredRegistry);
    }
    /** Effective no-copy list for a backup: request overrides, else persisted settings. */
    copyExcludeFor(req) {
        const enabled = req.bundlePluginCopies ?? this.settings.pluginCopies?.enabled ?? true;
        const exclude = req.pluginCopyExclude ?? this.settings.pluginCopies?.exclude ?? [];
        if (!enabled)
            return ['*'];
        return exclude;
    }
    /** Every plugin in every profile, with registry status and 「建议保存副本」 hints. */
    async listPlugins(opts = {}) {
        const lookup = opts.checkRegistry === false ? undefined : this.registryLookup() ?? undefined;
        const exclude = new Set(this.settings.pluginCopies?.exclude ?? []);
        const enabled = this.settings.pluginCopies?.enabled !== false;
        const plugins = (await listDetectedPlugins(this.dshHome, lookup)).map((p) => ({ ...p, copy: enabled && !exclude.has(p.key) }));
        return { plugins, settings: this.settings.pluginCopies, restoreOrder: this.settings.pluginRestoreOrder };
    }
    async updateSettings(patch) {
        this.settings = {
            ...this.settings,
            ...patch,
            retention: { ...this.settings.retention, ...patch.retention },
            pluginCopies: {
                enabled: (patch.pluginCopies?.enabled ?? this.settings.pluginCopies?.enabled) !== false,
                exclude: Array.isArray(patch.pluginCopies?.exclude) ? [...new Set(patch.pluginCopies.exclude.filter((x) => typeof x === 'string'))] : this.settings.pluginCopies?.exclude ?? [],
            },
            pluginRestoreOrder: (patch.pluginRestoreOrder ?? this.settings.pluginRestoreOrder) === 'copy-first' ? 'copy-first' : 'source-first',
            schedule: { ...this.settings.schedule, ...patch.schedule, retention: { ...this.settings.schedule.retention, ...patch.schedule?.retention } },
        };
        await saveSettings(this.dataDir, this.settings);
        this.armSchedule();
        return this.settings;
    }
    /** Stored targets with secrets masked for browser/API responses. */
    listTargets() {
        return this.registry.list().map(maskTargetSecrets);
    }
    /** Unmasked configs (internal / CLI that already has filesystem access). */
    listTargetsRaw() {
        return this.registry.list();
    }
    async upsertTarget(config) {
        if (config.id === ROLLBACK_TARGET_ID) {
            throw new VaultUserError('local-rollback is a reserved private target', 400, 'BAD_CONFIG');
        }
        const existing = this.registry.list().find((t) => t.id === config.id);
        const merged = mergeTargetSecrets(config, existing);
        this.registry.upsert(merged);
        const targets = this.registry.list();
        await saveTargets(this.dataDir, targets);
        return targets.map(maskTargetSecrets);
    }
    async removeTarget(id) {
        if (id === ROLLBACK_TARGET_ID) {
            throw new VaultUserError('local-rollback is a reserved private target', 400, 'BAD_CONFIG');
        }
        this.registry.remove(id);
        const targets = this.registry.list();
        await saveTargets(this.dataDir, targets);
        return targets.map(maskTargetSecrets);
    }
    async backup(req, onProgress) {
        const started = Date.now();
        const out = await this.backupInner(req, onProgress);
        out.durationMs = Date.now() - started;
        return out;
    }
    async backupInner(req, onProgress) {
        if (req.targetId === ROLLBACK_TARGET_ID) {
            throw new VaultUserError('cannot backup to the private rollback folder; use a normal storage target', 400, 'BAD_CONFIG');
        }
        const exportFile = req.exportFile?.trim() ? expandUserPath(req.exportFile.trim()) : undefined;
        const directory = req.directory?.trim() ? expandUserPath(req.directory.trim()) : undefined;
        if (!req.targetId && !exportFile && !directory) {
            throw new VaultUserError('targetId, directory, or exportFile is required', 400, 'BAD_CONFIG');
        }
        let encrypt = Boolean(req.encrypt);
        if (req.targetId) {
            const targetConfig = this.registry.list().find((t) => t.id === req.targetId);
            if (!targetConfig)
                throw new VaultUserError(`storage target not found: ${req.targetId}`, 404, 'TARGET_NOT_FOUND');
            encrypt = Boolean(req.encrypt ?? targetConfig.encryptByDefault);
        }
        const includeSecrets = Boolean(req.includeSecrets);
        if (includeSecrets && !encrypt) {
            throw new VaultUserError('secrets may only be included when encryption is enabled', 400, 'SECRETS_REQUIRE_ENCRYPT');
        }
        onProgress?.({ phase: 'collect', message: 'Collecting dsh setup', percent: 5 });
        const { files, plugins } = await collectBackupFiles({
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            includeSecrets,
            categories: req.categories,
            bundleLocalPlugins: req.bundleLocalPlugins,
            pluginCopyExclude: this.copyExcludeFor(req),
            onProgress,
        });
        // Mark copies whose exact version the registry no longer has: restore installs those from the copy directly.
        const lookup = this.registryLookup();
        const withCopy = plugins.filter((p) => p.fallbackBundle);
        if (lookup && withCopy.length) {
            onProgress?.({ phase: 'copies', message: 'Checking plugin versions on the registry', item: 'registry' });
            const st = await registryStatuses(withCopy, lookup);
            for (const p of withCopy)
                if (st.get(pluginKey(p.profile, p.name)) === 'missing')
                    p.registryMissing = true;
        }
        const packed = await packSnapshot({
            files,
            plugins,
            includeSecrets,
            encrypt,
            password: req.password,
            kdf: req.kdf ?? this.settings.preferredKdf,
            dshVersion: req.dshVersion ?? this.dshVersion,
            notes: req.notes,
            onProgress: onProgress
                ? (ev) => {
                    if (ev.phase === 'done')
                        return;
                    onProgress({ ...ev, fraction: ev.phase === 'pack' ? (ev.percent ?? 0) / 70 : 0.5 });
                }
                : undefined,
        });
        onProgress?.({ phase: 'upload', message: 'Saving snapshot', fraction: 0.1 });
        let targetId = req.targetId ?? (directory ? 'local-oneshot' : 'export-file');
        let remoteKey = packed.snapshotId;
        let exportPath;
        if (exportFile) {
            const ext = packed.encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION;
            const out = exportFile.toLowerCase().endsWith('.tar.gz') || exportFile.toLowerCase().endsWith('.dshvault')
                ? exportFile
                : `${exportFile}${ext}`;
            await mkdir(dirname(out), { recursive: true });
            await writeFile(out, packed.bytes, { mode: 0o600 });
            remoteKey = basename(out);
            exportPath = out;
            targetId = 'export-file';
        }
        else if (directory) {
            await mkdir(directory, { recursive: true });
            const adapter = new LocalStorageAdapter({
                kind: 'local',
                id: 'local-oneshot',
                label: 'One-shot folder',
                directory,
            });
            const put = await adapter.put(packed.snapshotId, packed.bytes);
            remoteKey = put.remoteKey;
            exportPath = join(directory, put.remoteKey);
            targetId = 'local-oneshot';
        }
        else if (req.targetId) {
            const adapter = this.adapterFor(req.targetId);
            const put = await adapter.put(packed.snapshotId, packed.bytes);
            remoteKey = put.remoteKey;
            await this.applyRetention(req.targetId);
            targetId = req.targetId;
        }
        onProgress?.({ phase: 'done', message: 'Backup complete', percent: 100 });
        return {
            snapshotId: packed.snapshotId,
            targetId,
            remoteKey,
            bytes: packed.bytes.length,
            encrypted: packed.encrypted,
            includeSecrets,
            manifest: packed.manifest,
            exportPath,
        };
    }
    async listSnapshots(targetId) {
        if (targetId === ROLLBACK_TARGET_ID) {
            return this.ensureRollbackAdapter().list();
        }
        const ids = targetId ? [targetId] : this.registry.list().map((t) => t.id);
        const all = [];
        if (targetId) {
            all.push(...(await this.adapterFor(targetId).list()));
        }
        else {
            // Listing everything: one unreachable remote (bad token, offline WebDAV/S3) must not
            // hide the other targets' snapshots or break the overview.
            const lists = await Promise.all(ids.map(async (id) => {
                try {
                    return await Promise.race([
                        this.adapterFor(id).list(),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000).unref?.()),
                    ]);
                }
                catch {
                    return [];
                }
            }));
            for (const l of lists)
                all.push(...l);
        }
        if (!targetId) {
            // Include private rollback snapshots when listing everything.
            all.push(...(await this.ensureRollbackAdapter().list()));
        }
        return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    async deleteSnapshot(targetId, snapshotId) {
        await this.adapterFor(targetId).delete(snapshotId);
    }
    async verify(targetId, snapshotId, password) {
        const bytes = await this.adapterFor(targetId).get(snapshotId);
        const unpacked = await unpackSnapshot(bytes, password);
        return { ok: true, manifestId: unpacked.manifest.id };
    }
    async previewRestore(req) {
        const { bytes } = await this.resolveSnapshotBytes(req);
        const unpacked = await unpackSnapshot(bytes, req.password);
        const conflicts = normalizeConflicts(req.conflicts);
        const { files: liveFiles } = await collectBackupFiles({
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            includeSecrets: unpacked.manifest.includeSecrets,
            bundleLocalPlugins: false,
        });
        return previewRestoreDiff({
            manifest: unpacked.manifest,
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            currentScopedPaths: liveFiles.map((f) => f.relPath),
            conflict: req.conflict,
            conflicts,
        });
    }
    async restore(req, onProgress) {
        const started = Date.now();
        const out = await this.restoreInner(req, onProgress);
        out.durationMs = Date.now() - started;
        return out;
    }
    async restoreInner(req, onProgress) {
        onProgress?.({ phase: 'prepare', message: 'Loading snapshot', fraction: 0.1 });
        const resolved = await this.resolveSnapshotBytes(req);
        const unpacked = await unpackSnapshot(resolved.bytes, req.password, (ev) => {
            if (ev.phase !== 'done')
                onProgress?.({ ...ev, phase: 'prepare', fraction: (ev.percent ?? 0) / 100 });
        });
        const rollbackProgress = onProgress
            ? (ev) => {
                if (ev.phase === 'done')
                    return;
                const frac = ev.phase === 'collect' && ev.total ? (ev.current ?? 0) / ev.total * 0.6 : 0.6 + 0.4 * ((ev.percent ?? 0) / 100);
                onProgress({ phase: 'rollback', message: 'Creating pre-restore rollback snapshot', fraction: frac, item: ev.item });
            }
            : undefined;
        const conflicts = normalizeConflicts(req.conflicts);
        const includeSecrets = req.includeSecrets ?? unpacked.manifest.includeSecrets;
        const snapshotId = unpacked.manifest.id;
        let rollbackSnapshotId;
        let rollbackTargetId;
        if (req.createRollbackSnapshot !== false) {
            const willTouchSecrets = await this.restoreWillApplySecrets(unpacked.manifest, req.conflict, conflicts, includeSecrets);
            onProgress?.({ phase: 'rollback', message: 'Creating pre-restore rollback snapshot', fraction: 0 });
            if (willTouchSecrets) {
                if (!req.password) {
                    throw new VaultUserError('password required to create an encrypted pre-restore rollback that includes credentials (reuse the restore password)', 400, 'PASSWORD_REQUIRED');
                }
                rollbackSnapshotId = await this.createPrivateRollbackSnapshot({
                    includeSecrets: true,
                    encrypt: true,
                    password: req.password,
                    notes: `pre-restore rollback for ${snapshotId}`,
                    onProgress: rollbackProgress,
                });
            }
            else {
                rollbackSnapshotId = await this.createPrivateRollbackSnapshot({
                    includeSecrets: false,
                    encrypt: false,
                    notes: `pre-restore rollback for ${snapshotId}`,
                    onProgress: rollbackProgress,
                });
            }
            rollbackTargetId = ROLLBACK_TARGET_ID;
        }
        const selfBefore = await captureSelfEntries(this.dshHome);
        const result = await applyRestore({
            manifest: unpacked.manifest,
            files: unpacked.files,
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            conflict: req.conflict,
            conflicts,
            includeSecrets,
            rollbackSnapshotId,
            onProgress,
        });
        result.rollbackTargetId = rollbackTargetId;
        // Keep this machine's own dsh-vault entry (its link: path), never machine 1's.
        await reapplySelfEntries(this.dshHome, selfBefore);
        if (req.reinstallPlugins !== false) {
            onProgress?.({ phase: 'reinstall', message: 'Installing plugins into profile', fraction: 0 });
            const records = req.pluginProfiles?.length
                ? unpacked.manifest.plugins.filter((p) => req.pluginProfiles.includes(p.profile ?? this.activeProfile))
                : unpacked.manifest.plugins;
            await this.installPlugins(records, result, undefined, req.pluginRestoreOrder, onProgress);
            await this.saveLastRestore({ snapshotId, plugins: unpacked.manifest.plugins, pluginResults: result.pluginResults ?? [] });
        }
        onProgress?.({ phase: 'verify', message: 'Verifying', fraction: 1 });
        this.finishPluginSummary(result);
        onProgress?.({ phase: 'done', message: result.ok ? 'Restore complete' : 'Restore incomplete (plugin failures)', percent: 100 });
        return result;
    }
    installDeps() {
        return {
            dshHome: this.dshHome,
            activeProfile: this.activeProfile,
            pluginManager: this.pluginManager,
            pnpmCommand: this.pnpmCommand,
            pnpm: this.pnpm,
            preferredRegistry: this.preferredRegistry,
            registryIntegrity: this.registryIntegrity(),
            runCommand: this.runCommand,
        };
    }
    registryIntegrity() {
        if (this.options.registryIntegrity !== undefined)
            return this.options.registryIntegrity;
        if (process.env.DSH_VAULT_NO_REGISTRY_CHECK === '1')
            return null;
        return npmRegistryIntegrity(this.preferredRegistry);
    }
    async installPlugins(records, result, only, order, onProgress) {
        const restoreOrder = order ?? this.settings.pluginRestoreOrder ?? 'source-first';
        const { results, restartRequired } = await reinstallMissingPlugins(records, this.installDeps(), { only, restoreOrder, onProgress });
        result.pluginResults = results;
        result.pluginsReinstalled = results.filter((r) => r.status === 'installed' || r.status === 'installed-from-backup').map((r) => r.name);
        result.pluginsFailed = results.filter((r) => r.status === 'failed').map((r) => r.name);
        result.restartRequired = restartRequired || results.some((r) => r.status === 'installed');
    }
    /** ok flag + the (deduplicated) manual actions that follow from plugin results. */
    finishPluginSummary(result) {
        if (result.restartRequired) {
            result.manualActions.push(this.activeProfile === DESKTOP_PROFILE
                ? 'Restart DeepSeek Harness Desktop so newly installed plugins load.'
                : 'Restart dsh web / the host so newly installed plugins load.');
        }
        result.ok = (result.pluginsFailed?.length ?? 0) === 0;
        if (!result.ok) {
            result.manualActions.push('Restore finished with plugin failures — not a full success. Fix the failed plugins and retry or install them from Desktop → Plugins.');
        }
        result.manualActions = [...new Set(result.manualActions)];
    }
    lastRestorePath() {
        return join(this.dataDir, 'last-restore.json');
    }
    async saveLastRestore(data) {
        try {
            await mkdir(this.dataDir, { recursive: true });
            // Logs can be long; a retry only needs the records and statuses.
            const slim = data.pluginResults.map(({ log: _log, ...row }) => row);
            await writeFile(this.lastRestorePath(), JSON.stringify({ ...data, pluginResults: slim, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
        }
        catch {
            // best effort
        }
    }
    async loadLastRestore() {
        try {
            return JSON.parse(await readFile(this.lastRestorePath(), 'utf8'));
        }
        catch {
            return null;
        }
    }
    /**
     * Re-attempt only the failed plugins of the last restore, without rewriting config.
     * Also works after a restore made by an older dsh-vault: plugin records then come
     * from the profile manifests on disk.
     */
    async retryFailedPlugins(req = {}, onProgress) {
        const last = await this.loadLastRestore();
        const records = [...(last?.plugins ?? [])];
        if (!records.length) {
            const profilesDir = join(this.dshHome, 'profiles');
            for (const profile of await listProfiles(profilesDir)) {
                try {
                    const text = await readFile(join(profilesDir, profile, 'package.json'), 'utf8');
                    records.push(...extractPluginsFromProfilePackage(text, profile));
                }
                catch {
                    // no manifest
                }
            }
        }
        const wanted = req.plugins?.length
            ? req.plugins
            : (last?.pluginResults ?? []).filter((r) => r.status === 'failed').map((r) => ({ name: r.name, profile: r.profile }));
        const only = wanted.length ? new Set(wanted.map((p) => `${p.profile}:${p.name}`)) : undefined;
        const result = {
            snapshotId: last?.snapshotId ?? '',
            applied: [],
            skipped: [],
            pluginsReinstalled: [],
            pluginsFailed: [],
            manualActions: [],
        };
        await this.installPlugins(records, result, only, undefined, onProgress);
        if (last) {
            // Merge into the saved results so a second retry still knows what is left.
            const rows = new Map(last.pluginResults.map((r) => [`${r.profile}:${r.name}`, r]));
            for (const r of result.pluginResults ?? [])
                rows.set(`${r.profile}:${r.name}`, r);
            await this.saveLastRestore({ snapshotId: last.snapshotId ?? '', plugins: last.plugins, pluginResults: [...rows.values()] });
        }
        this.finishPluginSummary(result);
        return result;
    }
    /** Load snapshot bytes from a configured target or an import path (file/folder). */
    async resolveSnapshotBytes(req) {
        if (req.importPath?.trim()) {
            const path = expandUserPath(req.importPath.trim());
            let info;
            try {
                info = await stat(path);
            }
            catch {
                throw new VaultUserError(`import path not found: ${path}`, 404, 'SNAPSHOT_NOT_FOUND');
            }
            if (info.isFile()) {
                if (!isSnapshotArchiveName(path)) {
                    throw new VaultUserError('import file must be a .tar.gz or .dshvault archive', 400, 'BAD_CONFIG');
                }
                const bytes = await readFile(path);
                return { bytes, targetId: 'import-file', snapshotId: req.snapshotId ?? basename(path).replace(/\.(tar\.gz|dshvault)$/i, '') };
            }
            if (info.isDirectory()) {
                const adapter = new LocalStorageAdapter({
                    kind: 'local',
                    id: 'import-folder',
                    label: 'Import folder',
                    directory: path,
                });
                const list = await adapter.list();
                const snapshotId = req.snapshotId ?? list[0]?.id;
                if (!snapshotId)
                    throw new VaultUserError(`no snapshots in folder: ${path}`, 404, 'SNAPSHOT_NOT_FOUND');
                const bytes = await adapter.get(snapshotId);
                return { bytes, targetId: 'import-folder', snapshotId };
            }
            throw new VaultUserError(`import path is neither file nor directory: ${path}`, 400, 'BAD_CONFIG');
        }
        if (!req.targetId || !req.snapshotId) {
            throw new VaultUserError('targetId+snapshotId or importPath is required', 400, 'BAD_CONFIG');
        }
        const bytes = await this.adapterFor(req.targetId).get(req.snapshotId);
        return { bytes, targetId: req.targetId, snapshotId: req.snapshotId };
    }
    getSchedule() {
        return this.settings.schedule;
    }
    async updateSchedule(patch) {
        const schedule = {
            ...this.settings.schedule,
            ...patch,
            retention: { ...this.settings.schedule.retention, ...patch.retention },
        };
        // Schedule retention applies to the schedule's target only; do not clobber
        // the global retention policy.
        await this.updateSettings({ schedule });
        return this.settings.schedule;
    }
    async runScheduledBackup(onProgress) {
        const schedule = this.settings.schedule;
        if (!schedule.enabled)
            return null;
        const result = await this.backup({
            targetId: schedule.targetId,
            encrypt: schedule.encrypt,
            includeSecrets: schedule.includeSecrets && schedule.encrypt,
            notes: 'scheduled backup',
        }, onProgress);
        const next = new Date(Date.now() + effectiveIntervalMs(schedule.intervalMinutes)).toISOString();
        await this.updateSchedule({ lastRunAt: new Date().toISOString(), nextRunAt: next });
        return result;
    }
    stopSchedule() {
        if (this.scheduleTimer) {
            clearTimeout(this.scheduleTimer);
            this.scheduleTimer = null;
        }
    }
    armSchedule() {
        this.stopSchedule();
        const schedule = this.settings.schedule;
        if (!schedule.enabled)
            return;
        // Honor a persisted nextRunAt so restarts don't keep pushing the run out;
        // overdue runs fire shortly after startup. Each run persists the next
        // nextRunAt via updateSchedule → updateSettings → armSchedule.
        const intervalMs = effectiveIntervalMs(schedule.intervalMinutes);
        const due = schedule.nextRunAt ? Date.parse(schedule.nextRunAt) : NaN;
        const delay = Number.isFinite(due)
            ? Math.min(Math.max(due - Date.now(), SCHEDULE_CATCHUP_DELAY_MS), intervalMs)
            : intervalMs;
        this.scheduleTimer = setTimeout(() => {
            this.scheduleTimer = null;
            void this.runScheduledBackup().catch(() => {
                // never log secrets; retry on the next interval
                this.armScheduleAfterFailure(intervalMs);
            });
        }, delay);
        // unref so CLI/tests can exit
        this.scheduleTimer.unref?.();
    }
    armScheduleAfterFailure(intervalMs) {
        if (this.scheduleTimer || !this.settings.schedule.enabled)
            return;
        this.scheduleTimer = setTimeout(() => {
            this.scheduleTimer = null;
            this.armSchedule();
        }, intervalMs);
        this.scheduleTimer.unref?.();
    }
    async applyRetention(targetId) {
        if (targetId === ROLLBACK_TARGET_ID)
            return;
        const policy = this.settings.schedule.targetId === targetId
            ? this.settings.schedule.retention
            : this.settings.retention;
        const list = await this.adapterFor(targetId).list();
        const toDelete = snapshotsToDelete(list, policy);
        for (const id of toDelete) {
            try {
                await this.adapterFor(targetId).delete(id);
            }
            catch {
                // ignore individual delete failures
            }
        }
    }
    /** Status summary for dashboard / tools. */
    async status() {
        const recentSnapshots = (await this.listSnapshots()).slice(0, 10);
        const surface = this.activeProfile === DESKTOP_PROFILE
            ? 'desktop'
            : this.activeProfile === WEB_PROFILE
                ? 'web'
                : 'other';
        return {
            dshHome: this.dshHome,
            dataDir: this.dataDir,
            activeProfile: this.activeProfile,
            guiProfiles: listInitializedGuiProfiles(this.dshHome),
            surface,
            installPlan: multiProfileInstallPlan('dsh-vault', this.dshHome),
            targets: this.listTargets(),
            settings: this.settings,
            recentSnapshots,
            pluginDataEntries: await listPluginDataEntries(this.dshHome),
        };
    }
    adapterFor(targetId) {
        if (targetId === ROLLBACK_TARGET_ID)
            return this.ensureRollbackAdapter();
        try {
            return this.registry.get(targetId);
        }
        catch {
            throw new VaultUserError(`storage target not found: ${targetId}`, 404, 'TARGET_NOT_FOUND');
        }
    }
    async ensureRollbackDir() {
        const dir = vaultRollbackDir(this.dataDir);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        try {
            await chmod(dir, 0o700);
        }
        catch {
            // Windows may ignore mode; best-effort.
        }
        return dir;
    }
    ensureRollbackAdapter() {
        if (!this.rollbackAdapter) {
            const directory = vaultRollbackDir(this.dataDir);
            this.rollbackAdapter = new LocalStorageAdapter({
                kind: 'local',
                id: ROLLBACK_TARGET_ID,
                label: 'Private rollback',
                directory,
            });
        }
        return this.rollbackAdapter;
    }
    /**
     * Write a pre-restore snapshot into the private 0700 rollback folder under DSH_HOME.
     * Never uses a user-configured local target (USB/sync folders).
     */
    async createPrivateRollbackSnapshot(input) {
        await this.ensureRollbackDir();
        if (input.includeSecrets && !input.encrypt) {
            throw new VaultUserError('rollback secrets require encryption', 400, 'SECRETS_REQUIRE_ENCRYPT');
        }
        if (input.encrypt && !input.password) {
            throw new VaultUserError('password required for encrypted rollback', 400, 'PASSWORD_REQUIRED');
        }
        const { files, plugins } = await collectBackupFiles({
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            includeSecrets: input.includeSecrets,
            bundleLocalPlugins: false,
            onProgress: input.onProgress,
        });
        const packed = await packSnapshot({
            files,
            plugins,
            includeSecrets: input.includeSecrets,
            encrypt: input.encrypt,
            password: input.password,
            kdf: this.settings.preferredKdf,
            dshVersion: this.dshVersion,
            notes: input.notes,
            onProgress: input.onProgress,
        });
        await this.ensureRollbackAdapter().put(packed.snapshotId, packed.bytes);
        return packed.snapshotId;
    }
    async restoreWillApplySecrets(manifest, conflict, conflicts, includeSecrets) {
        if (!includeSecrets && !manifest.includeSecrets)
            return false;
        const allowSecrets = includeSecrets || manifest.includeSecrets;
        if (!allowSecrets)
            return false;
        const preview = await previewRestoreDiff({
            manifest,
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            conflict,
            conflicts,
        });
        for (const item of preview.items) {
            const meta = manifest.files.find((f) => f.path === item.path);
            const secret = Boolean(meta?.secret) || isSecretRelPath(item.path);
            if (!secret)
                continue;
            const strategy = item.resolution ?? resolveItemConflict(item.path, conflict, conflicts);
            if (shouldApplyChange(item.change, strategy))
                return true;
        }
        return false;
    }
}
/** Minimum schedule interval enforced by the timer (and reflected in nextRunAt). */
export const MIN_SCHEDULE_MINUTES = 15;
const SCHEDULE_CATCHUP_DELAY_MS = 5_000;
export function effectiveIntervalMs(intervalMinutes) {
    return Math.max(MIN_SCHEDULE_MINUTES, Number(intervalMinutes) || 0) * 60_000;
}
/** Id of the private local rollback folder (not a user-editable storage target). */
export const ROLLBACK_TARGET_ID = 'local-rollback';
/** Write a sidecard meta file next to a local snapshot (optional helper for CLI). */
export async function writeSidecarMeta(dir, snapshotId, meta) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${snapshotId}.meta.json`), JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 });
}
export { isBuiltinDshBundle } from './diff.js';
async function listProfiles(dir) {
    try {
        return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=vault-service.js.map