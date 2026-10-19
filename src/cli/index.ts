#!/usr/bin/env node
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { VaultService } from '../core/vault-service.js'
import { restoreExitCode, restoreFailureSummary } from './exit.js'
import { resolveDshHome } from '../core/paths.js'
import {
  DESKTOP_PROFILE,
  GUI_PROFILES,
  installCommandForProfile,
  listInitializedGuiProfiles,
  multiProfileInstallPlan,
  WEB_PROFILE,
  type GuiProfile,
} from '../core/profiles.js'

function usage(): string {
  return `dsh-vault — standalone backup/restore for DeepSeek Harness

Usage:
  dsh-vault setup [--profile web|desktop|all] [--package <spec>] [--home <path>] [--dry-run]
  dsh-vault backup [--target <id>] [--encrypt] [--password <pass>] [--secrets] [--home <path>]
  dsh-vault restore <snapshotId> [--target <id>] [--password <pass>] [--keep|--use-backup] [--home <path>]
      (exits 2 when files were restored but a plugin failed to install)
  dsh-vault retry-plugins [--home <path>]
      (re-install only the plugins that failed in the last restore; config is not rewritten)
  dsh-vault list [--target <id>] [--home <path>]
  dsh-vault verify <snapshotId> [--target <id>] [--password <pass>] [--home <path>]
  dsh-vault status [--home <path>]

Desktop: use DeepSeek Harness Desktop's bundled \`dsh\` (Tray → Terminal) for
\`dsh plugin --profile desktop add dsh-vault\`, or install from Desktop → Plugins.
npm-global \`dsh\` refuses --profile desktop. Web: \`dsh plugin --profile web add dsh-vault\`.

Works even when the dsh UI is broken. Secrets are excluded unless --secrets
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

function runDshPluginAdd(profile: string, packageSpec: string, dshHome?: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn('dsh', ['plugin', '--profile', profile, 'add', packageSpec], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Honor --home: the child dsh must install into the same DSH_HOME.
      env: dshHome ? { ...process.env, DSH_HOME: dshHome } : process.env,
      shell: process.platform === 'win32',
    })
    let detail = ''
    child.stdout?.on('data', (c: Buffer) => {
      detail += c.toString('utf8')
    })
    child.stderr?.on('data', (c: Buffer) => {
      detail += c.toString('utf8')
    })
    child.on('error', (err) => resolvePromise({ ok: false, detail: err.message }))
    child.on('close', (code) => resolvePromise({ ok: code === 0, detail: detail.slice(0, 1200) }))
  })
}

async function runSetup(args: string[], home: string): Promise<number> {
  const packageSpec = getFlag(args, '--package') ?? 'dsh-vault'
  const profileFlag = (getFlag(args, '--profile') ?? 'all').toLowerCase()
  const dryRun = has(args, '--dry-run')

  let profiles: GuiProfile[]
  if (profileFlag === 'all') {
    const initialized = listInitializedGuiProfiles(home)
    profiles = initialized.length > 0 ? [...initialized] : [WEB_PROFILE]
    if (!profiles.includes(DESKTOP_PROFILE)) {
      // Still print desktop guidance even if not yet initialized.
      process.stdout.write(
        JSON.stringify({ note: 'desktop profile not initialized yet; open DeepSeek Harness Desktop once, quit, then re-run setup --profile desktop' }, null, 2) + '\n',
      )
    }
  } else if (profileFlag === WEB_PROFILE || profileFlag === DESKTOP_PROFILE) {
    profiles = [profileFlag]
  } else {
    process.stderr.write(`Unknown profile "${profileFlag}". Use web, desktop, or all.\n`)
    return 1
  }

  const results: Array<{ profile: string; command: string; ok?: boolean; detail?: string; notes: string[] }> = []
  for (const profile of profiles) {
    const plan = installCommandForProfile(profile, packageSpec)
    if (dryRun || (profile === DESKTOP_PROFILE && profileFlag === 'all' && !listInitializedGuiProfiles(home).includes(DESKTOP_PROFILE))) {
      results.push({ profile, command: plan.command, notes: plan.notes })
      continue
    }
    process.stderr.write(`→ ${plan.command}\n`)
    const run = await runDshPluginAdd(profile, packageSpec, home)
    results.push({
      profile,
      command: plan.command,
      ok: run.ok,
      detail: run.detail,
      notes: plan.notes,
    })
  }

  // When --profile all and desktop missing from run list, append guidance-only entry.
  if (profileFlag === 'all' && !results.some((r) => r.profile === DESKTOP_PROFILE)) {
    const plan = installCommandForProfile(DESKTOP_PROFILE, packageSpec)
    results.push({ profile: DESKTOP_PROFILE, command: plan.command, notes: plan.notes })
  }

  process.stdout.write(JSON.stringify({
    home,
    packageSpec,
    dryRun,
    knownGuiProfiles: GUI_PROFILES,
    initialized: listInitializedGuiProfiles(home),
    results,
    fullPlan: multiProfileInstallPlan(packageSpec, home),
  }, null, 2) + '\n')

  const failed = results.some((r) => r.ok === false)
  return failed ? 1 : 0
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2)
  const cmd = args[0]
  if (!cmd || cmd === '-h' || cmd === '--help') {
    process.stdout.write(usage())
    return 0
  }

  const home = resolve(getFlag(args, '--home') ?? resolveDshHome())

  if (cmd === 'setup' || cmd === 'install') {
    return runSetup(args, home)
  }

  const service = new VaultService({ dshHome: home })
  await service.init()

  try {
    if (cmd === 'status') {
      const s = await service.status()
      process.stdout.write(JSON.stringify({
        dshHome: s.dshHome,
        dataDir: s.dataDir,
        activeProfile: s.activeProfile,
        surface: s.surface,
        guiProfiles: s.guiProfiles,
        installPlan: s.installPlan,
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
      process.stderr.write(restoreFailureSummary(result))
      return restoreExitCode(result)
    }

    if (cmd === 'retry-plugins') {
      const result = await service.retryFailedPlugins()
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      process.stderr.write(restoreFailureSummary(result))
      return restoreExitCode(result)
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
