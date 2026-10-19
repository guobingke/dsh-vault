import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyInstallFailure,
  decodeConsoleOutput,
  parseLocalSpec,
  resolveLocalSpecPath,
  specPath,
} from '../src/core/local-spec.js'
import { bundledDshCandidates, desktopResourceRoots, findBundledPnpm } from '../src/core/plugin-install.js'

const M1_TGZ = 'C:\\Users\\24600\\Documents\\Codex\\2026-10-06\\bang\\outputs\\dsh-skill-mcp-panel-2.1.5-selfuse.2.tgz'
const M2_PROFILE = 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop'

describe('local dependency specs (Windows strings)', () => {
  it('parses file:/link:/portal:/workspace: and leaves registry ranges alone', () => {
    assert.deepEqual(parseLocalSpec(`file:${M1_TGZ}`), { kind: 'path', protocol: 'file', raw: `file:${M1_TGZ}`, path: M1_TGZ, tarball: true })
    assert.equal((parseLocalSpec('file:C:/Users/24600/x.tar.gz') as { tarball: boolean }).tarball, true)
    assert.equal((parseLocalSpec('link:..\\..\\dev\\bridge') as { path: string }).path, '..\\..\\dev\\bridge')
    assert.equal((parseLocalSpec('file:///C:/Users/24600/a%20b/p.tgz') as { path: string }).path, 'C:/Users/24600/a b/p.tgz')
    assert.equal(parseLocalSpec('portal:../x')?.kind, 'path')
    assert.equal(parseLocalSpec('workspace:*')?.kind, 'unsupported')
    assert.equal(parseLocalSpec('C:\\pkgs\\x.tgz')?.kind, 'path')
    assert.equal(parseLocalSpec('^1.2.3'), null)
    assert.equal(parseLocalSpec('npm:foo@1'), null)
    assert.equal(parseLocalSpec('github:a/b'), null)
  })

  it('resolves relative paths against the profile dir, Windows-aware', () => {
    assert.equal(resolveLocalSpecPath('..\\..\\plugins\\x', M2_PROFILE), 'C:\\Users\\Administrator\\.dsh\\plugins\\x')
    assert.equal(resolveLocalSpecPath('../../plugins/x', M2_PROFILE), 'C:\\Users\\Administrator\\.dsh\\plugins\\x')
    assert.equal(resolveLocalSpecPath('C:/Users/24600/x.tgz', M2_PROFILE), 'C:\\Users\\24600\\x.tgz')
    assert.equal(resolveLocalSpecPath('../dev/x', '/home/u/.dsh/profiles/web', { platform: 'linux' }), '/home/u/.dsh/profiles/dev/x')
    assert.equal(resolveLocalSpecPath(M1_TGZ, '/home/u/.dsh/profiles/web', { platform: 'linux' }), M1_TGZ)
    assert.equal(specPath('C:\\Users\\Administrator\\.dsh\\plugin-sources\\desktop\\p\\p.tgz'), 'C:/Users/Administrator/.dsh/plugin-sources/desktop/p/p.tgz')
  })
})

describe('install failure classification', () => {
  const poisoned = ` ERR_PNPM_ENOENT  [ENOENT] open '${M1_TGZ}'\n\nThis error happened while installing a direct dependency of ${M2_PROFILE}\n`
  it('blames the poisoned spec, not the npm plugin that tripped over it', () => {
    const c = classifyInstallFailure(poisoned, [], '@anysearch/anysearch-dsh')
    assert.equal(c.reason, 'blocked-by-other')
    assert.equal(c.subject, M1_TGZ)
  })
  it('recognises the plugin\'s own missing tarball', () => {
    assert.equal(classifyInstallFailure(poisoned, ['C:/Users/24600/Documents/Codex/2026-10-06/bang/outputs/dsh-skill-mcp-panel-2.1.5-selfuse.2.tgz']).reason, 'tarball-missing')
  })
  it('recognises a missing installer, 404 and network errors', () => {
    assert.equal(classifyInstallFailure("dsh: 'dsh' 不是内部或外部命令，也不是可运行的程序").reason, 'installer-missing')
    const nf = classifyInstallFailure('ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@acme%2Fmissing: Not Found - 404')
    assert.equal(nf.reason, 'registry-not-found')
    assert.equal(nf.subject, '@acme/missing')
    assert.equal(classifyInstallFailure('request to https://registry.npmmirror.com failed, reason: ETIMEDOUT').reason, 'network')
    assert.equal(classifyInstallFailure('something odd\nERR_PNPM_X boom').reason, 'unknown')
  })
})

describe('Windows console output', () => {
  it('decodes cp936 (GBK) output from cmd.exe', () => {
    const gbk = Buffer.from('276473682720b2bbcac7c4dab2bfbbf2cde2b2bfc3fcc1ee', 'hex')
    assert.equal(decodeConsoleOutput(gbk, 'win32'), "'dsh' 不是内部或外部命令")
    assert.equal(decodeConsoleOutput(Buffer.from('ok 正常', 'utf8'), 'win32'), 'ok 正常')
  })
})

describe('Desktop installer discovery', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\Administrator\\AppData\\Local', PATH: 'C:\\Windows' }
  const res = 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\DeepSeek Harness\\resources'
  it('finds the bundled node + pnpm under resources/runtime/primary-runtime', async () => {
    assert.ok(desktopResourceRoots(env, 'win32').includes(res))
    const files = new Set([
      `${res}\\runtime\\primary-runtime\\dependencies\\node\\bin\\node.exe`,
      `${res}\\runtime\\primary-runtime\\dependencies\\pnpm\\dist\\pnpm.mjs`,
    ])
    const pnpm = await findBundledPnpm(env, 'win32', async (p) => files.has(p))
    assert.equal(pnpm?.command, `${res}\\runtime\\primary-runtime\\dependencies\\node\\bin\\node.exe`)
    assert.deepEqual(pnpm?.args, [`${res}\\runtime\\primary-runtime\\dependencies\\pnpm\\dist\\pnpm.mjs`])
    assert.match(pnpm!.env!.PATH!, /dependencies\\node\\bin;C:\\Windows$/)
    assert.equal(await findBundledPnpm(env, 'win32', async () => false), null)
  })
  it('lists Desktop dsh carriers under the install dir before bare dsh', () => {
    const list = bundledDshCandidates(env, 'win32')
    assert.ok(list.indexOf(`${res}\\dsh\\dsh.cmd`) >= 0)
    assert.ok(list.indexOf(`${res}\\dsh\\dsh.cmd`) < list.indexOf('dsh'))
  })
})
