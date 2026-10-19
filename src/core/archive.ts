import { gunzipSync, gzipSync } from 'node:zlib'
import { sha256Buffer } from './checksum.js'

export interface ArchiveEntry {
  path: string
  data: Buffer
  mode?: number
}

const BLOCK = 512

function encodeOctal(value: number, length: number): string {
  const s = value.toString(8)
  if (s.length > length - 1) return s.slice(-length + 1).padStart(length - 1, '0') + '\0'
  return s.padStart(length - 1, '0') + '\0'
}

function checksumHeader(header: Buffer): number {
  let sum = 0
  for (let i = 0; i < header.length; i++) sum += header[i]!
  return sum
}

function writeUstarHeader(path: string, size: number, mode: number): Buffer {
  const header = Buffer.alloc(BLOCK, 0)
  const name = path.length > 100 ? path.slice(0, 100) : path
  header.write(name, 0, 'utf8')
  header.write(encodeOctal(mode, 8), 100, 'utf8')
  header.write(encodeOctal(0, 8), 108, 'utf8') // uid
  header.write(encodeOctal(0, 8), 116, 'utf8') // gid
  header.write(encodeOctal(size, 12), 124, 'utf8')
  header.write(encodeOctal(Math.floor(Date.now() / 1000), 12), 136, 'utf8')
  header.write('        ', 148, 'utf8') // checksum placeholder
  header.write('0', 156, 'utf8') // regular file
  header.write('ustar\0', 257, 'utf8')
  header.write('00', 263, 'utf8')
  if (path.length > 100) {
    const prefix = path.slice(0, path.length - 100)
    header.write(prefix.slice(0, 155), 345, 'utf8')
  }
  const sum = checksumHeader(header)
  header.write(encodeOctal(sum, 8), 148, 'utf8')
  return header
}

function padToBlock(size: number): number {
  const rem = size % BLOCK
  return rem === 0 ? 0 : BLOCK - rem
}

/** Pack entries into a gzip-compressed ustar archive. */
export function packTarGz(entries: ArchiveEntry[]): Buffer {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const path = entry.path.replace(/\\/g, '/')
    const mode = entry.mode ?? 0o644
    chunks.push(writeUstarHeader(path, entry.data.length, mode))
    chunks.push(entry.data)
    const pad = padToBlock(entry.data.length)
    if (pad) chunks.push(Buffer.alloc(pad, 0))
  }
  chunks.push(Buffer.alloc(BLOCK * 2, 0))
  return gzipSync(Buffer.concat(chunks), { level: 9 })
}

function readOctal(buf: Buffer, start: number, length: number): number {
  const raw = buf.subarray(start, start + length).toString('utf8').replace(/\0/g, '').trim()
  if (!raw) return 0
  return parseInt(raw, 8)
}

/** Unpack a gzip-compressed ustar archive. */
export function unpackTarGz(archive: Buffer): ArchiveEntry[] {
  const tar = gunzipSync(archive)
  const out: ArchiveEntry[] = []
  let offset = 0
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    offset += BLOCK
    if (header.every((b) => b === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0/g, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0/g, '')
    const path = prefix ? `${prefix}/${name}` : name
    const size = readOctal(header, 124, 12)
    const mode = readOctal(header, 100, 8)
    const typeFlag = String.fromCharCode(header[156] ?? 0)
    const data = tar.subarray(offset, offset + size)
    offset += size + padToBlock(size)
    if (typeFlag === '0' || typeFlag === '\0') {
      out.push({ path, data: Buffer.from(data), mode })
    }
  }
  return out
}

export function archiveFingerprint(archive: Buffer): string {
  return sha256Buffer(archive)
}
