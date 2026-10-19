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

  it('status reports desktop surface + install plan', async () => {
    const home = await makeTempHome()
    try {
      const { mkdir, writeFile } = await import('node:fs/promises')
      await mkdir(join(home.dshHome, 'profiles', 'desktop'), { recursive: true })
      await writeFile(join(home.dshHome, 'profiles', 'desktop', 'package.json'), '{}\n')
      await mkdir(join(home.dshHome, 'profiles', 'web'), { recursive: true })
      await writeFile(join(home.dshHome, 'profiles', 'web', 'package.json'), '{}\n')

      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        activeProfile: 'desktop',
      })
      await service.init()
      const status = await service.status()
      assert.equal(status.activeProfile, 'desktop')
      assert.equal(status.surface, 'desktop')
      assert.ok(status.guiProfiles.includes('desktop'))
      assert.ok(status.guiProfiles.includes('web'))
      assert.ok(status.installPlan.some((p) => p.profile === 'desktop' && /--profile desktop add/.test(p.command)))
      assert.ok(status.installPlan.some((p) => p.profile === 'web'))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('restore plugin reinstall targets desktop profile from manifest', async () => {
    const home = await makeTempHome()
    try {
      const { mkdir, writeFile } = await import('node:fs/promises')
      // Isolate: only desktop lists an npm plugin so reinstall profile is unambiguous.
      await writeFile(
        join(home.dshHome, 'profiles', 'web', 'package.json'),
        JSON.stringify({ name: 'web', dependencies: {} }, null, 2),
      )
      await writeFile(join(home.dshHome, 'profiles', 'web', 'cordis.patch.yml'), '[]\n')
      const profileDir = join(home.dshHome, 'profiles', 'desktop')
      await mkdir(profileDir, { recursive: true })
      await writeFile(
        join(profileDir, 'package.json'),
        JSON.stringify({ name: 'desktop', dependencies: { 'example-missing-plugin': '1.0.0' } }, null, 2),
      )
      await writeFile(
        join(profileDir, 'cordis.patch.yml'),
        `- insert:\n    - id: example-missing-plugin\n      name: 'example-missing-plugin'\n`,
      )

      const installs: Array<{ spec: string; profile: string }> = []
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        activeProfile: 'desktop',
        runPluginInstall: async (spec, profile) => {
          installs.push({ spec, profile })
          return { ok: false, detail: 'simulated desktop carrier missing' }
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
        reinstallPlugins: true,
      })
      assert.ok(installs.length >= 1)
      assert.ok(installs.every((i) => i.profile === 'desktop'))
      assert.ok(result.pluginsFailed.includes('example-missing-plugin'))
      assert.ok(result.manualActions.some((m) => /bundled|Desktop|quit|Plugins/i.test(m)))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('honors per-path conflicts with global fallback (preview + apply)', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id

      const backup = await service.backup({ targetId })
      // Mutate two files so both show as "change"
      await writeFile(join(home.dshHome, 'settings.yaml'), 'theme: light\n')
      await writeFile(join(home.dshHome, 'mcp.json'), JSON.stringify({ servers: { demo: { command: 'changed' } } }))

      const preview = await service.previewRestore({
        targetId,
        snapshotId: backup.snapshotId,
        conflict: 'use-backup',
        conflicts: { 'settings.yaml': 'keep-current' },
      })
      const settingsItem = preview.items.find((i) => i.path === 'settings.yaml')
      const mcpItem = preview.items.find((i) => i.path === 'mcp.json')
      assert.equal(settingsItem?.change, 'change')
      assert.equal(settingsItem?.resolution, 'keep-current')
      assert.equal(mcpItem?.change, 'change')
      assert.equal(mcpItem?.resolution, 'use-backup') // global fallback
      assert.equal(preview.conflict, 'use-backup')
      assert.deepEqual(preview.conflicts, { 'settings.yaml': 'keep-current' })

      const result = await service.restore({
        targetId,
        snapshotId: backup.snapshotId,
        conflict: 'use-backup',
        conflicts: { 'settings.yaml': 'keep-current' },
        createRollbackSnapshot: true,
        reinstallPlugins: false,
      })
      assert.ok(result.rollbackSnapshotId)
      assert.ok(result.skipped.includes('settings.yaml'))
      assert.ok(result.applied.includes('mcp.json'))
      assert.match(await readFile(join(home.dshHome, 'settings.yaml'), 'utf8'), /light/)
      assert.match(await readFile(join(home.dshHome, 'mcp.json'), 'utf8'), /echo/)

      // Re-applying the rollback snapshot with the same map restores the pre-restore tree.
      const rolled = await service.restore({
        targetId,
        snapshotId: result.rollbackSnapshotId!,
        conflict: 'use-backup',
        conflicts: { 'settings.yaml': 'keep-current' },
        createRollbackSnapshot: false,
        reinstallPlugins: false,
      })
      // settings was keep-current during original restore (stayed light); rollback snapshot
      // also has light settings, so it may be unchanged/skipped — mcp was restored to echo,
      // rollback has "changed", so use-backup reapplies "changed".
      assert.ok(rolled.applied.includes('mcp.json') || rolled.skipped.includes('mcp.json'))
      assert.match(await readFile(join(home.dshHome, 'mcp.json'), 'utf8'), /changed/)

      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})
