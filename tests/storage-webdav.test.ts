import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parsePropfind, WebDavStorageAdapter } from '../src/storage/webdav.js'

describe('WebDavStorageAdapter', () => {
  it('parses PROPFIND listings', () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/u/dsh-vault/</d:href>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/u/dsh-vault/vault-1.tar.gz</d:href>
    <d:propstat><d:prop>
      <d:getcontentlength>12</d:getcontentlength>
      <d:getlastmodified>Mon, 19 Oct 2026 02:00:00 GMT</d:getlastmodified>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`
    const items = parsePropfind(xml, 'webdav')
    assert.equal(items.length, 1)
    assert.equal(items[0]!.id, 'vault-1')
    assert.equal(items[0]!.bytes, 12)
  })

  it('puts/gets/deletes with mocked fetch', async () => {
    const blobs = new Map<string, Buffer>()
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'MKCOL') return new Response(null, { status: 201 })
      if (method === 'PUT') {
        const name = url.split('/').pop()!
        blobs.set(name, Buffer.from(await new Request(url, init).arrayBuffer()))
        return new Response(null, { status: 201 })
      }
      if (method === 'GET') {
        const name = url.split('/').pop()!
        const hit = blobs.get(name)
        if (!hit) return new Response(null, { status: 404 })
        return new Response(hit, { status: 200 })
      }
      if (method === 'DELETE') {
        const name = url.split('/').pop()!
        blobs.delete(name)
        return new Response(null, { status: 204 })
      }
      if (method === 'PROPFIND') {
        const responses = [...blobs.entries()].map(([name, buf]) => `
          <d:response>
            <d:href>/dav/dsh-vault/${name}</d:href>
            <d:propstat><d:prop>
              <d:getcontentlength>${buf.length}</d:getcontentlength>
              <d:getlastmodified>Mon, 19 Oct 2026 02:00:00 GMT</d:getlastmodified>
            </d:prop></d:propstat>
          </d:response>`).join('')
        return new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${responses}</d:multistatus>`, {
          status: 207,
        })
      }
      return new Response(null, { status: 500 })
    }

    const adapter = new WebDavStorageAdapter({
      kind: 'webdav',
      id: 'wd',
      label: 'WD',
      url: 'https://example.test/dav',
      username: 'u',
      password: 'p',
    }, fetchImpl)

    await adapter.put('vault-wd-1', Buffer.from('webdav-bytes'))
    assert.equal((await adapter.list()).length, 1)
    assert.equal((await adapter.get('vault-wd-1')).toString(), 'webdav-bytes')
    await adapter.delete('vault-wd-1')
    assert.equal((await adapter.list()).length, 0)
  })
})
