export function buildVaultCommands(service) {
    return [
        {
            name: 'vault',
            description: 'dsh-vault: status | backup [targetId] | list | restore <snapshotId> [--target id] [--keep|--use-backup]',
            async execute(args) {
                const parts = args.trim().split(/\s+/).filter(Boolean);
                const cmd = parts[0] ?? 'status';
                if (cmd === 'status') {
                    const s = await service.status();
                    return [
                        `dsh-vault home: ${s.dshHome}`,
                        `targets: ${s.targets.map((t) => t.id).join(', ') || '(none)'}`,
                        `schedule: ${s.settings.schedule.enabled ? `every ${s.settings.schedule.intervalMinutes}m → ${s.settings.schedule.targetId}` : 'off'}`,
                        `recent: ${s.recentSnapshots.slice(0, 5).map((x) => x.id).join(', ') || '(none)'}`,
                    ].join('\n');
                }
                if (cmd === 'list') {
                    const snaps = await service.listSnapshots(parts[1]);
                    if (!snaps.length)
                        return 'No snapshots.';
                    return snaps.map((s) => `${s.id}\t${s.targetId}\t${s.bytes}B\t${s.encrypted ? 'encrypted' : 'plain'}`).join('\n');
                }
                if (cmd === 'backup') {
                    const targetId = parts[1] ?? service.listTargets()[0]?.id;
                    if (!targetId)
                        return 'No storage target configured.';
                    const result = await service.backup({ targetId });
                    return `Backup created: ${result.snapshotId} (${result.bytes} bytes) on ${result.targetId}`;
                }
                if (cmd === 'restore') {
                    const snapshotId = parts[1];
                    if (!snapshotId)
                        return 'Usage: /vault restore <snapshotId> [--target id] [--keep|--use-backup]';
                    let targetId = service.listTargets()[0]?.id;
                    let conflict = 'use-backup';
                    for (let i = 2; i < parts.length; i++) {
                        if (parts[i] === '--target')
                            targetId = parts[++i];
                        if (parts[i] === '--keep')
                            conflict = 'keep-current';
                        if (parts[i] === '--use-backup')
                            conflict = 'use-backup';
                    }
                    if (!targetId)
                        return 'No storage target configured.';
                    const result = await service.restore({ targetId, snapshotId, conflict });
                    return `Restored ${result.applied.length} files from ${result.snapshotId}. Manual: ${result.manualActions.join('; ') || 'none'}`;
                }
                return 'Unknown subcommand. Use status | backup | list | restore.';
            },
        },
    ];
}
export function registerVaultCommands(commands, service) {
    for (const cmd of buildVaultCommands(service)) {
        commands.register(cmd);
    }
}
//# sourceMappingURL=register.js.map