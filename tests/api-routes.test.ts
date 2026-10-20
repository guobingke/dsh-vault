import { allowAll, vaultFetch } from './api-client.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { VaultService } from '../src/core/vault-service.js'
import { buildVaultRoutes } from '../src/api/routes.js'
import { makeTempHome } from './helpers.js'

async function withServer(
  service: VaultService,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const routes = buildVaultRoutes(service, allowAll)
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const route = routes.find((r) => r.path === url.pathname)
    if (!route) {
      res.writeHead(404)
      res.end('missing')
      return
    }
    void route.handler(req as IncomingMessage, res as ServerResponse)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no addr')
  try {
    await fn(`http://127.0.0.1:${addr.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  }
}

describe('HTTP API routes', () => {
  it('serves status and backup on loopback', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      await withServer(service, async (base) => {
        const statusRes = await vaultFetch(`${base}/api/dsh-vault/status`)
        assert.equal(statusRes.status, 200)
        const status = await statusRes.json() as {
          targets: unknown[]
          activeProfile: string
          surface: string
          installPlan: Array<{ profile: string; command: string }>
        }
        assert.ok(status.targets.length >= 1)
        assert.ok(typeof status.activeProfile === 'string' && status.activeProfile.length > 0)
        assert.ok(['web', 'desktop', 'other'].includes(status.surface))
        assert.ok(status.installPlan.some((p) => p.profile === 'desktop'))

        const backupRes = await vaultFetch(`${base}/api/dsh-vault/backup`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetId: 'local-default' }),
        })
        assert.equal(backupRes.status, 200)
        const backup = await backupRes.json() as { snapshotId: string }
        assert.match(backup.snapshotId, /^vault-/)

        const listRes = await vaultFetch(`${base}/api/dsh-vault/snapshots`)
        const list = await listRes.json() as { snapshots: unknown[] }
        assert.ok(list.snapshots.length >= 1)
      })
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})
