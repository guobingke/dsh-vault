import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcCss = join(root, 'src/client/theme.css')
const destCss = join(root, 'lib/client/theme.css')
if (existsSync(srcCss)) {
  mkdirSync(dirname(destCss), { recursive: true })
  cpSync(srcCss, destCss)
}
