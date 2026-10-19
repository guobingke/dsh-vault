import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { snapshotsToDelete } from '../src/core/retention.js'
import { makeTempHome } from './helpers.js'

describe('VaultService', () => {
  it('backs up, previews, restores with conflict strategies', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id

      const backup = await service.backup({ targetId, notes: 'unit' })
      assert.ok(backup.snapshotId.startsWith('vault-'))
      assert.equal(backup.includeSecrets, false)

      await assert.rejects(() => service.backup({ targetId, includeSecrets: true, encrypt: false }))

      const enc = await service.backup({
        targetId,
        encrypt: true,
        password: 'unit-pass',
        includeSecrets: true,
      })
      assert.equal(enc.encrypted, true)

      // mutate live settings
      await writeFile(join(home.dshHome, 'settings.yaml'), 'theme: light\n')

      const preview = await service.previewRestore({
        targetId,
        snapshotId: backup.snapshotId,
      })
      assert.ok(preview.changed + preview.added + preview.unchanged > 0)
      assert.ok(preview.manualActions.some((m) => /API keys/i.test(m)))

      const keep = await service.restore({
        targetId,
        snapshotId: backup.snapshotId,
        conflict: 'keep-current',
        createRollbackSnapshot: true,
        reinstallPlugins: false,
      })
      assert.ok(keep.rollbackSnapshotId)
      const afterKeep = await readFile(join(home.dshHome, 'settings.yaml'), 'utf8')
      assert.match(afterKeep, /light/)

      const useBackup = await service.restore({
        targetId,
        snapshotId: backup.snapshotId,
        conflict: 'use-backup',
        createRollbackSnapshot: false,
        reinstallPlugins: true,
      })
      assert.ok(useBackup.applied.includes('settings.yaml'))
      const restored = await readFile(join(home.dshHome, 'settings.yaml'), 'utf8')
      assert.match(restored, /dark/)

      const verified = await service.verify(targetId, enc.snapshotId, 'unit-pass')
      assert.equal(verified.ok, true)

      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('applies retention keep-last-N', () => {
    const ids = snapshotsToDelete(
      [
        { id: 'a', targetId: 't', remoteKey: 'a', createdAt: '2026-01-01T00:00:00.000Z', bytes: 1, encrypted: false, includeSecrets: false },
        { id: 'b', targetId: 't', remoteKey: 'b', createdAt: '2026-01-02T00:00:00.000Z', bytes: 1, encrypted: false, includeSecrets: false },
        { id: 'c', targetId: 't', remoteKey: 'c', createdAt: '2026-01-03T00:00:00.000Z', bytes: 1, encrypted: false, includeSecrets: false },
      ],
      { keepLast: 2 },
    )
    assert.deepEqual(ids, ['a'])
  })
})
