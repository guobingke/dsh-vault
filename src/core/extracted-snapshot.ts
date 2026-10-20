/**
 * An already-extracted snapshot folder (`manifest.json` + `files/`), as produced by unpacking a
 * plaintext `.tar.gz`. Re-packed in memory so the normal verified unpack path (manifest
 * integrity, per-file sha256 and size, archive limits) applies unchanged.
 */
import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultArchiveLimits, packTarGz, type ArchiveEntry, type ArchiveLimits } from './archive.js'
import { VaultUserError } from './errors.js'

export async function isExtractedSnapshotDir(dir: string): Promise<boolean> {
  const m = await lstat(join(dir, 'manifest.json')).catch(() => null)
  const f = await lstat(join(dir, 'files')).catch(() => null)
  return Boolean(m?.isFile() && (!f || f.isDirectory()))
}

interface ReadState {
  entries: number
  totalBytes: number
}

/**
 * Read one folder entry only after its stat fits every archive limit. The size is checked again
 * after the read so a file that grows concurrently cannot bypass the per-entry or total budget.
 */
async function readEntry(
  abs: string,
  rel: string,
  limits: ArchiveLimits,
  state: ReadState,
): Promise<ArchiveEntry> {
  const st = await lstat(abs)
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new VaultUserError(`snapshot folder contains a link or special file: ${rel}`, 400, 'RESTORE_UNSAFE_PATH')
  }
  if (state.entries >= limits.maxEntries) {
    throw new VaultUserError('snapshot folder has too many files', 413, 'ARCHIVE_LIMIT')
  }
  if (st.size > limits.maxEntryBytes) {
    throw new VaultUserError(`snapshot file too large: ${rel}`, 413, 'ARCHIVE_LIMIT')
  }
  if (state.totalBytes + st.size > limits.maxTotalBytes) {
    throw new VaultUserError(`snapshot folder is larger than ${limits.maxTotalBytes} bytes`, 413, 'ARCHIVE_LIMIT')
  }
  const data = await readFile(abs)
  if (data.length > limits.maxEntryBytes) {
    throw new VaultUserError(`snapshot file too large: ${rel}`, 413, 'ARCHIVE_LIMIT')
  }
  if (state.totalBytes + data.length > limits.maxTotalBytes) {
    throw new VaultUserError(`snapshot folder is larger than ${limits.maxTotalBytes} bytes`, 413, 'ARCHIVE_LIMIT')
  }
  state.entries += 1
  state.totalBytes += data.length
  return { path: rel, data }
}

export async function packExtractedSnapshot(
  dir: string,
  limitsIn: Partial<ArchiveLimits> = {},
): Promise<Buffer> {
  const limits = { ...defaultArchiveLimits(), ...limitsIn }
  const state: ReadState = { entries: 0, totalBytes: 0 }
  const entries: ArchiveEntry[] = [
    await readEntry(join(dir, 'manifest.json'), 'manifest.json', limits, state),
  ]
  const walk = async (abs: string, rel: string): Promise<void> => {
    for (const e of await readdir(abs, { withFileTypes: true })) {
      const childAbs = join(abs, e.name)
      const childRel = rel ? `${rel}/${e.name}` : e.name
      const st = await lstat(childAbs)
      // Same rule as archives: links and special files are refused, never followed.
      if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) {
        throw new VaultUserError(`snapshot folder contains a link or special file: files/${childRel}`, 400, 'RESTORE_UNSAFE_PATH')
      }
      if (st.isDirectory()) {
        await walk(childAbs, childRel)
        continue
      }
      entries.push(await readEntry(childAbs, `files/${childRel}`, limits, state))
    }
  }
  const files = join(dir, 'files')
  if (await lstat(files).then((s) => s.isDirectory(), () => false)) await walk(files, '')
  return packTarGz(entries)
}
