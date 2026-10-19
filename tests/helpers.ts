import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function makeTempHome(prefix = 'dsh-vault-test-'): Promise<{
  root: string
  dshHome: string
  agentsHome: string
  cleanup: () => Promise<void>
}> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const dshHome = join(root, '.dsh')
  const agentsHome = join(root, '.agents')
  await mkdir(join(dshHome, 'profiles', 'web'), { recursive: true })
  await mkdir(join(dshHome, '.agent-presets'), { recursive: true })
  await mkdir(join(agentsHome, 'skills', 'demo'), { recursive: true })
  await writeFile(join(dshHome, 'settings.yaml'), 'theme: dark\nmodel: demo\n')
  await writeFile(join(dshHome, '.credentials.yaml'), 'apiKey: SUPER-SECRET-KEY\n')
  await writeFile(
    join(dshHome, 'profiles', 'web', 'package.json'),
    JSON.stringify({
      name: 'dsh-profile-web',
      dependencies: {
        'dsh-vault': '0.1.0',
        '@deepseek-ai/dsh-tools': '0.2.1-rc.2',
      },
      dsh: { profile: { bundles: ['dsh-vault'] } },
    }, null, 2),
  )
  await writeFile(
    join(dshHome, 'profiles', 'web', 'cordis.patch.yml'),
    `- insert:\n    - id: dsh-vault\n      name: dsh-vault\n`,
  )
  await writeFile(join(dshHome, 'mcp.json'), JSON.stringify({ servers: { demo: { command: 'echo' } } }))
  await writeFile(join(dshHome, 'AGENTS.md'), '# Global instructions\nBe helpful.\n')
  await writeFile(join(agentsHome, 'skills', 'demo', 'SKILL.md'), '# Demo skill\n')
  await writeFile(join(dshHome, '.agent-presets', 'coder.json'), JSON.stringify({ name: 'coder' }))
  return {
    root,
    dshHome,
    agentsHome,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true })
    },
  }
}
