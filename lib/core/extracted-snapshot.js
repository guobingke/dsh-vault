/**
 * An already-extracted snapshot folder (`manifest.json` + `files/`), as produced by unpacking a
 * plaintext `.tar.gz`. Re-packed in memory so the normal verified unpack path (manifest
 * integrity, per-file sha256 and size, archive limits) applies unchanged.
 */
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultArchiveLimits, packTarGz } from './archive.js';
import { VaultUserError } from './errors.js';
export async function isExtractedSnapshotDir(dir) {
    const m = await lstat(join(dir, 'manifest.json')).catch(() => null);
    const f = await lstat(join(dir, 'files')).catch(() => null);
    return Boolean(m?.isFile() && (!f || f.isDirectory()));
}
export async function packExtractedSnapshot(dir, limits = defaultArchiveLimits()) {
    const entries = [{ path: 'manifest.json', data: await readFile(join(dir, 'manifest.json')) }];
    let total = entries[0].data.length;
    const walk = async (abs, rel) => {
        for (const e of await readdir(abs, { withFileTypes: true })) {
            const childAbs = join(abs, e.name);
            const childRel = rel ? `${rel}/${e.name}` : e.name;
            const st = await lstat(childAbs);
            // Same rule as archives: links and special files are refused, never followed.
            if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) {
                throw new VaultUserError(`snapshot folder contains a link or special file: files/${childRel}`, 400, 'RESTORE_UNSAFE_PATH');
            }
            if (st.isDirectory()) {
                await walk(childAbs, childRel);
                continue;
            }
            if (entries.length >= limits.maxEntries)
                throw new VaultUserError('snapshot folder has too many files', 413, 'ARCHIVE_LIMIT');
            if (st.size > limits.maxEntryBytes)
                throw new VaultUserError(`snapshot file too large: files/${childRel}`, 413, 'ARCHIVE_LIMIT');
            total += st.size;
            if (total > limits.maxTotalBytes)
                throw new VaultUserError(`snapshot folder is larger than ${limits.maxTotalBytes} bytes`, 413, 'ARCHIVE_LIMIT');
            entries.push({ path: `files/${childRel}`, data: await readFile(childAbs) });
        }
    };
    const files = join(dir, 'files');
    if (await lstat(files).then((s) => s.isDirectory(), () => false))
        await walk(files, '');
    return packTarGz(entries);
}
//# sourceMappingURL=extracted-snapshot.js.map