import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { homeExcludeReason, listPluginDataEntries } from '../src/core/home-scope.js'
import { diffHomes } from '../src/core/home-diff.js'
import { packTarGz, unpackTarGz } from '../src/core/archive.js'
import { classifyInstallFailure, isRemoteNonRegistrySpec, parseLocalSpec, resolveLocalSpecPath } from '../src/core/local-spec.js'

async function put(path: string, data: string | Buffer) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}

/** The owner's real machine-1 layout (C:\Users\24600\.dsh), with fake contents. */
async function seedOwnerHome(dshHome: string, agentsHome: string) {
  const f = (rel: string, data: string | Buffer) => put(join(dshHome, ...rel.split('/')), data)
  await f('.agent-presets/coder.json', '{"name":"coder"}')
  await f('attachments/a1/screenshot.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  await f('backups/memory-bridge/2026-10-18.json', '{"memories":[1,2,3]}')
  await f('boot-animation/selection.json', '{"id":"whale"}')
  for (const n of ['drill-grant.json', 'installed-rev', 'last-cwd.txt', 'override-state.json', 'settle-restart.guard', 'unpacked-asar.json', 'applied.json']) {
    await f(`dsh-purge/${n}`, `${n} from machine 1\n`)
  }
  await f('dsh-vault/targets.json', '[{"kind":"webdav","password":"s3cret"}]')
  await f('dsh-vault/snapshots/old.tar.gz', 'x')
  await f('llm-deepseek/files-v3.json', '{"files":[]}')
  await f('profiles/node_modules/.modules.yaml', 'junk')
  await f('profiles/desktop/package.json', JSON.stringify({
    name: 'dsh-profile-desktop',
    dependencies: {
      '@linxin666/dsh-client-ui-skin-center': '0.4.4',
      '@local/codex-dsh-memory-bridge': 'file:E:/cds/codex-dsh-memory-bridge/artifacts/local-codex-dsh-memory-bridge-0.2.0.tgz',
      '@wxg-prc-cpg/browser-skill-dsh-plugin': '^0.3.2',
      'dsh-purge': 'github:YuJunZhiXue/dsh-purge',
      'dsh-skill-mcp-panel': 'file:C:/Users/24600/Documents/Codex/2026-10-06/bang/outputs/dsh-skill-mcp-panel-2.1.5-selfuse.2.tgz',
      'dsh-vault': 'link:C:/Users/24600/~/dsh-vault',
    },
    dsh: { profile: { bundles: ['dsh-purge', 'dsh-skill-mcp-panel', '@local/codex-dsh-memory-bridge', 'dsh-vault'] } },
  }, null, 2))
  await f('profiles/desktop/node_modules/x/package.json', '{}')
  await f('profiles/desktop/.plugin-manager/logs/op-1/pnpm.log', 'log')
  await f('profiles/web/package.json', JSON.stringify({
    name: 'dsh-profile-web',
    dependencies: { '@anysearch/anysearch-dsh': '^0.1.2', '@wxg-prc-cpg/browser-skill-dsh-plugin': '^0.3.2' },
  }, null, 2))
  await f('redteam/engagements/\u6f14\u7ec3-01/\u62a5\u544a.md', '# \u62a5\u544a\n\u7ea2\u961f\u6f14\u7ec3\u8bb0\u5f55\n')
  await f('redteam/skills/\u7ea2\u961f\u6280\u80fd/SKILL.md', '# skill\n')
  await f('redteam/preset-declare.json', '{}')
  await f('redteam/setup.sh', '#!/bin/sh\n')
  await f('sessions/chat-1.jsonl', '{"role":"user"}\n')
  await f('skin-center/wallpapers/a.png', Buffer.from([1, 2, 3]))
  await f('skins/whale-fantasy/skin.json', '{"name":"whale"}')
  await f('storages/session_projcache/index.json', '{}')
  await f('storages/session_projcache.json', '{}')
  await f('storages/workspace.json', '{"workspaces":[]}')
  await f('.anonymous-user-id', 'uuid')
  await f('.credentials.yaml', 'apiKey: SECRET\n')
  await f('prompt-inject.md', '\u4e2d\u6587\u63d0\u793a\u8bcd\n')
  await f('settings.yaml.imported', 'imported: true\n')
  await f('settings.yaml', 'theme: dark\n')
  await f('skin-center-active.json', '{"id":"whale"}')
  await put(join(agentsHome, 'skills', '\u5199\u4f5c\u52a9\u624b', 'SKILL.md'), '# \u5199\u4f5c\n')
}

describe('home scope (denylist)', () => {
  it('excludes sessions, attachments, dsh-vault, node_modules, secrets, and dsh-purge machine state', () => {
    assert.equal(homeExcludeReason('sessions', true), 'chat-history')
    assert.equal(homeExcludeReason('sessions/a.jsonl', false), 'chat-history')
    assert.equal(homeExcludeReason('attachments', true), 'attachments')
    assert.equal(homeExcludeReason('dsh-vault/targets.json', false), 'vault-own')
    assert.equal(homeExcludeReason('profiles/desktop/node_modules/x', true), 'node-modules')
    assert.equal(homeExcludeReason('profiles/desktop/.plugin-manager/logs/op', true), 'plugin-manager-logs')
    assert.equal(homeExcludeReason('.anonymous-user-id', false), 'machine-id')
    assert.equal(homeExcludeReason('.credentials.yaml', false), 'secret')
    assert.equal(homeExcludeReason('.credentials.yaml', false, { includeSecrets: true }), null)
    assert.equal(homeExcludeReason('dsh-purge/installed-rev', false), 'machine-state')
    assert.equal(homeExcludeReason('dsh-purge/applied.json', false), 'machine-state')
    assert.equal(homeExcludeReason('dsh-purge/unpacked-asar.json', false), 'machine-state')
    assert.equal(homeExcludeReason('dsh-purge/settle-restart.guard', false), 'machine-state')
    assert.equal(homeExcludeReason('dsh-purge/drill-grant.json', false), null)
    assert.equal(homeExcludeReason('dsh-purge/override-state.json', false), null)
    assert.equal(homeExcludeReason('dsh-purge/last-cwd.txt', false), null)
    assert.equal(homeExcludeReason('backups/memory-bridge/x.json', false), null)
    assert.equal(homeExcludeReason('redteam/engagements/x.md', false), null)
    assert.equal(homeExcludeReason('storages/session_projcache.json', false), 'machine-state')
    assert.equal(homeExcludeReason('storages/workspace.json', false), 'workspace')
  })

  it('lists the detected plugin data entries for the UI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-scope-'))
    const dsh = join(root, '.dsh')
    await seedOwnerHome(dsh, join(root, '.agents'))
    try {
      const entries = await listPluginDataEntries(dsh)
      assert.ok(entries.includes('dsh-purge/'))
      assert.ok(entries.includes('redteam/'))
      assert.ok(entries.includes('backups/'))
      assert.ok(entries.includes('prompt-inject.md'))
      assert.ok(!entries.some((e) => e.startsWith('sessions')))
      assert.ok(!entries.some((e) => e.startsWith('attachments')))
      assert.ok(!entries.some((e) => e.startsWith('dsh-vault')))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('Windows path specs (owner machine)', () => {
  it('parses forward-slash drive letters including a different drive', () => {
    for (const raw of [
      'file:C:/Users/24600/Documents/Codex/2026-10-06/bang/outputs/dsh-skill-mcp-panel-2.1.5-selfuse.2.tgz',
      'file:E:/cds/codex-dsh-memory-bridge/artifacts/local-codex-dsh-memory-bridge-0.2.0.tgz',
      'link:C:/Users/24600/~/dsh-vault',
    ]) {
      const s = parseLocalSpec(raw)
      assert.equal(s?.kind, 'path')
      if (s?.kind !== 'path') continue
      assert.ok(/^[A-Za-z]:\//.test(s.path) || s.path.includes('Users'), s.path)
      const abs = resolveLocalSpecPath(s.path, 'C:/Users/24600/.dsh/profiles/desktop', { platform: 'win32' })
      assert.match(abs, /^[A-Za-z]:\\/)
    }
    assert.equal(isRemoteNonRegistrySpec('github:YuJunZhiXue/dsh-purge'), true)
    assert.equal(isRemoteNonRegistrySpec('^0.3.2'), false)
  })

  it('classifies a missing git clearly', () => {
    const c = classifyInstallFailure(
      "pnpm: Command failed with ENOENT: git ls-remote https://github.com/YuJunZhiXue/dsh-purge.git HEAD\nspawn git ENOENT",
      [],
      'dsh-purge',
    )
    assert.equal(c.reason, 'git-missing')
  })
})

describe('pax / UTF-8 tar names', () => {
  it('round-trips Chinese names through pack, unpack, GNU tar and bsdtar', () => {
    const entries = [
      { path: 'files/agents-home/skills/\u5199\u4f5c\u52a9\u624b/SKILL.md', data: Buffer.from('\u4e2d\u6587\u5185\u5bb9\n', 'utf8') },
      { path: 'files/redteam/engagements/\u6f14\u7ec3-01/\u62a5\u544a v2.md', data: Buffer.from('# ok\n', 'utf8') },
      { path: 'files/' + 'a'.repeat(80) + '/' + 'b'.repeat(80) + '/long.txt', data: Buffer.from('long') },
    ]
    const archive = packTarGz(entries)
    const back = unpackTarGz(archive)
    assert.deepEqual(back.map((e) => e.path), entries.map((e) => e.path))
    assert.equal(back[0]!.data.toString('utf8'), '\u4e2d\u6587\u5185\u5bb9\n')

    // External readers: extract (not list — Windows tar prints names in the console
    // code page) and check the Unicode paths on disk. Each tool is checked when present.
    const tmp = join(tmpdir(), `pax-${Date.now()}.tar.gz`)
    writeFileSync(tmp, archive)
    for (const tool of ['tar', 'bsdtar']) {
      const probe = spawnSync(tool, ['--version'], { encoding: 'utf8' })
      if (probe.error) continue // not installed here (e.g. no bsdtar on ubuntu-latest)
      const out = join(tmpdir(), `pax-out-${tool}-${Date.now()}`)
      mkdirSync(out)
      execFileSync(tool, ['xzf', tmp, '-C', out])
      assert.ok(existsSync(join(out, 'files', 'agents-home', 'skills', '\u5199\u4f5c\u52a9\u624b', 'SKILL.md')), tool)
      assert.ok(existsSync(join(out, 'files', 'redteam', 'engagements', '\u6f14\u7ec3-01', '\u62a5\u544a v2.md')), tool)
      assert.ok(existsSync(join(out, 'files', 'a'.repeat(80), 'b'.repeat(80), 'long.txt')), tool)
    }
  })
})

describe('full-home backup + restore + diff', () => {
  it('backs up every plugin data dir, restores byte-identical, and keeps dsh-purge machine state out', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-r4-'))
    const m1 = join(root, 'm1')
    const m2 = join(root, 'm2')
    const dsh1 = join(m1, '.dsh')
    const agents1 = join(m1, '.agents')
    const dsh2 = join(m2, '.dsh')
    const agents2 = join(m2, '.agents')
    const outsideC = join(root, 'C', 'Users', '24600', 'Documents', 'Codex', '2026-10-06', 'bang', 'outputs')
    const outsideE = join(root, 'E', 'cds', 'codex-dsh-memory-bridge', 'artifacts')
    const vaultSrc = join(root, 'vault-src')
    try {
      await seedOwnerHome(dsh1, agents1)
      await put(join(outsideC, 'dsh-skill-mcp-panel-2.1.5-selfuse.2.tgz'), 'dsh-skill-mcp-panel\n')
      await put(join(outsideE, 'local-codex-dsh-memory-bridge-0.2.0.tgz'), '@local/codex-dsh-memory-bridge\n')
      await put(join(vaultSrc, 'package.json'), JSON.stringify({ name: 'dsh-vault', version: '0.1.0' }))
      // Point the Windows-looking specs at our Linux stand-ins for the bundling step.
      const desktopPkg = JSON.parse(await readFile(join(dsh1, 'profiles', 'desktop', 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
      desktopPkg.dependencies['dsh-skill-mcp-panel'] = `file:${join(outsideC, 'dsh-skill-mcp-panel-2.1.5-selfuse.2.tgz')}`
      desktopPkg.dependencies['@local/codex-dsh-memory-bridge'] = `file:${join(outsideE, 'local-codex-dsh-memory-bridge-0.2.0.tgz')}`
      desktopPkg.dependencies['dsh-vault'] = `link:${vaultSrc}`
      await writeFile(join(dsh1, 'profiles', 'desktop', 'package.json'), JSON.stringify(desktopPkg, null, 2))

      // A fake installed dsh-purge so the github: spec can be bundled as a fallback.
      await put(join(dsh1, 'profiles', 'desktop', 'node_modules', 'dsh-purge', 'package.json'), JSON.stringify({ name: 'dsh-purge', version: '1.1.72' }))
      await put(join(dsh1, 'profiles', 'desktop', 'node_modules', 'dsh-purge', 'lib', 'index.js'), 'export {}\n')
      await put(join(dsh1, 'profiles', 'desktop', 'pnpm-lock.yaml'), [
        'lockfileVersion: \'9.0\'',
        '',
        'importers:',
        '  \'.\':',
        '    dependencies:',
        '      dsh-purge:',
        '        specifier: github:YuJunZhiXue/dsh-purge',
        '        version: https://codeload.github.com/YuJunZhiXue/dsh-purge/tar.gz/52e8c68d39023100b4e88f91328f88227132736f',
        '',
      ].join('\n'))

      const s1 = new VaultService({ dshHome: dsh1, agentsHome: agents1, activeProfile: 'desktop', runPluginInstall: async () => ({ ok: true, detail: 'ok', code: 0 }) })
      await s1.init()
      const exportFile = join(root, 'owner.tar.gz')
      await s1.backup({ exportFile })
      s1.stopSchedule()

      // Fresh machine 2: empty home.
      await mkdir(join(dsh2, 'profiles', 'desktop'), { recursive: true })
      await mkdir(agents2, { recursive: true })
      const calls: Array<{ cmd: string; args: string[] }> = []
      const s2 = new VaultService({
        dshHome: dsh2,
        agentsHome: agents2,
        activeProfile: 'desktop',
        runPluginInstall: async (cmd, args) => {
          calls.push({ cmd, args })
          return { ok: true, detail: 'ok', code: 0 }
        },
      })
      await s2.init()
      const result = await s2.restore({ importPath: exportFile, conflict: 'use-backup', createRollbackSnapshot: false, reinstallPlugins: false })
      s2.stopSchedule()
      assert.equal(result.ok, true)

      // Plugin data is back byte-identical.
      for (const rel of [
        'backups/memory-bridge/2026-10-18.json',
        'boot-animation/selection.json',
        'dsh-purge/drill-grant.json',
        'dsh-purge/override-state.json',
        'dsh-purge/last-cwd.txt',
        'llm-deepseek/files-v3.json',
        'redteam/engagements/\u6f14\u7ec3-01/\u62a5\u544a.md',
        'redteam/skills/\u7ea2\u961f\u6280\u80fd/SKILL.md',
        'skin-center/wallpapers/a.png',
        'skins/whale-fantasy/skin.json',
        'prompt-inject.md',
        'settings.yaml.imported',
        'skin-center-active.json',
      ]) {
        assert.equal(
          await readFile(join(dsh2, ...rel.split('/')), 'utf8'),
          await readFile(join(dsh1, ...rel.split('/')), 'utf8'),
          rel,
        )
      }
      assert.equal(await readFile(join(agents2, 'skills', '\u5199\u4f5c\u52a9\u624b', 'SKILL.md'), 'utf8'), '# \u5199\u4f5c\n')

      // Documented excludes stayed out.
      assert.ok(!existsSync(join(dsh2, 'sessions', 'chat-1.jsonl')))
      assert.ok(!existsSync(join(dsh2, 'attachments', 'a1', 'screenshot.png')))
      assert.ok(!existsSync(join(dsh2, 'dsh-purge', 'installed-rev')))
      assert.ok(!existsSync(join(dsh2, 'dsh-purge', 'applied.json')))
      assert.ok(!existsSync(join(dsh2, 'dsh-purge', 'unpacked-asar.json')))
      assert.ok(!existsSync(join(dsh2, 'dsh-purge', 'settle-restart.guard')))
      assert.ok(!existsSync(join(dsh2, '.anonymous-user-id')))
      assert.ok(!existsSync(join(dsh2, 'storages', 'session_projcache.json')))
      assert.ok(!existsSync(join(dsh2, 'storages', 'workspace.json')), 'workspaces are not migrated')
      assert.ok(!existsSync(join(dsh2, 'profiles', 'desktop', 'node_modules', 'x')))

      const d = await diffHomes({ homeA: dsh1, homeB: dsh2, agentsA: agents1, agentsB: agents2 })
      assert.equal(d.clean, true, JSON.stringify(d, null, 2))
      assert.ok(d.identical >= 20)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
