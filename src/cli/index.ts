#!/usr/bin/env node
import { resolve } from 'node:path'
import { VaultService } from '../core/vault-service.js'
import { resolveDshHome } from '../core/paths.js'

function usage(): string {
  return `dsh-vault — standalone backup/restore for DeepSeek Harness

Usage:
  dsh-vault backup [--target <id>] [--encrypt] [--password <pass>] [--secrets] [--home <path>]
  dsh-vault restore <snapshotId> [--target <id>] [--password <pass>] [--keep|--use-backup] [--home <path>]
  dsh-vault list [--target <id>] [--home <path>]
  dsh-vault verify <snapshotId> [--target <id>] [--password <pass>] [--home <path>]
  dsh-vault status [--home <path>]

Works even when the dsh web UI is broken. Secrets are excluded unless --secrets
is combined with --encrypt.
`
}

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  return args[i + 1]
}

function has(args: string[], name: string): boolean {
  return args.includes(name)
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2)
  const cmd = args[0]
  if (!cmd || cmd === '-h' || cmd === '--help') {
    process.stdout.write(usage())
    return 0
  }

  const home = getFlag(args, '--home') ?? resolveDshHome()
  const service = new VaultService({ dshHome: resolve(home) })
  await service.init()

  try {
    if (cmd === 'status') {
      const s = await service.status()
      process.stdout.write(JSON.stringify({
        dshHome: s.dshHome,
        dataDir: s.dataDir,
        targets: s.targets.map((t) => ({ id: t.id, kind: t.kind, label: t.label })),
        schedule: s.settings.schedule,
        recentSnapshots: s.recentSnapshots,
      }, null, 2) + '\n')
      return 0
    }

    if (cmd === 'list') {
      const snaps = await service.listSnapshots(getFlag(args, '--target'))
      process.stdout.write(JSON.stringify(snaps, null, 2) + '\n')
      return 0
    }

    if (cmd === 'backup') {
      const targetId = getFlag(args, '--target') ?? service.listTargets()[0]?.id
      if (!targetId) {
        process.stderr.write('No storage target. Configure one in the UI or targets.json.\n')
        return 1
      }
      const encrypt = has(args, '--encrypt')
      const includeSecrets = has(args, '--secrets')
      const password = getFlag(args, '--password')
      const result = await service.backup({
        targetId,
        encrypt,
        includeSecrets,
        password,
      })
      process.stdout.write(JSON.stringify({
        snapshotId: result.snapshotId,
        targetId: result.targetId,
        remoteKey: result.remoteKey,
        bytes: result.bytes,
        encrypted: result.encrypted,
        includeSecrets: result.includeSecrets,
      }, null, 2) + '\n')
      return 0
    }

    if (cmd === 'verify') {
      const snapshotId = args[1]
      if (!snapshotId) {
        process.stderr.write('Usage: dsh-vault verify <snapshotId>\n')
        return 1
      }
      const targetId = getFlag(args, '--target') ?? service.listTargets()[0]?.id
      if (!targetId) {
        process.stderr.write('No storage target.\n')
        return 1
      }
      const result = await service.verify(targetId, snapshotId, getFlag(args, '--password'))
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      return 0
    }

    if (cmd === 'restore') {
      const snapshotId = args[1]
      if (!snapshotId) {
        process.stderr.write('Usage: dsh-vault restore <snapshotId>\n')
        return 1
      }
      const targetId = getFlag(args, '--target') ?? service.listTargets()[0]?.id
      if (!targetId) {
        process.stderr.write('No storage target.\n')
        return 1
      }
      const conflict = has(args, '--keep') ? 'keep-current' : 'use-backup'
      const result = await service.restore({
        targetId,
        snapshotId,
        conflict,
        password: getFlag(args, '--password'),
      })
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      return 0
    }

    process.stderr.write(`Unknown command: ${cmd}\n\n${usage()}`)
    return 1
  } finally {
    service.stopSchedule()
  }
}

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n')
    process.exit(1)
  },
)
