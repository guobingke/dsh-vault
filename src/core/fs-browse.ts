import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { expandUserPath } from './win-paths.js'
import { VaultUserError } from './errors.js'

export interface FsEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
  bytes?: number
}

export interface FsListing {
  path: string
  parent: string | null
  entries: FsEntry[]
}

/** List one directory level for the in-app path browser (Windows-safe). */
export async function listDirectory(inputPath: string): Promise<FsListing> {
  const path = expandUserPath(inputPath || '~')
  let info
  try {
    info = await stat(path)
  } catch {
    throw new VaultUserError(`directory unreadable: ${path}`, 400, 'DIRECTORY_UNREADABLE')
  }
  if (!info.isDirectory()) {
    throw new VaultUserError(`not a directory: ${path}`, 400, 'NOT_A_DIRECTORY')
  }
  let names: string[]
  try {
    names = await readdir(path)
  } catch {
    throw new VaultUserError(`directory unreadable: ${path}`, 400, 'DIRECTORY_UNREADABLE')
  }
  const entries: FsEntry[] = []
  for (const name of names) {
    if (name === '.' || name === '..') continue
    const abs = join(path, name)
    try {
      const st = await stat(abs)
      entries.push({
        name,
        path: abs,
        kind: st.isDirectory() ? 'directory' : 'file',
        bytes: st.isFile() ? st.size : undefined,
      })
    } catch {
      // skip unreadable entries
    }
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const parent = dirname(path)
  return {
    path,
    parent: parent && parent !== path ? parent : null,
    entries,
  }
}

export function isSnapshotArchiveName(name: string): boolean {
  const base = basename(name).toLowerCase()
  return base.endsWith('.tar.gz') || base.endsWith('.dshvault') || base.endsWith('.json')
}
