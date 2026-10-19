import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { createDirectory, listDirectory, listRoots } from '../src/core/fs-browse.js'
import { bindDirectoryPicker } from '../src/index.js'
import { VaultService } from '../src/core/vault-service.js'
import { buildVaultRoutes } from '../src/api/routes.js'
import { joinPath, parentOf, isArchiveName } from '../src/client/components/PathPicker.js'
import { defaultExportName } from '../src/client/components/BackupPanel.js'
import { makeTempHome } from './helpers.js'

describe('fs browse (in-app Browse… dialog)', () => {
  it('lists home by default with roots, sep, parent and dirs first', async () => {
    const home = await listDirectory('')
    assert.equal(home.path, homedir())
    assert.equal(home.home, homedir())
    assert.equal(home.sep, sep)
    assert.deepEqual(home.roots, process.platform === 'win32' ? home.roots : ['/'])
    const dir = await mkdtemp(join(tmpdir(), 'dv-fs-'))
    try {
      await mkdir(join(dir, 'zeta'))
      await writeFile(join(dir, 'a.tar.gz'), 'x')
      await writeFile(join(dir, '.hidden'), 'x')
      const l = await listDirectory(dir)
      assert.equal(l.entries[0]!.name, 'zeta')
      assert.equal(l.entries[0]!.kind, 'directory')
      assert.equal(l.entries.find((e) => e.name === '.hidden')?.hidden, true)
      assert.equal(l.entries.find((e) => e.name === 'a.tar.gz')?.bytes, 1)
      assert.equal(l.parent, tmpdir())
      await assert.rejects(listDirectory(join(dir, 'a.tar.gz')), /not a directory/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('probes drive letters on win32 without hanging (none exist on POSIX)', async () => {
    const roots = await listRoots('win32')
    assert.ok(Array.isArray(roots))
    if (process.platform !== 'win32') assert.deepEqual(roots, [])
    assert.deepEqual(await listRoots('linux'), ['/'])
  })

  it('creates one folder and rejects bad names / duplicates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dv-fs-'))
    try {
      const made = await createDirectory(dir, 'Backups 2026')
      assert.ok((await stat(made)).isDirectory())
      await assert.rejects(createDirectory(dir, 'Backups 2026'), /already exists/)
      for (const bad of ['', '..', 'a/b', 'a\\b', 'c:d']) {
        await assert.rejects(createDirectory(dir, bad), /invalid folder name/)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('native directory picker binding', () => {
  it('always forwards an AbortSignal (dsh pick dereferences signal.aborted)', async () => {
    let got: unknown
    const pick = bindDirectoryPicker({
      capability: () => ({
        kind: 'native',
        pick: async (signal: AbortSignal) => {
          got = signal
          if (signal.aborted) throw new Error('aborted') // would TypeError on undefined
          return 'C:\\Backups'
        },
      }),
    })
    assert.ok(pick)
    assert.equal(await pick!(new AbortController().signal), 'C:\\Backups')
    assert.ok(got instanceof AbortSignal)
  })

  it('ignores the browse backend (in-app browser handles it)', () => {
    assert.equal(bindDirectoryPicker({ capability: () => ({ kind: 'browse', list: async () => ({}) }) }), undefined)
    assert.equal(bindDirectoryPicker(undefined), undefined)
  })
})

describe('fs HTTP routes', () => {
  async function withRoutes(service: VaultService, fn: (base: string) => Promise<void>) {
    const routes = buildVaultRoutes(service)
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const route = routes.find((r) => r.path === url.pathname)
      if (!route) { res.writeHead(404); res.end(); return }
      void route.handler(req as IncomingMessage, res as ServerResponse)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no addr')
    try { await fn(`http://127.0.0.1:${addr.port}/api/dsh-vault`) } finally { server.close() }
  }

  it('list/mkdir work; pick-directory is 501 without native, forwards a signal with it', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({ dshHome: home.dshHome, agentsHome: home.agentsHome })
      await service.init()
      await withRoutes(service, async (base) => {
        const l = await (await fetch(`${base}/fs/list?path=${encodeURIComponent(home.dshHome)}`)).json() as { path: string; nativePicker: boolean; roots: string[] }
        assert.equal(l.path, home.dshHome)
        assert.equal(l.nativePicker, false)
        const mk = await fetch(`${base}/fs/mkdir`, { method: 'POST', body: JSON.stringify({ path: home.dshHome, name: 'new-dir' }) })
        assert.equal(mk.status, 200)
        assert.equal(((await mk.json()) as { path: string }).path, join(home.dshHome, 'new-dir'))
        const dup = await fetch(`${base}/fs/mkdir`, { method: 'POST', body: JSON.stringify({ path: home.dshHome, name: 'new-dir' }) })
        assert.equal(dup.status, 409)
        const none = await fetch(`${base}/fs/pick-directory`, { method: 'POST', body: '{}' })
        assert.equal(none.status, 501)
        let sawSignal = false
        service.setPickDirectory(async (signal) => { sawSignal = signal instanceof AbortSignal; return '/picked' })
        const l2 = await (await fetch(`${base}/fs/list`)).json() as { nativePicker: boolean }
        assert.equal(l2.nativePicker, true)
        const ok = await (await fetch(`${base}/fs/pick-directory`, { method: 'POST', body: '{}' })).json() as { path: string }
        assert.equal(ok.path, '/picked')
        assert.ok(sawSignal)
      })
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('PathPicker helpers', () => {
  it('joins and walks up POSIX and Windows paths', () => {
    assert.equal(joinPath('C:\\Users\\me', 'x.dshvault', '\\'), 'C:\\Users\\me\\x.dshvault')
    assert.equal(joinPath('C:\\', 'x', '\\'), 'C:\\x')
    assert.equal(joinPath('/home/me', 'x'), '/home/me/x')
    assert.equal(parentOf('C:\\Users\\me\\x.dshvault'), 'C:\\Users\\me')
    assert.equal(parentOf('C:\\Users'), 'C:\\')
    assert.equal(parentOf('/home/me/x.tar.gz'), '/home/me')
    assert.equal(parentOf('/home'), '/')
    assert.ok(isArchiveName('a.TAR.GZ') && isArchiveName('b.dshvault') && !isArchiveName('c.zip'))
    assert.match(defaultExportName(true, new Date(2026, 9, 19, 8, 5)), /^dsh-vault-20261019-0805\.dshvault$/)
    assert.match(defaultExportName(false), /\.tar\.gz$/)
  })
})
