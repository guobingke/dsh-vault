import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DOCUMENTED_EXCLUDES, homeExcludeReason, isWorkspaceStatePath } from '../src/core/home-scope.js'
import { applyRestore } from '../src/core/restore-apply.js'
import { previewRestoreDiff } from '../src/core/diff.js'
import { sha256Buffer as sha256 } from '../src/core/checksum.js'
import { dictionaries } from '../src/client/i18n.js'
import type { VaultManifest } from '../src/core/types.js'

describe('workspaces (工作区) are not migrated', () => {
  it('excludes storages/workspace.json from backup', () => {
    assert.equal(homeExcludeReason('storages/workspace.json', false), 'workspace')
    assert.equal(homeExcludeReason('storages\\workspace.json', false), 'workspace')
    assert.equal(homeExcludeReason('storages/workspace.json.tmp', false), 'workspace')
    assert.equal(homeExcludeReason('storages/other.json', false), null)
    assert.equal(isWorkspaceStatePath('profiles/desktop/storages/x.json'), false)
  })

  it('lists it in the documented excludes with a Chinese reason', () => {
    const e = DOCUMENTED_EXCLUDES.find((x) => x.reason === 'workspace')
    assert.ok(e)
    assert.equal(e.pattern, 'storages/workspace.json')
    assert.match(e.why, /工作区（本机路径，不迁移）/)
  })

  it('old snapshots containing workspaces: restore skips them and preserves the target', async () => {
    const home = await mkdtemp(join(tmpdir(), 'vault-ws-'))
    const agents = join(home, 'agents')
    await mkdir(join(home, 'storages'), { recursive: true })
    const target = '{"tables":{"workspaces":{"a":{"path":"/home/me/proj"}}}}'
    await writeFile(join(home, 'storages', 'workspace.json'), target)
    const src = Buffer.from('{"tables":{"workspaces":{"b":{"path":"E:\\\\travel"}}}}')
    const other = Buffer.from('ok')
    const manifest = {
      id: 'snap1',
      files: [
        { path: 'storages/workspace.json', sha256: sha256(src), size: src.length, category: 'plugin-config' },
        { path: 'storages/other.json', sha256: sha256(other), size: other.length, category: 'plugin-config' },
      ],
      plugins: [],
    } as unknown as VaultManifest
    const preview = await previewRestoreDiff({ manifest, dshHome: home, agentsHome: agents })
    assert.ok(!preview.items.some((i) => i.path === 'storages/workspace.json'))
    await applyRestore({
      manifest,
      files: new Map([['storages/workspace.json', src], ['storages/other.json', other]]),
      dshHome: home,
      agentsHome: agents,
      conflict: 'use-backup',
    })
    assert.equal(await readFile(join(home, 'storages', 'workspace.json'), 'utf8'), target)
    assert.equal(await readFile(join(home, 'storages', 'other.json'), 'utf8'), 'ok')
  })

  it('user-visible name is 大肥鱼备份', () => {
    assert.equal(dictionaries.zh['section.label'], '大肥鱼备份')
    assert.equal(dictionaries.en['section.title'], '大肥鱼备份')
  })
})
