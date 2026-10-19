import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { restartNotice } from '../src/client/restart-notice.js'
import { translate } from '../src/client/i18n.js'
import type { RestoreResult } from '../src/core/types.js'

const base = (over: Partial<RestoreResult>): RestoreResult => ({ ok: true, applied: [], skipped: [], ...over }) as RestoreResult
const row = (name: string, status: string) => ({ name, profile: 'desktop', status }) as never

function text(lang: 'zh' | 'en', r: RestoreResult): string | null {
  const n = restartNotice(r)
  return n ? translate(lang, n.key, n.vars) : null
}

describe('restart notice by restore outcome', () => {
  it('full success says fully finished', () => {
    const r = base({ applied: ['a'] as never, pluginResults: [row('a', 'installed'), row('b', 'already-present')] })
    assert.equal(text('zh', r), '恢复已全部完成，请重启 dsh（完全退出 Desktop 后重新打开）以加载插件和配置。')
    assert.match(text('en', r)!, /fully finished/)
  })
  it('partial names the failure count and never says fully finished', () => {
    const r = base({ ok: false, applied: ['a', 'b'] as never, pluginResults: [row('a', 'installed'), row('b', 'failed'), row('c', 'failed')] })
    const zh = text('zh', r)!
    assert.equal(zh, '恢复已结束，有 2 个插件安装失败。请重启 dsh（完全退出 Desktop 后重新打开）以加载已恢复的插件和配置；失败的插件可在下方重试。')
    assert.doesNotMatch(zh, /全部完成/)
    assert.match(text('en', r)!, /2 plugin\(s\) failed/)
    assert.doesNotMatch(text('en', r)!, /fully/)
  })
  it('all plugins failed but files written is still partial', () => {
    const r = base({ ok: false, applied: ['x'] as never, pluginResults: [row('a', 'failed')] })
    assert.equal(restartNotice(r)?.key, 'summary.restartPartial')
  })
  it('aborted with files written mentions files and rollback', () => {
    const r = base({ ok: false, applied: ['x', 'y', 'z'] as never })
    assert.match(text('zh', r)!, /已写入 3 个文件.*回滚/)
    assert.match(text('en', r)!, /3 file\(s\) were already written.*rollback/)
  })
  it('nothing restored shows no restart prompt', () => {
    assert.equal(restartNotice(base({ ok: false })), null)
    assert.equal(restartNotice(base({ ok: false, pluginResults: [row('a', 'failed')] })), null)
  })
})
