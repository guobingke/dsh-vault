import { totalmem } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { sha256Buffer } from './checksum.js';
const BLOCK = 512;
function encodeOctal(value, length) {
    const s = value.toString(8);
    if (s.length > length - 1)
        return s.slice(-length + 1).padStart(length - 1, '0') + '\0';
    return s.padStart(length - 1, '0') + '\0';
}
function checksumHeader(header) {
    let sum = 0;
    for (let i = 0; i < header.length; i++)
        sum += header[i];
    return sum;
}
function writeHeader(name, prefix, size, mode, type, mtime) {
    const header = Buffer.alloc(BLOCK, 0);
    header.write(name, 0, 100, 'utf8');
    header.write(encodeOctal(mode, 8), 100, 'ascii');
    header.write(encodeOctal(0, 8), 108, 'ascii'); // uid
    header.write(encodeOctal(0, 8), 116, 'ascii'); // gid
    header.write(encodeOctal(size, 12), 124, 'ascii');
    header.write(encodeOctal(mtime, 12), 136, 'ascii');
    header.write('        ', 148, 'ascii'); // checksum placeholder
    header.write(type, 156, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    if (prefix)
        header.write(prefix, 345, 155, 'utf8');
    const sum = checksumHeader(header);
    header.write(encodeOctal(sum, 8), 148, 'ascii');
    return header;
}
const isPrintableAscii = (s) => /^[\x20-\x7e]*$/.test(s);
/** Split a path into ustar prefix (≤155 bytes) + name (≤100 bytes) at a '/', if possible. */
function splitUstar(path) {
    if (!isPrintableAscii(path))
        return null;
    if (path.length <= 100)
        return { name: path, prefix: '' };
    for (let i = path.length - 1; i > 0; i--) {
        if (path[i] !== '/')
            continue;
        const prefix = path.slice(0, i);
        const name = path.slice(i + 1);
        if (prefix.length <= 155 && name.length <= 100 && name.length > 0)
            return { name, prefix };
    }
    return null;
}
/** One pax record: "<len> key=value\n", where len counts the whole record in bytes. */
function paxRecord(key, value) {
    const body = ` ${key}=${value}\n`;
    const bodyLen = Buffer.byteLength(body, 'utf8');
    let len = bodyLen + String(bodyLen).length;
    if (String(len).length !== String(len - bodyLen).length)
        len = bodyLen + String(len).length;
    return Buffer.from(`${len}${body}`, 'utf8');
}
/** ASCII stand-in for readers without pax support (never used by pax-aware tar). */
function asciiFallback(path) {
    const ascii = path.replace(/[^\x20-\x7e]/g, '_');
    return ascii.length <= 100 ? ascii : ascii.slice(ascii.length - 100);
}
function padToBlock(size) {
    const rem = size % BLOCK;
    return rem === 0 ? 0 : BLOCK - rem;
}
/**
 * Pack entries into a gzip-compressed POSIX (pax) tar.
 * Names that are non-ASCII (e.g. Chinese skill files) or too long for ustar get a pax
 * `path` record in UTF-8, which GNU tar, bsdtar / Windows tar.exe and 7-Zip all honor,
 * so names round-trip on Windows and Linux instead of turning into mojibake.
 */
export function packTarGz(entries) {
    const chunks = [];
    const mtime = Math.floor(Date.now() / 1000);
    for (const entry of entries) {
        const path = entry.path.replace(/\\/g, '/');
        const mode = entry.mode ?? 0o644;
        const split = splitUstar(path);
        if (split) {
            chunks.push(writeHeader(split.name, split.prefix, entry.data.length, mode, '0', mtime));
        }
        else {
            const pax = paxRecord('path', path);
            chunks.push(writeHeader(asciiFallback(`PaxHeaders/${path}`), '', pax.length, 0o644, 'x', mtime));
            chunks.push(pax);
            const padPax = padToBlock(pax.length);
            if (padPax)
                chunks.push(Buffer.alloc(padPax, 0));
            chunks.push(writeHeader(asciiFallback(path), '', entry.data.length, mode, '0', mtime));
        }
        chunks.push(entry.data);
        const pad = padToBlock(entry.data.length);
        if (pad)
            chunks.push(Buffer.alloc(pad, 0));
    }
    chunks.push(Buffer.alloc(BLOCK * 2, 0));
    return gzipSync(Buffer.concat(chunks), { level: 9 });
}
function readOctal(buf, start, length) {
    const field = buf.subarray(start, start + length);
    if (field[0] & 0x80) {
        // GNU base-256 (large sizes)
        let n = 0;
        for (let i = 1; i < field.length; i++)
            n = n * 256 + field[i];
        return n;
    }
    const raw = field.toString('ascii').replace(/\0/g, '').trim();
    if (!raw)
        return 0;
    return parseInt(raw, 8);
}
function parsePax(data) {
    const out = {};
    let i = 0;
    while (i < data.length) {
        const sp = data.indexOf(0x20, i);
        if (sp < 0)
            break;
        const len = parseInt(data.subarray(i, sp).toString('ascii'), 10);
        if (!Number.isFinite(len) || len <= 0)
            break;
        const rec = data.subarray(sp + 1, i + len - 1).toString('utf8');
        const eq = rec.indexOf('=');
        if (eq > 0)
            out[rec.slice(0, eq)] = rec.slice(eq + 1);
        i += len;
    }
    return out;
}
const cstr = (b) => {
    const z = b.indexOf(0);
    return (z < 0 ? b : b.subarray(0, z)).toString('utf8');
};
function envLimit(name, fallback) {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
}
/**
 * Default uncompressed-size limit: a quarter of installed memory, between 256 MiB and
 * 2 GiB − 1 (unpacking is in memory, so the limit follows what the machine can hold).
 */
export function memoryBasedArchiveLimit(totalMem = totalmem()) {
    const MiB = 1024 * 1024;
    return Math.max(256 * MiB, Math.min(2 * 1024 * MiB - 1, Math.floor(totalMem / 4)));
}
export function defaultArchiveLimits() {
    return {
        maxTotalBytes: envLimit('DSH_VAULT_MAX_ARCHIVE_BYTES', memoryBasedArchiveLimit()),
        maxEntryBytes: envLimit('DSH_VAULT_MAX_ENTRY_BYTES', 512 * 1024 * 1024),
        maxEntries: envLimit('DSH_VAULT_MAX_ENTRIES', 200_000),
        maxPathLength: 4096,
    };
}
export class ArchiveLimitError extends Error {
    code = 'ARCHIVE_LIMIT';
    constructor(message) {
        super(message);
        this.name = 'ArchiveLimitError';
    }
}
/** Unpack a gzip-compressed tar (ustar, pax `x`/`g`, GNU `L` long names). Links and devices are refused. */
export function unpackTarGz(archive, limitsIn = {}) {
    const limits = { ...defaultArchiveLimits(), ...limitsIn };
    let tar;
    try {
        tar = gunzipSync(archive, { maxOutputLength: limits.maxTotalBytes });
    }
    catch (err) {
        const e = err;
        if (e?.code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) {
            throw new ArchiveLimitError(`archive expands beyond ${limits.maxTotalBytes} bytes; refusing to unpack`);
        }
        throw err;
    }
    const out = [];
    let headers = 0;
    let offset = 0;
    let nextPath;
    let globalPath;
    while (offset + BLOCK <= tar.length) {
        const header = tar.subarray(offset, offset + BLOCK);
        offset += BLOCK;
        if (header.every((b) => b === 0))
            break;
        const name = cstr(header.subarray(0, 100));
        const magic = header.subarray(257, 262).toString('ascii');
        const prefix = magic === 'ustar' ? cstr(header.subarray(345, 500)) : '';
        const size = readOctal(header, 124, 12);
        const mode = readOctal(header, 100, 8);
        const typeFlag = String.fromCharCode(header[156] ?? 0);
        if (++headers > limits.maxEntries)
            throw new ArchiveLimitError(`archive has more than ${limits.maxEntries} entries`);
        if (!Number.isFinite(size) || size < 0 || size > limits.maxEntryBytes) {
            throw new ArchiveLimitError(`archive entry larger than ${limits.maxEntryBytes} bytes`);
        }
        if (offset + size > tar.length)
            throw new ArchiveLimitError('archive entry runs past the end of the archive (truncated or forged size)');
        const data = tar.subarray(offset, offset + size);
        offset += size + padToBlock(size);
        if (typeFlag === 'x') {
            const pax = parsePax(data);
            if (pax.path !== undefined)
                nextPath = pax.path;
            continue;
        }
        if (typeFlag === 'g') {
            const pax = parsePax(data);
            if (pax.path !== undefined)
                globalPath = pax.path;
            continue;
        }
        if (typeFlag === 'L') {
            nextPath = cstr(Buffer.from(data));
            continue;
        }
        const path = nextPath ?? globalPath ?? (prefix ? `${prefix}/${name}` : name);
        nextPath = undefined;
        if (Buffer.byteLength(path, 'utf8') > limits.maxPathLength)
            throw new ArchiveLimitError('archive entry path too long');
        if (typeFlag === '0' || typeFlag === '\0' || typeFlag === '7') {
            out.push({ path, data: Buffer.from(data), mode });
        }
        else if (typeFlag === '1' || typeFlag === '2' || typeFlag === '3' || typeFlag === '4' || typeFlag === '6') {
            // H-01: hard links, symlinks, devices and FIFOs never come out of a snapshot.
            throw new ArchiveLimitError(`archive contains a link or special file (${path}); refusing to unpack`);
        }
    }
    return out;
}
export function archiveFingerprint(archive) {
    return sha256Buffer(archive);
}
//# sourceMappingURL=archive.js.map