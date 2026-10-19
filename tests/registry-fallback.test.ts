import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { VaultService } from '../src/core/vault-service.js'
import { extractPluginsFromNodeModules, extractPluginsFromPatchYaml } from '../src/core/collect.js'
import { classifyInstallFailure } from '../src/core/local-spec.js'

async function put(path: string, data: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}

async function writePkg(dir: string, pkg: Record<string, unknown>) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
}

/**
 * pnpm that fails exact-version adds with NO_MATCHING_VERSION (unpublished),
 * but succeeds for link:/file: to a backup copy.
 */
function fakePnpmUnpublished(unpublished: Set<string>, calls: string[]) {
  return async (cmd: string, args: string[], opts: { cwd?: string }) => {
    calls.push(`${cmd} ${args.join(' ')} @ ${opts.cwd ?? ''}`)
    if (cmd !== 'pnpm' || !opts.cwd) return { ok: false, detail: 'no pnpm', code: 1 }
    const dir = opts.cwd
    if (args.includes('--prod')) return { ok: true, detail: 'ok', code: 0 }
    const pkgPath = join(dir, 'package.json')
    const pkg = existsSync(pkgPath)
      ? (JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } })
      : { dependencies: {} }
    pkg.dependencies ??= {}

    if (args[0] === 'install') {
      // Materialize: fail if any dep is an unpublished exact version still listed.
      for (const [name, spec] of Object.entries(pkg.dependencies)) {
        if (unpublished.has(`${name}@${spec}`) || unpublished.has(name)) {
          return {
            ok: false,
            detail: `ERR_PNPM_NO_MATCHING_VERSION  No matching version found for ${name}@${spec} in the registry`,
            code: 1,
          }
        }
        const nm = join(dir, 'node_modules', ...name.split('/'))
        if (!existsSync(join(nm, 'package.json'))) {
          if (spec.startsWith('link:') || spec.startsWith('file:')) {
            const target = spec.slice(5)
            const src = join(target, 'package.json')
            if (existsSync(src)) {
              await mkdir(nm, { recursive: true })
              await writeFile(join(nm, 'package.json'), await readFile(src, 'utf8'))
            }
          } else {
            await writePkg(nm, { name, version: /^\d/.test(spec) ? spec : '1.0.0', keywords: ['dsh-plugin'] })
          }
        }
      }
      return { ok: true, detail: 'ok', code: 0 }
    }

    if (args[0] === 'add') {
      const spec = args[1]!
      if (spec.startsWith('link:') || spec.startsWith('file:')) {
        const target = spec.replace(/^(link|file):/, '')
        const srcPkg = join(target, 'package.json')
        if (!existsSync(srcPkg)) return { ok: false, detail: `ENOENT ${target}`, code: 1 }
        const meta = JSON.parse(await readFile(srcPkg, 'utf8')) as { name: string; version?: string }
        pkg.dependencies[meta.name] = spec
        await writeFile(pkgPath, JSON.stringify(pkg, null, 2))
        const nm = join(dir, 'node_modules', ...meta.name.split('/'))
        await mkdir(dirname(nm), { recursive: true })
        try { await rm(nm, { recursive: true, force: true }) } catch { /* */ }
        // Real pnpm link: makes a symlink; keep the backup tree byte-identical.
        symlinkSync(target, nm, 'junction')
        return { ok: true, detail: 'ok', code: 0 }
      }
      // name@version
      const at = spec.lastIndexOf('@')
      const name = at > 0 ? spec.slice(0, at) : spec
      const ver = at > 0 ? spec.slice(at + 1) : ''
      if (unpublished.has(`${name}@${ver}`) || unpublished.has(name)) {
        return {
          ok: false,
          detail: `ERR_PNPM_NO_MATCHING_VERSION\nNo matching version found for ${name}@${ver}\nThis error happened while installing a direct dependency of ${dir}`,
          code: 1,
        }
      }
      pkg.dependencies[name] = ver || spec
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2))
      await writePkg(join(dir, 'node_modules', ...name.split('/')), { name, version: ver || '1.0.0', keywords: ['dsh-plugin'] })
      return { ok: true, detail: 'ok', code: 0 }
    }
    return { ok: true, detail: 'ok', code: 0 }
  }
}

describe('registry fallback (unpublished version)', () => {
  it('classifies ERR_PNPM_NO_MATCHING_VERSION as registry-not-found', () => {
    const c = classifyInstallFailure(
      'ERR_PNPM_NO_MATCHING_VERSION  No matching version found for dsh-vscode-bridge@0.3.1',
      [],
      'dsh-vscode-bridge',
    )
    assert.equal(c.reason, 'registry-not-found')
  })

  it('detects cordis-only and node_modules plugins', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-cordis-'))
    try {
      const profileDir = join(root, 'profiles', 'web')
      await writePkg(join(profileDir, 'node_modules', 'dsh-vscode-bridge'), {
        name: 'dsh-vscode-bridge',
        version: '0.3.1',
        keywords: ['dsh-plugin'],
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      })
      const fromNm = await extractPluginsFromNodeModules(profileDir, 'web')
      assert.ok(fromNm.some((p) => p.name === 'dsh-vscode-bridge' && p.installedVersion === '0.3.1'))
      const fromPatch = extractPluginsFromPatchYaml(
        `- insert:\n    - id: bridge\n      name: dsh-vscode-bridge\n`,
        'web',
      )
      assert.ok(fromPatch.some((p) => p.name === 'dsh-vscode-bridge'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('restores an unpublished npm version from the bundled copy (installed-from-backup)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dv-r5-'))
    const m1 = join(root, 'm1')
    const m2 = join(root, 'm2')
    const dsh1 = join(m1, '.dsh')
    const agents1 = join(m1, '.agents')
    const dsh2 = join(m2, '.dsh')
    const agents2 = join(m2, '.agents')
    try {
      await mkdir(join(agents1, 'skills'), { recursive: true })
      await put(join(dsh1, 'settings.yaml'), 'theme: dark\n')
      // web: npm plugin at 0.3.1 in package.json + cordis-only plugin
      await writePkg(join(dsh1, 'profiles', 'web'), {
        name: 'dsh-profile-web',
        dependencies: {
          'dsh-gone-from-registry': '0.3.1',
          'dsh-vault': '0.1.0',
        },
        dsh: { profile: { bundles: ['dsh-gone-from-registry', 'dsh-vscode-bridge', 'dsh-vault'] } },
      })
      await put(
        join(dsh1, 'profiles', 'web', 'cordis.patch.yml'),
        `- insert:\n    - id: bridge\n      name: dsh-vscode-bridge\n    - id: gone\n      name: dsh-gone-from-registry\n`,
      )
      // Installed copies with unique marker files
      await writePkg(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-gone-from-registry'), {
        name: 'dsh-gone-from-registry',
        version: '0.3.1',
        keywords: ['dsh-plugin'],
        dsh: { bundle: { patch: './x.yml' } },
      })
      await put(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-gone-from-registry', 'MARKER.txt'), 'machine-1-gone\n')
      await put(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-gone-from-registry', 'index.js'), 'export {}\n')
      await writePkg(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-vscode-bridge'), {
        name: 'dsh-vscode-bridge',
        version: '0.3.1',
        keywords: ['dsh-plugin'],
        dsh: { bundle: { patch: './x.yml' } },
      })
      await put(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-vscode-bridge', 'MARKER.txt'), 'machine-1-bridge\n')
      await put(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-vscode-bridge', 'index.js'), 'export {}\n')
      await writePkg(join(dsh1, 'profiles', 'web', 'node_modules', 'dsh-vault'), {
        name: 'dsh-vault',
        version: '0.1.0',
        keywords: ['dsh-plugin'],
      })

      const s1 = new VaultService({
        dshHome: dsh1,
        agentsHome: agents1,
        activeProfile: 'web',
        runPluginInstall: async () => ({ ok: true, detail: 'ok', code: 0 }),
      })
      await s1.init()
      const exportFile = join(root, 'snap.tar.gz')
      const backup = await s1.backup({ exportFile })
      s1.stopSchedule()
      const gone = backup.manifest?.plugins?.find((p) => p.name === 'dsh-gone-from-registry' && p.profile === 'web')
        ?? (await (async () => {
          // backup() return may not include manifest — inspect via restore unpack path instead
          return null
        })())
      // Inspect via a second collect-less check: restore and look at plugin-sources
      assert.ok(existsSync(exportFile))

      await mkdir(join(dsh2, 'profiles', 'web'), { recursive: true })
      await mkdir(agents2, { recursive: true })
      const calls: string[] = []
      const unpublished = new Set(['dsh-gone-from-registry@0.3.1', 'dsh-vscode-bridge@0.3.1'])
      const s2 = new VaultService({
        dshHome: dsh2,
        agentsHome: agents2,
        activeProfile: 'web',
        runPluginInstall: fakePnpmUnpublished(unpublished, calls),
      })
      await s2.init()
      const result = await s2.restore({
        importPath: exportFile,
        conflict: 'use-backup',
        createRollbackSnapshot: false,
      })
      s2.stopSchedule()

      const row = (name: string) => (result.pluginResults ?? []).find((r) => r.name === name && r.profile === 'web')
      assert.equal(row('dsh-gone-from-registry')?.status, 'installed-from-backup', JSON.stringify(row('dsh-gone-from-registry')))
      assert.equal(row('dsh-vscode-bridge')?.status, 'installed-from-backup', JSON.stringify(row('dsh-vscode-bridge')))
      assert.match(row('dsh-gone-from-registry')?.detail ?? '', /backup|registry version unavailable/i)
      assert.equal(result.ok, true)

      // Byte-for-byte marker from machine 1
      assert.equal(
        await readFile(join(dsh2, 'profiles', 'web', 'node_modules', 'dsh-gone-from-registry', 'MARKER.txt'), 'utf8'),
        'machine-1-gone\n',
      )
      assert.equal(
        await readFile(join(dsh2, 'profiles', 'web', 'node_modules', 'dsh-vscode-bridge', 'MARKER.txt'), 'utf8'),
        'machine-1-bridge\n',
      )
      // Fallback was packed
      assert.ok(existsSync(join(dsh2, 'plugin-sources', 'web', 'dsh-gone-from-registry', 'package.json')))
      assert.ok(existsSync(join(dsh2, 'plugin-sources', 'web', 'dsh-vscode-bridge', '.dsh-vault-bundle.json')))
      const meta = JSON.parse(await readFile(join(dsh2, 'plugin-sources', 'web', 'dsh-vscode-bridge', '.dsh-vault-bundle.json'), 'utf8'))
      assert.equal(meta.version, '0.3.1')
      assert.equal(meta.name, 'dsh-vscode-bridge')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
