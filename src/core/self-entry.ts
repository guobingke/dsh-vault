import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** This plugin's own package name. A restore never reinstalls or rewrites it. */
export const SELF_PLUGIN_NAME = 'dsh-vault'

export function isSelfPlugin(name: string): boolean {
  return name === SELF_PLUGIN_NAME
}

type Bundle = string | { name?: string }
interface ProfilePkg {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: Bundle[] } }
  [k: string]: unknown
}

export interface SelfEntry {
  /** The target's own dependency spec for dsh-vault (often `link:<its checkout>`), if any. */
  dep?: string
  inBundles: boolean
}

const bundleName = (b: Bundle) => (typeof b === 'string' ? b : b?.name ?? '')

async function readPkg(file: string): Promise<{ pkg: ProfilePkg; text: string } | null> {
  try {
    const text = await readFile(file, 'utf8')
    return { pkg: JSON.parse(text) as ProfilePkg, text }
  } catch {
    return null
  }
}

async function profileNames(dshHome: string): Promise<string[]> {
  try {
    return (await readdir(join(dshHome, 'profiles'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

/** Snapshot how each profile on this machine references dsh-vault, before files are restored. */
export async function captureSelfEntries(dshHome: string): Promise<Map<string, SelfEntry>> {
  const out = new Map<string, SelfEntry>()
  for (const profile of await profileNames(dshHome)) {
    const r = await readPkg(join(dshHome, 'profiles', profile, 'package.json'))
    if (!r) continue
    out.set(profile, {
      dep: r.pkg.dependencies?.[SELF_PLUGIN_NAME],
      inBundles: (r.pkg.dsh?.profile?.bundles ?? []).some((b) => bundleName(b) === SELF_PLUGIN_NAME),
    })
  }
  return out
}

/**
 * After restore: put back this machine's own dsh-vault entry in every profile package.json.
 * The source machine's spec (e.g. its `link:` path) is dropped; a profile that had no
 * dsh-vault here gets none.
 */
export async function reapplySelfEntries(dshHome: string, before: Map<string, SelfEntry>): Promise<string[]> {
  const changed: string[] = []
  for (const profile of await profileNames(dshHome)) {
    const file = join(dshHome, 'profiles', profile, 'package.json')
    const r = await readPkg(file)
    if (!r) continue
    const { pkg } = r
    const want = before.get(profile) ?? { inBundles: false }
    if (want.dep !== undefined) {
      pkg.dependencies = { ...(pkg.dependencies ?? {}), [SELF_PLUGIN_NAME]: want.dep }
    } else if (pkg.dependencies && SELF_PLUGIN_NAME in pkg.dependencies) {
      delete pkg.dependencies[SELF_PLUGIN_NAME]
    }
    const bundles = pkg.dsh?.profile?.bundles
    if (bundles) {
      const has = bundles.some((b) => bundleName(b) === SELF_PLUGIN_NAME)
      if (has && !want.inBundles) pkg.dsh!.profile!.bundles = bundles.filter((b) => bundleName(b) !== SELF_PLUGIN_NAME)
      if (!has && want.inBundles) bundles.push(SELF_PLUGIN_NAME)
    } else if (want.inBundles) {
      pkg.dsh = { ...(pkg.dsh ?? {}), profile: { ...(pkg.dsh?.profile ?? {}), bundles: [SELF_PLUGIN_NAME] } }
    }
    const next = `${JSON.stringify(pkg, null, 2)}\n`
    if (next !== r.text && JSON.stringify(JSON.parse(r.text)) !== JSON.stringify(pkg)) {
      await writeFile(file, next, 'utf8')
      changed.push(profile)
    }
  }
  return changed
}
