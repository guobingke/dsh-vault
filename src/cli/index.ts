#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { VaultService } from '../core/vault-service.js'
import { restoreExitCode, restoreFailureSummary } from './exit.js'
import { resolveAgentsHome, resolveDshHome } from '../core/paths.js'
import { diffHomes, formatHomeDiff } from '../core/home-diff.js'
import { DOCUMENTED_EXCLUDES } from '../core/home-scope.js'
import { bundledDshCandidates, desktopResourceRoots, findBundledPnpm, findDshCliEntry, findGit } from '../core/plugin-install.js'
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
  dsh-vault backup [--target <id> | --to-file <path>] [--encrypt] [--password <pass>] [--secrets] [--home <path>]
  dsh-vault restore <snapshotId> [--target <id>] [--password <pass>] [--keep|--use-backup] [--home <path>]
  dsh-vault restore --from <file> [--home <sandbox DSH_HOME>] [--profile desktop|web|all]
                    [--dsh-desktop-dir <DeepSeek Harness install dir>] [--password <pass>] [--no-plugins]
      (exits 2 when files were restored but a plugin failed to install)
  dsh-vault retry-plugins [--home <path>]
      (re-install only the plugins that failed in the last restore; config is not rewritten)
  dsh-vault diff <homeA> <homeB> [--agents-a <dir>] [--agents-b <dir>] [--secrets] [--json]
      (byte-compare two dsh homes with the backup excludes; exit 1 when they differ)
  dsh-vault installers [--dsh-desktop-dir <dir>]
      (show which node / pnpm / git / dsh CLI a restore would use)
  dsh-vault excludes
  dsh-vault list [--target <id>] [--home <path>]
  dsh-vault verify <snapshotId> [--target <id>] [--password <pass>] [--home <path>]
  dsh-vault status [--home <path>]

--home also moves the agents root: <home>/../.agents (or --agents-home <dir>), so a
sandbox restore never writes into your real ~/.agents.

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

/** --dsh-desktop-dir: the DeepSeek Harness install dir (or its resources/ folder). */
function applyDesktopDir(dir: string): void {
  const resources = existsSync(join(dir, 'resources')) ? join(dir, 'resources') : dir
  process.env.DSH_DESKTOP_RESOURCES = resources
  process.env.DSH_DESKTOP_DSH_DIR = process.env.DSH_DESKTOP_DSH_DIR ?? dir
}

/** --agents-home, else the sibling of --home (…/.dsh → …/.agents), else the normal default. */
function agentsHomeFor(args: string[]): string {
  const explicit = getFlag(args, '--agents-home')
  if (explicit) return resolve(explicit)
  const h = getFlag(args, '--home')
  if (h) return join(dirname(resolve(h)), '.agents')
  return resolveAgentsHome()
}

async function runDiff(args: string[]): Promise<number> {
  const positional = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1]?.startsWith('--') && !['--secrets', '--json'].includes(all[i - 1]!)))
  const [a, b] = positional
  if (!a || !b) {
    process.stderr.write('Usage: dsh-vault diff <homeA> <homeB> [--agents-a <dir>] [--agents-b <dir>] [--secrets] [--json]\n')
    return 1
  }
  const homeA = resolve(a)
  const homeB = resolve(b)
  const sibling = (h: string) => (basename(h) === '.dsh' ? join(dirname(h), '.agents') : undefined)
  const agentsA = getFlag(args, '--agents-a') ? resolve(getFlag(args, '--agents-a')!) : sibling(homeA)
  const agentsB = getFlag(args, '--agents-b') ? resolve(getFlag(args, '--agents-b')!) : sibling(homeB)
  const result = await diffHomes({ homeA, homeB, agentsA, agentsB, includeSecrets: has(args, '--secrets') })
  process.stdout.write(has(args, '--json') ? `${JSON.stringify({ ...result, agentsA, agentsB }, null, 2)}\n` : formatHomeDiff(result))
  return result.clean ? 0 : 1
}

async function runInstallers(): Promise<number> {
  const roots = desktopResourceRoots()
  const pnpm = await findBundledPnpm()
  const out = {
    desktopResourceRoots: roots.map((r) => ({ path: r, exists: existsSync(r) })),
    bundledPnpm: pnpm ? { node: pnpm.command, script: pnpm.args?.[0] } : null,
    git: (await findGit()) ?? 'NOT FOUND — github: plugins need git unless pnpm-lock.yaml pins them (install Git for Windows)',
    dshCliEntry: await findDshCliEntry(roots),
    dshCandidates: bundledDshCandidates().filter((c) => /[\\/]/.test(c) && existsSync(c)),
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
  return 0
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

  const desktopDir = getFlag(args, '--dsh-desktop-dir')
  if (desktopDir) applyDesktopDir(resolve(desktopDir))

  if (cmd === 'diff') return runDiff(args)
  if (cmd === 'installers') return runInstallers()
  if (cmd === 'excludes') {
    for (const e of DOCUMENTED_EXCLUDES) process.stdout.write(`${e.pattern}\n    ${e.why}\n`)
    return 0
  }

  const agentsHome = agentsHomeFor(args)
  const profileFlag = (getFlag(args, '--profile') ?? '').toLowerCase()
  const service = new VaultService({
    dshHome: home,
    agentsHome,
    ...(profileFlag === DESKTOP_PROFILE || profileFlag === WEB_PROFILE ? { activeProfile: profileFlag } : {}),
  })
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
      const toFile = getFlag(args, '--to-file')
      const targetId = toFile ? undefined : getFlag(args, '--target') ?? service.listTargets()[0]?.id
      if (!toFile && !targetId) {
        process.stderr.write('No storage target. Configure one in the UI or targets.json.\n')
        return 1
      }
      const encrypt = has(args, '--encrypt')
      const includeSecrets = has(args, '--secrets')
      const password = getFlag(args, '--password')
      const result = await service.backup({
        ...(toFile ? { exportFile: resolve(toFile) } : { targetId }),
        encrypt,
        includeSecrets,
        password,
      })
      process.stdout.write(JSON.stringify({
        dshHome: home,
        agentsHome,
        exportFile: toFile ? resolve(toFile) : undefined,
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

    if (cmd === 'restore' && getFlag(args, '--from')) {
      const from = resolve(getFlag(args, '--from')!)
      const pluginProfiles = !profileFlag || profileFlag === 'all' ? undefined : [profileFlag]
      process.stderr.write(`restore ${from}\n  → DSH_HOME ${home}\n  → agents  ${agentsHome}\n`)
      const result = await service.restore({
        importPath: from,
        conflict: has(args, '--keep') ? 'keep-current' : 'use-backup',
        password: getFlag(args, '--password'),
        reinstallPlugins: !has(args, '--no-plugins'),
        pluginProfiles,
      })
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      process.stderr.write(restoreFailureSummary(result))
      return restoreExitCode(result)
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
