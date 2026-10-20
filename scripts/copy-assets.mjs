import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { normalizeText } from './build-utils.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcCss = join(root, 'src/client/theme.css')
const destCss = join(root, 'lib/client/theme.css')
if (existsSync(srcCss)) {
  mkdirSync(dirname(destCss), { recursive: true })
  writeFileSync(destCss, normalizeText(readFileSync(srcCss, 'utf8')))
}
