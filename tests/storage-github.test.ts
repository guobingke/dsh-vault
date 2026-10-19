import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { GitHubStorageAdapter } from '../src/storage/github.js'

describe('GitHubStorageAdapter', () => {
  it('puts and lists via mocked GitHub API', async () => {
    const store = new Map<string, { content: string; sha: string; size: number }>()
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'GET' && url.includes('/contents/dsh-vault?')) {
        const items = [...store.entries()].map(([path, v]) => ({
          name: path.split('/').pop(),
          path,
          sha: v.sha,
          size: v.size,
          type: 'file',
        }))
        return new Response(JSON.stringify(items), { status: 200 })
      }
      if (method === 'GET' && url.includes('/contents/')) {
        const path = decodeURIComponent(url.split('/contents/')[1]!.split('?')[0]!)
        const hit = store.get(path)
        if (!hit) return new Response('missing', { status: 404 })
        return new Response(JSON.stringify({ content: hit.content, encoding: 'base64', sha: hit.sha }), { status: 200 })
      }
      if (method === 'PUT') {
        const path = decodeURIComponent(url.split('/contents/')[1]!)
        const body = JSON.parse(String(init?.body)) as { content: string }
        const buf = Buffer.from(body.content, 'base64')
        store.set(path, { content: body.content, sha: 'sha1', size: buf.length })
        return new Response(JSON.stringify({ content: { path } }), { status: 201 })
      }
      if (method === 'DELETE') {
        const path = decodeURIComponent(url.split('/contents/')[1]!)
        store.delete(path)
        return new Response('{}', { status: 200 })
      }
      return new Response('nope', { status: 500 })
    }

    const adapter = new GitHubStorageAdapter(
      {
        kind: 'github',
        id: 'gh',
        label: 'GH',
        owner: 'acme',
        repo: 'vault',
        token: 'test-token',
      },
      {},
      fetchImpl,
    )

    await adapter.put('vault-gh-1', Buffer.from('hello'))
    const list = await adapter.list()
    assert.equal(list.length, 1)
    assert.equal(list[0]!.id, 'vault-gh-1')
    const got = await adapter.get('vault-gh-1')
    assert.equal(got.toString(), 'hello')
    await adapter.delete('vault-gh-1')
    assert.equal((await adapter.list()).length, 0)
  })

  it('falls back to the git blobs API for files over 1 MB', async () => {
    const big = Buffer.alloc(1_200_000, 7)
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('/contents/')) {
        // Real GitHub: content is empty and encoding "none" above 1 MB.
        return new Response(JSON.stringify({ content: '', encoding: 'none', sha: 'bigsha', size: big.length }), { status: 200 })
      }
      if (url.endsWith('/git/blobs/bigsha')) {
        return new Response(JSON.stringify({ content: big.toString('base64'), encoding: 'base64' }), { status: 200 })
      }
      return new Response('nope', { status: 500 })
    }
    const adapter = new GitHubStorageAdapter(
      { kind: 'github', id: 'gh', label: 'GH', owner: 'acme', repo: 'vault', token: 't' },
      {},
      fetchImpl,
    )
    const got = await adapter.get('dsh-vault/vault-big.dshvault')
    assert.equal(got.length, big.length)
    assert.ok(got.equals(big))
    assert.ok(calls.some((u) => u.endsWith('/git/blobs/bigsha')))
  })
})
