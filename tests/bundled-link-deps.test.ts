import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { missingRuntimeDependencies, reinstallMissingPlugins, resolveLinkTarget } from '../src/core/plugin-install.js'
import { collectBackupFiles } from '../src/core/collect.js'
import { makeTempHome } from './helpers.js'

async function writePkg(dir: string, pkg: Record<string, unknown>) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg))
}

describe('bundled link: plugins on machine 2', () => {
  it('detects unresolvable runtime deps (pnpm skips deps of link: packages)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-deps-'))
    try {
      await writePkg(join(root, 'plug'), { name: 'plug', dependencies: { yaml: '^2' } })
      assert.deepEqual(await missingRuntimeDependencies(join(root, 'plug')), ['yaml'])
      await writePkg(join(root, 'node_modules', 'yaml'), { name: 'yaml', version: '2.8.1' })
      assert.deepEqual(await missingRuntimeDependencies(join(root, 'plug')), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('prefers the original path when it exists here, else the bundled copy', async () => {
    const home = await makeTempHome()
    try {
      const bundled = join(home.dshHome, 'plugin-sources', 'web', 'plug')
      await writePkg(bundled, { name: 'plug' })
      const rec = { name: 'plug', source: 'link:plugin-sources/web/plug', profile: 'web', bundledSource: 'plugin-sources/web/plug', originalSource: `link:${join(home.root, 'dev', 'plug')}` }
      assert.deepEqual(await resolveLinkTarget(rec, home.dshHome), { abs: bundled, bundled: true, kind: 'dir' })
      await writePkg(join(home.root, 'dev', 'plug'), { name: 'plug' })
      assert.deepEqual(await resolveLinkTarget(rec, home.dshHome), { abs: join(home.root, 'dev', 'plug'), bundled: false, kind: 'dir' })
    } finally {
      await home.cleanup()
    }
  })

  it('installs bundled source deps, and fails (never false success) when they stay missing', async () => {
    for (const depsInstallWorks of [true, false]) {
      const home = await makeTempHome()
      try {
        const profileDir = join(home.dshHome, 'profiles', 'web')
        const bundled = join(home.dshHome, 'plugin-sources', 'web', 'plug')
        await writePkg(bundled, { name: 'plug', version: '1.0.0', dependencies: { yaml: '^2' } })
        await writePkg(profileDir, { name: 'dsh-profile-web', dependencies: { plug: 'link:/elsewhere/plug' } })
        await mkdir(join(profileDir, 'node_modules'), { recursive: true })
        await symlink(bundled, join(profileDir, 'node_modules', 'plug'))
        const calls: Array<{ cwd?: string; args: string[] }> = []
        const { results } = await reinstallMissingPlugins(
          [{ name: 'plug', source: 'link:plugin-sources/web/plug', profile: 'web', bundledSource: 'plugin-sources/web/plug', originalSource: 'link:/elsewhere/plug' }],
          {
            dshHome: home.dshHome,
            activeProfile: 'web',
            runCommand: async (_cmd, args, opts) => {
              calls.push({ cwd: opts.cwd, args })
              if (depsInstallWorks && opts.cwd === bundled && args.includes('--prod')) {
                await writePkg(join(bundled, 'node_modules', 'yaml'), { name: 'yaml', version: '2.8.1' })
              }
              return { ok: true, detail: 'ok', code: 0 }
            },
          },
        )
        assert.ok(calls.some((c) => c.cwd === bundled && c.args.includes('--prod')), 'pnpm install --prod ran in the bundled source')
        const row = results.find((r) => r.name === 'plug')!
        if (depsInstallWorks) {
          assert.equal(row.status, 'already-present')
          assert.match(row.detail, /bundled source/)
        } else {
          assert.equal(row.status, 'failed')
          assert.match(row.detail, /missing dependencies yaml/)
        }
      } finally {
        await home.cleanup()
      }
    }
  })

  it('records the exact installed version and flags a mismatch after restore', async () => {
    const home = await makeTempHome()
    try {
      const profileDir = join(home.dshHome, 'profiles', 'web')
      await writePkg(profileDir, { name: 'dsh-profile-web', dependencies: { 'dsh-cost-meter': '^1.9.0' } })
      await writePkg(join(profileDir, 'node_modules', 'dsh-cost-meter'), { name: 'dsh-cost-meter', version: '1.9.12' })
      const { plugins } = await collectBackupFiles({ dshHome: home.dshHome, agentsHome: home.agentsHome })
      const rec = plugins.find((p) => p.name === 'dsh-cost-meter' && p.profile === 'web')!
      assert.equal(rec.installedVersion, '1.9.12')

      // Machine 2 ends up with a different version → must not be reported as success.
      await writePkg(join(profileDir, 'node_modules', 'dsh-cost-meter'), { name: 'dsh-cost-meter', version: '1.9.13' })
      const adds: string[] = []
      const { results } = await reinstallMissingPlugins([rec], {
        dshHome: home.dshHome,
        activeProfile: 'web',
        runCommand: async (cmd, args) => {
          if (args.includes('add')) adds.push(args.join(' '))
          return { ok: true, detail: 'ok', code: 0 }
        },
      })
      assert.ok(adds.some((a) => a.includes('dsh-cost-meter@1.9.12')), `exact spec used: ${adds.join(' | ')}`)
      assert.equal(results[0]!.status, 'failed')
      assert.match(results[0]!.detail, /1\.9\.13.*1\.9\.12/)
    } finally {
      await home.cleanup()
    }
  })
})
