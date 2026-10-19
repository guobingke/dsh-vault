import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JobRegistry, ProgressTracker, stageOf, type JobState } from '../src/core/progress.js'
import { VaultService } from '../src/core/vault-service.js'
import { fakePnpmUnpublished, writePkg } from './fake-pnpm.js'
import type { ProgressEvent } from '../src/core/types.js'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function settle<R>(reg: { get(id: string): JobState | null }, id: string): Promise<JobState<R>> {
  for (let i = 0; i < 400; i++) {
    const j = reg.get(id)!
    if (j.status !== 'running') return j as JobState<R>
    await wait(10)
  }
  throw new Error('job did not settle')
}

describe('ProgressTracker', () => {
  it('weights stages, counts n/N, never goes backwards, ends at 100', () => {
    const t = new ProgressTracker('restore')
    const seen: number[] = []
    const push = (ev: ProgressEvent) => seen.push(t.update(ev).percent)
    push({ phase: 'prepare', message: '', fraction: 1 })
    push({ phase: 'rollback', message: '', fraction: 0.5 })
    push({ phase: 'pack', message: '' }) // nested pack inside rollback stays in rollback
    assert.equal(t.snapshot.stage, 'rollback')
    push({ phase: 'apply', message: '', current: 50, total: 100 })
    const afterApply = t.snapshot.percent
    push({ phase: 'reinstall', message: '', current: 3, total: 9, item: 'dsh-purge' })
    assert.equal(t.snapshot.item, 'dsh-purge')
    assert.equal(t.snapshot.current, 3)
    push({ phase: 'apply', message: '', current: 100, total: 100 }) // late event: ignored
    assert.equal(t.snapshot.stage, 'reinstall')
    push({ phase: 'verify', message: '', fraction: 1 })
    assert.ok(t.snapshot.percent <= 99)
    push({ phase: 'done', message: '' })
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i]! >= seen[i - 1]!, `monotonic at ${i}: ${seen.join(',')}`)
    assert.equal(seen.at(-1), 100)
    // plugin install dominates a restore: 3/9 plugins is past the half-way mark of everything before it
    assert.ok(afterApply < 40, String(afterApply))
  })

  it('maps backup phases', () => {
    assert.equal(stageOf('backup', 'pack'), 'pack')
    assert.equal(stageOf('restore', 'pack'), 'rollback')
    assert.equal(stageOf('backup', 'copies'), 'copies')
    assert.equal(stageOf('restore', 'decrypt'), 'prepare')
  })
})

describe('JobRegistry', () => {
  it('runs one job at a time and keeps the result / error', async () => {
    const reg = new JobRegistry()
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const j = reg.start('backup', async (p) => {
      p({ phase: 'collect', message: '', current: 1, total: 2, item: 'a.json' })
      await gate
      return 42
    })
    assert.equal(reg.active()?.id, j.id)
    assert.equal(reg.get(j.id)?.progress.item, 'a.json')
    assert.throws(() => reg.start('restore', async () => 1), (e: { status?: number }) => e.status === 409)
    release()
    const done = await settle<number>(reg, j.id)
    assert.equal(done.status, 'done')
    assert.equal(done.result, 42)
    assert.equal(done.progress.percent, 100)
    assert.equal(reg.latest()?.id, j.id)
    const bad = reg.start('restore', async () => { throw Object.assign(new Error('boom'), { status: 400, code: 'X' }) })
    const failed = await settle(reg, bad.id)
    assert.equal(failed.status, 'error')
    assert.deepEqual(failed.error, { message: 'boom', code: 'X', status: 400 })
  })
})

describe('real progress from backup / restore', () => {
  it('reports collect n/N, plugin copies, and per-plugin install k/K with names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-progress-'))
    try {
      const dsh1 = join(root, 'm1', '.dsh'); const a1 = join(root, 'm1', '.agents')
      const dsh2 = join(root, 'm2', '.dsh'); const a2 = join(root, 'm2', '.agents')
      await mkdir(join(a1, 'skills'), { recursive: true })
      await writeFile(join(root, 'x'), '')
      await mkdir(dsh1, { recursive: true })
      await writeFile(join(dsh1, 'settings.yaml'), 'a: 1\n')
      await writePkg(join(dsh1, 'profiles', 'web'), { name: 'p', dependencies: { 'dsh-a': '1.0.0', 'dsh-b': '2.0.0' }, dsh: { profile: { bundles: ['dsh-a', 'dsh-b'] } } })
      await writePkg(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-a'), { name: 'dsh-a', version: '1.0.0', keywords: ['dsh-plugin'] })
      await writePkg(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-b'), { name: 'dsh-b', version: '2.0.0', keywords: ['dsh-plugin'] })

      const s1 = new VaultService({ dshHome: dsh1, agentsHome: a1, activeProfile: 'web', registryLookup: null })
      await s1.init()
      const bEvents: ProgressEvent[] = []
      const exportFile = join(root, 'snap.tar.gz')
      const bjob = s1.jobs.start('backup', (p) => s1.backup({ exportFile }, (ev) => { bEvents.push(ev); p(ev) }))
      const bdone = await settle(s1.jobs, bjob.id)
      s1.stopSchedule()
      assert.equal(bdone.status, 'done', JSON.stringify(bdone.error))
      assert.ok(bEvents.some((e) => e.phase === 'collect' && e.total && e.current === e.total))
      assert.ok(bEvents.some((e) => e.phase === 'copies' && e.item === 'dsh-b' && e.total === 2))
      assert.ok(bEvents.some((e) => e.phase === 'upload'))

      await mkdir(join(dsh2, 'profiles', 'web'), { recursive: true })
      await mkdir(a2, { recursive: true })
      const s2 = new VaultService({ dshHome: dsh2, agentsHome: a2, activeProfile: 'web', registryLookup: null, runPluginInstall: fakePnpmUnpublished(new Set(), []) })
      await s2.init()
      const events: ProgressEvent[] = []
      const tracker = new ProgressTracker('restore')
      const stages: string[] = []
      const rjob = s2.jobs.start('restore', (p) => s2.restore({ importPath: exportFile, conflict: 'use-backup' }, (ev) => {
        events.push(ev)
        const st = tracker.update(ev).stage
        if (stages.at(-1) !== st) stages.push(st)
        p(ev)
      }))
      const rdone = await settle<{ ok?: boolean; durationMs?: number }>(s2.jobs, rjob.id)
      s2.stopSchedule()
      assert.equal(rdone.status, 'done', JSON.stringify(rdone.error))
      assert.deepEqual(stages, ['prepare', 'rollback', 'apply', 'reinstall', 'verify', 'done'])
      assert.ok(events.some((e) => e.phase === 'apply' && e.total && e.current === e.total))
      const installs = events.filter((e) => e.phase === 'reinstall' && e.item && e.total === 2)
      assert.deepEqual([...new Set(installs.map((e) => e.item))].filter((n) => !n!.startsWith('pnpm')), ['dsh-a', 'dsh-b'])
      assert.equal(rdone.progress.percent, 100)
      assert.equal(typeof rdone.result?.durationMs, 'number')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
