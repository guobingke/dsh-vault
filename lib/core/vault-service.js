import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { defaultArchiveLimits } from './archive.js';
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
import { resolveAgentsHome, resolveDshHome, vaultDataDir, vaultRollbackDir, vaultTempDir, } from './paths.js';
import { DESKTOP_PROFILE, listInitializedGuiProfiles, multiProfileInstallPlan, resolveActiveProfile, WEB_PROFILE, } from './profiles.js';
import { reinstallMissingPlugins, } from './plugin-install.js';
import { snapshotsToDelete } from './retention.js';
import { applyRestore, isSecretEntry } from './restore-apply.js';
import { OperationLock } from './op-lock.js';
import { PathPolicy } from './path-policy.js';
import { redactText } from './redact.js';
import { isRemoteNonRegistrySpec } from './local-spec.js';
import { captureSelfEntries, reapplySelfEntries } from './self-entry.js';
import { packSnapshot, unpackSnapshot } from './snapshot-io.js';
import { WriteJournal } from './safe-fs.js';
import { isExtractedSnapshotDir, packExtractedSnapshot } from './extracted-snapshot.js';
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
    /** Approved folders for API-supplied paths (C-02/C-03/H-08). */
    paths;
    lock;
    scheduleGeneration = 0;
    scheduleStopped = false;
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
        this.paths = new PathPolicy({ extraRoots: options.apiPathRoots, protectedDirs: [this.dataDir], ...(options.apiHome ? { home: options.apiHome } : {}) });
        this.lock = new OperationLock(this.dataDir, { timeoutMs: options.lockTimeoutMs });
    }
    /** Validate a path that came from the HTTP API (CLI/tools are not restricted). */
    checkApiPath(path, use) {
        return this.paths.check(path, use);
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
    /** In-app browser listing for the HTTP API: approved roots only, realpath-checked. */
    async listFsApi(path) {
        const input = path?.trim() ? path : '~';
        await this.paths.check(input, 'list');
        // List the path as typed (Windows 8.3 names, links the policy already resolved and approved).
        const listing = await listDirectory(input);
        // Probe in parallel with a short timeout so empty card readers can't stall the dialog.
        const candidates = await this.paths.roots();
        const present = await Promise.all(candidates.map((r) => Promise.race([
            stat(r).then((st) => st.isDirectory(), () => false),
            new Promise((res) => setTimeout(() => res(false), 800).unref?.()),
        ])));
        const roots = candidates.filter((_, i) => present[i]);
        const allowed = async (p) => {
            if (!p)
                return false;
            try {
                await this.paths.check(p, 'list');
                return true;
            }
            catch {
                return false;
            }
        };
        const entries = [];
        for (const e of listing.entries)
            if (await allowed(e.path))
                entries.push(e);
        return {
            ...listing,
            parent: (await allowed(listing.parent)) ? listing.parent : null,
            roots,
            entries,
            nativePicker: this.hasNativePicker(),
        };
    }
    async createFsDirectoryApi(parent, name) {
        await this.paths.check(parent, 'mkdir');
        await this.paths.check(join(expandUserPath(parent), name), 'mkdir');
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
        const picked = await this.pickDirectoryFn(signal);
        // A folder chosen in the OS dialog is an explicit user approval for API paths.
        this.paths.approve(picked);
        return picked;
    }
    async init() {
        this.scheduleStopped = false;
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
    async updateSettings(patchIn) {
        // H-07: only known keys; the data folder (and anything else) cannot be moved over the API.
        const { dataDir: _dataDir, ...patch } = (patchIn ?? {});
        void _dataDir;
        if (patch.schedule && patch.schedule.intervalMinutes !== undefined) {
            patch.schedule = { ...patch.schedule, intervalMinutes: clampIntervalMinutes(patch.schedule.intervalMinutes) };
        }
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
        // A disabled schedule has no next run (covers PUT /settings and PUT /schedule alike).
        if (!this.settings.schedule.enabled)
            delete this.settings.schedule.nextRunAt;
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
        if (config.kind === 'local' && typeof config.directory === 'string') {
            // Never let a target point into the plugin's own data dir (targets.json, rollback).
            const dir = config.directory;
            if (isInside(this.dataDir, expandUserPath(dir)) && !isInside(join(this.dataDir, 'snapshots'), expandUserPath(dir))) {
                throw new VaultUserError('a storage target may not point into the dsh-vault data folder', 400, 'BAD_CONFIG');
            }
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
        return this.lock.run('backup', async () => {
            const started = Date.now();
            const out = await this.backupInner(req, onProgress);
            out.durationMs = Date.now() - started;
            return out;
        });
    }
    /** Final archive path for an export request (extension added when missing). */
    exportPathFor(exportFile, encrypted) {
        const f = expandUserPath(exportFile.trim());
        const lower = f.toLowerCase();
        if (lower.endsWith('.tar.gz') || lower.endsWith('.dshvault'))
            return f;
        return `${f}${encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION}`;
    }
    /** 409 EXPORT_EXISTS unless the request explicitly allows replacing the file (C-02). */
    async assertExportWritable(req) {
        if (!req.exportFile?.trim())
            return;
        const out = this.exportPathFor(req.exportFile, Boolean(req.encrypt));
        const st = await lstat(out).catch(() => null);
        if (!st)
            return;
        if (!st.isFile())
            throw new VaultUserError(`export target exists and is not a regular file: ${out}`, 409, 'EXPORT_NOT_FILE');
        if (!req.overwrite)
            throw new VaultUserError(`export file already exists: ${out} (confirm to overwrite)`, 409, 'EXPORT_EXISTS');
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
        const { files, plugins, redactedFiles } = await collectBackupFiles({
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            includeSecrets,
            categories: req.categories,
            bundleLocalPlugins: req.bundleLocalPlugins,
            pluginCopyExclude: this.copyExcludeFor(req),
            excludeAbs: [this.dataDir],
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
        await this.recordSnapshotMeta(packed.snapshotId, packed.encrypted && packed.manifest.includeSecrets === true);
        let targetId = req.targetId ?? (directory ? 'local-oneshot' : 'export-file');
        let remoteKey = packed.snapshotId;
        let exportPath;
        if (exportFile) {
            const out = this.exportPathFor(exportFile, packed.encrypted);
            await mkdir(dirname(out), { recursive: true });
            // C-02: exclusive create unless the caller explicitly confirmed overwriting a regular file.
            const existing = await lstat(out).catch(() => null);
            if (existing && (!existing.isFile() || !req.overwrite)) {
                throw new VaultUserError(existing.isFile() ? `export file already exists: ${out} (confirm to overwrite)` : `export target exists and is not a regular file: ${out}`, 409, existing.isFile() ? 'EXPORT_EXISTS' : 'EXPORT_NOT_FILE');
            }
            try {
                await writeFile(out, packed.bytes, { mode: 0o600, flag: req.overwrite ? 'w' : 'wx' });
            }
            catch (err) {
                if (err.code === 'EEXIST') {
                    throw new VaultUserError(`export file already exists: ${out} (confirm to overwrite)`, 409, 'EXPORT_EXISTS');
                }
                throw err;
            }
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
            ...(redactedFiles.length ? { redactedFiles } : {}),
        };
    }
    async listSnapshots(targetId) {
        await this.loadSnapshotIndex();
        if (targetId === ROLLBACK_TARGET_ID) {
            return this.withSnapshotMeta(await this.ensureRollbackAdapter().list());
        }
        const ids = targetId ? [targetId] : this.registry.list().map((t) => t.id);
        const all = [];
        if (targetId) {
            all.push(...this.withSnapshotMeta(await this.adapterFor(targetId).list()));
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
        return this.withSnapshotMeta(all).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    /**
     * Storage listings cannot see inside encrypted snapshots, so whether a snapshot carries
     * credentials is recorded here when it is made (`snapshot-index.json` in the data folder).
     * Snapshots made elsewhere and only encrypted ones can be unknown: they show as "no".
     */
    get snapshotIndexPath() {
        return join(this.dataDir, 'snapshot-index.json');
    }
    snapshotIndex = null;
    async loadSnapshotIndex() {
        if (this.snapshotIndex)
            return this.snapshotIndex;
        try {
            const parsed = JSON.parse(await readFile(this.snapshotIndexPath, 'utf8'));
            this.snapshotIndex = parsed && typeof parsed === 'object' ? parsed : {};
        }
        catch {
            this.snapshotIndex = {};
        }
        return this.snapshotIndex;
    }
    async recordSnapshotMeta(id, includeSecrets) {
        const index = await this.loadSnapshotIndex();
        index[id] = { includeSecrets };
        await writeFile(this.snapshotIndexPath, JSON.stringify(index) + '\n', { mode: 0o600 }).catch(() => { });
    }
    withSnapshotMeta(list) {
        const index = this.snapshotIndex ?? {};
        return list.map((s) => (index[s.id] ? { ...s, includeSecrets: s.encrypted && index[s.id].includeSecrets } : s));
    }
    async deleteSnapshot(targetId, snapshotId) {
        await this.lock.run('delete-snapshot', () => this.adapterFor(targetId).delete(snapshotId));
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
        const secretsAvailable = unpacked.encrypted && unpacked.manifest.includeSecrets === true;
        const { files: liveFiles } = await collectBackupFiles({
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            includeSecrets: secretsAvailable,
            bundleLocalPlugins: false,
            excludeAbs: [this.dataDir],
        });
        const preview = await previewRestoreDiff({
            manifest: unpacked.manifest,
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            currentScopedPaths: liveFiles.map((f) => f.relPath),
            conflict: req.conflict,
            conflicts,
        });
        preview.secretsAvailable = secretsAvailable;
        const remote = remotePluginSources(unpacked.manifest.plugins, this.activeProfile);
        if (remote.length)
            preview.remotePluginSources = remote;
        return preview;
    }
    async restore(req, onProgress) {
        return this.lock.run('restore', async () => {
            const started = Date.now();
            this.restoreMarkerWritten = false;
            try {
                const out = await this.restoreInner(req, onProgress);
                out.durationMs = Date.now() - started;
                return out;
            }
            finally {
                // Finished (applied, or rolled back in-process): the marker only survives a crash.
                if (this.restoreMarkerWritten)
                    await rm(this.restoreMarkerPath, { force: true }).catch(() => { });
                this.restoreMarkerWritten = false;
            }
        });
    }
    restoreMarkerWritten = false;
    /** H-03 crash marker: present only while files are being restored, so it survives a host crash. */
    get restoreMarkerPath() {
        return join(this.dataDir, 'restore-in-progress.json');
    }
    /**
     * A restore that started writing files but never finished (the host crashed or was killed).
     * Null while a restore is running in this or another live process.
     */
    async unfinishedRestore() {
        let info;
        try {
            info = JSON.parse(await readFile(this.restoreMarkerPath, 'utf8'));
        }
        catch {
            return null;
        }
        if (!info || typeof info.snapshotId !== 'string')
            return null;
        if (this.lock.current() === 'restore')
            return null;
        const owner = await this.lock.read();
        if (owner && !(await this.lock.abandoned(owner)))
            return null;
        return info;
    }
    /** Forget an unfinished-restore notice (after rolling back, or when the user keeps the result). */
    async dismissUnfinishedRestore() {
        if (this.lock.current() === 'restore')
            return;
        await rm(this.restoreMarkerPath, { force: true });
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
        // H-02: credentials are written only when the caller asked for them AND the manifest
        // says the snapshot carries them AND the bytes really were an encrypted envelope.
        const includeSecrets = req.includeSecrets === true && unpacked.manifest.includeSecrets === true && unpacked.encrypted;
        const snapshotId = unpacked.manifest.id;
        // M-01: only a private rollback snapshot may delete files (those its restore added).
        const removePaths = resolved.targetId === ROLLBACK_TARGET_ID && Array.isArray(unpacked.manifest.rollbackRemoves)
            ? unpacked.manifest.rollbackRemoves.filter((p) => typeof p === 'string')
            : undefined;
        const plannedAdds = await this.plannedAdds(unpacked.manifest, req.conflict, conflicts, includeSecrets);
        let rollbackSnapshotId;
        let rollbackTargetId;
        let rollbackEncrypted = false;
        if (req.createRollbackSnapshot !== false) {
            const willTouchSecrets = await this.restoreWillApplySecrets(unpacked.manifest, req.conflict, conflicts, includeSecrets);
            onProgress?.({ phase: 'rollback', message: 'Creating pre-restore rollback snapshot', fraction: 0 });
            const touchesSecretsByDelete = (removePaths ?? []).some((p) => isSecretEntry(unpacked.manifest, p)) && includeSecrets;
            if (willTouchSecrets || touchesSecretsByDelete) {
                if (!req.password) {
                    throw new VaultUserError('password required to create an encrypted pre-restore rollback that includes credentials (reuse the restore password)', 400, 'PASSWORD_REQUIRED');
                }
                rollbackEncrypted = true;
                rollbackSnapshotId = await this.createPrivateRollbackSnapshot({
                    includeSecrets: true,
                    encrypt: true,
                    password: req.password,
                    notes: `pre-restore rollback for ${snapshotId}`,
                    rollbackRemoves: plannedAdds,
                    onProgress: rollbackProgress,
                });
            }
            else {
                rollbackSnapshotId = await this.createPrivateRollbackSnapshot({
                    includeSecrets: false,
                    encrypt: false,
                    notes: `pre-restore rollback for ${snapshotId}`,
                    rollbackRemoves: plannedAdds,
                    onProgress: rollbackProgress,
                });
            }
            rollbackTargetId = ROLLBACK_TARGET_ID;
        }
        const marker = {
            snapshotId,
            startedAt: new Date().toISOString(),
            ...(rollbackSnapshotId ? { rollbackSnapshotId, rollbackTargetId: ROLLBACK_TARGET_ID } : {}),
            rollbackEncrypted,
        };
        await writeFile(this.restoreMarkerPath, JSON.stringify(marker, null, 2) + '\n', { mode: 0o600 });
        this.restoreMarkerWritten = true;
        const selfBefore = await captureSelfEntries(this.dshHome);
        const journal = new WriteJournal([this.dshHome, this.agentsHome]);
        const result = await applyRestore({
            journal,
            manifest: unpacked.manifest,
            files: unpacked.files,
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            conflict: req.conflict,
            conflicts,
            allowSecrets: includeSecrets,
            removePaths,
            rollbackSnapshotId,
            onProgress,
        });
        result.rollbackTargetId = rollbackTargetId;
        // H-03: individual plugin failures are a partial success by design (config stays,
        // failures are reported and can be retried). But if the plugin phase itself aborts
        // (throws), the restored files are rolled back too, so nothing is left half-applied.
        try {
            // Keep this machine's own dsh-vault entry (its link: path), never machine 1's.
            await reapplySelfEntries(this.dshHome, selfBefore);
            if (req.reinstallPlugins !== false) {
                onProgress?.({ phase: 'reinstall', message: 'Installing plugins into profile', fraction: 0 });
                const records = req.pluginProfiles?.length
                    ? unpacked.manifest.plugins.filter((p) => req.pluginProfiles.includes(p.profile ?? this.activeProfile))
                    : unpacked.manifest.plugins;
                const approved = new Set((req.approvedPluginSources ?? []).filter((k) => typeof k === 'string'));
                await this.installPlugins(records, result, undefined, req.pluginRestoreOrder, onProgress, approved);
                await this.saveLastRestore({ snapshotId, plugins: unpacked.manifest.plugins, pluginResults: result.pluginResults ?? [] });
            }
        }
        catch (err) {
            const notReverted = await journal.rollback();
            const why = err instanceof Error ? err.message : String(err);
            throw new VaultUserError(notReverted.length
                ? `restore aborted during plugin install (${why}); files rolled back except ${notReverted.slice(0, 5).join(', ')} — restore the pre-restore rollback snapshot`
                : `restore aborted during plugin install (${why}); every restored file was rolled back`, 500, 'RESTORE_ROLLED_BACK');
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
    async installPlugins(records, result, only, order, onProgress, approvedSources) {
        const restoreOrder = order ?? this.settings.pluginRestoreOrder ?? 'source-first';
        // H-06: a git / tarball / URL source is fetched only when the user approved that plugin.
        const blockedSources = new Set();
        const untrustedApproved = [];
        for (const r of remotePluginSources(records, this.activeProfile)) {
            const ok = approvedSources?.has(r.key) || approvedSources?.has(r.nameKey) || approvedSources?.has('*');
            if (!ok)
                blockedSources.add(r.nameKey);
            else if (!r.trusted)
                untrustedApproved.push(`${r.name} (${r.source})`);
        }
        if (untrustedApproved.length) {
            result.manualActions.push(`Plugins fetched from sources outside npm / github.com (approved by you): ${untrustedApproved.join(', ')}`);
        }
        const { results: raw, restartRequired } = await reinstallMissingPlugins(records, this.installDeps(), { only, restoreOrder, onProgress, blockedSources });
        const results = raw.map((r) => ({ ...r, ...(r.detail ? { detail: redactText(r.detail) } : {}), ...(r.log ? { log: redactText(r.log) } : {}), ...(r.source ? { source: redactText(r.source) } : {}) }));
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
        return this.lock.run('retry-plugins', () => this.retryInner(req, onProgress));
    }
    async retryInner(req, onProgress) {
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
        // Retrying a named plugin is an explicit, per-plugin user action: it approves its source.
        await this.installPlugins(records, result, only, undefined, onProgress, req.plugins?.length ? only : undefined);
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
                if (info.size > MAX_IMPORT_BYTES) {
                    throw new VaultUserError(`import file is larger than ${MAX_IMPORT_BYTES} bytes`, 413, 'ARCHIVE_LIMIT');
                }
                const bytes = await readFile(path);
                return { bytes, targetId: 'import-file', snapshotId: req.snapshotId ?? basename(path).replace(/\.(tar\.gz|dshvault)$/i, '') };
            }
            if (info.isDirectory() && (await isExtractedSnapshotDir(path))) {
                // An unpacked plaintext snapshot (manifest.json + files/), e.g. copied by hand.
                return { bytes: await packExtractedSnapshot(path), targetId: 'import-folder', snapshotId: req.snapshotId ?? basename(path) };
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
                    throw new VaultUserError(`no snapshot in folder: ${path} (expected .tar.gz / .dshvault files, or an extracted snapshot with manifest.json and files/)`, 404, 'SNAPSHOT_NOT_FOUND');
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
        const generation = this.scheduleGeneration;
        const result = await this.backup({
            targetId: schedule.targetId,
            encrypt: schedule.encrypt,
            includeSecrets: schedule.includeSecrets && schedule.encrypt,
            notes: 'scheduled backup',
        }, onProgress);
        const next = new Date(Date.now() + effectiveIntervalMs(schedule.intervalMinutes)).toISOString();
        // M-03: stopSchedule() during the backup must not be undone by persisting nextRunAt.
        if (this.scheduleStopped || generation !== this.scheduleGeneration) {
            const cur = this.settings.schedule;
            this.settings = { ...this.settings, schedule: { ...cur, lastRunAt: new Date().toISOString(), ...(cur.enabled ? { nextRunAt: next } : {}) } };
            if (!cur.enabled)
                delete this.settings.schedule.nextRunAt;
            await saveSettings(this.dataDir, this.settings).catch(() => { });
            return result;
        }
        await this.updateSchedule({ lastRunAt: new Date().toISOString(), nextRunAt: next });
        return result;
    }
    /** Stop the timer for good (plugin disposal / tests); re-armed only by init(). */
    stopSchedule() {
        this.scheduleStopped = true;
        this.clearScheduleTimer();
    }
    clearScheduleTimer() {
        this.scheduleGeneration++;
        if (this.scheduleTimer) {
            clearTimeout(this.scheduleTimer);
            this.scheduleTimer = null;
        }
    }
    /** Whether a schedule timer is armed (tests). */
    hasScheduleTimer() {
        return this.scheduleTimer !== null;
    }
    /** Sleep until `dueAt` in chunks ≤ 2^31-1 ms (M-04: larger delays overflow to 1 ms). */
    armAt(dueAt, generation, fire) {
        const remaining = dueAt - Date.now();
        if (remaining <= 0) {
            fire();
            return;
        }
        this.scheduleTimer = setTimeout(() => {
            this.scheduleTimer = null;
            if (generation !== this.scheduleGeneration || this.scheduleStopped)
                return;
            this.armAt(dueAt, generation, fire);
        }, Math.min(remaining, MAX_TIMER_MS));
        // unref so CLI/tests can exit
        this.scheduleTimer.unref?.();
    }
    armSchedule() {
        this.clearScheduleTimer();
        if (this.scheduleStopped)
            return;
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
        const generation = this.scheduleGeneration;
        this.armAt(Date.now() + delay, generation, () => {
            void this.runScheduledBackup().catch(() => {
                // never log secrets; retry on the next interval
                this.armScheduleAfterFailure(intervalMs);
            });
        });
    }
    armScheduleAfterFailure(intervalMs) {
        if (this.scheduleTimer || this.scheduleStopped || !this.settings.schedule.enabled)
            return;
        const generation = this.scheduleGeneration;
        this.armAt(Date.now() + intervalMs, generation, () => this.armSchedule());
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
            installPlan: multiProfileInstallPlan(undefined, this.dshHome),
            targets: this.listTargets(),
            settings: this.settings,
            recentSnapshots,
            pluginDataEntries: await listPluginDataEntries(this.dshHome),
            unfinishedRestore: await this.unfinishedRestore(),
            archiveLimitBytes: defaultArchiveLimits().maxTotalBytes,
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
            excludeAbs: [this.dataDir],
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
            rollbackRemoves: input.rollbackRemoves,
            onProgress: input.onProgress,
        });
        await this.recordSnapshotMeta(packed.snapshotId, packed.encrypted && packed.manifest.includeSecrets === true);
        await this.ensureRollbackAdapter().put(packed.snapshotId, packed.bytes);
        return packed.snapshotId;
    }
    /** Paths the restore will create (not overwrite); a rollback of it deletes them again (M-01). */
    async plannedAdds(manifest, conflict, conflicts, allowSecrets) {
        const preview = await previewRestoreDiff({ manifest, dshHome: this.dshHome, agentsHome: this.agentsHome, conflict, conflicts });
        return preview.items
            .filter((i) => i.change === 'add' && (allowSecrets || !isSecretEntry(manifest, i.path)))
            .map((i) => i.path);
    }
    /** M-07: per-path, with the shared classifier — the request/manifest flags alone never decide. */
    async restoreWillApplySecrets(manifest, conflict, conflicts, includeSecrets) {
        if (!includeSecrets)
            return false;
        const preview = await previewRestoreDiff({
            manifest,
            dshHome: this.dshHome,
            agentsHome: this.agentsHome,
            conflict,
            conflicts,
        });
        for (const item of preview.items) {
            if (!isSecretEntry(manifest, item.path))
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
/** Longest supported interval (M-04): one year. */
export const MAX_SCHEDULE_MINUTES = 365 * 24 * 60;
/** setTimeout's ceiling; longer delays are chained. */
export const MAX_TIMER_MS = 2 ** 31 - 1;
/** Largest import file read into memory. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024 - 1;
export function clampIntervalMinutes(intervalMinutes) {
    const n = Number(intervalMinutes);
    if (!Number.isFinite(n))
        return MIN_SCHEDULE_MINUTES;
    return Math.min(MAX_SCHEDULE_MINUTES, Math.max(MIN_SCHEDULE_MINUTES, n));
}
export function effectiveIntervalMs(intervalMinutes) {
    return clampIntervalMinutes(intervalMinutes) * 60_000;
}
function isInside(root, p) {
    const r = root.replace(/[\\/]+$/, '');
    const a = process.platform === 'win32' ? p.toLowerCase() : p;
    const b = process.platform === 'win32' ? r.toLowerCase() : r;
    return a === b || a.startsWith(b + '/') || a.startsWith(b + '\\');
}
/** Hosts dsh-vault treats as trusted plugin sources (H-06). Others are allowed only with a warning. */
const TRUSTED_SOURCE_PATTERNS = [
    /^github:[\w.-]+\/[\w.-]+/i,
    /^(git\+)?https:\/\/github\.com\//i,
    /^git\+ssh:\/\/git@github\.com\//i,
    /^git@github\.com:/i,
    /^https:\/\/codeload\.github\.com\//i,
    /^https:\/\/registry\.npmjs\.org\//i,
    /^https:\/\/registry\.npmmirror\.com\//i,
];
export function isTrustedPluginSource(spec) {
    const s = redactText(spec.trim()).replace(/^npm:/i, '');
    return TRUSTED_SOURCE_PATTERNS.some((re) => re.test(s));
}
/** Approval key bound to one exact source string. */
export function pluginSourceKey(profile, name, spec) {
    return `${profile}:${name}#${createHash('sha256').update(spec, 'utf8').digest('hex').slice(0, 16)}`;
}
/** Plugins whose install would fetch a git / tarball / URL source (H-06), credentials stripped for display. */
export function remotePluginSources(records, activeProfile) {
    const out = [];
    const seen = new Set();
    for (const p of records) {
        const profile = p.profile ?? activeProfile;
        const nameKey = `${profile}:${p.name}`;
        if (seen.has(nameKey))
            continue;
        const specs = [p.source, p.version, p.lockedTarball].filter((s) => typeof s === 'string' && isRemoteNonRegistrySpec(s));
        if (!specs.length || p.bundledSource)
            continue;
        seen.add(nameKey);
        // The key covers every remote spec of the record, so changing any of them voids the approval.
        out.push({
            key: pluginSourceKey(profile, p.name, specs.join('\n')),
            nameKey,
            name: p.name,
            profile,
            source: redactText(specs[0]),
            trusted: specs.every(isTrustedPluginSource),
        });
    }
    return out;
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