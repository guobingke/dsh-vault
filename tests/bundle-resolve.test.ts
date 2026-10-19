import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundleResolvesFromProfile, reinstallMissingPlugins } from '../src/core/plugin-install.js'
import { groupDiffItems } from '../src/client/components/DiffGroups.js'
import { restoreHeadline, restoreState, formatDuration } from '../src/client/components/ResultSummary.js'
import { translate } from '../src/client/i18n.js'
import { fakePnpmUnpublished, writePkg } from './fake-pnpm.js'
import type { DiffItem, RestoreResult } from '../src/core/types.js'

const bundlesOf = async (dir: string): Promise<string[]> =>
  (JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { dsh: { profile: { bundles: string[] } } }).dsh.profile.bundles

describe('profile bundles stay resolvable during restore (包不可用)', () => {
  it('lists a restored plugin in dsh.profile.bundles only once it resolves like dsh does', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-bundles-'))
    try {
      const dshHome = join(root, '.dsh')
      const profileDir = join(dshHome, 'profiles', 'desktop')
      // What applyRestore wrote from the snapshot: every plugin already listed, none installed.
      await writePkg(profileDir, {
        name: 'dsh-profile-desktop',
        dependencies: { 'dsh-purge': '1.0.0', 'dsh-skin': '2.0.0', 'dsh-gone': '9.9.9' },
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-purge', 'dsh-skin', 'dsh-gone'] } },
      })
      assert.equal(bundleResolvesFromProfile(profileDir, 'dsh-purge'), false)
      const calls: string[] = []
      const seenDuringInstall: string[][] = []
      const pnpm = fakePnpmUnpublished(new Set(['dsh-gone']), calls)
      const run = async (cmd: string, args: string[], opts: { cwd?: string }) => {
        if (opts.cwd === profileDir) seenDuringInstall.push(await bundlesOf(profileDir))
        return pnpm(cmd, args, opts)
      }
      const { results } = await reinstallMissingPlugins(
        [
          { name: 'dsh-purge', version: '1.0.0', source: 'npm:dsh-purge@1.0.0', profile: 'desktop' },
          { name: 'dsh-skin', version: '2.0.0', source: 'npm:dsh-skin@2.0.0', profile: 'desktop' },
          { name: 'dsh-gone', version: '9.9.9', source: 'npm:dsh-gone@9.9.9', profile: 'desktop' },
        ],
        { dshHome, activeProfile: 'desktop', runCommand: run },
      )
      // While installing, Desktop would never see an unresolvable plugin bundle.
      assert.ok(seenDuringInstall.length > 0)
      assert.deepEqual(seenDuringInstall[0], ['@deepseek-ai/dsh-base'])
      // Afterwards: installed ones back in the backup's order; the failed one left out; dsh built-ins kept.
      assert.deepEqual(await bundlesOf(profileDir), ['@deepseek-ai/dsh-base', 'dsh-purge', 'dsh-skin'])
      assert.equal(results.find((r) => r.name === 'dsh-gone')?.status, 'failed')
      for (const n of ['dsh-purge', 'dsh-skin']) assert.ok(bundleResolvesFromProfile(profileDir, n), n)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('restore preview groups', () => {
  const item = (path: string, category: DiffItem['category'], change: DiffItem['change']): DiffItem => ({ path, category, change })
  const items = [
    item('profiles/web/package.json', 'profiles', 'change'),
    item('plugin-sources/web/a/package.json', 'plugins', 'add'),
    item('mcp.json', 'mcp', 'unchanged'),
    ...Array.from({ length: 120 }, (_, i) => item(`skills/s${i}/SKILL.md`, 'skills', i % 2 ? 'unchanged' : 'add')),
  ]
  it('groups by category in a fixed order, hides 相同 by default but still counts them', () => {
    const g = groupDiffItems(items, { showUnchanged: false, query: '' })
    assert.deepEqual(g.map((x) => x.id), ['plugins', 'profiles', 'skills'])
    const skills = g.find((x) => x.id === 'skills')!
    assert.equal(skills.items.length, 60)
    assert.deepEqual(skills.counts, { add: 60, change: 0, remove: 0, unchanged: 60 })
    assert.ok(groupDiffItems(items, { showUnchanged: true, query: '' }).some((x) => x.id === 'mcp'))
  })
  it('filters by path', () => {
    const g = groupDiffItems(items, { showUnchanged: true, query: 'S1/' })
    assert.deepEqual(g.map((x) => x.id), ['skills'])
    assert.equal(g[0]!.items.length, 1)
  })
})

describe('completion summary', () => {
  const tr = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('zh', k, v)
  const base: RestoreResult = { snapshotId: 's', applied: Array(121).fill('x'), skipped: [], pluginsReinstalled: [], pluginsFailed: [], manualActions: [], durationMs: 12_300 }
  it('partial restore headline', () => {
    const r: RestoreResult = {
      ...base,
      ok: false,
      pluginResults: [
        ...Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, profile: 'desktop', status: 'installed' as const, detail: '' })),
        { name: 'bad', profile: 'web', status: 'failed' as const, detail: '' },
      ],
    }
    assert.equal(restoreState(r), 'partial')
    assert.equal(restoreHeadline(r, tr), '恢复部分完成：插件 8 成功 · 1 失败，文件 121 写入，耗时 12s')
  })
  it('full success headline', () => {
    const r: RestoreResult = { ...base, ok: true, pluginResults: [{ name: 'a', profile: 'web', status: 'installed', detail: '' }] }
    assert.equal(restoreHeadline(r, tr), '恢复完成：插件 1 成功，文件 121 写入，耗时 12s')
    assert.equal(formatDuration(75_000), '1m15s')
  })
})
