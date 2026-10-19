import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { bundledDshCandidates } from '../src/core/plugin-install.js'
import { makeTempHome } from './helpers.js'

async function seedDesktopProfile(dshHome: string): Promise<void> {
  const profileDir = join(dshHome, 'profiles', 'desktop')
  await mkdir(profileDir, { recursive: true })
  await writeFile(
    join(profileDir, 'package.json'),
    JSON.stringify({
      name: 'dsh-profile-desktop',
      dependencies: {
        'left-pad': '1.3.0',
        'my-local-plugin': 'link:C:\\Users\\测试\\plugins\\my-local-plugin',
      },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'left-pad', 'my-local-plugin'] } },
    }, null, 2),
  )
  await writeFile(
    join(profileDir, 'cordis.patch.yml'),
    `- insert:\n    - id: left-pad\n      name: left-pad\n`,
  )
  await writeFile(join(dshHome, 'settings.yaml'), 'theme: desktop-dark\nmodel: deepseek\n')
  await writeFile(join(dshHome, 'mcp.json'), JSON.stringify({ servers: { desktopMcp: { command: 'echo' } } }))
}

describe('desktop profile backup / restore', () => {
  it('backs up profiles/desktop and reinstalls via pluginManager + pnpm (not npm-global dsh)', async () => {
    const home = await makeTempHome()
    try {
      await seedDesktopProfile(home.dshHome)
      const commands: Array<{ command: string; args: string[] }> = []
      const installs: string[] = []
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        activeProfile: 'desktop',
        pluginManager: {
          async installBundle(spec) {
            installs.push(spec)
            if (spec.startsWith('left-pad')) {
              // Simulate Desktop host: package.json already lists the dep.
              const err = new Error('already-installed') as Error & { code?: string }
              err.code = 'already-installed'
              throw err
            }
            return { application: 'applied' }
          },
        },
        runPluginInstall: async (command, args, opts) => {
          commands.push({ command, args })
          // Materialize: create a fake node_modules entry for left-pad after pnpm install.
          if (command === 'pnpm' && args[0] === 'install' && opts.cwd) {
            const pkg = join(opts.cwd, 'node_modules', 'left-pad')
            await mkdir(pkg, { recursive: true })
            await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'left-pad', version: '1.3.0' }))
            return { ok: true, detail: 'pnpm ok', code: 0 }
          }
          // npm-global dsh refuses desktop
          if (command === 'dsh' || command.endsWith('dsh') || command.endsWith('dsh.cmd')) {
            return {
              ok: false,
              detail: 'The desktop profile is managed exclusively by the Electron app',
              code: 1,
            }
          }
          return { ok: true, detail: 'ok', code: 0 }
        },
      })
      await service.init()
      const targetId = service.listTargets()[0]!.id
      const backup = await service.backup({ targetId })
      assert.ok(backup.manifest.plugins.some((p) => p.name === 'left-pad' && p.profile === 'desktop'))
      assert.ok(backup.manifest.files.some((f) => f.path.includes('profiles/desktop')))

      // Wipe desktop node_modules to simulate machine 2
      await rm(join(home.dshHome, 'profiles', 'desktop', 'node_modules'), { recursive: true, force: true })

      const result = await service.restore({
        targetId,
        snapshotId: backup.snapshotId,
        conflict: 'use-backup',
        createRollbackSnapshot: false,
      })

      assert.ok(commands.some((c) => c.command === 'pnpm'))
      const leftPad = result.pluginResults?.find((r) => r.name === 'left-pad')
      assert.ok(leftPad, 'left-pad should appear in pluginResults')
      assert.ok(leftPad!.status === 'installed' || leftPad!.status === 'already-present')
      const local = result.pluginResults?.find((r) => r.name === 'my-local-plugin')
      assert.ok(local)
      assert.equal(local!.status, 'failed')
      assert.match(local!.detail, /local plugin source missing|missing on this machine/i)
      assert.equal(result.ok, false)
      assert.ok(result.pluginsFailed.includes('my-local-plugin'))
      service.stopSchedule()
    } finally {
      await home.cleanup()
    }
  })

  it('exportFile + importPath round-trip without a storage target', async () => {
    const home = await makeTempHome()
    const exportRoot = await mkdtemp(join(tmpdir(), 'dsh-vault-export-'))
    try {
      await seedDesktopProfile(home.dshHome)
      const exportFile = join(exportRoot, 'portable-backup')
      const service = new VaultService({
        dshHome: home.dshHome,
        agentsHome: home.agentsHome,
        activeProfile: 'desktop',
        runPluginInstall: async () => ({ ok: true, detail: 'ok', code: 0 }),
      })
      await service.init()
      const backup = await service.backup({
        exportFile,
        encrypt: false,
      })
      assert.ok(backup.exportPath)
      await access(backup.exportPath!)

      // Machine 2: different home, import archive
      const home2 = await makeTempHome()
      try {
        const service2 = new VaultService({
          dshHome: home2.dshHome,
          agentsHome: home2.agentsHome,
          activeProfile: 'desktop',
          runPluginInstall: async (command, args, opts) => {
            if (command === 'pnpm' && opts.cwd) {
              const pkg = join(opts.cwd, 'node_modules', 'left-pad')
              await mkdir(pkg, { recursive: true })
              await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'left-pad', version: '1.3.0' }))
            }
            return { ok: true, detail: 'ok', code: 0 }
          },
        })
        await service2.init()
        const result = await service2.restore({
          importPath: backup.exportPath,
          conflict: 'use-backup',
          createRollbackSnapshot: false,
        })
        const settings = await readFile(join(home2.dshHome, 'settings.yaml'), 'utf8')
        assert.match(settings, /desktop-dark/)
        const desktopPkg = await readFile(join(home2.dshHome, 'profiles', 'desktop', 'package.json'), 'utf8')
        assert.match(desktopPkg, /left-pad/)
        assert.ok(result.applied.length > 0)
        service2.stopSchedule()
      } finally {
        await home2.cleanup()
      }
      service.stopSchedule()
    } finally {
      await home.cleanup()
      await rm(exportRoot, { recursive: true, force: true })
    }
  })

  it('lists Desktop-bundled dsh candidates before bare dsh', () => {
    const env = {
      DSH_DESKTOP_DSH_DIR: 'C:\\Program Files\\DeepSeek Harness\\resources\\dsh',
      DSH_CLI: '',
    }
    const list = bundledDshCandidates(env)
    assert.ok(list[0]?.includes('DeepSeek Harness') || list[0]?.includes('resources'))
  })
})
