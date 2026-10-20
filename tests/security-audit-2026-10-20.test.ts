/**
 * Regression tests for the 2026-10-20 security audit (docs/SECURITY-FIXES-2026-10-20.md).
 * Each describe() is named after the finding ID it covers.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { VaultService, ROLLBACK_TARGET_ID, clampIntervalMinutes, effectiveIntervalMs, MAX_SCHEDULE_MINUTES, MAX_TIMER_MS } from '../src/core/vault-service.js'
import { buildVaultRoutes, publicJob } from '../src/api/routes.js'
import type { RouteGuard, WebRoute } from '../src/api/http.js'
import { apply } from '../src/index.js'
import { buildManifest } from '../src/core/manifest.js'
import { packTarGz, unpackTarGz, ArchiveLimitError } from '../src/core/archive.js'
import { sha256Buffer } from '../src/core/checksum.js'
import { categoryForRelPath } from '../src/core/collect.js'
import { isSecretRelPath } from '../src/core/paths.js'
import { PathPolicy } from '../src/core/path-policy.js'
import { WriteJournal } from '../src/core/safe-fs.js'
import { OperationLock } from '../src/core/op-lock.js'
import { JobRegistry } from '../src/core/progress.js'
import { redactText } from '../src/core/redact.js'
import { isShellSafeArg, invalidPluginRecord } from '../src/core/plugin-install.js'
import type { PluginRecord } from '../src/core/types.js'
import { allowAll, vaultFetch } from './api-client.js'
import { linkDir, makeTempHome } from './helpers.js'

const TOKEN = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'

/** dsh's session check stand-in: only a request with the session cookie is admitted. */
const sessionGuard: RouteGuard = {
  authorize: (req) => (String(req.headers.cookie ?? '').includes('dsh-auth-test=ok') ? undefined : 401),
}

async function serve(routes: WebRoute[], fn: (port: number) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const route = routes.find((r) => r.path === url.pathname)
    if (!route) { res.writeHead(404); res.end(); return }
    void route.handler(req as IncomingMessage, res as ServerResponse)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  try {
    await fn(port)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

/** Raw HTTP so tests can forge Host / Origin / Sec-Fetch-Site like a browser or a rebinding page. */
function raw(port: number, path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

async function newService(home: Awaited<ReturnType<typeof makeTempHome>>, extra: Partial<ConstructorParameters<typeof VaultService>[0]> = {}) {
  const service = new VaultService({
    dshHome: home.dshHome,
    agentsHome: home.agentsHome,
    apiHome: join(home.root, 'user-home'),
    apiPathRoots: [join(home.root, 'approved')],
    runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
    registryLookup: null,
    registryIntegrity: null,
    ...extra,
  })
  await mkdir(join(home.root, 'user-home'), { recursive: true })
  await mkdir(join(home.root, 'approved'), { recursive: true })
  await service.init()
  return service
}

/** A hand-made (unencrypted, attacker-controlled) snapshot file. */
async function forgedSnapshot(dir: string, files: Record<string, string>, opts: { includeSecrets?: boolean; plugins?: PluginRecord[] } = {}): Promise<string> {
  const collected = Object.entries(files).map(([rel, text]) => {
    const data = Buffer.from(text, 'utf8')
    return { absPath: '', relPath: rel, category: categoryForRelPath(rel), secret: false, size: data.length, sha256: sha256Buffer(data), data }
  })
  const manifest = buildManifest({ id: 'vault-20260101T000000Z-abcdef', files: collected, plugins: opts.plugins ?? [], includeSecrets: opts.includeSecrets ?? false, encrypted: false })
  const tar = packTarGz([
    { path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf8') },
    ...collected.map((f) => ({ path: `files/${f.relPath}`, data: f.data })),
  ])
  await mkdir(dir, { recursive: true })
  const p = join(dir, `${manifest.id}.tar.gz`)
  await writeFile(p, tar)
  return p
}

const posixOnly = process.platform === 'win32' ? { skip: 'POSIX path semantics' } : {}

describe('C-01 API authentication and browser fences', () => {
  it('refuses missing session (401), cross-origin, cross-site, DNS-rebinding Host, missing marker, non-JSON bodies; fails closed without an authenticator', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      await serve(buildVaultRoutes(service, sessionGuard), async (port) => {
        const ok = { 'x-dsh-vault-request': '1', cookie: 'dsh-auth-test=ok' }
        assert.equal((await raw(port, '/api/dsh-vault/status', { headers: ok })).status, 200)
        // missing token / session → 401
        assert.equal((await raw(port, '/api/dsh-vault/status', { headers: { 'x-dsh-vault-request': '1' } })).status, 401)
        // no marker header (a plain <img>/<form>/no-cors fetch) → 403
        assert.equal((await raw(port, '/api/dsh-vault/status', { headers: { cookie: 'dsh-auth-test=ok' } })).status, 403)
        // cross-origin page
        assert.equal((await raw(port, '/api/dsh-vault/jobs', { headers: { ...ok, origin: 'http://evil.example' } })).status, 403)
        assert.equal((await raw(port, '/api/dsh-vault/jobs', { headers: { ...ok, 'sec-fetch-site': 'cross-site' } })).status, 403)
        assert.equal((await raw(port, '/api/dsh-vault/jobs', { headers: { ...ok, 'sec-fetch-site': 'same-site' } })).status, 403)
        // DNS rebinding: attacker domain resolving to 127.0.0.1
        assert.equal((await raw(port, '/api/dsh-vault/status', { headers: { ...ok, host: `evil.example:${port}` } })).status, 403)
        // same-origin Origin is fine
        assert.equal((await raw(port, '/api/dsh-vault/status', { headers: { ...ok, origin: `http://127.0.0.1:${port}` } })).status, 200)
        // the audit repro: text/plain POST /targets (CORS "simple request") → refused, target not stored
        const evil = JSON.stringify({ id: 'evil', kind: 'webdav', label: 'x', url: 'http://attacker.example/', username: 'a', password: 'b' })
        assert.equal((await raw(port, '/api/dsh-vault/targets', { method: 'POST', headers: { ...ok, 'content-type': 'text/plain' }, body: evil })).status, 415)
        assert.equal((await raw(port, '/api/dsh-vault/targets', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: evil })).status, 403)
        assert.ok(!service.listTargets().some((t) => t.id === 'evil'))
        assert.equal((await raw(port, '/api/dsh-vault/backup', { method: 'POST', headers: { 'x-dsh-vault-request': '1', 'content-type': 'application/json' }, body: '{"targetId":"local-default"}' })).status, 401)
      })
      // Every route is fenced (GET /jobs, /status, /plugins, /fs/* included).
      const routes = buildVaultRoutes(service, sessionGuard)
      await serve(routes, async (port) => {
        for (const r of routes) {
          for (const method of ['GET', 'POST', 'PUT']) {
            const res = await raw(port, r.path, { method, headers: { 'x-dsh-vault-request': '1', 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' })
            assert.ok(res.status === 401 || res.status === 405, `${method} ${r.path} answered ${res.status}`)
          }
        }
      })
      // No authenticator → 503, never open.
      await serve(buildVaultRoutes(service), async (port) => {
        assert.equal((await raw(port, '/api/dsh-vault/status', { headers: { 'x-dsh-vault-request': '1' } })).status, 503)
      })
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('the host plugin wires dsh connection.requestRejection into every route (and fails closed without it)', async () => {
    const home = await makeTempHome()
    const prev = process.env.DSH_HOME
    const prevAgents = process.env.DSH_AGENTS_HOME
    process.env.DSH_HOME = home.dshHome
    process.env.DSH_AGENTS_HOME = home.agentsHome
    try {
      for (const withConnection of [true, false]) {
        const routes: WebRoute[] = []
        const disposers: Array<() => void> = []
        const seen: string[] = []
        const services: Record<string, unknown> = {
          webServer: { register: (r: WebRoute) => { routes.push(r); return () => {} } },
          ...(withConnection
            ? { connection: { requestRejection: (req: IncomingMessage) => { seen.push(String(req.url)); return String(req.headers.cookie ?? '').includes('dsh-auth-x=1') ? undefined : 401 } } }
            : {}),
        }
        apply({ effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d) }, get: (n: string) => services[n] } as never)
        await new Promise((r) => setTimeout(r, 50))
        try {
          await serve(routes, async (port) => {
            const res = await raw(port, '/api/dsh-vault/status', { headers: { 'x-dsh-vault-request': '1' } })
            assert.equal(res.status, withConnection ? 401 : 503)
            if (withConnection) {
              const authed = await raw(port, '/api/dsh-vault/status', { headers: { 'x-dsh-vault-request': '1', cookie: 'dsh-auth-x=1' } })
              assert.equal(authed.status, 200)
              assert.ok(seen.length >= 2)
            }
          })
        } finally {
          for (const d of disposers) d()
        }
      }
    } finally {
      if (prev === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
      if (prevAgents === undefined) delete process.env.DSH_AGENTS_HOME
      else process.env.DSH_AGENTS_HOME = prevAgents
      await home.cleanup()
    }
  })
})

describe('C-02 export path: no silent overwrite, approved folders only', () => {
  it('refuses to overwrite an existing archive without confirmation; overwrite:true replaces it', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const out = join(home.root, 'approved', 'victim.tar.gz')
      await writeFile(out, 'precious')
      await assert.rejects(() => service.backup({ exportFile: out }), (e: { code?: string; status?: number }) => e.code === 'EXPORT_EXISTS' && e.status === 409)
      assert.equal(await readFile(out, 'utf8'), 'precious')
      const r = await service.backup({ exportFile: out, overwrite: true })
      assert.equal(r.exportPath, out)
      assert.notEqual(await readFile(out, 'utf8'), 'precious')
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('API refuses system folders, folders outside the approved roots, the data dir, and links escaping a root', async () => {
    const home = await makeTempHome()
    const outside = await mkdtemp(join(tmpdir(), 'dv-outside-'))
    try {
      const service = await newService(home)
      await serve(buildVaultRoutes(service, allowAll), async (port) => {
        const post = (body: unknown) => vaultFetch(`http://127.0.0.1:${port}/api/dsh-vault/backup`, { method: 'POST', body: JSON.stringify(body) })
        const sys = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'evil.tar.gz') : '/etc/evil.tar.gz'
        for (const exportFile of [sys, join(outside, 'x.tar.gz'), join(service.dataDir, 'x.tar.gz')]) {
          const res = await post({ exportFile })
          assert.equal(res.status, 403, exportFile)
          assert.equal(((await res.json()) as { code: string }).code, 'PATH_NOT_ALLOWED')
        }
        assert.equal((await post({ directory: outside })).status, 403)
        const existing = join(home.root, 'approved', 'a.tar.gz')
        await writeFile(existing, 'keep')
        const conflict = await post({ exportFile: existing })
        assert.equal(conflict.status, 409)
        assert.equal(((await conflict.json()) as { code: string }).code, 'EXPORT_EXISTS')
        assert.equal((await post({ exportFile: join(home.root, 'approved', 'new.tar.gz') })).status, 200)
        // A link inside an approved folder that points outside is judged by its target.
        if (await linkDir(outside, join(home.root, 'approved', 'link'))) {
          assert.equal((await post({ exportFile: join(home.root, 'approved', 'link', 'x.tar.gz') })).status, 403)
        }
      })
      service.stopSchedule()
    } finally {
      await rm(outside, { recursive: true, force: true })
      await home.cleanup()
    }
  })
})

describe('C-03 / H-08 fs browse, mkdir and import paths are bounded', () => {
  it('lists and creates only under approved roots; restore preview refuses foreign importPath', async () => {
    const home = await makeTempHome()
    const outside = await mkdtemp(join(tmpdir(), 'dv-outside-'))
    try {
      await writeFile(join(outside, 'secret.txt'), 'x')
      const service = await newService(home)
      await serve(buildVaultRoutes(service, allowAll), async (port) => {
        const base = `http://127.0.0.1:${port}/api/dsh-vault`
        assert.equal((await vaultFetch(`${base}/fs/list?path=${encodeURIComponent(outside)}`)).status, 403)
        assert.equal((await vaultFetch(`${base}/fs/list?path=${encodeURIComponent(service.dataDir)}`)).status, 403)
        const okList = await vaultFetch(`${base}/fs/list?path=${encodeURIComponent(join(home.root, 'approved'))}`)
        assert.equal(okList.status, 200)
        assert.equal((await vaultFetch(`${base}/fs/mkdir`, { method: 'POST', body: JSON.stringify({ path: outside, name: 'pwn' }) })).status, 403)
        await assert.rejects(stat(join(outside, 'pwn')))
        assert.equal((await vaultFetch(`${base}/fs/mkdir`, { method: 'POST', body: JSON.stringify({ path: join(home.root, 'approved'), name: 'ok' }) })).status, 200)
        const prev = await vaultFetch(`${base}/restore/preview`, { method: 'POST', body: JSON.stringify({ importPath: outside }) })
        assert.equal(prev.status, 403)
      })
      service.stopSchedule()
    } finally {
      await rm(outside, { recursive: true, force: true })
      await home.cleanup()
    }
  })

  it('a folder picked in the native dialog becomes approved', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'dv-picked-'))
    try {
      const policy = new PathPolicy({ home: join(outside, 'nohome') })
      await assert.rejects(() => policy.check(join(outside, 'a.tar.gz'), 'write-file'))
      policy.approve(outside)
      assert.ok(await policy.check(join(outside, 'a.tar.gz'), 'write-file'))
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('H-01 restore never writes through links / junctions', () => {
  it('refuses the whole restore when a path component is a link; nothing outside (or inside) is written', async (t) => {
    const home = await makeTempHome()
    const outside = await mkdtemp(join(tmpdir(), 'dv-escape-'))
    try {
      const service = await newService(home)
      if (!(await linkDir(outside, join(home.dshHome, 'mcp')))) { t.skip('links not permitted'); return }
      const snap = await forgedSnapshot(join(home.root, 'approved', 'in'), { 'settings.yaml': 'theme: hacked\n', 'mcp/pwn.json': '{"pwned":true}' })
      await assert.rejects(
        () => service.restore({ importPath: snap, conflict: 'use-backup', reinstallPlugins: false, createRollbackSnapshot: false }),
        (e: { code?: string }) => e.code === 'RESTORE_UNSAFE_PATH',
      )
      assert.deepEqual(await readdir(outside), [])
      assert.equal(await readFile(join(home.dshHome, 'settings.yaml'), 'utf8'), 'theme: dark\nmodel: demo\n')
      service.stopSchedule()
    } finally {
      await rm(outside, { recursive: true, force: true })
      await home.cleanup()
    }
  })

  it('refuses archives that contain symlink / hard-link entries', () => {
    const header = Buffer.alloc(512, 0)
    header.write('files/evil', 0, 'utf8')
    header.write('0000644\0', 100, 'ascii')
    header.write('00000000000\0', 124, 'ascii')
    header.write('2', 156, 'ascii')
    header.write('/etc/passwd', 157, 'utf8')
    header.write('ustar\0', 257, 'ascii')
    const tar = gzipSync(Buffer.concat([header, Buffer.alloc(1024, 0)]))
    assert.throws(() => unpackTarGz(tar), ArchiveLimitError)
  })
})

describe('H-02 / M-07 forged secret flags', () => {
  it('a plaintext snapshot claiming includeSecrets with secret=false cannot overwrite credentials', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const snap = await forgedSnapshot(join(home.root, 'approved', 'in'), {
        '.credentials.yaml': 'apiKey: ATTACKER\n',
        '.ENV': 'X=1\n',
        'settings.yaml': 'theme: light\n',
      }, { includeSecrets: true })
      for (const includeSecrets of [undefined, true]) {
        const r = await service.restore({ importPath: snap, conflict: 'use-backup', reinstallPlugins: false, includeSecrets })
        assert.equal(await readFile(join(home.dshHome, '.credentials.yaml'), 'utf8'), 'apiKey: SUPER-SECRET-KEY\n')
        await assert.rejects(stat(join(home.dshHome, '.ENV')))
        assert.deepEqual(r.credentialsWritten, [])
        assert.ok(r.skipped.includes('.credentials.yaml'))
      }
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('an encrypted snapshot writes credentials only on explicit request, reports them, and makes an encrypted rollback', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const targetId = service.listTargets()[0]!.id
      const b = await service.backup({ targetId, encrypt: true, password: 'pw-123456', includeSecrets: true })
      await writeFile(join(home.dshHome, '.credentials.yaml'), 'apiKey: CHANGED\n')
      const noSecrets = await service.restore({ targetId, snapshotId: b.snapshotId, password: 'pw-123456', conflict: 'use-backup', reinstallPlugins: false })
      assert.equal(await readFile(join(home.dshHome, '.credentials.yaml'), 'utf8'), 'apiKey: CHANGED\n')
      assert.deepEqual(noSecrets.credentialsWritten, [])
      const withSecrets = await service.restore({ targetId, snapshotId: b.snapshotId, password: 'pw-123456', conflict: 'use-backup', reinstallPlugins: false, includeSecrets: true })
      assert.equal(await readFile(join(home.dshHome, '.credentials.yaml'), 'utf8'), 'apiKey: SUPER-SECRET-KEY\n')
      assert.deepEqual(withSecrets.credentialsWritten, ['.credentials.yaml'])
      const rb = (await service.listSnapshots(ROLLBACK_TARGET_ID)).find((s) => s.id === withSecrets.rollbackSnapshotId)
      assert.equal(rb?.encrypted, true)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('H-03 / M-01 transactional restore', () => {
  it('a type conflict is caught before anything is written (settings.yaml untouched)', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      await writeFile(join(home.dshHome, 'block'), 'i am a file')
      const snap = await forgedSnapshot(join(home.root, 'approved', 'in'), { 'settings.yaml': 'theme: hacked\n', 'block/child.txt': 'x' })
      await assert.rejects(() => service.restore({ importPath: snap, conflict: 'use-backup', reinstallPlugins: false }), (e: { code?: string }) => e.code === 'RESTORE_UNSAFE_PATH')
      assert.equal(await readFile(join(home.dshHome, 'settings.yaml'), 'utf8'), 'theme: dark\nmodel: demo\n')
      assert.equal(await readFile(join(home.dshHome, 'block'), 'utf8'), 'i am a file')
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('the write journal reverts overwritten files, deletes added files and removes created folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-journal-'))
    try {
      await writeFile(join(root, 'a.txt'), 'old')
      const j = new WriteJournal([root])
      await j.write(join(root, 'a.txt'), Buffer.from('new'), 0o644)
      await j.write(join(root, 'deep', 'er', 'b.txt'), Buffer.from('added'), 0o644)
      assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'new')
      assert.deepEqual(await j.rollback(), [])
      assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'old')
      await assert.rejects(stat(join(root, 'deep')))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('restoring the pre-restore rollback deletes the files that restore added', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const snap = await forgedSnapshot(join(home.root, 'approved', 'in'), { 'settings.yaml': 'theme: dark\nmodel: demo\n', 'mcp/added.json': '{}' })
      const r = await service.restore({ importPath: snap, conflict: 'use-backup', reinstallPlugins: false })
      assert.ok(r.addedFiles?.includes('mcp/added.json'))
      await stat(join(home.dshHome, 'mcp', 'added.json'))
      await service.restore({ targetId: ROLLBACK_TARGET_ID, snapshotId: r.rollbackSnapshotId!, conflict: 'use-backup', reinstallPlugins: false, createRollbackSnapshot: false })
      await assert.rejects(stat(join(home.dshHome, 'mcp', 'added.json')))
      // An ordinary (non-rollback) snapshot can never delete files, even if its manifest says so.
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('H-04 job results are redacted and expire', () => {
  it('prunes finished jobs on read', async () => {
    const reg = new JobRegistry(5)
    const job = reg.start('backup', async () => ({ ok: true }))
    await new Promise((r) => setTimeout(r, 40))
    assert.equal(reg.get(job.id), null)
    assert.equal(reg.latest(), null)
  })

  it('never returns the full manifest or URL credentials', () => {
    const job = publicJob({
      id: 'j', kind: 'backup', status: 'done', startedAt: '', elapsedMs: 0,
      progress: { stage: 'done', percent: 100, message: '' },
      result: { snapshotId: 's', manifest: { id: 's', files: [{ path: 'a' }], plugins: [{ name: 'p', profile: 'web', source: `git+https://user:${TOKEN}@github.com/o/r.git` }] }, note: `https://x:${TOKEN}@h/` },
    } as never)
    const text = JSON.stringify(job)
    assert.ok(!text.includes(TOKEN))
    assert.ok(!text.includes('"files":['))
  })
})

describe('H-05 plaintext backups strip URL credentials', () => {
  it('manifest plugin records and archived package.json carry no token', async () => {
    const home = await makeTempHome()
    try {
      const pkgPath = join(home.dshHome, 'profiles', 'web', 'package.json')
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
      pkg.dependencies['private-plugin'] = `git+https://user:${TOKEN}@github.com/acme/private-plugin.git`
      await writeFile(pkgPath, JSON.stringify(pkg))
      const service = await newService(home)
      const out = join(home.root, 'approved', 'plain.tar.gz')
      const r = await service.backup({ exportFile: out })
      assert.ok(r.redactedFiles?.includes('profiles/web/package.json'))
      assert.ok(!JSON.stringify(r.manifest).includes(TOKEN))
      const entries = unpackTarGz(await readFile(out))
      for (const e of entries) assert.ok(!e.data.toString('utf8').includes(TOKEN), e.path)
      assert.match(entries.find((e) => e.path === 'files/profiles/web/package.json')!.data.toString('utf8'), /git\+https:\/\/github\.com\/acme\/private-plugin\.git/)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('redactText handles common token shapes', () => {
    assert.equal(redactText(`https://u:${TOKEN}@github.com/x`), 'https://github.com/x')
    assert.equal(redactText(`https://${TOKEN}@github.com/x`), 'https://github.com/x')
    assert.equal(redactText('ssh://git@github.com/x'), 'ssh://git@github.com/x')
    assert.ok(!redactText(`token ${TOKEN}`).includes(TOKEN))
    assert.ok(!redactText('//registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz0123456789').includes('npm_abc'))
  })
})

describe('H-06 / L-03 snapshot plugin sources need approval; installs ignore scripts', () => {
  async function setup() {
    const home = await makeTempHome()
    const calls: string[][] = []
    const service = await newService(home, { runPluginInstall: async (_cmd, args) => { calls.push(args); return { ok: false, detail: 'fake' } } })
    const snap = await forgedSnapshot(join(home.root, 'approved', 'in'), {
      'profiles/web/package.json': JSON.stringify({ name: 'dsh-profile-web', dependencies: { evil: 'git+https://attacker.example/evil.git' } }),
    }, { plugins: [{ name: 'evil', source: 'git+https://attacker.example/evil.git', version: 'git+https://attacker.example/evil.git', profile: 'web', recordedFrom: 'dependency' }] })
    return { home, calls, service, snap }
  }

  it('preview lists the source; unapproved it is never fetched and leaves the restored manifest', async () => {
    const { home, calls, service, snap } = await setup()
    try {
      const preview = await service.previewRestore({ importPath: snap })
      assert.deepEqual(preview.remotePluginSources?.map((r) => r.key), ['web:evil'])
      const r = await service.restore({ importPath: snap, conflict: 'use-backup' })
      assert.ok(!calls.some((a) => a.join(' ').includes('attacker.example')), JSON.stringify(calls))
      assert.equal(r.pluginResults?.find((p) => p.name === 'evil')?.reason, 'source-not-approved')
      const restored = JSON.parse(await readFile(join(home.dshHome, 'profiles', 'web', 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
      assert.ok(!restored.dependencies?.evil)
      for (const a of calls) if (a[0] === 'add' || a[0] === 'install') assert.ok(a.includes('--ignore-scripts'), a.join(' '))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('approved per plugin it is installed with --ignore-scripts', async () => {
    const { home, calls, service, snap } = await setup()
    try {
      await service.restore({ importPath: snap, conflict: 'use-backup', approvedPluginSources: ['web:evil'] })
      const adds = calls.filter((a) => a.join(' ').includes('attacker.example'))
      assert.ok(adds.length > 0)
      for (const a of calls) if (a[0] === 'add' || a[0] === 'install') assert.ok(a.includes('--ignore-scripts'), a.join(' '))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('malformed records (option injection, bad names) are refused', () => {
    assert.ok(invalidPluginRecord({ name: 'x', source: '--config.registry=http://evil', profile: 'web' }))
    assert.ok(invalidPluginRecord({ name: 'a b', source: 'a', profile: 'web' }))
    assert.ok(invalidPluginRecord({ name: 'ok', source: 'ok', profile: '../../x' }))
    assert.equal(invalidPluginRecord({ name: '@scope/ok', source: 'npm:@scope/ok@1.0.0', version: '1.0.0', profile: 'web' }), null)
  })
})

describe('H-07 the vault data dir is never packed', () => {
  it('a dataDir inside DSH_HOME (with targets.json tokens) stays out of plaintext backups; the API cannot move it', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home, { dataDir: join(home.dshHome, 'vault-data') })
      await service.upsertTarget({ kind: 'github', id: 'gh', label: 'gh', owner: 'o', repo: 'r', token: TOKEN } as never)
      const out = join(home.root, 'approved', 'b.tar.gz')
      const r = await service.backup({ exportFile: out })
      assert.ok(!r.manifest.files.some((f) => f.path.startsWith('vault-data/')), r.manifest.files.map((f) => f.path).join(','))
      assert.ok(!(await readFile(out)).includes(Buffer.from(TOKEN)))
      const settings = await service.updateSettings({ dataDir: '/tmp/elsewhere' } as never)
      assert.equal((settings as unknown as { dataDir?: string }).dataDir, undefined)
      assert.equal(service.dataDir, join(home.dshHome, 'vault-data'))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('M-02 one writer at a time', () => {
  it('serializes operations in-process', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dv-lock-'))
    try {
      const lock = new OperationLock(dir)
      const log: string[] = []
      const op = (n: string) => lock.run(n, async () => { log.push(`${n}+`); await new Promise((r) => setTimeout(r, 20)); log.push(`${n}-`) })
      await Promise.all([op('a'), op('b'), op('c')])
      assert.deepEqual(log, ['a+', 'a-', 'b+', 'b-', 'c+', 'c-'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('waits for (and times out on) a lock held by another live process; takes over a dead one', async () => {
    const home = await makeTempHome()
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore' })
    try {
      const service = await newService(home, { lockTimeoutMs: 300 })
      const { hostname } = await import('node:os')
      const lockPath = join(service.dataDir, 'operation.lock')
      await writeFile(lockPath, JSON.stringify({ pid: child.pid, host: hostname(), op: 'cli-restore', startedAt: new Date().toISOString() }))
      await assert.rejects(() => service.backup({ targetId: service.listTargets()[0]!.id }), (e: { code?: string }) => e.code === 'VAULT_BUSY')
      child.kill()
      await new Promise((r) => child.once('exit', r))
      const r = await service.backup({ targetId: service.listTargets()[0]!.id })
      assert.ok(r.snapshotId)
      service.stopSchedule()
    } finally {
      child.kill()
      await home.cleanup()
    }
  })
})

describe('M-03 / M-04 schedule', () => {
  it('stopSchedule during a running backup is not undone', async () => {
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      await service.updateSchedule({ enabled: true, targetId: service.listTargets()[0]!.id, intervalMinutes: 60 })
      assert.equal(service.hasScheduleTimer(), true)
      const run = service.runScheduledBackup()
      service.stopSchedule()
      await run
      await new Promise((r) => setTimeout(r, 20))
      assert.equal(service.hasScheduleTimer(), false)
    } finally {
      await home.cleanup()
    }
  })

  it('clamps huge intervals and never arms a timer beyond 2^31-1 ms', async () => {
    assert.equal(clampIntervalMinutes(1e15), MAX_SCHEDULE_MINUTES)
    assert.equal(clampIntervalMinutes(Number.NaN), 15)
    assert.equal(effectiveIntervalMs(1e15), MAX_SCHEDULE_MINUTES * 60_000)
    assert.ok(MAX_TIMER_MS === 2 ** 31 - 1)
    const home = await makeTempHome()
    try {
      const service = await newService(home)
      const s = await service.updateSchedule({ enabled: true, targetId: service.listTargets()[0]!.id, intervalMinutes: 1e12 })
      assert.equal(s.intervalMinutes, MAX_SCHEDULE_MINUTES)
      await new Promise((r) => setTimeout(r, 60))
      // Before the fix the overflowing delay fired after 1 ms.
      assert.equal(service.getSchedule().lastRunAt, undefined)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('M-05 decompression bombs and forged headers', () => {
  it('stops at the output limit instead of inflating everything', () => {
    const bomb = gzipSync(Buffer.alloc(8 * 1024 * 1024, 0))
    assert.throws(() => unpackTarGz(bomb, { maxTotalBytes: 1024 * 1024 }), ArchiveLimitError)
  })

  it('refuses oversized entries and too many entries', () => {
    const big = packTarGz([{ path: 'files/a', data: Buffer.alloc(4096, 1) }])
    assert.throws(() => unpackTarGz(big, { maxEntryBytes: 1024 }), ArchiveLimitError)
    const many = packTarGz(Array.from({ length: 20 }, (_, i) => ({ path: `files/${i}`, data: Buffer.from('x') })))
    assert.throws(() => unpackTarGz(many, { maxEntries: 10 }), ArchiveLimitError)
    assert.equal(unpackTarGz(many).length, 20)
  })
})

describe('M-06 one case-insensitive credential classifier', () => {
  it('matches the common credential files', () => {
    for (const p of ['.env', '.ENV', '.env.production', 'x/.npmrc', '.pypirc', '.netrc', 'Credentials.json', 'credentials', '.credentials.yaml', 'auth.json', 'certs/server.PEM', 'tls.key', 'id_ed25519', 'plugin-data/x/.git-credentials']) {
      assert.equal(isSecretRelPath(p), true, p)
    }
    for (const p of ['settings.yaml', 'AGENTS.md', 'profiles/web/package.json', 'skills/env-setup/SKILL.md', 'keyboard.json']) {
      assert.equal(isSecretRelPath(p), false, p)
    }
  })

  it('plaintext backups skip them', async () => {
    const home = await makeTempHome()
    try {
      await mkdir(join(home.dshHome, 'my-plugin'), { recursive: true })
      await writeFile(join(home.dshHome, 'my-plugin', '.NPMRC'), '//r/:_authToken=x')
      await writeFile(join(home.dshHome, 'my-plugin', 'Credentials.json'), '{}')
      const service = await newService(home)
      const r = await service.backup({ exportFile: join(home.root, 'approved', 'p.tar.gz') })
      const paths = r.manifest.files.map((f) => f.path)
      assert.ok(!paths.some((p) => /npmrc|credentials/i.test(p)), paths.join(','))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('L-01 / L-04 build and Windows shell hardening', () => {
  it('the committed client bundle has no absolute build paths in its style tag ids', async () => {
    const text = await readFile(join(process.cwd(), 'lib', 'client.js'), 'utf8')
    const ids = [...text.matchAll(/tagId = ("[^"]*")/g)].map((m) => JSON.parse(m[1]!) as string)
    assert.ok(ids.length > 0)
    for (const id of ids) assert.match(id, /^dsh-vault\/[^/\\:]+\.css$/, id)
  })

  it('cmd.exe metacharacters are refused', () => {
    for (const bad of ['a&calc', 'x|y', 'a>b', '%PATH%', 'a^b', 'q"q', 'a\nb', '!x!']) assert.equal(isShellSafeArg(bad), false, bad)
    for (const good of ['add', 'evil@git+https://github.com/o/r.git', '--ignore-scripts', 'C:\\Program Files\\x', '@scope/pkg@1.2.3']) assert.equal(isShellSafeArg(good), true, good)
  })
})
