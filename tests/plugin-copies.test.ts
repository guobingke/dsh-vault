import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { listDetectedPlugins, registryStatuses } from '../src/core/plugin-copies.js'
import { loadSettings } from '../src/core/config-store.js'
import { fakePnpmUnpublished, writePkg } from './fake-pnpm.js'
import type { RestoreRequest } from '../src/core/types.js'

async function put(path: string, data: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}

/**
 * The user's second-machine case: dsh-vscode-bridge@0.3.1 (self-written, only 0.3.0 on npm)
 * lives in the web profile only via cordis.patch.yml + node_modules — not in package.json
 * dependencies nor dsh.profile.bundles.
 */
async function seedMachine1(dsh1: string, agents1: string) {
  await mkdir(join(agents1, 'skills'), { recursive: true })
  await put(join(dsh1, 'settings.yaml'), 'theme: dark\n')
  await writePkg(join(dsh1, 'profiles', 'web'), { name: 'dsh-profile-web', dependencies: { 'dsh-vault': '0.1.0' } })
  await put(join(dsh1, 'profiles', 'web', 'cordis.patch.yml'), `- insert:\n    - id: bridge\n      name: dsh-vscode-bridge\n`)
  const bridge = join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-vscode-bridge')
  await writePkg(bridge, { name: 'dsh-vscode-bridge', version: '0.3.1', dsh: { bundle: { patch: './cordis.patch.yml' } } })
  await put(join(bridge, 'MARKER.txt'), 'machine-1-bridge\n')
  await writePkg(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-vault'), { name: 'dsh-vault', version: '0.1.0', keywords: ['dsh-plugin'] })
  await writePkg(join(dsh1, 'profiles', 'desktop'), { name: 'dsh-profile-desktop', dependencies: { 'dsh-npm-ok': '1.2.3' } })
  await writePkg(join(dsh1, 'profiles', 'desktop', 'node_modules', 'dsh-npm-ok'), { name: 'dsh-npm-ok', version: '1.2.3', keywords: ['dsh-plugin'] })
}

async function scenario(opts: {
  backup?: { bundlePluginCopies?: boolean; pluginCopyExclude?: string[] }
  registry?: Record<string, 'present' | 'missing'>
  restore?: Partial<RestoreRequest>
}) {
  const root = await mkdtemp(join(tmpdir(), 'dv-copies-'))
  const dsh1 = join(root, 'm1', '.dsh'); const agents1 = join(root, 'm1', '.agents')
  const dsh2 = join(root, 'm2', '.dsh'); const agents2 = join(root, 'm2', '.agents')
  await seedMachine1(dsh1, agents1)
  const lookup = opts.registry ? async (name: string, v: string) => opts.registry![`${name}@${v}`] ?? 'present' : null
  const s1 = new VaultService({ dshHome: dsh1, agentsHome: agents1, activeProfile: 'web', registryLookup: lookup, runPluginInstall: async () => ({ ok: true, detail: 'ok', code: 0 }) })
  await s1.init()
  const exportFile = join(root, 'snap.tar.gz')
  const backup = await s1.backup({ exportFile, ...opts.backup })
  s1.stopSchedule()
  await mkdir(join(dsh2, 'profiles', 'web'), { recursive: true })
  await mkdir(agents2, { recursive: true })
  const calls: string[] = []
  const s2 = new VaultService({ dshHome: dsh2, agentsHome: agents2, activeProfile: 'web', registryLookup: null, pnpm: { command: 'pnpm' }, runPluginInstall: fakePnpmUnpublished(new Set(['dsh-vscode-bridge@0.3.1']), calls) })
  await s2.init()
  const result = await s2.restore({ importPath: exportFile, conflict: 'use-backup', createRollbackSnapshot: false, pluginProfiles: ['web'], ...opts.restore })
  s2.stopSchedule()
  const bridge = (result.pluginResults ?? []).find((r) => r.name === 'dsh-vscode-bridge')
  return { root, dsh1, dsh2, backup, result, bridge, calls }
}

describe('plugin copies (保存插件副本)', () => {
  it('cordis + node_modules only, version not on npm: restores from the copy', async () => {
    const t = await scenario({})
    try {
      const rec = t.backup.manifest.plugins.find((p) => p.name === 'dsh-vscode-bridge')
      assert.equal(rec?.fallbackBundle, 'plugin-sources/web/dsh-vscode-bridge')
      assert.equal(t.bridge?.status, 'installed-from-backup', JSON.stringify(t.bridge))
      assert.equal(await readFile(join(t.dsh2, 'profiles', 'web', 'node_modules', 'dsh-vscode-bridge', 'MARKER.txt'), 'utf8'), 'machine-1-bridge\n')
      // source first: the registry was tried before the copy
      assert.ok(t.calls.some((c) => c.includes('add dsh-vscode-bridge@0.3.1')))
    } finally { await rm(t.root, { recursive: true, force: true }) }
  })

  it('snapshot without a copy (older build / copies off): clear 重新备份 message', async () => {
    const t = await scenario({ backup: { bundlePluginCopies: false } })
    try {
      assert.equal(t.backup.manifest.plugins.find((p) => p.name === 'dsh-vscode-bridge')?.fallbackBundle, undefined)
      assert.equal(t.bridge?.status, 'failed')
      assert.equal(t.bridge?.reason, 'no-backup-copy')
      assert.equal(t.bridge?.subject, 'dsh-vscode-bridge@0.3.1')
      const { dictionaries } = await import('../src/client/i18n.js')
      assert.match(dictionaries.zh['restore.reason.no-backup-copy'], /这份备份里没有该插件的副本，请用新版大肥鱼备份重新备份/)
    } finally { await rm(t.root, { recursive: true, force: true }) }
  })

  it('per-plugin exclusion leaves that plugin without a copy', async () => {
    const t = await scenario({ backup: { pluginCopyExclude: ['web:dsh-vscode-bridge'] } })
    try {
      assert.equal(t.backup.manifest.plugins.find((p) => p.name === 'dsh-vscode-bridge')?.fallbackBundle, undefined)
      assert.ok(t.backup.manifest.plugins.find((p) => p.name === 'dsh-npm-ok')?.fallbackBundle)
      assert.equal(t.bridge?.reason, 'no-backup-copy')
    } finally { await rm(t.root, { recursive: true, force: true }) }
  })

  it('version missing from the registry at backup time: restore uses the copy directly', async () => {
    const t = await scenario({ registry: { 'dsh-vscode-bridge@0.3.1': 'missing' } })
    try {
      assert.equal(t.backup.manifest.plugins.find((p) => p.name === 'dsh-vscode-bridge')?.registryMissing, true)
      assert.equal(t.bridge?.status, 'installed-from-backup')
      assert.ok(!t.calls.some((c) => c.includes('add dsh-vscode-bridge@0.3.1')), t.calls.join('\n'))
    } finally { await rm(t.root, { recursive: true, force: true }) }
  })

  it('优先使用备份副本 (copy-first) skips the registry', async () => {
    const t = await scenario({ restore: { pluginRestoreOrder: 'copy-first' } })
    try {
      assert.equal(t.bridge?.status, 'installed-from-backup')
      assert.ok(!t.calls.some((c) => c.includes('add dsh-vscode-bridge@0.3.1')))
    } finally { await rm(t.root, { recursive: true, force: true }) }
  })

  it('lists every plugin (both profiles, cordis-only) with 建议保存副本 hints, and persists the choice', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-list-'))
    try {
      const dsh = join(root, '.dsh'); const agents = join(root, '.agents')
      await seedMachine1(dsh, agents)
      await writePkg(join(dsh, 'profiles', 'web', 'node_modules', 'my-local'), { name: 'my-local', version: '0.0.1', keywords: ['dsh-plugin'] })
      const pkg = JSON.parse(await readFile(join(dsh, 'profiles', 'web', 'package.json'), 'utf8'))
      pkg.dependencies['my-local'] = 'link:E:/dev/my-local'
      await writeFile(join(dsh, 'profiles', 'web', 'package.json'), JSON.stringify(pkg))
      const list = await listDetectedPlugins(dsh, async (n, v) => (n === 'dsh-vscode-bridge' && v === '0.3.1' ? 'missing' : 'present'))
      const by = (k: string) => list.find((p) => p.key === k)
      assert.equal(by('web:dsh-vscode-bridge')?.cordisOnly, true)
      assert.equal(by('web:dsh-vscode-bridge')?.registry, 'missing')
      assert.equal(by('web:dsh-vscode-bridge')?.recommended, true)
      assert.equal(by('web:my-local')?.kind, 'local')
      assert.equal(by('web:my-local')?.recommended, true)
      assert.equal(by('desktop:dsh-npm-ok')?.recommended, false)

      const s = new VaultService({ dshHome: dsh, agentsHome: agents, activeProfile: 'web', registryLookup: null })
      await s.init()
      await s.updateSettings({ pluginCopies: { enabled: true, exclude: ['desktop:dsh-npm-ok'] }, pluginRestoreOrder: 'copy-first' })
      const r = await s.listPlugins({ checkRegistry: false })
      assert.equal(r.plugins.find((p) => p.key === 'desktop:dsh-npm-ok')?.copy, false)
      assert.equal(r.plugins.find((p) => p.key === 'web:dsh-vscode-bridge')?.copy, true)
      const stored = await loadSettings(s.dataDir)
      assert.deepEqual(stored.pluginCopies, { enabled: true, exclude: ['desktop:dsh-npm-ok'] })
      assert.equal(stored.pluginRestoreOrder, 'copy-first')
      // persisted exclusion applies to the next backup
      const b = await s.backup({ exportFile: join(root, 'x.tar.gz') })
      s.stopSchedule()
      assert.equal(b.manifest.plugins.find((p) => p.name === 'dsh-npm-ok')?.fallbackBundle, undefined)
      assert.ok(b.manifest.plugins.find((p) => p.name === 'dsh-vscode-bridge')?.fallbackBundle)
      assert.ok(existsSync(join(root, 'x.tar.gz')))
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('registry check is bounded and never throws', async () => {
    const st = await registryStatuses(
      [{ name: 'a', profile: 'web', source: 'npm:a@1.0.0', version: '1.0.0', installedVersion: '1.0.0' }],
      () => new Promise(() => {}),
      50,
    )
    assert.equal(st.get('web:a'), 'unknown')
  })
})
