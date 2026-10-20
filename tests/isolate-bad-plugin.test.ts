import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { reinstallMissingPlugins } from '../src/core/plugin-install.js'
import { makeTempHome } from './helpers.js'

describe('one unresolvable npm plugin', () => {
  it('fails alone instead of taking the whole profile down', async () => {
    const home = await makeTempHome()
    try {
      const profileDir = join(home.dshHome, 'profiles', 'web')
      await mkdir(profileDir, { recursive: true })
      const pkgPath = join(profileDir, 'package.json')
      await writeFile(pkgPath, JSON.stringify({
        name: 'dsh-profile-web',
        dependencies: { good: '^1.0.0', bad: '^1.0.0' },
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'good', 'bad'] } },
      }))
      const readPkg = async () => JSON.parse(await readFile(pkgPath, 'utf8')) as {
        dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } }
      }
      const fail = (detail: string) => ({ ok: false, detail, code: 1 })
      const { results } = await reinstallMissingPlugins(
        [
          { name: 'bad', source: 'npm:bad@^1.0.0', profile: 'web', version: '^1.0.0' },
          { name: 'good', source: 'npm:good@^1.0.0', profile: 'web', version: '^1.0.0', installedVersion: '1.2.3' },
        ],
        {
          dshHome: home.dshHome,
          activeProfile: 'web',
          pnpm: { command: 'pnpm' },
          // Like pnpm/dsh: any install fails while the manifest still lists "bad".
          runCommand: async (cmd, args) => {
            const pkg = await readPkg()
            if (cmd === 'pnpm' && args[0] !== 'add') return 'bad' in pkg.dependencies ? fail('ERR_PNPM_FETCH_404 bad') : { ok: true, detail: '', code: 0 }
            const spec = args[0] === 'add' ? args[1]! : args[args.length - 1]!
            const name = spec.replace(/@[^@]*$/, '')
            pkg.dependencies[name] = spec.slice(name.length + 1)
            pkg.dsh.profile.bundles.push(name)
            await writeFile(pkgPath, JSON.stringify(pkg))
            if ('bad' in pkg.dependencies) return fail('ERR_PNPM_FETCH_404 bad')
            const dir = join(profileDir, 'node_modules', name)
            await mkdir(dir, { recursive: true })
            await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version: '1.2.3' }))
            return { ok: true, detail: '', code: 0 }
          },
        },
      )
      const by = Object.fromEntries(results.map((r) => [r.name, r]))
      assert.equal(by.good?.status, 'installed')
      assert.equal(by.bad?.status, 'failed')
      const pkg = await readPkg()
      assert.ok(!('bad' in pkg.dependencies), 'failed plugin left out of the manifest')
      assert.equal(pkg.dependencies.good, '1.2.3')
      assert.deepEqual(pkg.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'good'])
    } finally {
      await home.cleanup()
    }
  })
})
