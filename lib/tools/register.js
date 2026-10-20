import { redactDeep } from '../core/redact.js';
import { redactForLog } from '../core/encryption.js';
export function buildVaultTools(service) {
    return [
        {
            name: 'dsh_vault_status',
            description: 'Show dsh-vault status: targets, schedule, and recent snapshots (secrets never included).',
            parameters: {},
            async execute() {
                const status = await service.status();
                return redactForLog({
                    dshHome: status.dshHome,
                    dataDir: status.dataDir,
                    activeProfile: status.activeProfile,
                    surface: status.surface,
                    guiProfiles: status.guiProfiles,
                    installPlan: status.installPlan.map((p) => ({ profile: p.profile, command: p.command })),
                    targetCount: status.targets.length,
                    targets: status.targets.map((t) => ({ id: t.id, kind: t.kind, label: t.label })),
                    schedule: {
                        enabled: status.settings.schedule.enabled,
                        intervalMinutes: status.settings.schedule.intervalMinutes,
                        targetId: status.settings.schedule.targetId,
                        encrypt: status.settings.schedule.encrypt,
                    },
                    recentSnapshots: status.recentSnapshots.map((s) => ({
                        id: s.id,
                        targetId: s.targetId,
                        createdAt: s.createdAt,
                        bytes: s.bytes,
                        encrypted: s.encrypted,
                    })),
                });
            },
        },
        {
            name: 'dsh_vault_backup',
            description: 'Create a dsh-vault snapshot on a storage target. Secrets require encrypt=true and password.',
            parameters: {
                targetId: { type: 'string', required: true, description: 'Storage target id' },
                encrypt: { type: 'boolean', description: 'Encrypt the snapshot' },
                password: { type: 'string', description: 'Password when encrypt=true (never logged)' },
                includeSecrets: { type: 'boolean', description: 'Include credentials (requires encrypt)' },
                notes: { type: 'string', description: 'Optional note' },
            },
            async execute(args) {
                const result = await service.backup({
                    targetId: String(args.targetId),
                    encrypt: Boolean(args.encrypt),
                    password: typeof args.password === 'string' ? args.password : undefined,
                    includeSecrets: Boolean(args.includeSecrets),
                    notes: typeof args.notes === 'string' ? args.notes : undefined,
                });
                return {
                    snapshotId: result.snapshotId,
                    targetId: result.targetId,
                    remoteKey: result.remoteKey,
                    bytes: result.bytes,
                    encrypted: result.encrypted,
                    includeSecrets: result.includeSecrets,
                    fileCount: result.manifest.files.length,
                    pluginCount: result.manifest.plugins.length,
                };
            },
        },
        {
            name: 'dsh_vault_list',
            description: 'List dsh-vault snapshots, optionally filtered by targetId.',
            parameters: {
                targetId: { type: 'string', description: 'Optional storage target id' },
            },
            async execute(args) {
                const snapshots = await service.listSnapshots(typeof args.targetId === 'string' ? args.targetId : undefined);
                return { snapshots };
            },
        },
        {
            name: 'dsh_vault_restore_preview',
            description: 'Preview what a restore would add/change/remove without applying it. Optional conflict/conflicts annotate each item with its resolved strategy.',
            parameters: {
                targetId: { type: 'string', required: true },
                snapshotId: { type: 'string', required: true },
                password: { type: 'string', description: 'Password if the snapshot is encrypted' },
                conflict: { type: 'string', enum: ['keep-current', 'use-backup'], description: 'Global default used to annotate item resolutions' },
                conflicts: { type: 'object', description: 'Optional map of path -> keep-current|use-backup overrides' },
            },
            async execute(args) {
                const conflict = args.conflict === 'keep-current' || args.conflict === 'use-backup'
                    ? args.conflict
                    : undefined;
                const preview = await service.previewRestore({
                    targetId: String(args.targetId),
                    snapshotId: String(args.snapshotId),
                    password: typeof args.password === 'string' ? args.password : undefined,
                    conflict,
                    conflicts: typeof args.conflicts === 'object' && args.conflicts !== null
                        ? args.conflicts
                        : undefined,
                });
                return {
                    snapshotId: preview.snapshotId,
                    added: preview.added,
                    changed: preview.changed,
                    removed: preview.removed,
                    unchanged: preview.unchanged,
                    pluginsToReinstall: preview.pluginsToReinstall.map((p) => p.name),
                    manualActions: preview.manualActions,
                    conflict: preview.conflict,
                    conflicts: preview.conflicts,
                    items: preview.items.slice(0, 100),
                };
            },
        },
        {
            name: 'dsh_vault_restore',
            description: 'Restore a dsh-vault snapshot after preview. Creates a pre-restore rollback snapshot by default. Optional conflicts map overrides the global conflict per path.',
            parameters: {
                targetId: { type: 'string', required: true },
                snapshotId: { type: 'string', required: true },
                conflict: { type: 'string', required: true, enum: ['keep-current', 'use-backup'] },
                conflicts: { type: 'object', description: 'Optional map of path -> keep-current|use-backup overrides' },
                password: { type: 'string' },
                reinstallPlugins: { type: 'boolean' },
            },
            async execute(args) {
                const conflict = args.conflict === 'keep-current' ? 'keep-current' : 'use-backup';
                const result = await service.restore({
                    targetId: String(args.targetId),
                    snapshotId: String(args.snapshotId),
                    conflict,
                    conflicts: typeof args.conflicts === 'object' && args.conflicts !== null
                        ? args.conflicts
                        : undefined,
                    password: typeof args.password === 'string' ? args.password : undefined,
                    reinstallPlugins: args.reinstallPlugins !== false,
                    // A model can never approve credentials or git/URL plugin sources on the user's behalf.
                    includeSecrets: false,
                    approvedPluginSources: [],
                });
                return redactDeep(result);
            },
        },
    ];
}
export function registerVaultTools(tools, service, defineTool) {
    for (const def of buildVaultTools(service)) {
        tools.register(defineTool(def));
    }
}
//# sourceMappingURL=register.js.map