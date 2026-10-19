// Rebuild and fail if the committed lib/ differs from what src/ produces.
// lib/ is committed so a `github:guobingke/dsh-vault` install works without a build step.
import { execSync, spawnSync } from 'node:child_process'

execSync('npm run build', { stdio: 'inherit' })
const diff = spawnSync('git', ['diff', '--exit-code', '--stat', '--', 'lib'], { stdio: 'inherit' })
const untracked = execSync('git ls-files --others --exclude-standard -- lib', { encoding: 'utf8' }).trim()
if (diff.status !== 0 || untracked) {
  if (untracked) console.error(`untracked in lib/:\n${untracked}`)
  console.error('lib/ is stale: commit the rebuilt lib/')
  process.exit(1)
}
console.log('lib/ is up to date')
