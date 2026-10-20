/** Regression tests for the re-audit round of 7c56b44 (docs/SECURITY-FIXES-2026-10-20.md, "Re-audit round"). */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { PathPolicy } from '../src/core/path-policy.js'
import { OperationLock } from '../src/core/op-lock.js'
import { buildManifest } from '../src/core/manifest.js'
import { packTarGz } from '../src/core/archive.js'
import { sha256Buffer } from '../src/core/checksum.js'
import { categoryForRelPath } from '../src/core/collect.js'
import type { PluginRecord } from '../src/core/types.js'
import { makeTempHome } from './helpers.js'
// @ts-expect-error plain .mjs build helper
import { normalizeText, cssTagId } from '../scripts/build-utils.mjs'

async function newService(home: Awaited<ReturnType<typeof makeTempHome>>, extra: Partial<ConstructorParameters<typeof VaultService>[0]> = {}) {
  const service = new VaultService({
    dshHome: home.dshHome, agentsHome: home.agentsHome,
    apiHome: join(home.root, 'user-home'), apiPathRoots: [join(home.root, 'approved')],
    runPluginInstall: async () => ({ ok: true, detail: 'ok' }), registryLookup: null, registryIntegrity: null, ...extra,
  })
  await mkdir(join(home.root, 'user-home'), { recursive: true })
  await mkdir(join(home.root, 'approved'), { recursive: true })
  await service.init()
  return service
}

async function snapshotFile(dir: string, files: Record<string, string>, plugins: PluginRecord[] = []): Promise<string> {
  const collected = Object.entries(files).map(([rel, text]) => {
    const data = Buffer.from(text, 'utf8')
    return { absPath: '', relPath: rel, category: categoryForRelPath(rel), secret: false, size: data.length, sha256: sha256Buffer(data), data }
  })
  const manifest = buildManifest({ id: 'vault-20260101T000000Z-abcdef', files: collected, plugins, includeSecrets: false, encrypted: false })
  const tar = packTarGz([{ path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }, ...collected.map((f) => ({ path: `files/${f.relPath}`, data: f.data }))])
  await mkdir(dir, { recursive: true })
  const p = join(dir, `${manifest.id}.tar.gz`)
  await writeFile(p, tar)
  return p
}

describe('re-audit 1: credential folders are denied for list and read; imports must be archives', () => {
  it('denies ~/.ssh etc. for list/read and filters them out of listings', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const uh = join(home.root, 'user-home')
      for (const d of ['.ssh', '.gnupg', '.aws', '.kube', 'Documents']) await mkdir(join(uh, d), { recursive: true })
      await writeFile(join(uh, '.ssh', 'id_ed25519'), 'PRIVATE')
      for (const use of ['list', 'read'] as const) {
        await assert.rejects(() => service.checkApiPath(join(uh, '.ssh'), use))
        await assert.rejects(() => service.checkApiPath(join(uh, '.aws'), use))
        await assert.rejects(() => service.checkApiPath(join(uh, '.ssh', 'id_ed25519'), use))
      }
      await assert.rejects(() => service.checkApiPath(service.dataDir, 'list'))
      await assert.rejects(() => service.listFsApi(join(uh, '.gnupg')))
      const listing = await service.listFsApi(uh) as { entries: { name: string }[] }
      const names = listing.entries.map((e) => e.name)
      assert.ok(names.includes('Documents'), names.join(','))
      for (const n of ['.ssh', '.gnupg', '.aws', '.kube']) assert.ok(!names.includes(n), names.join(','))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('restore importPath must resolve to a .tar.gz / .dshvault file (or a folder)', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const dir = join(home.root, 'approved', 'in')
      const snap = await snapshotFile(dir, { 'settings.yaml': 'a: 1\n' })
      await service.checkApiPath(snap, 'read')
      await service.checkApiPath(dir, 'read')
      await writeFile(join(dir, 'notes.txt'), 'x')
      await writeFile(join(dir, 'm.json'), '{}')
      await assert.rejects(() => service.checkApiPath(join(dir, 'notes.txt'), 'read'))
      await assert.rejects(() => service.checkApiPath(join(dir, 'm.json'), 'read'))
      if (process.platform !== 'win32') {
        const { symlink } = await import('node:fs/promises')
        await symlink(join(dir, 'notes.txt'), join(dir, 'fake.tar.gz'))
        await assert.rejects(() => service.checkApiPath(join(dir, 'fake.tar.gz'), 'read'))
      }
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('PathPolicy denies sensitive dirs for every use', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-pp-'))
    try {
      await mkdir(join(root, '.ssh'), { recursive: true })
      const p = new PathPolicy({ home: root })
      for (const use of ['list', 'read', 'write-dir'] as const) await assert.rejects(() => p.check(join(root, '.ssh'), use))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('re-audit 2: lock ownership, heartbeat and safe release', () => {
  it('a live same-host owner is never taken over, however old its heartbeat', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dv-lock2-'))
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore' })
    try {
      const lockPath = join(dir, 'operation.lock')
      await writeFile(lockPath, JSON.stringify({ pid: child.pid, host: hostname(), nonce: 'n-live', op: 'x', startedAt: '2000-01-01T00:00:00Z', heartbeatAt: 0 }))
      const old = new Date(0)
      await utimes(lockPath, old, old)
      const lock = new OperationLock(dir, { timeoutMs: 300, staleMs: 1, pollMs: 20 })
      await assert.rejects(() => lock.run('y', async () => {}), (e: { code?: string }) => e.code === 'VAULT_BUSY')
      assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).nonce, 'n-live')
    } finally {
      child.kill()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('takes over a dead owner and a foreign-host lock whose heartbeat stopped; keeps a fresh foreign one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dv-lock3-'))
    try {
      const lockPath = join(dir, 'operation.lock')
      const lock = new OperationLock(dir, { timeoutMs: 300, staleMs: 60_000, pollMs: 20 })
      await writeFile(lockPath, JSON.stringify({ pid: 2 ** 30, host: hostname(), nonce: 'dead', op: 'x', startedAt: '', heartbeatAt: Date.now() }))
      assert.equal(await lock.run('a', async () => 1), 1)
      await writeFile(lockPath, JSON.stringify({ pid: 1, host: 'other-host', nonce: 'old', op: 'x', startedAt: '', heartbeatAt: Date.now() - 3_600_000 }))
      await utimes(lockPath, new Date(0), new Date(0))
      assert.equal(await lock.run('b', async () => 2), 2)
      await writeFile(lockPath, JSON.stringify({ pid: 1, host: 'other-host', nonce: 'fresh', op: 'x', startedAt: '', heartbeatAt: Date.now() }))
      await assert.rejects(() => lock.run('c', async () => {}), (e: { code?: string }) => e.code === 'VAULT_BUSY')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('carries a nonce, heartbeats while running, and release never deletes another owner\'s lock', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dv-lock4-'))
    try {
      const lockPath = join(dir, 'operation.lock')
      const lock = new OperationLock(dir, { heartbeatMs: 20 })
      await lock.run('a', async () => {
        const first = JSON.parse(await readFile(lockPath, 'utf8'))
        assert.equal(first.host, hostname())
        assert.equal(first.pid, process.pid)
        assert.match(first.nonce, /^[0-9a-f]{32}$/)
        const old = new Date(0)
        await utimes(lockPath, old, old)
        await new Promise((r) => setTimeout(r, 120))
        assert.ok((await stat(lockPath)).mtimeMs > 0, 'heartbeat touched the lock')
      })
      await assert.rejects(stat(lockPath))
      // Someone else replaced the lock meanwhile: our release must leave theirs alone.
      await new OperationLock(dir, { heartbeatMs: 60_000 }).run('r', async () => {
        const mine = JSON.parse(await readFile(lockPath, 'utf8'))
        await writeFile(lockPath, JSON.stringify({ ...mine, nonce: 'someone-else' }))
      })
      assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).nonce, 'someone-else')
      await rm(lockPath)
      await lock.run('b', async () => {})
      await assert.rejects(stat(lockPath))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('re-audit 3 (H-03): plugin phase', () => {
  it('an abort during the plugin phase rolls the restored files back', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      await writeFile(join(home.dshHome, 'settings.yaml'), 'theme: light\n')
      const snap = await snapshotFile(join(home.root, 'approved', 'in'), { 'settings.yaml': 'theme: dark\n', 'mcp/new.json': '{}' })
      await assert.rejects(
        () => service.restore({ importPath: snap, conflict: 'use-backup' }, (p) => { if (p.phase === 'reinstall') throw new Error('boom') }),
        (e: { code?: string }) => e.code === 'RESTORE_ROLLED_BACK',
      )
      assert.equal(await readFile(join(home.dshHome, 'settings.yaml'), 'utf8'), 'theme: light\n')
      await assert.rejects(stat(join(home.dshHome, 'mcp', 'new.json')))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('individual plugin install failures are partial success: config kept, failure reported', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home, { runPluginInstall: async () => ({ ok: false, detail: 'fail' }) })
      const snap = await snapshotFile(join(home.root, 'approved', 'in'), {
        'settings.yaml': 'theme: dark\n',
        'profiles/web/package.json': JSON.stringify({ name: 'dsh-profile-web', dependencies: { 'dsh-plugin-x': '1.0.0' } }),
      }, [{ name: 'dsh-plugin-x', source: 'dsh-plugin-x', version: '1.0.0', profile: 'web', recordedFrom: 'dependency' }])
      const r = await service.restore({ importPath: snap, conflict: 'use-backup' })
      assert.equal(await readFile(join(home.dshHome, 'settings.yaml'), 'utf8'), 'theme: dark\n')
      assert.ok(r.applied.includes('settings.yaml'))
      assert.ok(r.pluginsFailed.length > 0 && r.ok === false, JSON.stringify(r.pluginResults))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('re-audit 4: deterministic build', () => {
  it('normalizes newlines/BOM and uses path-separator-independent ids', () => {
    assert.equal(normalizeText('\uFEFFa\r\nb\rc\n'), 'a\nb\nc\n')
    assert.equal(cssTagId('pkg', 'C:\\x\\y\\theme.css'), cssTagId('pkg', '/x/y/theme.css'))
  })

  it('tsconfig pins LF output', async () => {
    assert.equal(JSON.parse(await readFile('tsconfig.json', 'utf8')).compilerOptions.newLine, 'lf')
  })

  it('a fresh client bundle is byte-identical to the committed lib/client.js', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dv-build-'))
    try {
      const out = join(dir, 'client.js')
      execFileSync(process.execPath, ['scripts/build-client.mjs', '--out', out], { stdio: 'pipe' })
      assert.ok((await readFile(out)).equals(await readFile('lib/client.js')), 'lib/client.js differs from a clean build')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
