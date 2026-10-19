import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sep } from 'node:path'
import { expandUserPath, looksLikeWindowsAbsPath } from '../src/core/win-paths.js'

describe('expandUserPath (Windows-style)', () => {
  it('keeps drive letters and normalizes mixed slashes', () => {
    const out = expandUserPath('D:/Backups/dsh vault')
    assert.match(out, /^D:[/\\]Backups[/\\]dsh vault$/)
    assert.equal(looksLikeWindowsAbsPath('D:\\Backups'), true)
    assert.equal(looksLikeWindowsAbsPath('\\\\server\\share\\x'), true)
    assert.equal(looksLikeWindowsAbsPath('/home/x'), false)
  })

  it('expands %USERPROFILE% and paths with spaces / non-ASCII', () => {
    const env = { USERPROFILE: `C:${sep}Users${sep}测试 用户` }
    const out = expandUserPath('%USERPROFILE%\\Documents\\My Vault', env)
    assert.match(out, /测试 用户/)
    assert.match(out, /Documents/)
    assert.match(out, /My Vault/)
  })

  it('expands ~ using homedir', () => {
    const out = expandUserPath('~/dsh-backups')
    assert.ok(out.length > 'dsh-backups'.length)
    assert.ok(!out.includes('~'))
  })
})
