import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { VaultService, isBuiltinDshBundle } from '../src/core/vault-service.js'
import { makeTempHome } from './helpers.js'

describe('plugin reinstall (e2e regressions)', () => {
  it('installs into the restored home and skips dsh built-in bundles', async () => {
    const home = await makeTempHome()
    try {
      const profileDir = join(home.dshHome, 'profiles', 'tui')
      await mkdir(profileDir, { recursive: true })
      await writeFile(
        join(profileDir, 'package.json'),
        JSON.stringify({
          name: 'dsh-profile-tui',
          dependencies: { 'left-pad': '1.3.0' },
          dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'left-pad'] } },
        }),
      )
      const installs: Array<{ command: string; args: string[] }> = []
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async (command, args, opts) => {
          installs.push({ command, args })
          if (command === 'pnpm' && args[0] === 'install' && opts.cwd) {
            const name = 'left-pad'
            const pkg = join(opts.cwd, 'node_modules', name)
            await mkdir(pkg, { recursive: true })
            await writeFile(join(pkg, 'package.json'), JSON.stringify({ name, version: '1.3.0' }))
            return { ok: true, detail: 'ok', code: 0 }
          }
          if (command === 'dsh' && args.includes('add')) {
            // Real `dsh plugin add` leaves the package in the profile's node_modules.
            const profile = args[args.indexOf('--profile') + 1]!
            const name = args[args.length - 1]!.replace(/(.)@[^/]*$/, '$1')
            const pkg = join(home.dshHome, 'profiles', profile, 'node_modules', ...name.split('/'))
            await mkdir(pkg, { recursive: true })
            await writeFile(join(pkg, 'package.json'), JSON.stringify({ name, version: '0.0.0' }))
            return { ok: true, detail: 'ok', code: 0 }
          }
          return { ok: true, detail: 'ok', code: 0 }
        },
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id
      const backup = await service.backup({ targetId })
      const result = await service.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      // pnpm materialize should have made left-pad already-present (or dsh add was attempted).
      const leftPad = result.pluginResults?.find((r) => r.name === 'left-pad')
      assert.ok(leftPad)
      assert.ok(leftPad!.status === 'installed' || leftPad!.status === 'already-present')
      assert.ok(!result.pluginResults?.some((r) => r.name.startsWith('@deepseek-ai/')))
      assert.ok(!result.pluginsFailed.some((n) => n.startsWith('@deepseek-ai/')))
      assert.equal(result.ok, true, JSON.stringify(result.pluginResults))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('marks restore incomplete when a plugin install fails', async () => {
    const home = await makeTempHome()
    try {
      const profileDir = join(home.dshHome, 'profiles', 'web')
      await writeFile(
        join(profileDir, 'package.json'),
        JSON.stringify({
          name: 'dsh-profile-web',
          dependencies: { 'missing-pkg-xyz': '1.0.0' },
          dsh: { profile: { bundles: ['missing-pkg-xyz'] } },
        }),
      )
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async (command, args) => {
          if ((command === 'dsh' || (command === 'pnpm' && args[0] === 'add')) && args.includes('missing-pkg-xyz@1.0.0')) {
            return { ok: false, detail: '404 Not Found', code: 1 }
          }
          return { ok: true, detail: 'ok', code: 0 }
        },
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id
      const backup = await service.backup({ targetId })
      const result = await service.restore({
        targetId,
        snapshotId: backup.snapshotId,
        conflict: 'use-backup',
        createRollbackSnapshot: false,
      })
      assert.equal(result.ok, false)
      assert.ok(result.pluginsFailed.includes('missing-pkg-xyz'))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('classifies built-in bundles', () => {
    assert.equal(isBuiltinDshBundle('@deepseek-ai/dsh-base'), true)
    assert.equal(isBuiltinDshBundle('dsh-vault'), false)
    assert.equal(isBuiltinDshBundle('@acme/dsh-thing'), false)
  })
})

describe('rollback without a local target (e2e regression)', () => {
  it('writes rollback into the private folder even when only a remote target exists', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok', code: 0 }),
      })
      await service.init()
      const local = service.listTargets()[0]!
      const backup = await service.backup({ targetId: local.id })
      const { LocalStorageAdapter } = await import('../src/storage/local.js')
      const bytes = await new LocalStorageAdapter({ kind: 'local', id: 'x', label: 'x', directory: (local as { directory: string }).directory }).get(backup.snapshotId)
      const { createServer } = await import('node:http')
      const server = createServer((req, res) => {
        if (req.method === 'GET' && req.url?.endsWith('.tar.gz')) { res.writeHead(200); res.end(bytes); return }
        if (req.method === 'PROPFIND') { res.writeHead(207, { 'content-type': 'application/xml' }); res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/v/${backup.snapshotId}.tar.gz</d:href><d:propstat><d:prop><d:getcontentlength>${bytes.length}</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>`); return }
        res.writeHead(404); res.end()
      })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
      const port = (server.address() as { port: number }).port
      try {
        await service.removeTarget(local.id)
        await service.upsertTarget({ kind: 'webdav', id: 'dav', label: 'dav', url: `http://127.0.0.1:${port}/`, pathPrefix: 'v' })
        const result = await service.restore({ targetId: 'dav', snapshotId: backup.snapshotId, conflict: 'use-backup', reinstallPlugins: false })
        assert.ok(result.rollbackSnapshotId)
        assert.equal(result.rollbackTargetId, 'local-rollback')
        assert.ok(!service.listTargets().some((t) => t.id === 'local-rollback'))
        const rollbacks = await service.listSnapshots('local-rollback')
        assert.ok(rollbacks.some((s) => s.id === result.rollbackSnapshotId))
      } finally {
        server.close()
      }
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('schedule (e2e regressions)', () => {
  it('reports nextRunAt with the enforced minimum and keeps global retention', async () => {
    const { effectiveIntervalMs, MIN_SCHEDULE_MINUTES } = await import('../src/core/vault-service.js')
    assert.equal(effectiveIntervalMs(1), MIN_SCHEDULE_MINUTES * 60_000)
    assert.equal(effectiveIntervalMs(60), 60 * 60_000)
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok', code: 0 }),
      })
      await service.init()
      await service.updateSettings({ retention: { keepLast: 7 } })
      const targetId = service.listTargets()[0]!.id
      await service.updateSchedule({ enabled: true, intervalMinutes: 1, targetId, retention: { keepLast: 3 } })
      assert.equal(service.status ? (await service.status()).settings.retention.keepLast : 7, 7)
      const before = Date.now()
      await service.runScheduledBackup()
      const next = Date.parse(service.getSchedule().nextRunAt!)
      assert.ok(next - before >= MIN_SCHEDULE_MINUTES * 60_000 - 1000)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})
