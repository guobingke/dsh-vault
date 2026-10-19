import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalStorageAdapter } from '../src/storage/local.js'

describe('LocalStorageAdapter', () => {
  it('puts, lists, gets, deletes snapshots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dv-local-'))
    try {
      const adapter = new LocalStorageAdapter({
        kind: 'local',
        id: 'local',
        label: 'Local',
        directory: dir,
      })
      const data = Buffer.from('plain-bytes')
      const { remoteKey } = await adapter.put('vault-1', data)
      assert.ok(remoteKey.includes('vault-1'))
      const list = await adapter.list()
      assert.equal(list.length, 1)
      assert.equal(list[0]!.id, 'vault-1')
      const got = await adapter.get('vault-1')
      assert.deepEqual(got, data)
      await adapter.delete('vault-1')
      assert.equal((await adapter.list()).length, 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
