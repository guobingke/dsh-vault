import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DESKTOP_PROFILE,
  WEB_PROFILE,
  installCommandForProfile,
  isProfileInitialized,
  listInitializedGuiProfiles,
  multiProfileInstallPlan,
  resolveActiveProfile,
  resolveProfileDir,
} from '../src/core/profiles.js'
import { assertInside } from '../src/core/paths.js'

describe('profiles (desktop + web)', () => {
  it('resolves active profile from DSH_PROFILE / DSH_PROFILE_DIR', () => {
    assert.equal(resolveActiveProfile({}), WEB_PROFILE)
    assert.equal(resolveActiveProfile({ DSH_PROFILE: 'desktop' }), DESKTOP_PROFILE)
    assert.equal(resolveActiveProfile({ DSH_PROFILE_DIR: '/home/u/.dsh/profiles/desktop' }), DESKTOP_PROFILE)
    assert.equal(resolveActiveProfile({ DSH_PROFILE_DIR: 'C:\\Users\\u\\.dsh\\profiles\\web\\' }), WEB_PROFILE)
    // Explicit name wins over dir
    assert.equal(
      resolveActiveProfile({ DSH_PROFILE: 'web', DSH_PROFILE_DIR: '/x/profiles/desktop' }),
      WEB_PROFILE,
    )
  })

  it('detects initialized gui profiles on disk', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dv-profiles-'))
    try {
      await mkdir(join(home, 'profiles', 'web'), { recursive: true })
      await writeFile(join(home, 'profiles', 'web', 'package.json'), '{}')
      await mkdir(join(home, 'profiles', 'desktop'), { recursive: true })
      await writeFile(join(home, 'profiles', 'desktop', 'package.json'), '{}')
      assert.equal(isProfileInitialized(WEB_PROFILE, home), true)
      assert.equal(isProfileInitialized(DESKTOP_PROFILE, home), true)
      assert.deepEqual(listInitializedGuiProfiles(home), [WEB_PROFILE, DESKTOP_PROFILE])
      assert.equal(resolveProfileDir(DESKTOP_PROFILE, home), join(home, 'profiles', 'desktop'))
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('documents desktop-specific install constraints', () => {
    const desktop = installCommandForProfile(DESKTOP_PROFILE)
    assert.match(desktop.command, /--profile desktop add dsh-vault/)
    assert.ok(desktop.notes.some((n) => /bundled/i.test(n)))
    assert.ok(desktop.notes.some((n) => /quit/i.test(n)))

    const web = installCommandForProfile(WEB_PROFILE)
    assert.match(web.command, /--profile web add dsh-vault/)

    const plan = multiProfileInstallPlan('dsh-vault', '/nonexistent')
    assert.ok(plan.some((p) => p.profile === WEB_PROFILE))
    assert.ok(plan.some((p) => p.profile === DESKTOP_PROFILE))
  })

  it('assertInside accepts same-drive Windows paths case-insensitively when on win32', () => {
    if (process.platform !== 'win32') {
      // Cross-platform safety: posix still rejects escapes
      assert.throws(() => assertInside('/home/u/.dsh', '/tmp/evil'))
      const inside = assertInside('/home/u/.dsh', '/home/u/.dsh/settings.yaml')
      assert.ok(inside.endsWith('settings.yaml'))
      return
    }
    const root = 'C:\\Users\\Test\\.dsh'
    assert.equal(
      assertInside(root, 'c:\\users\\test\\.dsh\\settings.yaml').toLowerCase(),
      'c:\\users\\test\\.dsh\\settings.yaml',
    )
  })
})
