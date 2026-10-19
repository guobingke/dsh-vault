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
      const installs: Array<{ spec: string; profile: string; dshHome?: string }> = []
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async (spec, profile, dshHome) => {
          installs.push({ spec, profile, dshHome })
          return { ok: true, detail: 'ok' }
        },
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id
      const backup = await service.backup({ targetId })
      const result = await service.restore({ targetId, snapshotId: backup.snapshotId, conflict: 'use-backup', createRollbackSnapshot: false })
      assert.ok(installs.some((i) => i.spec === 'left-pad@1.3.0'))
      assert.ok(!installs.some((i) => i.spec.startsWith('@deepseek-ai/')))
      assert.ok(installs.every((i) => i.dshHome === home.dshHome))
      assert.ok(!result.pluginsFailed.some((n) => n.startsWith('@deepseek-ai/')))
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
      const service = new VaultService({ dshHome: home.dshHome, agentsHome: home.agentsHome, runPluginInstall: async () => ({ ok: true, detail: 'ok' }) })
      await service.init()
      const local = service.listTargets()[0]!
      const backup = await service.backup({ targetId: local.id })
      // Simulate a "new machine" whose only target is remote-like: re-register the
      // same storage as a non-local kind is not possible offline, so remove the
      // local target from the list and keep a second local-dir copy under another kind.
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
        // Private rollback folder is not a user-editable storage target.
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
      const service = new VaultService({ dshHome: home.dshHome, agentsHome: home.agentsHome, runPluginInstall: async () => ({ ok: true, detail: 'ok' }) })
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
