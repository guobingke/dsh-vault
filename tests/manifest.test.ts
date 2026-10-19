import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildManifest, makeSnapshotId, parseManifest } from '../src/core/manifest.js'
import { computeManifestSha256, verifyManifestIntegrity } from '../src/core/checksum.js'
import type { CollectedFile } from '../src/core/types.js'

describe('manifest', () => {
  it('builds snapshot ids with vault- prefix and uniqueness suffix', () => {
    const id = makeSnapshotId(new Date('2026-10-19T02:56:00.000Z'))
    assert.match(id, /^vault-20261019T025600Z-[0-9a-f]{6}$/)
    const id2 = makeSnapshotId(new Date('2026-10-19T02:56:00.000Z'))
    assert.notEqual(id, id2)
  })

  it('embeds sha256 table integrity', () => {
    const files: CollectedFile[] = [
      {
        absPath: '/x/settings.yaml',
        relPath: 'settings.yaml',
        category: 'settings',
        secret: false,
        size: 4,
        sha256: 'abcd',
        data: Buffer.from('test'),
      },
      {
        absPath: '/x/mcp.json',
        relPath: 'mcp.json',
        category: 'mcp',
        secret: false,
        size: 2,
        sha256: 'ef01',
        data: Buffer.from('{}'),
      },
    ]
    const manifest = buildManifest({
      id: 'vault-test',
      files,
      plugins: [{ name: 'dsh-vault', source: 'dsh-vault', version: '0.1.0' }],
      includeSecrets: false,
      encrypted: false,
    })
    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.files.length, 2)
    assert.equal(manifest.manifestSha256, computeManifestSha256(manifest.files))
    assert.equal(verifyManifestIntegrity(manifest).ok, true)
    const parsed = parseManifest(JSON.stringify(manifest))
    assert.equal(parsed.id, 'vault-test')
  })

  it('rejects wrong schema version', () => {
    assert.throws(() => parseManifest(JSON.stringify({ schemaVersion: 99, id: 'x', files: [] })))
  })
})

describe('snapshotTimeFromId (e2e regression: GitHub listings had createdAt=1970)', () => {
  it('parses ids created by makeSnapshotId', async () => {
    const { makeSnapshotId, snapshotTimeFromId } = await import('../src/core/manifest.js')
    const d = new Date('2026-10-19T04:21:31.000Z')
    assert.equal(snapshotTimeFromId(makeSnapshotId(d)), '2026-10-19T04:21:31.000Z')
    assert.equal(snapshotTimeFromId('not-a-vault-id'), undefined)
  })
})
