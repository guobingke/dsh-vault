import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { collectBackupFiles } from '../src/core/collect.js'
import { VaultService } from '../src/core/vault-service.js'
import { publicResult } from '../src/api/routes.js'
import { I18nContext, dictionaries, translate } from '../src/client/i18n.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BackupSummary } from '../src/client/components/ResultSummary.js'
import type { BackupResult } from '../src/core/types.js'

async function put(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}

const pkg = (deps: Record<string, string>, bundles: string[]) =>
  JSON.stringify({ name: 'dsh-profile-desktop', dependencies: deps, dsh: { profile: { bundles } } }, null, 2)

async function home() {
  const root = await mkdtemp(join(tmpdir(), 'dv-unportable-'))
  const dshHome = join(root, '.dsh')
  await mkdir(join(dshHome, 'profiles', 'desktop'), { recursive: true })
  return { root, dshHome, agentsHome: join(root, '.agents') }
}

describe('plugins a snapshot cannot carry (换机器会丢的插件)', () => {
  it('reports a local path whose source is gone and has no installed copy', async () => {
    const h = await home()
    try {
      await put(join(h.dshHome, 'profiles', 'desktop', 'package.json'), pkg({
        'dsh-gone': 'link:/nowhere/dsh-gone',
        'dsh-npm': '1.2.3',
      }, ['@deepseek-ai/dsh-base']))
      const r = await collectBackupFiles({ dshHome: h.dshHome, agentsHome: h.agentsHome, categories: ['plugins'] })
      assert.deepEqual(r.unportablePlugins, [{ name: 'dsh-gone', profile: 'desktop', reason: 'local-source' }])
    } finally {
      await rm(h.root, { recursive: true, force: true })
    }
  })

  it('reports a name-only plugin that is not installed anywhere', async () => {
    const h = await home()
    try {
      await put(join(h.dshHome, 'profiles', 'desktop', 'package.json'), pkg({}, ['@deepseek-ai/dsh-base', 'dsh-mystery']))
      const r = await collectBackupFiles({ dshHome: h.dshHome, agentsHome: h.agentsHome, categories: ['plugins'] })
      assert.deepEqual(r.unportablePlugins, [{ name: 'dsh-mystery', profile: 'desktop', reason: 'no-source' }])
    } finally {
      await rm(h.root, { recursive: true, force: true })
    }
  })

  it('stays quiet for local plugins that were packed and for installed fallbacks', async () => {
    const h = await home()
    try {
      const tgz = join(h.root, 'artifacts', 'dsh-local-2.0.0.tgz')
      await put(tgz, 'not-a-real-tarball-but-present')
      await put(join(h.dshHome, 'profiles', 'desktop', 'package.json'), pkg({
        'dsh-local': `file:${tgz}`,
        'dsh-vscode-bridge': '0.3.1',
      }, ['@deepseek-ai/dsh-base']))
      // Installed registry plugin: packed as a fallback copy, so it survives a move.
      const nm = join(h.dshHome, 'profiles', 'desktop', 'node_modules', 'dsh-vscode-bridge')
      await put(join(nm, 'package.json'), JSON.stringify({ name: 'dsh-vscode-bridge', version: '0.3.1', keywords: ['dsh-plugin'] }))
      const r = await collectBackupFiles({ dshHome: h.dshHome, agentsHome: h.agentsHome, categories: ['plugins'] })
      assert.equal(r.unportablePlugins.length, 0, JSON.stringify(r.unportablePlugins))
      const local = r.plugins.find((p) => p.name === 'dsh-local')
      assert.ok(local?.bundledSource, 'the tarball was packed')
    } finally {
      await rm(h.root, { recursive: true, force: true })
    }
  })

  it('travels with the backup result, survives the API trim, and is absent when empty', async () => {
    const h = await home()
    try {
      await put(join(h.dshHome, 'profiles', 'desktop', 'package.json'), pkg({
        'dsh-gone': 'link:/nowhere/dsh-gone',
      }, ['@deepseek-ai/dsh-base']))
      await mkdir(h.agentsHome, { recursive: true })
      const svc = new VaultService({ dshHome: h.dshHome, agentsHome: h.agentsHome, activeProfile: 'desktop' })
      await svc.init()
      const result = await svc.backup({ exportFile: join(h.root, 'snap.tar.gz') })
      svc.stopSchedule()
      assert.deepEqual(result.unportablePlugins, [{ name: 'dsh-gone', profile: 'desktop', reason: 'local-source' }])
      const api = publicResult(result) as typeof result
      assert.deepEqual(api.unportablePlugins, result.unportablePlugins)

      // Nothing to warn about: the field is not even set.
      await put(join(h.dshHome, 'profiles', 'desktop', 'package.json'), pkg({ 'dsh-npm': '1.2.3' }, ['@deepseek-ai/dsh-base']))
      const clean = await svc.backup({ exportFile: join(h.root, 'snap2.tar.gz') })
      svc.stopSchedule()
      assert.equal(clean.unportablePlugins, undefined)
    } finally {
      await rm(h.root, { recursive: true, force: true })
    }
  })

  it('shows the warning under the backup summary, and nothing when the list is empty', () => {
    const base = { snapshotId: 'vault-1', targetId: 't', remoteKey: 'k', bytes: 1024, encrypted: false, includeSecrets: false } as const
    const withWarning: BackupResult = {
      ...base,
      manifest: { plugins: [] } as unknown as BackupResult['manifest'],
      unportablePlugins: [
        { name: 'dsh-gone', profile: 'desktop', reason: 'local-source' },
        { name: 'dsh-mystery', profile: 'web', reason: 'no-source' },
      ],
    }
    const render = (result: BackupResult) => renderToStaticMarkup(createElement(
      I18nContext.Provider,
      { value: { locale: 'zh', t: (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('zh', k, v) } },
      createElement(BackupSummary, { result, location: '/tmp/snap.tar.gz' }),
    ))
    const html = render(withWarning)
    assert.ok(html.includes(translate('zh', 'summary.backup.unportableTitle', { count: 2 })), html)
    assert.match(html, /dsh-gone（desktop，本地路径，没有副本）/)
    assert.match(html, /dsh-mystery（web，来源未知，没有副本）/)
    // Still a completed backup, not an error.
    assert.match(html, /备份完成/)
    assert.doesNotMatch(html, /data-tone="error"/)

    const clean = render({ ...base, manifest: { plugins: [] } as unknown as BackupResult['manifest'] })
    assert.doesNotMatch(clean, /没打进快照/)
  })

  it('has warning text in both languages', () => {
    for (const key of ['summary.backup.unportableTitle', 'summary.backup.unportableBody', 'summary.backup.unportableList'] as const) {
      assert.ok(dictionaries.zh[key], key)
      assert.ok(dictionaries.en[key], key)
    }
    assert.match(dictionaries.zh['summary.backup.unportableTitle'], /\{count\}/)
    assert.match(dictionaries.zh['summary.backup.unportableBody'], /保存插件副本/)
  })
})
