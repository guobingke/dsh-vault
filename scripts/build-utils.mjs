// Shared by the build scripts: output must be byte-identical on Windows and POSIX.
/** CRLF / CR → LF, and drop a UTF-8 BOM. */
export function normalizeText(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

/** Stable style-tag id: package name + CSS basename (never an absolute path). */
export function cssTagId(pkgName, path) {
  return `${pkgName}/${path.split(/[\\/]/).pop()}`
}
