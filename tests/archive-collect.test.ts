import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { packTarGz, unpackTarGz } from '../src/core/archive.js'
import { collectBackupFiles } from '../src/core/collect.js'
import { packSnapshot, unpackSnapshot } from '../src/core/snapshot-io.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packExtractedSnapshot } from '../src/core/extracted-snapshot.js'
import { makeTempHome } from './helpers.js'

describe('archive + collect', () => {
  it('packs and unpacks tar.gz', () => {
    const packed = packTarGz([
      { path: 'a.txt', data: Buffer.from('hello') },
      { path: 'dir/b.txt', data: Buffer.from('world') },
    ])
    const entries = unpackTarGz(packed)
    assert.equal(entries.length, 2)
    assert.equal(entries.find((e) => e.path === 'a.txt')?.data.toString(), 'hello')
  })

  it('collects setup files and excludes secrets by default', async () => {
    const home = await makeTempHome()
    try {
      const { files, plugins } = await collectBackupFiles({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        includeSecrets: false,
      })
      assert.ok(files.some((f) => f.relPath === 'settings.yaml'))
      assert.ok(files.some((f) => f.relPath === 'profiles/web/cordis.patch.yml'))
      assert.ok(files.some((f) => f.relPath === 'agents-home/skills/demo/SKILL.md'))
      assert.ok(!files.some((f) => f.relPath === '.credentials.yaml'))
      assert.ok(plugins.some((p) => p.name === 'dsh-vault'))
    } finally {
      await home.cleanup()
    }
  })

  it('collects the home-wide cordis.patch.yml and plugin data under storages/ (not caches)', async () => {
    const home = await makeTempHome()
    try {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      await writeFile(join(home.dshHome, 'cordis.patch.yml'), '- id: agent-instructions\n  config: { maxBytes: 1 }\n')
      await mkdir(join(home.dshHome, 'storages', 'cost-meter'), { recursive: true })
      await writeFile(join(home.dshHome, 'storages', 'cost-meter', 'ledger.json'), '{"total":1}')
      await mkdir(join(home.dshHome, 'storages', 'session_projcache', 'sessions'), { recursive: true })
      await writeFile(join(home.dshHome, 'storages', 'session_projcache', 'sessions', 'x.json'), '{}')
      const { files } = await collectBackupFiles({ dshHome: home.dshHome, agentsHome: home.agentsHome })
      assert.equal(files.find((f) => f.relPath === 'cordis.patch.yml')?.category, 'settings')
      assert.equal(files.find((f) => f.relPath === 'storages/cost-meter/ledger.json')?.category, 'plugin-config')
      assert.ok(!files.some((f) => f.relPath.includes('session_projcache')))
    } finally {
      await home.cleanup()
    }
  })

  it('includes secrets only when requested', async () => {
    const home = await makeTempHome()
    try {
      const { files } = await collectBackupFiles({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        includeSecrets: true,
      })
      assert.ok(files.some((f) => f.relPath === '.credentials.yaml' && f.secret))
    } finally {
      await home.cleanup()
    }
  })

  it('round-trips snapshot pack/unpack with checksum verification', async () => {
    const home = await makeTempHome()
    try {
      const { files, plugins } = await collectBackupFiles({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
      })
      const packed = await packSnapshot({
        files,
        plugins,
        includeSecrets: false,
        encrypt: true,
        password: 'test-pass',
      })
      assert.equal(packed.encrypted, true)
      const unpacked = await unpackSnapshot(packed.bytes, 'test-pass')
      assert.equal(unpacked.manifest.id, packed.snapshotId)
      assert.ok(unpacked.files.has('settings.yaml'))
    } finally {
      await home.cleanup()
    }
  })
})

describe('extracted snapshot limits', () => {
  it('rejects a manifest larger than maxEntryBytes before re-packing it', async () => {
    const home = await makeTempHome('dsh-vault-extracted-')
    try {
      const folder = join(home.root, 'snapshot')
      await mkdir(folder, { recursive: true })
      await writeFile(join(folder, 'manifest.json'), '0123456789A')
      await assert.rejects(
        () => packExtractedSnapshot(folder, { maxEntries: 10, maxEntryBytes: 10, maxTotalBytes: 1000 }),
        (err: Error & { code?: string }) => err.code === 'ARCHIVE_LIMIT',
      )
    } finally {
      await home.cleanup()
    }
  })

  it('rejects a manifest that alone exceeds maxTotalBytes', async () => {
    const home = await makeTempHome('dsh-vault-extracted-')
    try {
      const folder = join(home.root, 'snapshot')
      await mkdir(folder, { recursive: true })
      await writeFile(join(folder, 'manifest.json'), '012345678901234567890')
      await assert.rejects(
        () => packExtractedSnapshot(folder, { maxEntries: 10, maxEntryBytes: 100, maxTotalBytes: 20 }),
        (err: Error & { code?: string }) => err.code === 'ARCHIVE_LIMIT',
      )
    } finally {
      await home.cleanup()
    }
  })
})

describe('collect skips dsh plugin-manager logs (e2e regression)', () => {
  it('does not back up profiles/*/.plugin-manager', async () => {
    const { shouldSkipDir } = await import('../src/core/paths.js')
    assert.equal(shouldSkipDir('.plugin-manager'), true)
  })
})
