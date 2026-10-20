import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { posix } from 'node:path'
import { findGlobalPnpm } from '../src/core/plugin-install.js'

const exists = async (p: string) => existsSync(p)

/**
 * A Linux-style nvm layout built with forward slashes (which Windows also accepts),
 * so the POSIX code path can be exercised on either OS:
 *   <root>/bin/node
 *   <root>/lib/node_modules/pnpm/{package.json, bin/pnpm.mjs}
 */
async function pnpmTree(root: string, pkg: Record<string, unknown>, files: string[]): Promise<string> {
  const node = posix.join(root, 'bin', 'node')
  await mkdir(posix.dirname(node), { recursive: true })
  await writeFile(node, '')
  const dir = posix.join(root, 'lib', 'node_modules', 'pnpm')
  await mkdir(dir, { recursive: true })
  await writeFile(posix.join(dir, 'package.json'), JSON.stringify(pkg))
  for (const f of files) {
    await mkdir(posix.dirname(posix.join(dir, f)), { recursive: true })
    await writeFile(posix.join(dir, f), '')
  }
  return node
}

const slashRoot = async (prefix: string) => (await mkdtemp(posix.join(tmpdir(), prefix))).replace(/\\/g, '/')

describe('global pnpm discovery (pnpm not on PATH)', () => {
  it('runs the entry declared by pnpm package.json with this node, no shell shim needed', async () => {
    const root = await slashRoot('dv-pnpm-')
    try {
      const node = await pnpmTree(root, { name: 'pnpm', version: '12.14.0', bin: { pnpm: 'dist/pnpm.mjs' } }, ['dist/pnpm.mjs'])
      const found = await findGlobalPnpm({ PATH: '/usr/bin:/bin' }, 'linux', exists, node)
      assert.ok(found, 'pnpm package next to this node is found without pnpm being on PATH')
      assert.equal(found!.command, node, 'runs node directly instead of relying on a pnpm shim on PATH')
      assert.deepEqual(found!.args, [posix.join(root, 'lib', 'node_modules', 'pnpm', 'dist', 'pnpm.mjs')])
      assert.ok(found!.env?.PATH?.startsWith(posix.join(root, 'bin')), 'node dir is prepended so pnpm finds node')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips a bin entry that is not JavaScript (pnpm 12 ships an sh placeholder)', async () => {
    // pnpm >= 11 declares `"bin": { "pnpm": "pnpm" }`: the file is a shebang-less sh
    // script that is later replaced by a native binary. `node <that>` dies on line one,
    // so the real ES module next to it has to win.
    const root = await slashRoot('dv-pnpm-shim-')
    try {
      const node = await pnpmTree(
        root,
        { name: 'pnpm', version: '12.14.0', type: 'module', bin: { pnpm: 'pnpm', pnpx: 'pnpx' } },
        ['pnpm', 'pnpx', 'bin/pnpm.mjs', 'bin/pnpx.mjs'],
      )
      const found = await findGlobalPnpm({ PATH: '/usr/bin:/bin' }, 'linux', exists, node)
      assert.ok(found)
      assert.equal(found!.command, node)
      assert.deepEqual(found!.args, [posix.join(root, 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('falls back to known entry names when package.json has no bin field', async () => {
    const root = await slashRoot('dv-pnpm2-')
    try {
      const node = await pnpmTree(root, { name: 'pnpm', version: '9.0.0' }, ['dist/pnpm.cjs'])
      const found = await findGlobalPnpm({ PATH: '' }, 'linux', exists, node)
      assert.ok(found)
      assert.equal(found!.args?.[0], posix.join(root, 'lib', 'node_modules', 'pnpm', 'dist', 'pnpm.cjs'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns null when no pnpm package is installed around this node', async () => {
    const root = await slashRoot('dv-pnpm3-')
    try {
      const node = posix.join(root, 'bin', 'node')
      await mkdir(posix.dirname(node), { recursive: true })
      await writeFile(node, '')
      // Look only inside the throwaway root: a CI image or a developer machine may well
      // have pnpm in /usr/local/lib/node_modules, which is a correct hit, not a bug.
      const onlyRoot = async (file: string) => file.startsWith(root) && existsSync(file)
      const found = await findGlobalPnpm({ PATH: '' }, 'linux', onlyRoot, node)
      assert.equal(found, null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
