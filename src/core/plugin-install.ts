import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { isBuiltinDshBundle } from './diff.js'
import { DESKTOP_PROFILE, installCommandForProfile } from './profiles.js'
import type { PluginRecord } from './types.js'
import { expandUserPath } from './win-paths.js'

export type PluginInstallStatus = 'installed' | 'already-present' | 'failed' | 'skipped'

export interface PluginInstallResult {
  name: string
  profile: string
  status: PluginInstallStatus
  detail: string
  source?: string
}

export interface PluginManagerLike {
  installBundle: (
    spec: string,
    options?: { registry?: string | null; saveExact?: boolean; enabled?: boolean },
  ) => Promise<{
    application?: string
    changed?: boolean
    error?: { code?: string; diagnostic?: string; message?: string }
    packageResult?: { kind?: string; output?: string }
  }>
}

export interface PluginInstallDeps {
  dshHome: string
  activeProfile: string
  pluginManager?: PluginManagerLike | null
  /** Preferred pnpm binary (from pluginManager config when known). */
  pnpmCommand?: string
  /** Preferred registry URL (e.g. npmmirror) asked first. */
  preferredRegistry?: string | null
  /** Override for tests. */
  runCommand?: (
    command: string,
    args: string[],
    opts: { cwd?: string; env?: NodeJS.ProcessEnv },
  ) => Promise<{ ok: boolean; detail: string; code: number | null }>
}

const NPMMIRROR = 'https://registry.npmmirror.com/'

export function sanitizePluginDirName(name: string): string {
  return name.replace(/^@/, '').replace(/\//g, '__').replace(/[<>:"|?*]/g, '_')
}

export function localSourcePath(source: string): string | null {
  if (source.startsWith('link:') || source.startsWith('file:')) {
    return source.slice(source.indexOf(':') + 1)
  }
  return null
}

export function bundledSourceRel(profile: string, name: string): string {
  return `plugin-sources/${profile}/${sanitizePluginDirName(name)}`
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function pluginPackagePresent(dshHome: string, profile: string, name: string): Promise<boolean> {
  const parts = ['profiles', profile, 'node_modules', ...name.split('/'), 'package.json']
  return pathExists(join(dshHome, ...parts))
}

function defaultRunCommand(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ ok: boolean; detail: string; code: number | null }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: process.platform === 'win32',
      windowsHide: true,
    })
    let detail = ''
    child.stdout?.on('data', (c: Buffer) => {
      detail += c.toString('utf8')
    })
    child.stderr?.on('data', (c: Buffer) => {
      detail += c.toString('utf8')
    })
    child.on('error', (err) => resolvePromise({ ok: false, detail: err.message, code: null }))
    child.on('close', (code) => resolvePromise({ ok: code === 0, detail: detail.slice(0, 2000), code }))
  })
}

/** Rewrite package.json link:/file: deps to restored bundled sources under DSH_HOME. */
export async function rewriteBundledLinkDeps(
  dshHome: string,
  plugins: PluginRecord[],
): Promise<string[]> {
  const touched: string[] = []
  const byProfile = new Map<string, PluginRecord[]>()
  for (const p of plugins) {
    if (!p.bundledSource || !p.profile) continue
    const list = byProfile.get(p.profile) ?? []
    list.push(p)
    byProfile.set(p.profile, list)
  }
  for (const [profile, list] of byProfile) {
    const pkgPath = join(dshHome, 'profiles', profile, 'package.json')
    let raw: string
    try {
      raw = await readFile(pkgPath, 'utf8')
    } catch {
      continue
    }
    let pkg: { dependencies?: Record<string, string> }
    try {
      pkg = JSON.parse(raw) as typeof pkg
    } catch {
      continue
    }
    if (!pkg.dependencies) continue
    let changed = false
    for (const plugin of list) {
      const abs = join(dshHome, ...plugin.bundledSource!.split('/'))
      if (!(await pathExists(abs))) continue
      const linkSpec = `link:${abs}`
      if (pkg.dependencies[plugin.name] !== linkSpec) {
        pkg.dependencies[plugin.name] = linkSpec
        changed = true
      }
    }
    if (changed) {
      await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, { mode: 0o644 })
      touched.push(profile)
    }
  }
  return touched
}

async function materializeProfile(
  profileDir: string,
  deps: PluginInstallDeps,
): Promise<{ ok: boolean; detail: string }> {
  const run = deps.runCommand ?? defaultRunCommand
  const pnpm = deps.pnpmCommand ?? 'pnpm'
  const env = { ...process.env, DSH_HOME: deps.dshHome }
  // Prefer lockfile when present; otherwise ordinary install.
  const hasLock = await pathExists(join(profileDir, 'pnpm-lock.yaml'))
  const args = hasLock ? ['install', '--frozen-lockfile'] : ['install']
  let result = await run(pnpm, args, { cwd: profileDir, env })
  if (!result.ok && hasLock) {
    result = await run(pnpm, ['install'], { cwd: profileDir, env })
  }
  return { ok: result.ok, detail: result.detail }
}

async function installViaPluginManager(
  manager: PluginManagerLike,
  spec: string,
  deps: PluginInstallDeps,
): Promise<{ ok: boolean; detail: string; already?: boolean }> {
  try {
    const outcome = await manager.installBundle(spec, {
      saveExact: !spec.startsWith('link:') && !spec.startsWith('file:'),
      registry: deps.preferredRegistry === undefined ? NPMMIRROR : deps.preferredRegistry,
      enabled: true,
    })
    if (outcome.error?.code === 'already-installed') {
      return { ok: true, detail: 'already-installed in profile manifest', already: true }
    }
    if (outcome.application === 'failed' || outcome.error) {
      const detail = outcome.error?.diagnostic
        ?? outcome.error?.message
        ?? outcome.packageResult?.output
        ?? outcome.error?.code
        ?? 'installBundle failed'
      return { ok: false, detail: String(detail).slice(0, 800) }
    }
    return { ok: true, detail: outcome.application ?? 'installed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/already-installed/i.test(message)) {
      return { ok: true, detail: message, already: true }
    }
    return { ok: false, detail: message.slice(0, 800) }
  }
}

/** Candidate Desktop-bundled `dsh` carriers (npm-global `dsh` refuses --profile desktop). */
export function bundledDshCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = []
  const win = process.platform === 'win32'
  const exe = win ? 'dsh.cmd' : 'dsh'
  if (env.DSH_DESKTOP_DSH_DIR?.trim()) {
    out.push(join(expandUserPath(env.DSH_DESKTOP_DSH_DIR, env), exe))
  }
  if (env.DSH_CLI?.trim()) out.push(expandUserPath(env.DSH_CLI, env))
  // Electron host: resources next to the running binary
  try {
    const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
    if (resources) {
      out.push(join(resources, 'dsh', exe))
      out.push(join(resources, 'app.asar.unpacked', 'dsh', exe))
      out.push(join(dirname(process.execPath), exe))
    }
  } catch {
    // ignore
  }
  out.push(exe)
  out.push('dsh')
  return [...new Set(out)]
}

async function installViaDshCli(
  spec: string,
  profile: string,
  deps: PluginInstallDeps,
): Promise<{ ok: boolean; detail: string }> {
  const run = deps.runCommand ?? defaultRunCommand
  const env = { ...process.env, DSH_HOME: deps.dshHome }
  const candidates = profile === DESKTOP_PROFILE ? bundledDshCandidates() : ['dsh']
  let last = { ok: false, detail: 'no dsh carrier tried' }
  for (const cmd of candidates) {
    const result = await run(cmd, ['plugin', '--profile', profile, 'add', spec], { env })
    if (result.ok) return { ok: true, detail: `installed via ${cmd}` }
    last = { ok: false, detail: `${cmd}: ${result.detail}`.slice(0, 800) }
    // npm-global refusal — try next candidate
    if (/managed exclusively by the Electron|manageDesktopProfile|refuses/i.test(result.detail)) continue
  }
  if (profile === DESKTOP_PROFILE) {
    last.detail += '\n' + installCommandForProfile(DESKTOP_PROFILE, spec).notes.join('\n')
  }
  return last
}

function installSpecFor(plugin: PluginRecord, dshHome: string): { spec: string; kind: 'npm' | 'link' | 'git' | 'other' } {
  if (plugin.bundledSource) {
    return { spec: `link:${join(dshHome, ...plugin.bundledSource.split('/'))}`, kind: 'link' }
  }
  const local = localSourcePath(plugin.source)
  if (local) {
    const abs = resolve(expandUserPath(local))
    return { spec: `link:${abs}`, kind: 'link' }
  }
  if (plugin.source.startsWith('git') || plugin.source.includes('github.com')) {
    return { spec: plugin.source.startsWith('npm:') ? plugin.name : plugin.source, kind: 'git' }
  }
  if (plugin.version && !plugin.version.startsWith('link:') && !plugin.version.startsWith('file:')) {
    return { spec: `${plugin.name}@${plugin.version}`, kind: 'npm' }
  }
  if (plugin.source.startsWith('npm:')) {
    return { spec: plugin.source.slice(4), kind: 'npm' }
  }
  return { spec: plugin.name, kind: 'other' }
}

/**
 * Reinstall missing plugins after files were restored.
 * Prefer in-process pluginManager + profile `pnpm install`, then Desktop bundled dsh.
 */
export async function reinstallMissingPlugins(
  plugins: PluginRecord[],
  deps: PluginInstallDeps,
): Promise<{ results: PluginInstallResult[]; restartRequired: boolean }> {
  const results: PluginInstallResult[] = []
  const actionable = plugins.filter((p) => !isBuiltinDshBundle(p.name))
  await rewriteBundledLinkDeps(deps.dshHome, actionable)

  // Group by profile and materialize from lockfile/manifest first.
  const profiles = [...new Set(actionable.map((p) => p.profile ?? deps.activeProfile))]
  for (const profile of profiles) {
    const profileDir = join(deps.dshHome, 'profiles', profile)
    if (!(await pathExists(join(profileDir, 'package.json')))) continue
    const mat = await materializeProfile(profileDir, deps)
    if (!mat.ok) {
      // Not fatal yet — individual installs may still work.
      void mat
    }
  }

  let restartRequired = false
  for (const plugin of actionable) {
    const profile = plugin.profile ?? deps.activeProfile
    if (await pluginPackagePresent(deps.dshHome, profile, plugin.name)) {
      results.push({
        name: plugin.name,
        profile,
        status: 'already-present',
        detail: 'package present in node_modules after profile install',
        source: plugin.source,
      })
      continue
    }

    const { spec, kind } = installSpecFor(plugin, deps.dshHome)
    if (kind === 'link') {
      const local = localSourcePath(spec)
      if (local && !(await pathExists(local))) {
        results.push({
          name: plugin.name,
          profile,
          status: 'failed',
          detail: `local plugin source missing on this machine: ${local}. Re-backup with the plugin folder present, or copy it and retry.`,
          source: plugin.originalSource ?? plugin.source,
        })
        continue
      }
    }

    // 1) Host plugin manager (works while Desktop is running)
    if (deps.pluginManager) {
      const viaMgr = await installViaPluginManager(deps.pluginManager, spec, deps)
      if (viaMgr.already) {
        // Manifest lists it but node_modules may still be empty — rematerialize.
        await materializeProfile(join(deps.dshHome, 'profiles', profile), deps)
        if (await pluginPackagePresent(deps.dshHome, profile, plugin.name)) {
          results.push({
            name: plugin.name,
            profile,
            status: 'installed',
            detail: 'materialized via pnpm after already-installed',
            source: plugin.source,
          })
          restartRequired = true
          continue
        }
      } else if (viaMgr.ok) {
        results.push({
          name: plugin.name,
          profile,
          status: 'installed',
          detail: viaMgr.detail,
          source: plugin.source,
        })
        restartRequired = true
        continue
      } else {
        // Fall through to CLI with manager error as detail seed
        const viaCli = await installViaDshCli(spec, profile, deps)
        if (viaCli.ok || (await pluginPackagePresent(deps.dshHome, profile, plugin.name))) {
          results.push({
            name: plugin.name,
            profile,
            status: 'installed',
            detail: viaCli.ok ? viaCli.detail : 'present after CLI attempt',
            source: plugin.source,
          })
          restartRequired = true
        } else {
          results.push({
            name: plugin.name,
            profile,
            status: 'failed',
            detail: `${viaMgr.detail}\n${viaCli.detail}`.slice(0, 1200),
            source: plugin.source,
          })
        }
        continue
      }
    }

    // 2) CLI fallback
    const viaCli = await installViaDshCli(spec, profile, deps)
    if (viaCli.ok || (await pluginPackagePresent(deps.dshHome, profile, plugin.name))) {
      results.push({
        name: plugin.name,
        profile,
        status: 'installed',
        detail: viaCli.detail,
        source: plugin.source,
      })
      restartRequired = true
    } else {
      results.push({
        name: plugin.name,
        profile,
        status: 'failed',
        detail: viaCli.detail,
        source: plugin.source,
      })
    }
  }

  return { results, restartRequired }
}
