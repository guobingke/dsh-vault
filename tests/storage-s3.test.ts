import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildS3SigningKey, parseListObjects, S3StorageAdapter, signS3Request } from '../src/storage/s3.js'

describe('S3StorageAdapter', () => {
  it('builds deterministic signing keys', () => {
    const key = buildS3SigningKey('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', '20130524', 'us-east-1', 's3')
    assert.equal(key.length, 32)
  })

  it('signs requests with required headers', () => {
    const signed = signS3Request({
      method: 'PUT',
      endpoint: 'https://s3.example.test',
      region: 'auto',
      bucket: 'vault',
      key: 'dsh-vault/a.tar.gz',
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      body: Buffer.from('hi'),
      forcePathStyle: true,
      now: new Date('2026-10-19T00:00:00.000Z'),
    })
    assert.ok(signed.headers.authorization?.startsWith('AWS4-HMAC-SHA256'))
    assert.ok(signed.url.includes('/vault/dsh-vault/a.tar.gz'))
  })

  it('parses ListObjects XML', () => {
    const xml = `<?xml version="1.0"?>
<ListBucketResult>
  <Contents>
    <Key>dsh-vault/vault-1.tar.gz</Key>
    <LastModified>2026-10-19T02:00:00.000Z</LastModified>
    <Size>9</Size>
  </Contents>
</ListBucketResult>`
    const items = parseListObjects(xml, 's3', 'dsh-vault')
    assert.equal(items.length, 1)
    assert.equal(items[0]!.id, 'vault-1')
  })

  it('puts/gets/deletes with mocked fetch', async () => {
    const blobs = new Map<string, Buffer>()
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('list-type=2')) {
        const contents = [...blobs.entries()].map(([key, buf]) => `
          <Contents><Key>${key}</Key><LastModified>2026-10-19T02:00:00.000Z</LastModified><Size>${buf.length}</Size></Contents>`).join('')
        return new Response(`<ListBucketResult>${contents}</ListBucketResult>`, { status: 200 })
      }
      const key = decodeURIComponent(url.split('/vault/')[1]!.split('?')[0]!)
      if (method === 'PUT') {
        blobs.set(key, Buffer.from(await new Request(url, init).arrayBuffer()))
        return new Response(null, { status: 200 })
      }
      if (method === 'GET') {
        const hit = blobs.get(key)
        if (!hit) return new Response(null, { status: 404 })
        return new Response(hit, { status: 200 })
      }
      if (method === 'DELETE') {
        blobs.delete(key)
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 500 })
    }

    const adapter = new S3StorageAdapter({
      kind: 's3',
      id: 's3',
      label: 'S3',
      endpoint: 'https://s3.example.test',
      bucket: 'vault',
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      forcePathStyle: true,
    }, fetchImpl)

    await adapter.put('vault-s3-1', Buffer.from('s3-bytes'))
    assert.equal((await adapter.list()).length, 1)
    assert.equal((await adapter.get('vault-s3-1')).toString(), 's3-bytes')
    await adapter.delete('vault-s3-1')
    assert.equal((await adapter.list()).length, 0)
  })
})
