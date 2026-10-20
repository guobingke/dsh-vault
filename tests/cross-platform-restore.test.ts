import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { packTarGz, unpackTarGz } from '../src/core/archive.js'
import { sha256Buffer } from '../src/core/checksum.js'
import { parseLocalSpec } from '../src/core/local-spec.js'
import { packSnapshot } from '../src/core/snapshot-io.js'
import { VaultService } from '../src/core/vault-service.js'
import type { CollectedFile, PluginRecord, RestoreRequest } from '../src/core/types.js'

const WIN_HOME = 'C:\\Users\\gbk'

function collected(relPath: string, text: string, category: CollectedFile['category'] = 'settings'): CollectedFile {
  const data = Buffer.from(text)
  return { absPath: '', relPath, category, secret: false, size: data.length, sha256: sha256Buffer(data), data }
}

/** Real snapshot bytes, but with the platform of the machine that made them. */
async function snapshotFrom(files: CollectedFile[], plugins: PluginRecord[], platform: string): Promise<Buffer> {
  const packed = await packSnapshot({ files, plugins, includeSecrets: false, encrypt: false })
  const entries = unpackTarGz(packed.bytes)
  const patched = entries.map((e) => {
    if (e.path !== 'manifest.json') return { path: e.path, data: e.data }
    const manifest = JSON.parse(e.data.toString('utf8')) as { platform: string }
    manifest.platform = platform
    return { path: e.path, data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') }
  })
  return packTarGz(patched)
}

const profilePkg = (deps: Record<string, string>, bundles: string[]) =>
  JSON.stringify({ name: 'dsh-profile-desktop', dependencies: deps, dsh: { profile: { bundles } } }, null, 2)

/** A pnpm that behaves like the real one for this scenario: link:/file: must exist, everything else materializes. */
function fakePnpm(calls: Array<{ cmd: string; args: string[]; cwd?: string }>) {
  return async (cmd: string, args: string[], opts: { cwd?: string }) => {
    calls.push({ cmd, args, cwd: opts.cwd })
    if (cmd !== 'pnpm' || !opts.cwd) return { ok: false, detail: 'no pnpm', code: 1 }
    const dir = opts.cwd
    if (args.includes('--prod')) return { ok: true, detail: 'ok', code: 0 }
    const pkgPath = join(dir, 'package.json')
    const pkg = (existsSync(pkgPath) ? JSON.parse(await readFile(pkgPath, 'utf8')) : { dependencies: {} }) as {
      dependencies?: Record<string, string>
    }
    pkg.dependencies ??= {}
    if (args[0] === 'add') {
      const spec = args[1]!
      const local = parseLocalSpec(spec)
      if (local?.kind === 'path') {
        const abs = local.path
        if (!existsSync(local.tarball ? abs : join(abs, 'package.json'))) {
          return { ok: false, detail: `ERR_PNPM_ENOENT  [ENOENT] open '${abs}'`, code: 1 }
        }
        const meta = local.tarball ? (await readFile(abs, 'utf8')).split('\n')[0]! : (JSON.parse(await readFile(join(abs, 'package.json'), 'utf8')) as { name: string }).name
        pkg.dependencies[meta] = spec
      } else {
        const at = spec.lastIndexOf('@')
        const name = at > 0 ? spec.slice(0, at) : spec
        pkg.dependencies[name] = at > 0 ? spec.slice(at + 1) : spec
      }
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2))
    }
    for (const [name, spec] of Object.entries(pkg.dependencies)) {
      const local = parseLocalSpec(spec)
      if (local?.kind === 'path' && !existsSync(local.tarball ? local.path : join(local.path, 'package.json'))) {
        return { ok: false, detail: `ERR_PNPM_ENOENT  [ENOENT] open '${local.path}'\n\nThis error happened while installing a direct dependency of ${dir}`, code: 1 }
      }
      const nm = join(dir, 'node_modules', ...name.split('/'))
      if (existsSync(join(nm, 'package.json'))) continue
      await mkdir(nm, { recursive: true })
      const version = local ? '1.0.0' : /^\d/.test(spec) ? spec : '1.0.0'
      await writeFile(join(nm, 'package.json'), JSON.stringify({ name, version }))
    }
    return { ok: true, detail: 'ok', code: 0 }
  }
}

interface Scenario {
  /** Bundled copies written into the snapshot, keyed by snapshot-relative path. */
  copies?: Record<string, string | Record<string, unknown>>
  plugins: PluginRecord[]
  dependencies: Record<string, string>
  /** Manifest names this scenario does not carry at all. */
  omitDeps?: string[]
}

async function restore(options: { scenario: (p: string) => Scenario; restore?: Partial<RestoreRequest> }) {
  const root = await mkdtemp(join(tmpdir(), 'dv-cross-'))
  const dshHome = join(root, '.dsh')
  const agentsHome = join(root, '.agents')
  const { scenario } = options
  const bundleDeps = {
    'npm-ok': '1.4.2',
    'gh-plugin': 'github:guobingke/dsh-gh-plugin',
    'win-local-dir': `link:${WIN_HOME}\\plugins\\dsh-local`,
    'win-local-tgz': `file:${WIN_HOME}\\Downloads\\dsh-local-2.0.0.tgz`,
    'dsh-vault': `link:${WIN_HOME}\\dsh-vault`,
  }
  const s = scenario(dshHome)
  for (const name of s.omitDeps ?? []) delete bundleDeps[name as keyof typeof bundleDeps]
  const files: CollectedFile[] = [
    collected('settings.yaml', 'theme: dark\nmodel: deepseek\n'),
    collected('agents-home/skills/my-skill/SKILL.md', '# skill\n', 'skills'),
    collected('profiles/desktop/package.json', profilePkg(bundleDeps, ['@deepseek-ai/dsh-base', ...Object.keys(bundleDeps)])),
    // Present so a same-platform restore would add --frozen-lockfile; a cross-platform one must not.
    collected('profiles/desktop/pnpm-lock.yaml', 'lockfileVersion: 9.0\n'),
  ]
  for (const [rel, body] of Object.entries(s.copies ?? {})) {
    files.push(collected(rel, typeof body === 'string' ? body : JSON.stringify(body), 'plugins'))
  }
  const bytes = await snapshotFrom(files, s.plugins, 'win32')
  const importPath = join(root, 'from-windows.tar.gz')
  await writeFile(importPath, bytes)

  const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = []
  const service = new VaultService({
    dshHome,
    agentsHome,
    activeProfile: 'desktop',
    targetPlatform: 'linux',
    pnpm: { command: 'pnpm' },
    runPluginInstall: fakePnpm(calls),
  })
  await service.init()
  const preview = await service.previewRestore({ importPath, conflict: 'use-backup' })
  const approved = (preview.remotePluginSources ?? []).flatMap((r) => [r.key, r.nameKey])
  const result = await service.restore({
    importPath,
    conflict: 'use-backup',
    createRollbackSnapshot: false,
    approvedPluginSources: approved,
    ...options.restore,
  })
  service.stopSchedule()
  const row = (name: string) => (result.pluginResults ?? []).find((r) => r.name === name)
  const manifest = JSON.parse(await readFile(join(dshHome, 'profiles', 'desktop', 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  return { root, dshHome, preview, result, row, manifest, calls }
}

describe('a snapshot made on Windows restored on Linux', () => {
  it('restores config / skills / presets and the registry + GitHub plugins, and fails only the Windows-only local plugins', async () => {
    const r = await restore({
      scenario: () => ({
        dependencies: {},
        plugins: [
          { name: 'npm-ok', version: '1.4.2', installedVersion: '1.4.2', source: 'npm:npm-ok@1.4.2', profile: 'desktop' },
          { name: 'gh-plugin', source: 'github:guobingke/dsh-gh-plugin', profile: 'desktop' },
          { name: 'win-local-dir', source: `link:${WIN_HOME}\\plugins\\dsh-local`, originalSource: `link:${WIN_HOME}\\plugins\\dsh-local`, profile: 'desktop' },
          { name: 'win-local-tgz', source: `file:${WIN_HOME}\\Downloads\\dsh-local-2.0.0.tgz`, originalSource: `file:${WIN_HOME}\\Downloads\\dsh-local-2.0.0.tgz`, profile: 'desktop' },
          { name: 'dsh-vault', source: `link:${WIN_HOME}\\dsh-vault`, originalSource: `link:${WIN_HOME}\\dsh-vault`, profile: 'desktop' },
        ],
      }),
    })
    try {
      // The preview tells the user what this is before anything is written.
      assert.equal(r.preview.sourcePlatform, 'win32')
      assert.equal(r.preview.targetPlatform, 'linux')
      assert.equal(r.preview.crossPlatform, true)
      assert.ok(r.preview.manualActions.some((m) => /win32.*linux|linux.*win32/i.test(m)))

      // Configuration, skills and the profile manifest still land.
      assert.match(await readFile(join(r.dshHome, 'settings.yaml'), 'utf8'), /theme: dark/)
      assert.match(await readFile(join(r.dshHome, '..', '.agents', 'skills', 'my-skill', 'SKILL.md'), 'utf8'), /# skill/)

      // Network plugins install.
      assert.equal(r.row('npm-ok')?.status, 'installed')
      assert.equal(r.row('gh-plugin')?.status, 'installed')
      // The GitHub spec survives into the manifest, so pnpm resolves it from git rather than the registry.
      assert.match(r.manifest.dependencies['gh-plugin'] ?? '', /guobingke\/dsh-gh-plugin/)
      assert.ok(
        existsSync(join(r.dshHome, 'profiles', 'desktop', 'node_modules', 'gh-plugin', 'package.json')),
        'GitHub plugin is present in node_modules',
      )

      // Windows-only local paths fail individually, with the reason the UI explains.
      for (const name of ['win-local-dir', 'win-local-tgz']) {
        assert.equal(r.row(name)?.status, 'failed', name)
        assert.equal(r.row(name)?.reason, 'foreign-local-source', name)
      }
      // dsh-vault is the running plugin: the target keeps its own install.
      assert.equal(r.row('dsh-vault')?.status, 'skipped')
      assert.equal(r.row('dsh-vault')?.reason, 'self')

      // The unusable Windows paths are gone from the manifest, so later pnpm installs work.
      assert.ok(!('win-local-dir' in r.manifest.dependencies))
      assert.ok(!('win-local-tgz' in r.manifest.dependencies))
      assert.ok(!r.manifest.dsh.profile.bundles.includes('win-local-dir'))
      assert.ok(!r.manifest.dsh.profile.bundles.includes('win-local-tgz'))
      // ...while everything that does resolve here stays.
      assert.ok('npm-ok' in r.manifest.dependencies)
      assert.ok('gh-plugin' in r.manifest.dependencies)

      // A lockfile from the other machine is not forced: frozen installs would fail on the difference.
      const installs = r.calls.filter((c) => c.args[0] === 'install')
      assert.ok(installs.length > 0)
      assert.ok(!installs.some((c) => c.args.includes('--frozen-lockfile')), 'cross-platform restore never uses --frozen-lockfile')

      // Partial, honest outcome: files restored, two plugins not.
      assert.equal(r.result.ok, false)
      assert.ok(r.result.applied.includes('profiles/desktop/package.json'))
      assert.deepEqual([...r.result.pluginsFailed].sort(), ['win-local-dir', 'win-local-tgz'])
    } finally {
      await rm(r.root, { recursive: true, force: true })
    }
  })

  it('still leaves a working manifest when plugin restore is turned off', async () => {
    const r = await restore({
      restore: { reinstallPlugins: false },
      scenario: () => ({ dependencies: {}, plugins: [] }),
    })
    try {
      // No plugin phase at all, yet the Windows paths that would break `pnpm install` are gone.
      assert.ok(!('win-local-dir' in r.manifest.dependencies))
      assert.ok(!('win-local-tgz' in r.manifest.dependencies))
      assert.ok(!r.manifest.dsh.profile.bundles.includes('win-local-dir'))
      // Network specs are left as they are: they do resolve on this machine.
      assert.ok('npm-ok' in r.manifest.dependencies)
      assert.equal(r.result.ok, true)
    } finally {
      await rm(r.root, { recursive: true, force: true })
    }
  })

  it('installs the saved copies of those local plugins instead when the snapshot has them', async () => {
    const r = await restore({
      scenario: () => ({
        dependencies: {},
        omitDeps: ['win-local-tgz'],
        copies: {
          'plugin-sources/desktop/win-local-dir/package.json': { name: 'win-local-dir', version: '0.2.0' },
          'plugin-sources/desktop/win-local-dir/index.js': 'export const apply = () => {}\n',
        },
        plugins: [
          {
            name: 'win-local-dir',
            source: `link:${WIN_HOME}\\plugins\\dsh-local`,
            originalSource: `link:${WIN_HOME}\\plugins\\dsh-local`,
            bundledSource: 'plugin-sources/desktop/win-local-dir',
            bundledKind: 'dir',
            bundledFrom: 'source',
            profile: 'desktop',
          },
        ],
      }),
    })
    try {
      assert.equal(r.row('win-local-dir')?.status, 'installed')
      // The profile points at the restored copy inside this machine's dsh home, not at C:\Users\...
      const spec = r.manifest.dependencies['win-local-dir']!
      assert.match(spec, /^link:/)
      assert.ok(!spec.includes('gbk'), `dependency still points at the source machine: ${spec}`)
      assert.ok(!spec.includes('plugins/dsh-local') && !spec.includes('plugins\\dsh-local'), `dependency still points at the source plugin: ${spec}`)
      // It must resolve inside THIS machine's dsh home, where the copy was restored.
      // Compare with forward slashes on both sides: the separator follows the host, and
      // only Windows is case-insensitive.
      const flat = (p: string) => p.replace(/\\/g, '/')
      const ci = process.platform === 'win32' ? (p: string) => p.toLowerCase() : (p: string) => p
      const specAbs = ci(flat(spec.slice(spec.indexOf(':') + 1)))
      const expectedRoot = ci(flat(join(r.dshHome, 'plugin-sources', 'desktop', 'win-local-dir')))
      assert.equal(specAbs, expectedRoot, `dependency should point at the restored copy: ${spec}`)
      assert.ok(existsSync(join(r.dshHome, 'plugin-sources', 'desktop', 'win-local-dir', 'index.js')))
      assert.equal(r.result.ok, true)
    } finally {
      await rm(r.root, { recursive: true, force: true })
    }
  })
})
