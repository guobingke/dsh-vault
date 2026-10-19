import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeConflicts,
  resolveItemConflict,
  shouldApplyChange,
} from '../src/core/conflict.js'

describe('conflict resolution', () => {
  it('falls back to the global strategy when path is unspecified', () => {
    assert.equal(resolveItemConflict('a.yaml', 'use-backup'), 'use-backup')
    assert.equal(resolveItemConflict('a.yaml', 'keep-current', {}), 'keep-current')
    assert.equal(
      resolveItemConflict('a.yaml', 'keep-current', { 'b.yaml': 'use-backup' }),
      'keep-current',
    )
  })

  it('prefers a per-path override over the global default', () => {
    assert.equal(
      resolveItemConflict('settings.yaml', 'use-backup', {
        'settings.yaml': 'keep-current',
        'mcp.json': 'use-backup',
      }),
      'keep-current',
    )
    assert.equal(
      resolveItemConflict('mcp.json', 'keep-current', {
        'settings.yaml': 'keep-current',
        'mcp.json': 'use-backup',
      }),
      'use-backup',
    )
  })

  it('applies change/add/remove rules consistently', () => {
    assert.equal(shouldApplyChange('add', 'keep-current'), true)
    assert.equal(shouldApplyChange('add', 'use-backup'), true)
    assert.equal(shouldApplyChange('change', 'use-backup'), true)
    assert.equal(shouldApplyChange('change', 'keep-current'), false)
    assert.equal(shouldApplyChange('unchanged', 'use-backup'), false)
    assert.equal(shouldApplyChange('remove', 'use-backup'), false)
  })

  it('normalizes and rejects malformed conflicts maps', () => {
    assert.equal(normalizeConflicts(undefined), undefined)
    assert.equal(normalizeConflicts(null), undefined)
    assert.deepEqual(
      normalizeConflicts({ 'settings.yaml': 'keep-current' }),
      { 'settings.yaml': 'keep-current' },
    )
    assert.throws(() => normalizeConflicts(['keep-current']))
    assert.throws(() => normalizeConflicts({ 'settings.yaml': 'merge' }))
    assert.throws(() => normalizeConflicts({ '': 'use-backup' }))
  })
})
