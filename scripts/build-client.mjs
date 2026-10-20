// Build the browser half as dsh expects it: one self-contained factory-form
// CommonJS bundle at lib/client.js, registered via window.__ModuleLoader__.load.
// React (and jsx-runtime) come from dsh's frozen platform module table.
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cssTagId, normalizeText } from './build-utils.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const cssAsStyleTag = {
  name: 'css-style-tag',
  setup(b) {
    b.onLoad({ filter: /\.css$/ }, (args) => {
      const css = normalizeText(readFileSync(args.path, 'utf8'))
      // L-01: a fixed relative id (basename only) — never the builder's absolute path (Windows uses `\\`).
      const tagId = cssTagId(pkg.name, args.path)
      return {
        loader: 'js',
        contents: `const css = ${JSON.stringify(css)};
const tagId = ${JSON.stringify(tagId)};
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
  const tag = document.createElement('style');
  tag.dataset.plugin = ${JSON.stringify(pkg.name)};
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
export default css;`,
      }
    })
  },
}

const result = await build({
  entryPoints: [join(root, 'src/client/index.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  plugins: [cssAsStyleTag],
  logLevel: 'warning',
})
const body = normalizeText(result.outputFiles[0].text)
if (/require\("node:/.test(body)) throw new Error('client bundle must not require node:* modules')
const out = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body}
\t\treturn module.exports;
\t}
});
`
// `--out <file>` writes elsewhere (determinism test); default lib/client.js.
const outIdx = process.argv.indexOf('--out')
const outFile = outIdx > 0 ? process.argv[outIdx + 1] : join(root, 'lib/client.js')
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, out)
console.log(`lib/client.js ${(out.length / 1024).toFixed(1)} KiB`)
