import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ServerResponse } from 'node:http'
import { VaultService, ROLLBACK_TARGET_ID } from '../src/core/vault-service.js'
import { SECRET_MASK, maskTargetSecrets, mergeTargetSecrets } from '../src/core/target-secrets.js'
import { VaultUserError, asVaultUserError } from '../src/core/errors.js'
import { ApiError, writeError } from '../src/api/http.js'
import { buildVaultRoutes } from '../src/api/routes.js'
import { vaultRollbackDir } from '../src/core/paths.js'
import { makeTempHome } from './helpers.js'

describe('target secret masking', () => {
  it('masks stored secrets and keeps existing on masked/empty save', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      await service.upsertTarget({
        kind: 'webdav',
        id: 'dav',
        label: 'dav',
        url: 'https://example.test/dav',
        username: 'u',
        password: 'super-secret-pass',
      })
      await service.upsertTarget({
        kind: 's3',
        id: 's3',
        label: 's3',
        endpoint: 'https://s3.example.test',
        bucket: 'b',
        accessKeyId: 'AKIA',
        secretAccessKey: 's3-secret-key',
      })
      await service.upsertTarget({
        kind: 'github',
        id: 'gh',
        label: 'gh',
        owner: 'o',
        repo: 'r',
        token: 'ghp_secret_token',
      })

      const listed = service.listTargets()
      const dav = listed.find((t) => t.id === 'dav')
      const s3t = listed.find((t) => t.id === 's3')
      const gh = listed.find((t) => t.id === 'gh')
      assert.equal(dav?.kind === 'webdav' && dav.password, SECRET_MASK)
      assert.equal(s3t?.kind === 's3' && s3t.secretAccessKey, SECRET_MASK)
      assert.equal(gh?.kind === 'github' && gh.token, SECRET_MASK)
      assert.ok(!JSON.stringify(listed).includes('super-secret-pass'))
      assert.ok(!JSON.stringify(listed).includes('s3-secret-key'))
      assert.ok(!JSON.stringify(listed).includes('ghp_secret_token'))

      await service.upsertTarget({
        kind: 'webdav',
        id: 'dav',
        label: 'dav-renamed',
        url: 'https://example.test/dav',
        username: 'u',
        password: SECRET_MASK,
      })
      await service.upsertTarget({
        kind: 's3',
        id: 's3',
        label: 's3',
        endpoint: 'https://s3.example.test',
        bucket: 'b',
        accessKeyId: 'AKIA',
        secretAccessKey: '',
      })

      const raw = service.listTargetsRaw()
      const rawDav = raw.find((t) => t.id === 'dav')
      const rawS3 = raw.find((t) => t.id === 's3')
      assert.equal(rawDav?.kind === 'webdav' && rawDav.password, 'super-secret-pass')
      assert.equal(rawDav?.kind === 'webdav' && rawDav.label, 'dav-renamed')
      assert.equal(rawS3?.kind === 's3' && rawS3.secretAccessKey, 's3-secret-key')

      await service.upsertTarget({
        kind: 'webdav',
        id: 'dav',
        label: 'dav-renamed',
        url: 'https://example.test/dav',
        password: 'brand-new',
      })
      const after = raw.find((t) => t.id === 'dav')
      void after
      assert.equal(
        (service.listTargetsRaw().find((t) => t.id === 'dav') as { password?: string }).password,
        'brand-new',
      )

      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('mask helpers are pure', () => {
    const masked = maskTargetSecrets({
      kind: 'webdav',
      id: 'x',
      label: 'x',
      url: 'https://x',
      password: 'abc',
    })
    assert.equal(masked.kind === 'webdav' && masked.password, SECRET_MASK)
    const merged = mergeTargetSecrets(
      { kind: 'webdav', id: 'x', label: 'x', url: 'https://x', password: SECRET_MASK },
      { kind: 'webdav', id: 'x', label: 'x', url: 'https://x', password: 'abc' },
    )
    assert.equal(merged.kind === 'webdav' && merged.password, 'abc')
  })
})

describe('private encrypted rollback for credentials', () => {
  it('encrypts rollback with secrets when restore overwrites credentials', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id
      const backup = await service.backup({
        targetId,
        encrypt: true,
        password: 'restore-pass',
        includeSecrets: true,
      })

      await writeFile(join(home.dshHome, '.credentials.yaml'), 'apiKey: LIVE-KEY\n', { mode: 0o600 })

      const result = await service.restore({
        targetId,
        snapshotId: backup.snapshotId,
        password: 'restore-pass',
        conflict: 'use-backup',
        includeSecrets: true,
        reinstallPlugins: false,
      })
      assert.ok(result.rollbackSnapshotId)
      assert.equal(result.rollbackTargetId, ROLLBACK_TARGET_ID)
      assert.ok(!service.listTargets().some((t) => t.id === ROLLBACK_TARGET_ID))

      const rbDir = vaultRollbackDir(service.dataDir)
      const st = await stat(rbDir)
      if (process.platform !== 'win32') {
        assert.equal(st.mode & 0o777, 0o700)
      }

      const rollbacks = await service.listSnapshots(ROLLBACK_TARGET_ID)
      const rb = rollbacks.find((s) => s.id === result.rollbackSnapshotId)
      assert.ok(rb)
      assert.equal(rb!.encrypted, true)

      await service.restore({
        targetId: ROLLBACK_TARGET_ID,
        snapshotId: result.rollbackSnapshotId!,
        password: 'restore-pass',
        conflict: 'use-backup',
        includeSecrets: true,
        createRollbackSnapshot: false,
        reinstallPlugins: false,
      })
      assert.match(await readFile(join(home.dshHome, '.credentials.yaml'), 'utf8'), /LIVE-KEY/)

      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('refuses secrets backup without encryption (400)', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      await assert.rejects(
        () => service.backup({ targetId: service.listTargets()[0]!.id, includeSecrets: true, encrypt: false }),
        (err: unknown) => err instanceof VaultUserError && err.code === 'SECRETS_REQUIRE_ENCRYPT' && err.status === 400,
      )
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('keeps credentials when conflict is keep-current (plain rollback, no password gate)', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id
      const backup = await service.backup({
        targetId,
        encrypt: true,
        password: 'restore-pass',
        includeSecrets: true,
      })
      await writeFile(join(home.dshHome, '.credentials.yaml'), 'apiKey: KEEP-ME\n', { mode: 0o600 })
      const result = await service.restore({
        targetId,
        snapshotId: backup.snapshotId,
        password: 'restore-pass',
        conflict: 'use-backup',
        conflicts: { '.credentials.yaml': 'keep-current' },
        includeSecrets: true,
        reinstallPlugins: false,
      })
      // Credentials not applied → rollback need not be encrypted-with-secrets.
      const rb = (await service.listSnapshots(ROLLBACK_TARGET_ID)).find((s) => s.id === result.rollbackSnapshotId)
      assert.ok(rb)
      assert.equal(rb!.encrypted, false)
      assert.match(await readFile(join(home.dshHome, '.credentials.yaml'), 'utf8'), /KEEP-ME/)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('does not store rollback files on the first user local target', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      const userDir = join(home.dshHome, 'user-usb')
      await mkdir(userDir, { recursive: true })
      await service.upsertTarget({ kind: 'local', id: 'usb', label: 'USB', directory: userDir })
      await service.removeTarget('local-default')
      const backup = await service.backup({ targetId: 'usb' })
      const result = await service.restore({
        targetId: 'usb',
        snapshotId: backup.snapshotId,
        conflict: 'use-backup',
        reinstallPlugins: false,
      })
      assert.equal(result.rollbackTargetId, ROLLBACK_TARGET_ID)
      const usbFiles = await readdir(userDir)
      assert.ok(usbFiles.some((n) => n.includes(backup.snapshotId)))
      assert.ok(!usbFiles.some((n) => result.rollbackSnapshotId && n.includes(result.rollbackSnapshotId)))
      const rbFiles = await readdir(vaultRollbackDir(service.dataDir))
      assert.ok(rbFiles.some((n) => result.rollbackSnapshotId && n.includes(result.rollbackSnapshotId)))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('preview lists local-only files as remove', () => {
  it('reports remove for in-scope files absent from the snapshot', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id
      const backup = await service.backup({ targetId })
      await writeFile(join(home.dshHome, 'orphan-local.md'), 'should not be in scope\n')
      await mkdir(join(home.agentsHome, 'skills', 'local-only'), { recursive: true })
      await writeFile(join(home.agentsHome, 'skills', 'local-only', 'SKILL.md'), '# local only\n')

      const preview = await service.previewRestore({ targetId, snapshotId: backup.snapshotId })
      const removes = preview.items.filter((i) => i.change === 'remove')
      assert.ok(preview.removed >= 1)
      assert.ok(removes.some((i) => i.path === 'agents-home/skills/local-only/SKILL.md'))
      assert.ok(!removes.some((i) => i.path.includes('orphan-local')))

      await service.restore({
        targetId,
        snapshotId: backup.snapshotId,
        conflict: 'use-backup',
        createRollbackSnapshot: false,
        reinstallPlugins: false,
      })
      assert.match(await readFile(join(home.agentsHome, 'skills', 'local-only', 'SKILL.md'), 'utf8'), /local only/)
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })
})

describe('user errors map to 4xx', () => {
  it('maps secrets-without-encrypt, missing target, and remote status codes', () => {
    const secrets = asVaultUserError(new Error('secrets may only be included when encryption is enabled'))
    assert.equal(secrets?.status, 400)
    assert.equal(secrets?.code, 'SECRETS_REQUIRE_ENCRYPT')

    const missing = asVaultUserError(new Error('storage target not found: nope'))
    assert.equal(missing?.status, 404)

    const forbidden = asVaultUserError(new Error('S3 list failed (403)'))
    assert.equal(forbidden?.status, 403)
    assert.equal(forbidden?.code, 'FORBIDDEN')

    const unauthorized = asVaultUserError(new Error('WebDAV put failed (401)'))
    assert.equal(unauthorized?.status, 401)

    const notFound = asVaultUserError(new Error('GitHub get failed (404)'))
    assert.equal(notFound?.status, 404)
  })

  it('HTTP backup returns 400 for secrets without encrypt', async () => {
    const home = await makeTempHome()
    try {
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        runPluginInstall: async () => ({ ok: true, detail: 'ok' }),
      })
      await service.init()
      const routes = buildVaultRoutes(service)
      const backup = routes.find((r) => r.path.endsWith('/backup'))!
      const { createServer } = await import('node:http')
      const server = createServer((incoming, outgoing) => {
        void backup.handler(incoming, outgoing)
      })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
      const port = (server.address() as { port: number }).port
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/dsh-vault/backup`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetId: service.listTargets()[0]!.id,
            includeSecrets: true,
            encrypt: false,
          }),
        })
        assert.equal(response.status, 400)
        const json = await response.json() as { error: string; code?: string }
        assert.match(json.error, /secrets may only be included/i)
        assert.equal(json.code, 'SECRETS_REQUIRE_ENCRYPT')
      } finally {
        server.close()
      }
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('writeError emits ApiError / VaultUserError status', () => {
    const chunks: Buffer[] = []
    const res = {
      writeHead() {},
      end(payload: string) { chunks.push(Buffer.from(payload)) },
    } as unknown as ServerResponse
    writeError(res, new ApiError('bad', 400, 'BAD_REQUEST'))
    assert.match(chunks[0]!.toString(), /"code":"BAD_REQUEST"/)
    writeError(res, new VaultUserError('nope', 403, 'FORBIDDEN'))
    assert.match(chunks[1]!.toString(), /"code":"FORBIDDEN"/)
    writeError(res, new Error('S3 list failed (403)'))
    assert.match(chunks[2]!.toString(), /"code":"FORBIDDEN"/)
  })
})
