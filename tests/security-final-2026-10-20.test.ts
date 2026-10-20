/** Regression tests for the final re-audit of 6bd36cb (docs/SECURITY-FIXES-2026-10-20.md, "Final round"). */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer, request as httpRequest } from 'node:http'
import { VaultService, isTrustedPluginSource, pluginSourceKey, remotePluginSources } from '../src/core/vault-service.js'
import { buildVaultRoutes } from '../src/api/routes.js'
import { memoryBasedArchiveLimit } from '../src/core/archive.js'
import { NO_SCRIPTS_ENV } from '../src/core/plugin-install.js'
import { runDshPluginAdd } from '../src/cli/dsh-add.js'
import { buildManifest } from '../src/core/manifest.js'
import { packTarGz } from '../src/core/archive.js'
import { sha256Buffer } from '../src/core/checksum.js'
import { categoryForRelPath } from '../src/core/collect.js'
import type { PluginRecord } from '../src/core/types.js'
import { allowAll } from './api-client.js'
import { makeTempHome } from './helpers.js'

type Call = { cmd: string; args: string[]; env?: NodeJS.ProcessEnv }

async function newService(home: Awaited<ReturnType<typeof makeTempHome>>, extra: Partial<ConstructorParameters<typeof VaultService>[0]> = {}) {
  const service = new VaultService({
    dshHome: home.dshHome, agentsHome: home.agentsHome,
    apiHome: join(home.root, 'user-home'), apiPathRoots: [join(home.root, 'approved')],
    runPluginInstall: async () => ({ ok: true, detail: 'ok', code: 0 }), registryLookup: null, registryIntegrity: null, ...extra,
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

const webPkg = (deps: Record<string, string>) => JSON.stringify({ name: 'dsh-profile-web', dependencies: deps })

describe('final L-03: no restore install path can run lifecycle scripts', () => {
  it('never calls the host pluginManager.installBundle; pnpm and the dsh CLI fallback get ignore-scripts', async () => {
    const home = await makeTempHome()
    const calls: Call[] = []
    const bundles: string[] = []
    try {
      const service = await newService(home, {
        activeProfile: 'web',
        pluginManager: { profile: { name: 'web' }, async installBundle(spec: string) { bundles.push(spec); return { application: 'applied' } } },
        runPluginInstall: async (cmd, args, opts) => { calls.push({ cmd, args, env: opts.env }); return { ok: false, detail: 'simulated failure', code: 1 } },
      })
      const snap = await snapshotFile(join(home.root, 'approved', 'in'), { 'profiles/web/package.json': webPkg({ 'dsh-plugin-x': '1.0.0' }) },
        [{ name: 'dsh-plugin-x', source: 'npm:dsh-plugin-x@1.0.0', version: '1.0.0', profile: 'web', recordedFrom: 'dependency' }])
      await service.restore({ importPath: snap, conflict: 'use-backup' })
      assert.deepEqual(bundles, [], 'installBundle runs pnpm add without --ignore-scripts; restores must not use it')
      assert.ok(calls.length > 0)
      for (const c of calls) {
        for (const [k, v] of Object.entries(NO_SCRIPTS_ENV)) assert.equal(c.env?.[k], v, `${c.cmd} ${c.args.join(' ')} lacks ${k}`)
        if (c.args.includes('add') || c.args[0] === 'install') {
          const viaDsh = c.args.includes('plugin')
          if (!viaDsh) assert.ok(c.args.includes('--ignore-scripts'), c.args.join(' '))
        }
      }
      assert.ok(calls.some((c) => c.args.includes('plugin') && c.args.includes('add')), 'the dsh CLI fallback was exercised')
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('final L-04: dsh-vault setup never passes metacharacters to cmd.exe', () => {
  it('refuses unsafe specs on Windows before spawning; safe specs go through the shared runner', async () => {
    const ran: Call[] = []
    const run = async (cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => { ran.push({ cmd, args, env: opts.env }); return { ok: true, detail: 'ok', code: 0 } }
    for (const bad of ['x & calc', 'a|b', 'x>y', '%PATH%', 'a"b', 'a^b']) {
      const r = await runDshPluginAdd('web', bad, undefined, { platform: 'win32', run })
      assert.equal(r.ok, false)
      assert.match(r.detail, /unsafe argument/)
    }
    assert.equal(ran.length, 0)
    const ok = await runDshPluginAdd('web', 'github:guobingke/dsh-vault', '/tmp/h', { platform: 'win32', run })
    assert.equal(ok.ok, true)
    assert.deepEqual(ran[0]!.args, ['plugin', '--profile', 'web', 'add', 'github:guobingke/dsh-vault'])
    assert.equal(ran[0]!.env?.DSH_HOME, '/tmp/h')
  })
})

describe('final H-06: approvals are bound to the exact source; trusted-source list', () => {
  it('classifies sources', () => {
    for (const s of ['github:o/r', 'git+https://github.com/o/r.git', 'https://github.com/o/r/archive/v1.tar.gz', 'git+ssh://git@github.com/o/r.git', 'https://registry.npmjs.org/x/-/x-1.0.0.tgz', 'https://registry.npmmirror.com/x/-/x-1.0.0.tgz']) {
      assert.equal(isTrustedPluginSource(s), true, s)
    }
    for (const s of ['git+https://attacker.example/evil.git', 'https://github.com.evil.example/x.tgz', 'http://github.com/o/r', 'gitlab:o/r']) {
      assert.equal(isTrustedPluginSource(s), false, s)
    }
  })

  it('preview keys carry a source hash; a changed source voids the approval', async () => {
    const home = await makeTempHome()
    const calls: string[][] = []
    try {
      const service = await newService(home, { runPluginInstall: async (_c, args) => { calls.push(args); return { ok: false, detail: 'x', code: 1 } } })
      const rec = (src: string): PluginRecord => ({ name: 'evil', source: src, version: src, profile: 'web', recordedFrom: 'dependency' })
      const a = await snapshotFile(join(home.root, 'approved', 'a'), { 'profiles/web/package.json': webPkg({ evil: 'git+https://attacker.example/a.git' }) }, [rec('git+https://attacker.example/a.git')])
      const preview = await service.previewRestore({ importPath: a })
      const row = preview.remotePluginSources![0]!
      assert.match(row.key, /^web:evil#[0-9a-f]{16}$/)
      assert.equal(row.nameKey, 'web:evil')
      assert.equal(row.trusted, false)
      // The approval was for source a; the snapshot now says b.
      const b = await snapshotFile(join(home.root, 'approved', 'b'), { 'profiles/web/package.json': webPkg({ evil: 'git+https://attacker.example/b.git' }) }, [rec('git+https://attacker.example/b.git')])
      const r = await service.restore({ importPath: b, conflict: 'use-backup', approvedPluginSources: [row.key] })
      assert.equal(r.pluginResults?.find((p) => p.name === 'evil')?.reason, 'source-not-approved')
      assert.ok(!calls.some((x) => x.join(' ').includes('attacker.example/b')))
      // The matching key approves it, and a non-allowlisted source is called out.
      const r2 = await service.restore({ importPath: a, conflict: 'use-backup', approvedPluginSources: [row.key] })
      assert.ok(calls.some((x) => x.join(' ').includes('attacker.example/a')))
      assert.ok(r2.manualActions.some((m) => m.includes('outside npm / github.com')), r2.manualActions.join('|'))
      assert.equal(pluginSourceKey('web', 'evil', 'git+https://attacker.example/a.git\ngit+https://attacker.example/a.git'), row.key)
      assert.equal(remotePluginSources([rec('github:o/r')], 'web')[0]!.trusted, true)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('the HTTP API drops name-only and wildcard approvals', async () => {
    const home = await makeTempHome()
    const calls: string[][] = []
    try {
      const service = await newService(home, { runPluginInstall: async (_c, args) => { calls.push(args); return { ok: false, detail: 'x', code: 1 } } })
      const snap = await snapshotFile(join(home.root, 'approved', 'a'), { 'profiles/web/package.json': webPkg({ evil: 'git+https://attacker.example/a.git' }) },
        [{ name: 'evil', source: 'git+https://attacker.example/a.git', version: 'git+https://attacker.example/a.git', profile: 'web', recordedFrom: 'dependency' }])
      const routes = buildVaultRoutes(service, allowAll)
      const server = createServer((req, res) => { const r = routes.find((x) => x.path === new URL(req.url ?? '/', 'http://x').pathname); if (r) void r.handler(req, res); else { res.writeHead(404); res.end() } })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      const port = (server.address() as { port: number }).port
      const body = JSON.stringify({ importPath: snap, conflict: 'use-backup', approvedPluginSources: ['*', 'web:evil'] })
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port, path: '/api/dsh-vault/jobs/restore', method: 'POST', headers: { 'x-dsh-vault-request': '1', 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)) })
        req.on('error', reject)
        req.end(body)
      })
      assert.equal(status, 202)
      for (let i = 0; i < 200 && service.jobs.latest()?.status === 'running'; i++) await new Promise((r) => setTimeout(r, 25))
      assert.ok(!calls.some((x) => x.join(' ').includes('attacker.example')), JSON.stringify(calls))
      await new Promise<void>((r) => server.close(() => r()))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('final H-03: unfinished restores are detected after a crash', () => {
  it('a marker exists only while files are written, survives a crash and can be dismissed', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const snap = await snapshotFile(join(home.root, 'approved', 'in'), { 'settings.yaml': 'theme: dark\n' })
      let during: string | null = null
      await service.restore({ importPath: snap, conflict: 'use-backup' }, (p) => {
        if (p.phase === 'reinstall' && during === null) during = 'x'
      })
      await assert.rejects(stat(service.restoreMarkerPath), 'removed after a finished restore')
      assert.equal((await service.status()).unfinishedRestore, null)

      // While running, the marker is on disk (a crash at this point leaves it behind).
      let seenMarker: { snapshotId?: string; rollbackSnapshotId?: string } | null = null
      await service.restore({ importPath: snap, conflict: 'use-backup' }, (p) => {
        if (p.phase === 'reinstall' && !seenMarker) {
          // synchronous peek is fine in a test
          seenMarker = JSON.parse(readFileSync(service.restoreMarkerPath, 'utf8'))
        }
      })
      assert.equal(seenMarker!.snapshotId, 'vault-20260101T000000Z-abcdef')
      assert.ok(seenMarker!.rollbackSnapshotId)

      // Simulate the crash: the marker is left behind and no live process holds the lock.
      await writeFile(service.restoreMarkerPath, JSON.stringify({ ...seenMarker, startedAt: new Date().toISOString(), rollbackTargetId: 'local-rollback', rollbackEncrypted: false }))
      const fresh = await newService(home)
      const st = await fresh.status()
      assert.equal(st.unfinishedRestore?.rollbackSnapshotId, seenMarker!.rollbackSnapshotId)
      // A failed attempt that never started writing (bad import) does not clear the notice.
      await assert.rejects(() => fresh.restore({ importPath: join(home.root, 'approved', 'missing.tar.gz'), conflict: 'use-backup' }))
      assert.ok((await fresh.status()).unfinishedRestore)
      // Restoring the rollback snapshot clears it.
      await fresh.restore({ targetId: 'local-rollback', snapshotId: st.unfinishedRestore!.rollbackSnapshotId!, conflict: 'use-backup', reinstallPlugins: false, createRollbackSnapshot: false })
      assert.equal((await fresh.status()).unfinishedRestore, null)
      // Dismiss works too.
      await writeFile(service.restoreMarkerPath, JSON.stringify({ snapshotId: 's', startedAt: '', rollbackEncrypted: false }))
      assert.ok((await fresh.status()).unfinishedRestore)
      await fresh.dismissUnfinishedRestore()
      assert.equal((await fresh.status()).unfinishedRestore, null)
      service.stopSchedule()
      fresh.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('final M-05: memory-based archive limit, shown in status', () => {
  it('a quarter of RAM, clamped to [256 MiB, 2 GiB - 1]', async () => {
    const MiB = 1024 * 1024
    assert.equal(memoryBasedArchiveLimit(512 * MiB), 256 * MiB)
    assert.equal(memoryBasedArchiveLimit(4096 * MiB), 1024 * MiB)
    assert.equal(memoryBasedArchiveLimit(64 * 1024 * MiB), 2 * 1024 * MiB - 1)
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const st = await service.status()
      const expected = Number(process.env.DSH_VAULT_MAX_ARCHIVE_BYTES) > 0 ? Number(process.env.DSH_VAULT_MAX_ARCHIVE_BYTES) : memoryBasedArchiveLimit()
      assert.equal(st.archiveLimitBytes, expected)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})
void readFile
