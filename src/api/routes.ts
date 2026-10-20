import type { VaultService } from '../core/vault-service.js'
import type { BackupRequest, RestoreRequest, ScheduleConfig, StorageTargetConfig, VaultSettings } from '../core/types.js'
import { endpoint as rawEndpoint, readJsonBody, writeJson, type HttpMethod, type RouteGuard, type WebRoute } from './http.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ApiError } from './http.js'
import { redactDeep } from '../core/redact.js'
import type { JobState } from '../core/progress.js'

/** H-04: API responses never carry a full manifest or credential-looking strings. */
export function publicResult<T>(result: T): T {
  if (!result || typeof result !== 'object') return result
  const r = { ...(result as Record<string, unknown>) }
  const m = r.manifest as { id?: string; createdAt?: string; includeSecrets?: boolean; encrypted?: boolean; files?: unknown[]; plugins?: Array<{ name?: string; profile?: string; fallbackBundle?: unknown; bundledSource?: unknown }>; categories?: unknown } | undefined
  if (m && typeof m === 'object') {
    r.manifest = {
      id: m.id,
      createdAt: m.createdAt,
      includeSecrets: m.includeSecrets,
      encrypted: m.encrypted,
      categories: m.categories,
      fileCount: Array.isArray(m.files) ? m.files.length : 0,
      pluginCopyCount: Array.isArray(m.plugins) ? m.plugins.filter((p) => Boolean(p?.fallbackBundle || p?.bundledSource)).length : 0,
      plugins: Array.isArray(m.plugins) ? m.plugins.map((p) => ({ name: p?.name, profile: p?.profile, hasCopy: Boolean(p?.fallbackBundle || p?.bundledSource) })) : [],
    }
  }
  return redactDeep(r) as T
}

export function publicJob(job: JobState | null): JobState | null {
  if (!job) return job
  return redactDeep({ ...job, result: publicResult(job.result) })
}

/** H-06: over HTTP only source-bound approvals (`profile:name#hash` from preview) count; `*` and `profile:name` are CLI-only. */
export function sanitizeApprovals(body: { approvedPluginSources?: unknown }): void {
  if (body.approvedPluginSources === undefined) return
  body.approvedPluginSources = Array.isArray(body.approvedPluginSources)
    ? body.approvedPluginSources.filter((k): k is string => typeof k === 'string' && /^[^#\s]+:[^#\s]+#[0-9a-f]{16}$/.test(k))
    : []
}

async function checkBackupPaths(service: VaultService, body: BackupRequest): Promise<void> {
  if (body.exportFile?.trim()) {
    const out = service.exportPathFor(body.exportFile, Boolean(body.encrypt))
    body.exportFile = await service.checkApiPath(out, 'write-file')
    await service.assertExportWritable(body)
  }
  if (body.directory?.trim()) body.directory = await service.checkApiPath(body.directory, 'write-dir')
  delete (body as { dataDir?: unknown }).dataDir
}

async function checkImportPath(service: VaultService, body: { importPath?: string }): Promise<void> {
  if (body.importPath?.trim()) body.importPath = await service.checkApiPath(body.importPath, 'read')
}

export const API_PREFIX = '/api/dsh-vault'

export function buildVaultRoutes(service: VaultService, guard: RouteGuard = {}): WebRoute[] {
  const routes: WebRoute[] = []
  const endpoint = (
    spec: { path: string; methods: readonly HttpMethod[] },
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  ) => rawEndpoint(spec, handler, guard)

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
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('settings must be an object', 400)
      writeJson(res, 200, await service.updateSettings(body))
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/plugins`, methods: ['GET'] }, async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      writeJson(res, 200, await service.listPlugins({ checkRegistry: url.searchParams.get('registry') !== '0' }))
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
      await checkBackupPaths(service, body)
      const result = await service.backup(body)
      writeJson(res, 200, publicResult(result))
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
      await checkImportPath(service, body)
      writeJson(res, 200, redactDeep(await service.previewRestore(body)))
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
      await checkImportPath(service, body)
      sanitizeApprovals(body)
      const result = await service.restore(body)
      // Never report HTTP success when plugins failed — clients must surface the failure.
      writeJson(res, result.ok === false ? 409 : 200, publicResult(result))
    }),
  )

  // Background jobs with real progress: start → poll GET /jobs?id= (or /jobs/latest after re-mount).
  routes.push(
    endpoint({ path: `${API_PREFIX}/jobs/backup`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<BackupRequest>(req)
      if (!body.targetId && !body.directory && !body.exportFile) {
        throw new ApiError('targetId, directory, or exportFile is required', 400)
      }
      await checkBackupPaths(service, body)
      writeJson(res, 202, publicJob(startJob(() => service.startBackupJob(body))))
    }),
  )
  routes.push(
    endpoint({ path: `${API_PREFIX}/jobs/restore`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<RestoreRequest>(req)
      if (body.conflict !== 'keep-current' && body.conflict !== 'use-backup') {
        throw new ApiError('conflict must be "keep-current" or "use-backup"', 400)
      }
      if ((!body.targetId || !body.snapshotId) && !body.importPath) {
        throw new ApiError('targetId+snapshotId or importPath is required', 400)
      }
      await checkImportPath(service, body)
      sanitizeApprovals(body)
      writeJson(res, 202, publicJob(startJob(() => service.startRestoreJob(body))))
    }),
  )
  routes.push(
    endpoint({ path: `${API_PREFIX}/jobs/retry-plugins`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<{ plugins?: Array<{ name: string; profile: string }> }>(req)
      writeJson(res, 202, publicJob(startJob(() => service.startRetryPluginsJob(body))))
    }),
  )
  routes.push(
    endpoint({ path: `${API_PREFIX}/jobs`, methods: ['GET'] }, async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const id = url.searchParams.get('id')
      const job = id ? service.jobs.get(id) : service.jobs.latest()
      if (id && !job) throw new ApiError('job not found', 404)
      writeJson(res, 200, { job: publicJob(job) })
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/restore/retry-plugins`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<{ plugins?: Array<{ name: string; profile: string }> }>(req)
      if (body.plugins !== undefined && (!Array.isArray(body.plugins) || body.plugins.some((p) => !p || typeof p.name !== 'string' || typeof p.profile !== 'string'))) {
        throw new ApiError('plugins must be [{ name, profile }]', 400)
      }
      const result = await service.retryFailedPlugins(body)
      writeJson(res, result.ok === false ? 409 : 200, publicResult(result))
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/restore/unfinished/dismiss`, methods: ['POST'] }, async (req, res) => {
      await readJsonBody<Record<string, never>>(req)
      await service.dismissUnfinishedRestore()
      writeJson(res, 200, { ok: true })
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
      writeJson(res, 200, await service.listFsApi(path))
    }),
  )

  routes.push(
    endpoint({ path: `${API_PREFIX}/fs/mkdir`, methods: ['POST'] }, async (req, res) => {
      const body = await readJsonBody<{ path?: string; name?: string }>(req)
      if (!body.path || !body.name) throw new ApiError('path and name are required', 400)
      writeJson(res, 200, { path: await service.createFsDirectoryApi(body.path, body.name) })
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

function startJob<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    const err = e as { status?: number; message?: string }
    if (err?.status === 409) throw new ApiError(err.message ?? 'another job is running', 409)
    throw e
  }
}

export function registerVaultRoutes(
  webServer: { register: (route: WebRoute) => (() => void) | void },
  service: VaultService,
  guard: RouteGuard = {},
): () => void {
  const disposers: Array<() => void> = []
  for (const route of buildVaultRoutes(service, guard)) {
    const dispose = webServer.register(route)
    if (typeof dispose === 'function') disposers.push(dispose)
  }
  return () => {
    for (const d of disposers) d()
  }
}
