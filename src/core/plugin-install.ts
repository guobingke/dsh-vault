import { access, readFile, realpath, writeFile } from 'node:fs/promises'
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

export async function installedPackageVersion(pkgDir: string): Promise<string | undefined> {
  try {
    const v = (JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')) as { version?: unknown }).version
    return typeof v === 'string' ? v : undefined
  } catch {
    return undefined
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

/**
 * Where a bundled link:/file: plugin should point on this machine: the original
 * local path when it exists here (same layout as machine 1 — identical state),
 * otherwise the source copy restored under $DSH_HOME/plugin-sources.
 */
export async function resolveLinkTarget(plugin: PluginRecord, dshHome: string): Promise<{ abs: string; bundled: boolean } | null> {
  const original = plugin.originalSource ? localSourcePath(plugin.originalSource) : null
  if (original) {
    const abs = resolve(expandUserPath(original))
    if (await pathExists(join(abs, 'package.json'))) return { abs, bundled: false }
  }
  if (plugin.bundledSource) {
    const abs = join(dshHome, ...plugin.bundledSource.split('/'))
    if (await pathExists(abs)) return { abs, bundled: true }
  }
  return null
}

/** Names of a package's runtime `dependencies` that Node cannot find from its (real) directory. */
export async function missingRuntimeDependencies(pkgDir: string): Promise<string[]> {
  let real = pkgDir
  try {
    real = await realpath(pkgDir)
  } catch {
    return []
  }
  let deps: Record<string, string> = {}
  try {
    deps = (JSON.parse(await readFile(join(real, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }).dependencies ?? {}
  } catch {
    return []
  }
  const missing: string[] = []
  for (const dep of Object.keys(deps)) {
    let dir = real
    let found = false
    for (;;) {
      if (await pathExists(join(dir, 'node_modules', ...dep.split('/'), 'package.json'))) {
        found = true
        break
      }
      const up = dirname(dir)
      if (up === dir) break
      dir = up
    }
    if (!found) missing.push(dep)
  }
  return missing
}

/**
 * pnpm does not install the dependencies of a `link:` package, so a bundled
 * plugin source restored on machine 2 has no node_modules — and fails to
 * import in dsh. Install its production deps in place.
 */
export async function installBundledSourceDeps(dir: string, deps: PluginInstallDeps): Promise<{ ok: boolean; detail: string }> {
  if ((await missingRuntimeDependencies(dir)).length === 0) return { ok: true, detail: 'dependencies present' }
  const run = deps.runCommand ?? defaultRunCommand
  const pnpm = deps.pnpmCommand ?? 'pnpm'
  const env = { ...process.env, DSH_HOME: deps.dshHome }
  const args = ['install', '--prod', '--ignore-workspace', '--config.auto-install-peers=false', '--config.node-linker=hoisted']
  if (deps.preferredRegistry) args.push(`--config.registry=${deps.preferredRegistry}`)
  let result = await run(pnpm, args, { cwd: dir, env })
  if (!result.ok && deps.preferredRegistry) {
    result = await run(pnpm, args.filter((a) => !a.startsWith('--config.registry=')), { cwd: dir, env })
  }
  const still = await missingRuntimeDependencies(dir)
  if (still.length) return { ok: false, detail: `dependencies not installed in ${dir}: ${still.join(', ')}\n${result.detail}`.slice(0, 1200) }
  return { ok: true, detail: 'installed bundled source dependencies' }
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
      const target = await resolveLinkTarget(plugin, dshHome)
      if (!target) continue
      const linkSpec = `link:${target.abs}`
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

async function installSpecFor(plugin: PluginRecord, dshHome: string): Promise<{ spec: string; kind: 'npm' | 'link' | 'git' | 'other' }> {
  if (plugin.bundledSource) {
    const target = await resolveLinkTarget(plugin, dshHome)
    return { spec: `link:${target?.abs ?? join(dshHome, ...plugin.bundledSource.split('/'))}`, kind: 'link' }
  }
  const local = localSourcePath(plugin.source)
  if (local) {
    const abs = resolve(expandUserPath(local))
    return { spec: `link:${abs}`, kind: 'link' }
  }
  if (plugin.source.startsWith('git') || plugin.source.includes('github.com')) {
    return { spec: plugin.source.startsWith('npm:') ? plugin.name : plugin.source, kind: 'git' }
  }
  // Exact version machine 1 actually had installed beats the manifest range (e.g. ^1.9.12).
  if (plugin.installedVersion) {
    return { spec: `${plugin.name}@${plugin.installedVersion}`, kind: 'npm' }
  }
  if (plugin.version && !plugin.version.startsWith('link:') && !plugin.version.startsWith('file:')) {
    return { spec: `${plugin.name}@${plugin.version}`, kind: 'npm' }
  }
  if (plugin.source.startsWith('npm:')) {
    return { spec: plugin.source.slice(4), kind: 'npm' }
  }
  return { spec: plugin.name, kind: 'other' }
}

interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

async function readManifest(profileDir: string): Promise<ProfileManifest | null> {
  try {
    return JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8')) as ProfileManifest
  } catch {
    return null
  }
}

async function writeManifest(profileDir: string, pkg: ProfileManifest): Promise<void> {
  await writeFile(join(profileDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, { mode: 0o644 })
}

/** Drop `names` from the profile manifest (dependencies and dsh.profile.bundles). */
async function removeFromManifest(profileDir: string, names: string[]): Promise<void> {
  const pkg = await readManifest(profileDir)
  if (!pkg) return
  let changed = false
  for (const n of names) {
    if (pkg.dependencies && n in pkg.dependencies) {
      delete pkg.dependencies[n]
      changed = true
    }
  }
  const bundles = pkg.dsh?.profile?.bundles
  if (bundles) {
    const kept = bundles.filter((b) => !names.includes(b))
    if (kept.length !== bundles.length) {
      pkg.dsh!.profile!.bundles = kept
      changed = true
    }
  }
  if (changed) await writeManifest(profileDir, pkg)
}

/** Put bundles back into the backup's order after per-plugin installs appended them. */
async function restoreBundleOrder(profileDir: string, original: string[]): Promise<void> {
  const pkg = await readManifest(profileDir)
  const bundles = pkg?.dsh?.profile?.bundles
  if (!pkg || !bundles) return
  const rank = new Map(original.map((b, i) => [b, i]))
  const sorted = [...bundles].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9))
  if (sorted.join('\0') !== bundles.join('\0')) {
    pkg.dsh!.profile!.bundles = sorted
    await writeManifest(profileDir, pkg)
  }
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

  // Remember what was already there, so packages added by the profile install count as installed (restart needed).
  const presentBefore = new Set<string>()
  for (const p of actionable) {
    const profile = p.profile ?? deps.activeProfile
    if (await pluginPackagePresent(deps.dshHome, profile, p.name)) presentBefore.add(`${profile}:${p.name}`)
  }

  // Group by profile and materialize from lockfile/manifest first.
  const isolated = new Map<string, Set<string>>()
  const originalBundles = new Map<string, string[]>()
  const profiles = [...new Set(actionable.map((p) => p.profile ?? deps.activeProfile))]
  for (const profile of profiles) {
    const profileDir = join(deps.dshHome, 'profiles', profile)
    if (!(await pathExists(join(profileDir, 'package.json')))) continue
    const mat = await materializeProfile(profileDir, deps)
    if (!mat.ok) {
      // One unresolvable npm plugin (unpublished, private registry, typo) makes the whole
      // profile install fail, and every later `dsh plugin add` re-resolves the same manifest.
      // Take the not-yet-installed npm plugins out, materialize the rest, then add them one
      // by one below so a bad one only fails itself.
      const pkg = await readManifest(profileDir)
      const isolate: string[] = []
      for (const p of actionable) {
        if ((p.profile ?? deps.activeProfile) !== profile) continue
        if (presentBefore.has(`${profile}:${p.name}`)) continue
        if ((await installSpecFor(p, deps.dshHome)).kind !== 'npm') continue
        if (pkg?.dependencies && p.name in pkg.dependencies) isolate.push(p.name)
      }
      if (isolate.length) {
        originalBundles.set(profile, [...(pkg?.dsh?.profile?.bundles ?? [])])
        isolated.set(profile, new Set(isolate))
        await removeFromManifest(profileDir, isolate)
        await materializeProfile(profileDir, deps)
      }
    }
  }

  // Bundled link: sources need their own runtime deps (pnpm skips them for link:).
  const bundledDeps = new Map<string, { ok: boolean; detail: string }>()
  for (const plugin of actionable) {
    const target = plugin.bundledSource ? await resolveLinkTarget(plugin, deps.dshHome) : null
    if (!target?.bundled || bundledDeps.has(target.abs)) continue
    bundledDeps.set(target.abs, await installBundledSourceDeps(target.abs, deps))
  }

  let restartRequired = false
  for (const plugin of actionable) {
    const profile = plugin.profile ?? deps.activeProfile
    const iso = isolated.get(profile)
    if (iso) {
      // A failed add can leave its entry behind, which would break the next add too.
      const failedHere = results.filter((r) => r.profile === profile && r.status === 'failed' && iso.has(r.name))
      if (failedHere.length) await removeFromManifest(join(deps.dshHome, 'profiles', profile), failedHere.map((r) => r.name))
    }
    if (await pluginPackagePresent(deps.dshHome, profile, plugin.name)) {
      // Present is not enough: a package whose dependencies don't resolve fails to import in dsh.
      const pkgDir = join(deps.dshHome, 'profiles', profile, 'node_modules', ...plugin.name.split('/'))
      const missing = await missingRuntimeDependencies(pkgDir)
      if (missing.length) {
        const target = plugin.bundledSource ? await resolveLinkTarget(plugin, deps.dshHome) : null
        const bundledDetail = target ? bundledDeps.get(target.abs)?.detail : undefined
        results.push({
          name: plugin.name,
          profile,
          status: 'failed',
          detail: `installed but cannot load: missing dependencies ${missing.join(', ')}${bundledDetail ? `\n${bundledDetail}` : ''}`.slice(0, 1200),
          source: plugin.originalSource ?? plugin.source,
        })
        continue
      }
      const version = await installedPackageVersion(pkgDir)
      if (plugin.installedVersion && version && version !== plugin.installedVersion) {
        // Wrong version (lockfile missing/ignored): fall through and install the exact one.
      } else {
      const linked = plugin.bundledSource ? await resolveLinkTarget(plugin, deps.dshHome) : null
      const isNew = !presentBefore.has(`${profile}:${plugin.name}`)
      if (isNew) restartRequired = true
      results.push({
        name: plugin.name,
        profile,
        status: isNew ? 'installed' : 'already-present',
        detail: linked
          ? `linked ${linked.bundled ? 'bundled source' : 'local source'} ${linked.abs}`
          : `${isNew ? 'installed by profile install' : 'already installed'}${version ? ` @${version}` : ''}`,
        source: plugin.source,
      })
      continue
      }
    }

    const { spec, kind } = await installSpecFor(plugin, deps.dshHome)
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

  for (const [profile, names] of isolated) {
    const profileDir = join(deps.dshHome, 'profiles', profile)
    const failed = results.filter((r) => r.profile === profile && r.status === 'failed' && names.has(r.name))
    if (failed.length) await removeFromManifest(profileDir, failed.map((r) => r.name))
    for (const r of failed) r.detail = `${r.detail}\n(left out of profiles/${profile}/package.json so the other plugins still install)`.slice(0, 1400)
    await restoreBundleOrder(profileDir, originalBundles.get(profile) ?? [])
  }

  // Final check: never report success for a version other than machine 1's.
  for (const row of results) {
    if (row.status === 'failed' || row.status === 'skipped') continue
    const plugin = actionable.find((p) => p.name === row.name && (p.profile ?? deps.activeProfile) === row.profile)
    if (!plugin?.installedVersion) continue
    const pkgDir = join(deps.dshHome, 'profiles', row.profile, 'node_modules', ...row.name.split('/'))
    const now = await installedPackageVersion(pkgDir)
    if (now && now !== plugin.installedVersion) {
      row.status = 'failed'
      row.detail = `installed ${now}, but the backup had ${plugin.installedVersion}`
    } else if (now && !row.detail.includes(now)) {
      row.detail = `${row.detail} (@${now})`
    }
  }

  return { results, restartRequired }
}
