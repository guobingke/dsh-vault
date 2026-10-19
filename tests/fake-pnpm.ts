import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

export async function writePkg(dir: string, pkg: Record<string, unknown>) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
}

/**
 * pnpm that fails exact-version adds with NO_MATCHING_VERSION (unpublished),
 * but succeeds for link:/file: to a backup copy.
 */
export function fakePnpmUnpublished(unpublished: Set<string>, calls: string[]) {
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

