import type { VaultService } from '../core/vault-service.js'
import type { BackupRequest, RestoreRequest, ScheduleConfig, StorageTargetConfig, VaultSettings } from '../core/types.js'
import { endpoint, readJsonBody, writeJson, type WebRoute } from './http.js'
import { ApiError } from './http.js'

export const API_PREFIX = '/api/dsh-vault'

export function buildVaultRoutes(service: VaultService): WebRoute[] {
  const routes: WebRoute[] = []

  routes.push(
    endpoint({ path: `${API_PREFIX}/status`, methods: ['GET'] }, async (_req, res) => {
      writeJson(res, 200, await service.status())
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/settings`, methods: ['GET', 'PUT'] }, async (req, res) => {
      if (req.method === 'GET') {
        writeJson(res, 200, service.getSettings())
        return
      }
      const body = await readJsonBody<Partial<VaultSettings>>(req)
      writeJson(res, 200, await service.updateSettings(body))
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/targets`, methods: ['GET', 'POST'] }, async (req, res) => {
      if (req.method === 'GET') {
        writeJson(res, 200, { targets: service.listTargets() })
        return
      }
      const body = await readJsonBody<StorageTargetConfig>(req)
      if (!body.id || !body.kind) throw new ApiError('id and kind are required', 400)
      writeJson(res, 200, { targets: await service.upsertTarget(body) })
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/targets/delete`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<{ id: string }>(req)
      if (!body.id) throw new ApiError('id is required', 400)
      writeJson(res, 200, { targets: await service.removeTarget(body.id) })
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/backup`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<BackupRequest>(req)
      if (!body.targetId && !body.directory && !body.exportFile) {
        throw new ApiError('targetId, directory, or exportFile is required', 400)
      }
      const result = await service.backup(body)
      writeJson(res, 200, result)
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/snapshots`, methods: ['GET'] }, async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const targetId = url.searchParams.get('targetId') ?? undefined
      writeJson(res, 200, { snapshots: await service.listSnapshots(targetId) })
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/snapshots/delete`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<{ targetId: string; snapshotId: string }>(req)
      if (!body.targetId || !body.snapshotId) throw new ApiError('targetId and snapshotId are required', 400)
      await service.deleteSnapshot(body.targetId, body.snapshotId)
      writeJson(res, 200, { ok: true })
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/verify`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<{ targetId: string; snapshotId: string; password?: string }>(req)
      if (!body.targetId || !body.snapshotId) throw new ApiError('targetId and snapshotId are required', 400)
      writeJson(res, 200, await service.verify(body.targetId, body.snapshotId, body.password))
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/restore/preview`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<Pick<RestoreRequest, 'targetId' | 'snapshotId' | 'importPath' | 'password' | 'conflict' | 'conflicts'>>(req)
      if ((!body.targetId || !body.snapshotId) && !body.importPath) {
        throw new ApiError('targetId+snapshotId or importPath is required', 400)
      }
      if (body.conflict !== undefined && body.conflict !== 'keep-current' && body.conflict !== 'use-backup') {
        throw new ApiError('conflict must be "keep-current" or "use-backup"', 400)
      }
      writeJson(res, 200, await service.previewRestore(body))
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/restore`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<RestoreRequest>(req)
      if (!body.conflict) throw new ApiError('conflict is required', 400)
      if ((!body.targetId || !body.snapshotId) && !body.importPath) {
        throw new ApiError('targetId+snapshotId or importPath is required', 400)
      }
      if (body.conflict !== 'keep-current' && body.conflict !== 'use-backup') {
        throw new ApiError('conflict must be "keep-current" or "use-backup"', 400)
      }
      const result = await service.restore(body)
      // Never report HTTP success when plugins failed — clients must surface the failure.
      writeJson(res, result.ok === false ? 409 : 200, result)
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/restore/retry-plugins`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<{ plugins?: Array<{ name: string; profile: string }> }>(req)
      if (body.plugins !== undefined && (!Array.isArray(body.plugins) || body.plugins.some((p) => !p || typeof p.name !== 'string' || typeof p.profile !== 'string'))) {
        throw new ApiError('plugins must be [{ name, profile }]', 400)
      }
      const result = await service.retryFailedPlugins(body)
      writeJson(res, result.ok === false ? 409 : 200, result)
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/fs/list`, methods: ['GET', 'POST'] }, async (req, res) => {
      let path = ''
      if (req.method === 'GET') {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        path = url.searchParams.get('path') ?? ''
      } else {
        const body = await readJsonBody<{ path?: string }>(req)
        path = body.path ?? ''
      }
      writeJson(res, 200, await service.listFs(path))
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/fs/mkdir`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<{ path?: string; name?: string }>(req)
      if (!body.path || !body.name) throw new ApiError('path and name are required', 400)
      writeJson(res, 200, { path: await service.createFsDirectory(body.path, body.name) })
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/fs/pick-directory`, methods: ['POST'] }, async (req, res) => {
      // Close the OS dialog if the browser goes away mid-pick.
      const controller = new AbortController()
      const onClose = () => { if (!res.writableEnded) controller.abort() }
      res.on('close', onClose)
      try {
        const path = await service.pickDirectory(controller.signal)
        writeJson(res, 200, { path })
      } finally {
        res.off('close', onClose)
      }
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/schedule`, methods: ['GET', 'PUT'] }, async (req, res) => {
      if (req.method === 'GET') {
        writeJson(res, 200, service.getSchedule())
        return
      }
      const body = await readJsonBody<Partial<ScheduleConfig>>(req)
      writeJson(res, 200, await service.updateSchedule(body))
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/schedule/run`, methods: ['POST'] }, async (_req, res) => {
      const result = await service.runScheduledBackup()
      writeJson(res, 200, { result })
    }),
  )

  return routes
}

export function registerVaultRoutes(
  webServer: { register: (route: WebRoute) => (() => void) | void },
  service: VaultService,
): () => void {
  const disposers: Array<() => void> = []
  for (const route of buildVaultRoutes(service)) {
    const dispose = webServer.register(route)
    if (typeof dispose === 'function') disposers.push(dispose)
  }
  return () => {
    for (const d of disposers) d()
  }
}
