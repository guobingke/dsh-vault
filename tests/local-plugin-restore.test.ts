import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { parseLocalSpec } from '../src/core/local-spec.js'
import { makeTempHome } from './helpers.js'

async function writePkg(dir: string, pkg: Record<string, unknown>) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
}

/**
 * A pnpm stand-in that behaves like the real one where it matters: a dependency
 * whose file:/link: path does not exist fails the WHOLE install of that profile
 * (ENOENT), whichever package was being added.
 */
function fakePnpm(calls: Array<{ cmd: string; args: string[]; cwd?: string }>) {
  return async (cmd: string, args: string[], opts: { cwd?: string }) => {
    calls.push({ cmd, args, cwd: opts.cwd })
    if (cmd !== 'pnpm' || !opts.cwd) return { ok: false, detail: "'dsh' 不是内部或外部命令", code: 1 }
    const dir = opts.cwd
    const pkgPath = join(dir, 'package.json')
    if (args.includes('--prod')) return { ok: true, detail: 'ok', code: 0 }
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
    const deps = { ...pkg.dependencies }
    if (args[0] === 'add') {
      const spec = args[1]!
      const local = parseLocalSpec(spec)
      const name = local ? (await readNameFor(local, dir)) : spec.replace(/@[^@]*$/, '')
      if (!name) return { ok: false, detail: ` ERR_PNPM_ENOENT  [ENOENT] open '${(local as { path: string }).path}'`, code: 1 }
      deps[name] = local ? spec : spec.slice(name.length + 1)
    }
    for (const [name, spec] of Object.entries(deps)) {
      const local = parseLocalSpec(spec)
      if (local?.kind === 'path') {
        const abs = isAbsolute(local.path) ? local.path : resolve(dir, local.path)
        if (!existsSync(abs)) {
          return { ok: false, detail: ` ERR_PNPM_ENOENT  [ENOENT] open '${local.path}'\n\nThis error happened while installing a direct dependency of ${dir}`, code: 1 }
        }
      }
      if (local?.kind === 'unsupported') return { ok: false, detail: `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND ${name}`, code: 1 }
      if (!local && /does-not-exist/.test(name)) return { ok: false, detail: `ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/${name}: Not Found - 404`, code: 1 }
    }
    for (const [name, spec] of Object.entries(deps)) {
      const nm = join(dir, 'node_modules', ...name.split('/'))
      if (!existsSync(join(nm, 'package.json'))) await writePkg(nm, { name, version: /^\d/.test(spec) ? spec : '1.0.0' })
    }
    if (args[0] === 'add') {
      pkg.dependencies = deps
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2))
    }
    return { ok: true, detail: 'ok', code: 0 }
  }
}

async function readNameFor(local: { path: string; tarball?: boolean }, dir: string): Promise<string | null> {
  const abs = isAbsolute(local.path) ? local.path : resolve(dir, local.path)
  if (!existsSync(abs)) return null
  if (local.tarball) return (await readFile(abs, 'utf8')).split('\n')[0]!.trim()
  return (JSON.parse(await readFile(join(abs, 'package.json'), 'utf8')) as { name: string }).name
}

/** Machine 1: npm plugins + a .tgz outside the home (absolute) + a relative link: dir + a deleted tarball + workspace:. */
async function seedMachine1(root: string, dshHome: string) {
  const outside = join(root, 'Documents', 'Codex', '2026-10-06', 'bang', 'outputs')
  await mkdir(outside, { recursive: true })
  const tgz = join(outside, 'dsh-skill-mcp-panel-2.1.5-selfuse.2.tgz')
  await writeFile(tgz, 'dsh-skill-mcp-panel\n(fake tarball bytes)')
  const bridge = join(root, 'dev', 'codex-dsh-memory-bridge')
  await writePkg(bridge, { name: '@local/codex-dsh-memory-bridge', version: '0.3.0' })
  await writeFile(join(bridge, 'index.js'), 'export const apply = () => {}\n')
  for (const profile of ['web', 'desktop']) {
    const dir = join(dshHome, 'profiles', profile)
    await writePkg(dir, {
      name: `dsh-profile-${profile}`,
      dependencies: {
        'dsh-purge': '1.2.0',
        '@anysearch/anysearch-dsh': '0.4.1',
        'dsh-skill-mcp-panel': `file:${tgz}`,
        '@local/codex-dsh-memory-bridge': 'link:../../../dev/codex-dsh-memory-bridge',
        'dsh-gone-tarball': `file:${join(outside, 'deleted-1.0.0.tgz')}`,
        'dsh-ws-plugin': 'workspace:*',
      },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-purge', '@anysearch/anysearch-dsh', 'dsh-skill-mcp-panel', '@local/codex-dsh-memory-bridge', 'dsh-gone-tarball', 'dsh-ws-plugin'] } },
    })
    for (const [name, version] of [['dsh-purge', '1.2.0'], ['@anysearch/anysearch-dsh', '0.4.1'], ['dsh-skill-mcp-panel', '2.1.5-selfuse.2'], ['dsh-gone-tarball', '1.0.0'], ['dsh-ws-plugin', '0.0.1']] as const) {
      await writePkg(join(dir, 'node_modules', ...name.split('/')), { name, version })
      await writeFile(join(dir, 'node_modules', ...name.split('/'), 'index.js'), 'export const apply = () => {}\n')
    }
  }
  return { tgz, bridge, outside }
}

describe('local plugins (file: tarballs, link: dirs, workspace:) machine 1 → machine 2', () => {
  it('bundles every kind of local source and installs them on machine 2 without machine-1 paths', async () => {
    const m1 = await makeTempHome('dv-m1-')
    const m2 = await makeTempHome('dv-m2-')
    const xfer = await mkdtemp(join(tmpdir(), 'dv-xfer-'))
    try {
      const { outside } = await seedMachine1(m1.root, m1.dshHome)
      const s1 = new VaultService({ dshHome: m1.dshHome, agentsHome: m1.agentsHome, activeProfile: 'desktop' })
      await s1.init()
      const exportFile = join(xfer, 'm1.tar.gz')
      const backup = await s1.backup({ exportFile })
      s1.stopSchedule()
      const rec = (name: string, profile = 'desktop') => backup.manifest.plugins.find((p) => p.name === name && p.profile === profile)!
      assert.equal(rec('dsh-skill-mcp-panel').bundledKind, 'tarball')
      assert.equal(rec('dsh-skill-mcp-panel').bundledSource, 'plugin-sources/desktop/dsh-skill-mcp-panel/dsh-skill-mcp-panel-2.1.5-selfuse.2.tgz')
      assert.equal(rec('@local/codex-dsh-memory-bridge').bundledKind, 'dir', 'relative link: resolved against the profile dir')
      assert.equal(rec('@local/codex-dsh-memory-bridge').originalSource, `link:${join(m1.root, 'dev', 'codex-dsh-memory-bridge')}`)
      assert.equal(rec('dsh-gone-tarball').bundledFrom, 'installed', 'deleted tarball falls back to the installed copy')
      assert.equal(rec('dsh-ws-plugin').bundledFrom, 'installed')
      assert.equal(rec('dsh-purge').installedVersion, '1.2.0')

      // Machine 2: none of machine 1's paths exist.
      await rm(m1.root, { recursive: true, force: true })
      const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = []
      await writePkg(join(m2.dshHome, 'profiles', 'desktop'), { name: 'dsh-profile-desktop', dependencies: {} })
      const s2 = new VaultService({ dshHome: m2.dshHome, agentsHome: m2.agentsHome, activeProfile: 'desktop', pnpm: { command: 'pnpm' }, runPluginInstall: fakePnpm(calls) })
      await s2.init()
      const result = await s2.restore({ importPath: exportFile, conflict: 'use-backup', createRollbackSnapshot: false })
      s2.stopSchedule()
      const failed = (result.pluginResults ?? []).filter((r) => r.status === 'failed')
      assert.deepEqual(failed.map((r) => `${r.profile}:${r.name} ${r.detail}`), [])
      assert.equal(result.ok, true)
      const keys = (result.pluginResults ?? []).map((r) => `${r.profile}:${r.name}`)
      assert.equal(new Set(keys).size, keys.length, 'one row per profile:plugin')
      for (const profile of ['web', 'desktop']) {
        const text = await readFile(join(m2.dshHome, 'profiles', profile, 'package.json'), 'utf8')
        assert.ok(!text.includes(outside) && !text.includes(m1.root), `no machine-1 path left in ${profile}/package.json:\n${text}`)
        const pkg = JSON.parse(text) as { dependencies: Record<string, string> }
        assert.match(pkg.dependencies['dsh-skill-mcp-panel']!, /^file:.*plugin-sources\/(web|desktop)\/dsh-skill-mcp-panel\/dsh-skill-mcp-panel-2\.1\.5-selfuse\.2\.tgz$/)
        assert.match(pkg.dependencies['@local/codex-dsh-memory-bridge']!, /^link:.*plugin-sources\/(web|desktop)\/local__codex-dsh-memory-bridge$/)
        assert.ok(existsSync(join(m2.dshHome, 'profiles', profile, 'node_modules', 'dsh-skill-mcp-panel', 'package.json')))
      }
    } finally {
      await m1.cleanup().catch(() => {})
      await m2.cleanup()
      await rm(xfer, { recursive: true, force: true })
    }
  })

  it('an unbundled machine-1 path no longer poisons the profile; retry installs it once it exists', async () => {
    const m1 = await makeTempHome('dv-m1-')
    const m2 = await makeTempHome('dv-m2-')
    const xfer = await mkdtemp(join(tmpdir(), 'dv-xfer-'))
    try {
      const { tgz } = await seedMachine1(m1.root, m1.dshHome)
      // Like a snapshot from an older dsh-vault: sources not bundled.
      const s1 = new VaultService({ dshHome: m1.dshHome, agentsHome: m1.agentsHome, activeProfile: 'desktop' })
      await s1.init()
      const exportFile = join(xfer, 'old.tar.gz')
      await s1.backup({ exportFile, bundleLocalPlugins: false })
      s1.stopSchedule()
      await rm(m1.root, { recursive: true, force: true })

      const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = []
      const installs: string[] = []
      const s2 = new VaultService({
        dshHome: m2.dshHome,
        agentsHome: m2.agentsHome,
        activeProfile: 'desktop',
        pnpm: { command: 'pnpm' },
        runPluginInstall: fakePnpm(calls),
        pluginManager: {
          profile: { name: 'desktop' },
          async installBundle(spec) {
            installs.push(spec)
            return { application: 'failed', error: { code: 'install-failed', message: 'simulated' } }
          },
        },
      })
      await s2.init()
      const result = await s2.restore({ importPath: exportFile, conflict: 'use-backup', createRollbackSnapshot: false })
      const rows = result.pluginResults ?? []
      const row = (name: string, profile = 'desktop') => rows.find((r) => r.name === name && r.profile === profile)!
      for (const profile of ['web', 'desktop']) {
        assert.equal(row('dsh-purge', profile).status, 'installed', `${profile} dsh-purge: ${row('dsh-purge', profile).detail}`)
        assert.equal(row('@anysearch/anysearch-dsh', profile).status, 'installed')
        assert.equal(row('dsh-skill-mcp-panel', profile).reason, 'tarball-missing')
        assert.equal(row('dsh-skill-mcp-panel', profile).subject, tgz)
        assert.equal(row('@local/codex-dsh-memory-bridge', profile).reason, 'local-source-missing')
        assert.equal(row('dsh-ws-plugin', profile).reason, 'unsupported-spec')
      }
      assert.ok(!installs.some((s) => s.includes('web')), 'host pluginManager only used for its own profile')
      assert.ok(rows.every((r) => !r.detail.includes('\n')), 'one short line per plugin')
      assert.equal(result.ok, false)
      const keys = rows.map((r) => `${r.profile}:${r.name}`)
      assert.equal(new Set(keys).size, keys.length)
      for (const profile of ['web', 'desktop']) {
        const pkg = JSON.parse(await readFile(join(m2.dshHome, 'profiles', profile, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
        assert.ok(!('dsh-skill-mcp-panel' in pkg.dependencies), 'unresolvable spec left out so later installs work')
      }

      // Retrying while the folder is still missing: a clear reason, no pnpm call, no stray entry.
      const webPkgBefore = await readFile(join(m2.dshHome, 'profiles', 'web', 'package.json'), 'utf8')
      const callsBefore = calls.length
      const stillMissing = await s2.retryFailedPlugins({ plugins: [{ name: '@local/codex-dsh-memory-bridge', profile: 'web' }] })
      assert.deepEqual(
        (stillMissing.pluginResults ?? []).map((r) => `${r.profile}:${r.name}:${r.status}:${r.reason}`),
        ['web:@local/codex-dsh-memory-bridge:failed:local-source-missing'],
      )
      assert.ok(!calls.slice(callsBefore).some((c) => c.args.includes('add')), 'missing folder never handed to pnpm add')
      assert.equal(await readFile(join(m2.dshHome, 'profiles', 'web', 'package.json'), 'utf8'), webPkgBefore)

      // Owner copies the tarball to the same path on machine 2 → retry only the failed ones.
      await mkdir(dirname(tgz), { recursive: true })
      await writeFile(tgz, 'dsh-skill-mcp-panel\n')
      const before = calls.length
      const retry = await s2.retryFailedPlugins({ plugins: [{ name: 'dsh-skill-mcp-panel', profile: 'desktop' }] })
      s2.stopSchedule()
      assert.deepEqual((retry.pluginResults ?? []).map((r) => `${r.profile}:${r.name}:${r.status}`), ['desktop:dsh-skill-mcp-panel:installed'])
      assert.equal(retry.ok, true)
      assert.equal(retry.applied.length, 0, 'retry does not rewrite config')
      assert.ok(calls.slice(before).every((c) => c.cwd?.includes(join('profiles', 'desktop'))), 'retry touched only the desktop profile')
    } finally {
      await m1.cleanup().catch(() => {})
      await m2.cleanup()
      await rm(xfer, { recursive: true, force: true })
    }
  })
})
