import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { lockedPackages } from '../src/core/collect.js'
import { translate } from '../src/client/i18n.js'
import { makeTempHome } from './helpers.js'
import { writePkg } from './fake-pnpm.js'

type Run = (cmd: string, args: string[], opts: { cwd?: string }) => Promise<{ ok: boolean; detail: string; code: number }>

/**
 * pnpm that "installs" whatever it is asked: link:/file: copies the target's package.json,
 * `name@version` writes that version. A bare name (the old guess) would pull the unrelated
 * `dsh-vault@1.10.75` from npm — recorded so the test can prove it never happens.
 */
function fakePnpm(calls: string[]): Run {
  return async (cmd, args, opts) => {
    calls.push(`${cmd} ${args.join(' ')}`)
    if (cmd !== 'pnpm' || !opts.cwd) return { ok: false, detail: 'no installer', code: 1 }
    const dir = opts.cwd
    const pkgPath = join(dir, 'package.json')
    const pkg = existsSync(pkgPath) ? JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies?: Record<string, string> } : {}
    pkg.dependencies ??= {}
    const put = async (name: string, spec: string) => {
      const nm = join(dir, 'node_modules', ...name.split('/'))
      if (spec.startsWith('link:') || spec.startsWith('file:')) {
        const src = JSON.parse(await readFile(join(spec.slice(5), 'package.json'), 'utf8'))
        await writePkg(nm, src)
      } else {
        const version = spec === 'latest' && name === 'dsh-vault' ? '1.10.75' : spec.replace(/^[\^~]/, '')
        await writePkg(nm, { name, version, description: name === 'dsh-vault' && version === '1.10.75' ? 'UNRELATED npm package' : undefined })
      }
    }
    if (args[0] === 'install') {
      for (const [name, spec] of Object.entries(pkg.dependencies)) await put(name, spec)
      return { ok: true, detail: 'ok', code: 0 }
    }
    if (args[0] === 'add') {
      const spec = args[1]!
      let name: string
      let version: string
      if (spec.startsWith('link:') || spec.startsWith('file:')) {
        const src = JSON.parse(await readFile(join(spec.slice(5), 'package.json'), 'utf8')) as { name: string }
        name = src.name
        version = spec
      } else {
        const at = spec.lastIndexOf('@')
        name = at > 0 ? spec.slice(0, at) : spec
        version = at > 0 ? spec.slice(at + 1) : 'latest'
      }
      await put(name, version)
      pkg.dependencies[name] = version === 'latest' ? '^1.10.75' : version
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2))
      return { ok: true, detail: 'ok', code: 0 }
    }
    return { ok: true, detail: 'ok', code: 0 }
  }
}

const added = (calls: string[]) => calls.filter((c) => c.startsWith('pnpm add ')).map((c) => c.slice('pnpm add '.length).split(' ')[0]!)

async function profile(dshHome: string, name: string, pkg: Record<string, unknown>, patch?: string) {
  const dir = join(dshHome, 'profiles', name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  if (patch !== undefined) await writeFile(join(dir, 'cordis.patch.yml'), patch)
  return dir
}

function service(home: { dshHome: string; agentsHome: string }, calls: string[], extra: Partial<ConstructorParameters<typeof VaultService>[0]> = {}) {
  return new VaultService({ dshHome: home.dshHome, agentsHome: home.agentsHome, activeProfile: 'web', runPluginInstall: fakePnpm(calls), registryIntegrity: null, ...extra })
}

describe('plugins are only installed from a recorded source', () => {
  it('a bundle-only "dsh-vault" never pulls the unrelated npm dsh-vault ^1.10.75', async () => {
    const home = await makeTempHome()
    try {
      const checkout = join(home.root, 'src', 'dsh-vault')
      await writePkg(checkout, { name: 'dsh-vault', version: '0.1.0', keywords: ['dsh-plugin'] })
      await profile(home.dshHome, 'web', { name: 'web', dependencies: { 'dsh-vault': `link:${checkout}` }, dsh: { profile: { bundles: ['dsh-vault'] } } })
      // The exact seed that broke: desktop lists dsh-vault (and a ghost) as bundles with no dependency.
      const desktop = await profile(home.dshHome, 'desktop', {
        name: 'desktop',
        dependencies: {},
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-vault', 'ghost-plugin'] } },
      }, '- insert:\n    - id: ghost-plugin\n      name: ghost-plugin\n')
      const calls: string[] = []
      const svc = service(home, calls)
      await svc.init()
      const targetId = svc.listTargets()[0]!.id
      const backup = await svc.backup({ targetId })
      const ghost = backup.manifest.plugins.find((p) => p.name === 'ghost-plugin')!
      assert.equal(ghost.recordedFrom, 'name-only')
      // dsh-vault's own checkout is not packed into the snapshot.
      assert.ok(!backup.manifest.files.some((f) => f.path.includes('plugin-sources/web/dsh-vault')))

      const result = await svc.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      assert.ok(!added(calls).some((s) => s === 'dsh-vault' || s.startsWith('dsh-vault@') || s === 'ghost-plugin'), added(calls).join(', '))
      const pkg = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
      assert.equal(pkg.dependencies?.['dsh-vault'], undefined)
      assert.ok(!existsSync(join(desktop, 'node_modules', 'dsh-vault')))

      const self = result.pluginResults!.filter((r) => r.name === 'dsh-vault')
      assert.ok(self.length >= 1 && self.every((r) => r.status === 'skipped' && r.reason === 'self'))
      const g = result.pluginResults!.find((r) => r.name === 'ghost-plugin')!
      assert.equal(g.status, 'skipped')
      assert.equal(g.reason, 'no-recorded-source')
      assert.equal(
        translate('zh', 'restore.reason.no-recorded-source', { subject: 'ghost-plugin' }),
        '备份中没有记录 ghost-plugin 的安装来源，也没有副本，已跳过（避免从 npm 装到同名的其他包）',
      )
      // Skips are not failures.
      assert.ok(!result.pluginsFailed.includes('ghost-plugin'))
      svc.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('keeps the target machine\'s own dsh-vault link and drops the source machine\'s path', async () => {
    const home = await makeTempHome()
    try {
      await profile(home.dshHome, 'web', { name: 'web', dependencies: { 'dsh-vault': 'link:/machine-1/old/dsh-vault' }, dsh: { profile: { bundles: ['dsh-vault'] } } })
      const calls: string[] = []
      const svc = service(home, calls)
      await svc.init()
      const targetId = svc.listTargets()[0]!.id
      const backup = await svc.backup({ targetId })
      // Machine 2 has its own checkout linked in web, and none in desktop.
      const mine = join(home.root, 'mine', 'dsh-vault')
      await writePkg(mine, { name: 'dsh-vault', version: '0.1.0' })
      await profile(home.dshHome, 'web', { name: 'web', dependencies: { 'dsh-vault': `link:${mine}` }, dsh: { profile: { bundles: ['dsh-vault'] } } })
      await svc.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      const web = JSON.parse(await readFile(join(home.dshHome, 'profiles', 'web', 'package.json'), 'utf8')) as { dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } } }
      assert.equal(web.dependencies['dsh-vault'], `link:${mine}`)
      assert.ok(web.dsh.profile.bundles.includes('dsh-vault'))
      assert.ok(!added(calls).some((s) => s.includes('machine-1') || s.startsWith('dsh-vault')))
      svc.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  async function cordisOnlySeed(home: { dshHome: string }, opts: { copy: boolean }) {
    const dir = await profile(home.dshHome, 'web', { name: 'web', dependencies: {}, dsh: { profile: { bundles: ['vscode-bridge'] } } },
      '- insert:\n    - id: vscode-bridge\n      name: vscode-bridge\n')
    await writePkg(join(dir, 'node_modules', 'vscode-bridge'), { name: 'vscode-bridge', version: '0.3.1', keywords: ['dsh-plugin'], _integrity: 'sha512-BACKEDUP' })
    return { dir, exclude: opts.copy ? [] : ['web:vscode-bridge'] }
  }

  it('cordis-only plugin: records name+version+integrity and installs that exact version from npm', async () => {
    const home = await makeTempHome()
    try {
      const { dir, exclude } = await cordisOnlySeed(home, { copy: false })
      const calls: string[] = []
      const svc = service(home, calls, { registryIntegrity: async () => 'sha512-BACKEDUP' })
      await svc.init()
      const targetId = svc.listTargets()[0]!.id
      const backup = await svc.backup({ targetId, pluginCopyExclude: exclude })
      const rec = backup.manifest.plugins.find((p) => p.name === 'vscode-bridge')!
      assert.equal(rec.recordedFrom, 'installed')
      assert.equal(rec.installedVersion, '0.3.1')
      assert.equal(rec.integrity, 'sha512-BACKEDUP')
      await rm(join(dir, 'node_modules'), { recursive: true, force: true })
      const result = await svc.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      assert.ok(added(calls).includes('vscode-bridge@0.3.1'), added(calls).join(', '))
      assert.ok(!added(calls).includes('vscode-bridge'))
      assert.equal(result.pluginResults!.find((r) => r.name === 'vscode-bridge')!.status, 'installed')
      svc.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('integrity differs on the registry: installs the saved copy, never the registry package', async () => {
    const home = await makeTempHome()
    try {
      const { dir, exclude } = await cordisOnlySeed(home, { copy: true })
      const calls: string[] = []
      const svc = service(home, calls, { registryIntegrity: async () => 'sha512-SOMEONE-ELSE' })
      await svc.init()
      const targetId = svc.listTargets()[0]!.id
      const backup = await svc.backup({ targetId, pluginCopyExclude: exclude })
      await rm(join(dir, 'node_modules'), { recursive: true, force: true })
      const result = await svc.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      const row = result.pluginResults!.find((r) => r.name === 'vscode-bridge')!
      assert.equal(row.status, 'installed-from-backup')
      assert.match(row.detail, /different integrity/)
      assert.ok(!added(calls).some((s) => s.startsWith('vscode-bridge')), added(calls).join(', '))
      assert.ok(added(calls).some((s) => s.startsWith('link:') && s.includes('plugin-sources')))
      svc.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('integrity differs and no copy: fails with integrity-mismatch instead of installing it', async () => {
    const home = await makeTempHome()
    try {
      const { dir, exclude } = await cordisOnlySeed(home, { copy: false })
      const calls: string[] = []
      const svc = service(home, calls, { registryIntegrity: async () => 'sha512-SOMEONE-ELSE' })
      await svc.init()
      const targetId = svc.listTargets()[0]!.id
      const backup = await svc.backup({ targetId, pluginCopyExclude: exclude })
      await rm(join(dir, 'node_modules'), { recursive: true, force: true })
      const result = await svc.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      const row = result.pluginResults!.find((r) => r.name === 'vscode-bridge')!
      assert.equal(row.status, 'failed')
      assert.equal(row.reason, 'integrity-mismatch')
      assert.ok(!added(calls).some((s) => s.startsWith('vscode-bridge')))
      svc.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('name-only plugin with a saved copy installs the copy, not the registry', async () => {
    const home = await makeTempHome()
    try {
      // Installed package whose package.json name differs from the bundle name: version is not trusted.
      const dir = await profile(home.dshHome, 'web', { name: 'web', dependencies: {}, dsh: { profile: { bundles: ['odd-plugin'] } } })
      await writePkg(join(dir, 'node_modules', 'odd-plugin'), { name: 'something-else', version: '2.0.0', keywords: ['dsh-plugin'] })
      const calls: string[] = []
      const svc = service(home, calls)
      await svc.init()
      const targetId = svc.listTargets()[0]!.id
      const backup = await svc.backup({ targetId })
      const rec = backup.manifest.plugins.find((p) => p.name === 'odd-plugin')!
      assert.equal(rec.recordedFrom, 'name-only')
      assert.ok(rec.fallbackBundle)
      await rm(join(dir, 'node_modules'), { recursive: true, force: true })
      const result = await svc.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      assert.ok(!added(calls).some((s) => s === 'odd-plugin' || s.startsWith('odd-plugin@')))
      const row = result.pluginResults!.find((r) => r.name === 'odd-plugin')!
      assert.notEqual(row.reason, 'no-recorded-source')
      svc.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('older snapshots: a bare-name record without version is treated as name-only', async () => {
    const { hasNoRecordedSource } = await import('../src/core/plugin-install.js')
    assert.equal(hasNoRecordedSource({ name: 'x', source: 'x' }), true)
    assert.equal(hasNoRecordedSource({ name: 'x', source: 'npm:x@1.0.0', version: '1.0.0' }), false)
    assert.equal(hasNoRecordedSource({ name: 'x', source: 'x', installedVersion: '1.0.0' }), false)
    assert.equal(hasNoRecordedSource({ name: 'x', source: 'x', recordedFrom: 'installed', installedVersion: '1.0.0' }), false)
  })

  it('reads integrity from pnpm-lock v9 / v6 / v5 package keys', async () => {
    const home = await makeTempHome()
    try {
      const dir = join(home.root, 'p')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'pnpm-lock.yaml'), [
        "lockfileVersion: '9.0'",
        'packages:',
        '  a@1.0.0:',
        '    resolution: {integrity: sha512-A}',
        "  '/@s/b@2.0.0(peer@1.0.0)':",
        '    resolution: {integrity: sha512-B}',
        '  /c/3.0.0:',
        '    resolution: {integrity: sha512-C, tarball: https://r/c-3.0.0.tgz}',
        '',
      ].join('\n'))
      const m = await lockedPackages(dir)
      assert.equal(m.get('a@1.0.0')?.integrity, 'sha512-A')
      assert.equal(m.get('@s/b@2.0.0')?.integrity, 'sha512-B')
      assert.equal(m.get('c@3.0.0')?.tarball, 'https://r/c-3.0.0.tgz')
    } finally {
      await home.cleanup()
    }
  })
})

describe('dsh-vault installed from GitHub', () => {
  it('a github: dsh-vault on the target is kept and never reinstalled', async () => {
    const home = await makeTempHome()
    try {
      await profile(home.dshHome, 'web', { name: 'web', dependencies: { 'dsh-vault': 'github:guobingke/dsh-vault' }, dsh: { profile: { bundles: ['dsh-vault'] } } })
      const nm = join(home.dshHome, 'profiles', 'web', 'node_modules', 'dsh-vault')
      await writePkg(nm, { name: 'dsh-vault', version: '0.1.0', keywords: ['dsh-plugin'] })
      const calls: string[] = []
      const svc = service(home, calls)
      await svc.init()
      const targetId = svc.listTargets()[0]!.id
      const backup = await svc.backup({ targetId })
      assert.ok(!backup.manifest.files.some((f) => f.path.includes('plugin-sources/web/dsh-vault')))
      await profile(home.dshHome, 'web', { name: 'web', dependencies: { 'dsh-vault': 'github:guobingke/dsh-vault#main' }, dsh: { profile: { bundles: ['dsh-vault'] } } })
      const result = await svc.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      const web = JSON.parse(await readFile(join(home.dshHome, 'profiles', 'web', 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
      assert.equal(web.dependencies['dsh-vault'], 'github:guobingke/dsh-vault#main')
      assert.ok(!calls.some((c) => c.includes('dsh-vault')), calls.join('\n'))
      assert.equal(result.pluginResults!.find((r) => r.name === 'dsh-vault')!.reason, 'self')
      svc.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})
