/**
 * C-01 real-browser check: a headless Chrome opens a malicious page on another site and tries
 * to read and drive the dsh-vault API with every request shape a page can make. The session
 * check is stubbed to admit everything, so what is tested is the plugin's own browser fence
 * (Host / Origin / Sec-Fetch-Site / marker header / JSON content type) as a real browser
 * exercises it. A same-origin control page proves the harness can reach the API at all.
 *
 * Runs on Linux when Chrome / Chromium is installed (GitHub's ubuntu runners have it);
 * skipped elsewhere. Set DSH_VAULT_CHROME to point at a browser binary.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { buildVaultRoutes } from '../src/api/routes.js'
import { allowAll } from './api-client.js'
import { makeTempHome } from './helpers.js'

function findChrome(): string | null {
  const env = process.env.DSH_VAULT_CHROME?.trim()
  if (env) return existsSync(env) ? env : null
  if (process.platform !== 'linux') return null
  for (const c of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(c)) return c
  }
  return null
}

const chrome = findChrome()

function listen(server: Server): Promise<number> {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)))
}

function dumpDom(url: string, profile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      chrome!,
      ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=15000', '--dump-dom', url],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => (err && !stdout ? reject(err) : resolve(stdout)),
    )
  })
}

const ATTACKS = (api: string) => `<!doctype html><html><body><pre id="out">running</pre>
<iframe name="sink" style="display:none"></iframe>
<form id="f" method="POST" action="${api}/api/dsh-vault/jobs/backup" enctype="text/plain" target="sink"><input name='{"targetId":"x","a' value='":1}'></form>
<script>
const api = ${JSON.stringify(api)};
const lines = [];
async function attempt(name, fn) {
  try { const r = await fn(); lines.push(name + ' ' + (r.type === 'opaque' ? 'OPAQUE' : 'READ:' + r.status + ':' + (await r.text()).slice(0, 80))) }
  catch (e) { lines.push(name + ' BLOCKED') }
}
(async () => {
  await attempt('cors-get', () => fetch(api + '/api/dsh-vault/status', { credentials: 'include' }));
  await attempt('cors-get-marker', () => fetch(api + '/api/dsh-vault/targets', { credentials: 'include', headers: { 'x-dsh-vault-request': '1' } }));
  await attempt('nocors-get', () => fetch(api + '/api/dsh-vault/jobs', { mode: 'no-cors', credentials: 'include' }));
  await attempt('nocors-post-text', () => fetch(api + '/api/dsh-vault/jobs/backup', { method: 'POST', mode: 'no-cors', credentials: 'include', headers: { 'content-type': 'text/plain' }, body: '{"targetId":"x"}' }));
  await attempt('cors-post-json', () => fetch(api + '/api/dsh-vault/jobs/backup', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-dsh-vault-request': '1' }, body: '{"targetId":"x"}' }));
  await attempt('nocors-fs-mkdir', () => fetch(api + '/api/dsh-vault/fs/mkdir', { method: 'POST', mode: 'no-cors', body: '{"path":"/tmp","name":"pwn"}' }));
  document.getElementById('f').submit();
  await new Promise((r) => setTimeout(r, 1500));
  document.getElementById('out').textContent = 'DONE\\n' + lines.join('\\n');
})();
</script></body></html>`

const CONTROL = `<!doctype html><html><body><pre id="out">running</pre><script>
fetch('/api/dsh-vault/status', { headers: { 'x-dsh-vault-request': '1' } })
  .then(async (r) => { document.getElementById('out').textContent = 'DONE\\nCONTROL ' + r.status + ' ' + ((await r.json()).dshHome ? 'has-dshHome' : 'no-body') })
  .catch((e) => { document.getElementById('out').textContent = 'DONE\\nCONTROL ERR ' + e })
</script></body></html>`

describe('C-01 real browser: a cross-site page cannot read or drive the API', { skip: chrome ? false : 'no Chrome/Chromium on this machine (runs on Linux CI)' }, () => {
  it('every cross-site request shape is refused; the same-origin control succeeds', async () => {
    const home = await makeTempHome()
    const profile = await mkdtemp(join(tmpdir(), 'dv-chrome-'))
    const service = new VaultService({ dshHome: home.dshHome, agentsHome: home.agentsHome, registryLookup: null, registryIntegrity: null })
    await service.init()
    const routes = buildVaultRoutes(service, allowAll)
    const seen: Array<{ method: string; path: string; status: number }> = []
    const api = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      res.on('finish', () => seen.push({ method: req.method ?? '', path: url.pathname, status: res.statusCode }))
      if (url.pathname === '/control.html') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(CONTROL)
        return
      }
      const route = routes.find((r) => r.path === url.pathname)
      if (!route) { res.writeHead(404); res.end(); return }
      void route.handler(req, res)
    })
    const apiPort = await listen(api)
    // "localhost" vs "127.0.0.1" are different sites: the attacker page is genuinely cross-site.
    const apiOrigin = `http://localhost:${apiPort}`
    const evil = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(ATTACKS(apiOrigin)) })
    const evilPort = await listen(evil)
    try {
      const control = await dumpDom(`${apiOrigin}/control.html`, profile)
      assert.match(control, /CONTROL 200 has-dshHome/, control)

      seen.length = 0
      const dom = await dumpDom(`http://127.0.0.1:${evilPort}/`, profile)
      if (process.env.DV_DEBUG) console.log(dom, JSON.stringify(seen))
      assert.match(dom, /DONE/, dom)
      assert.ok(!/READ:2\d\d/.test(dom), `the page read an API response:\n${dom}`)
      const apiHits = seen.filter((s) => s.path.startsWith('/api/'))
      assert.ok(apiHits.length > 0, 'the browser sent the attack requests')
      const passed = apiHits.filter((s) => s.status >= 200 && s.status < 300)
      assert.deepEqual(passed, [], `requests that passed the fence: ${JSON.stringify(passed)}`)
      assert.equal(service.jobs.latest(), null, 'no job was started')
    } finally {
      service.stopSchedule()
      await new Promise<void>((r) => api.close(() => r()))
      await new Promise<void>((r) => evil.close(() => r()))
      await rm(profile, { recursive: true, force: true }).catch(() => {})
      await home.cleanup()
    }
  })
})
