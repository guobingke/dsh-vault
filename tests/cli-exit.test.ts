import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { restoreExitCode, restoreFailureSummary } from '../src/cli/exit.js'

describe('cli restore exit code', () => {
  it('is non-zero when a plugin failed', () => {
    const r = { ok: false, pluginResults: [{ name: 'a', profile: 'web', status: 'failed' }, { name: 'b', status: 'installed' }] }
    assert.equal(restoreExitCode(r), 2)
    assert.match(restoreFailureSummary(r), /1 plugin\(s\) failed: a \(web\)/)
  })
  it('is zero on success', () => {
    assert.equal(restoreExitCode({ ok: true }), 0)
    assert.equal(restoreExitCode({}), 0)
    assert.equal(restoreFailureSummary({ ok: true }), '')
  })
})
