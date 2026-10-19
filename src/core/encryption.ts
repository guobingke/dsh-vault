import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { sha256Buffer } from './checksum.js'
import type { EncryptionAlgorithm, KdfAlgorithm } from './types.js'

export const ENCRYPTION_MAGIC = 'dsh-vault-encrypted'
export const ENCRYPTION_FORMAT_VERSION = 1 as const

export interface EncryptedEnvelope {
  magic: typeof ENCRYPTION_MAGIC
  version: typeof ENCRYPTION_FORMAT_VERSION
  algorithm: EncryptionAlgorithm
  kdf: {
    name: KdfAlgorithm
    salt: string
    /** scrypt N or argon2 memoryCost */
    N?: number
    r?: number
    p?: number
    /** argon2 timeCost */
    timeCost?: number
    memoryCost?: number
    parallelism?: number
  }
  cipher: {
    nonce: string
    tag: string
    data: string
  }
  /** SHA-256 of plaintext; never contains secrets in logs — callers must not print envelope.cipher. */
  plaintextSha256: string
}

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 32
const NONCE_LEN = 12
const SALT_LEN = 16

export interface EncryptOptions {
  password: string
  kdf?: KdfAlgorithm
  /** Injected for tests. */
  argon2Hash?: (password: string, salt: Buffer, opts: Argon2Params) => Promise<Buffer> | Buffer
}

export interface Argon2Params {
  timeCost: number
  memoryCost: number
  parallelism: number
  hashLength: number
}

const DEFAULT_ARGON2: Argon2Params = {
  timeCost: 3,
  memoryCost: 64 * 1024,
  parallelism: 1,
  hashLength: KEY_LEN,
}

function deriveScrypt(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
}

async function deriveKey(
  password: string,
  salt: Buffer,
  kdf: KdfAlgorithm,
  argon2Hash?: EncryptOptions['argon2Hash'],
  kdfParams?: EncryptedEnvelope['kdf'],
): Promise<{ key: Buffer; params: EncryptedEnvelope['kdf'] }> {
  if (kdf === 'argon2id') {
    if (!argon2Hash) {
      // Fall back to scrypt when argon2 is not available in this runtime.
      const key = deriveScrypt(password, salt)
      return {
        key,
        params: { name: 'scrypt', salt: salt.toString('base64'), N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      }
    }
    const params: Argon2Params = {
      timeCost: kdfParams?.timeCost ?? DEFAULT_ARGON2.timeCost,
      memoryCost: kdfParams?.memoryCost ?? DEFAULT_ARGON2.memoryCost,
      parallelism: kdfParams?.parallelism ?? DEFAULT_ARGON2.parallelism,
      hashLength: KEY_LEN,
    }
    const key = Buffer.from(await argon2Hash(password, salt, params))
    return {
      key,
      params: {
        name: 'argon2id',
        salt: salt.toString('base64'),
        timeCost: params.timeCost,
        memoryCost: params.memoryCost,
        parallelism: params.parallelism,
      },
    }
  }
  const key = deriveScrypt(password, salt)
  return {
    key,
    params: { name: 'scrypt', salt: salt.toString('base64'), N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
  }
}

/** Encrypt plaintext bytes into a JSON-serializable envelope. */
export async function encryptBytes(plain: Buffer, options: EncryptOptions): Promise<EncryptedEnvelope> {
  if (!options.password) throw new Error('password is required for encryption')
  const salt = randomBytes(SALT_LEN)
  const nonce = randomBytes(NONCE_LEN)
  const kdfName = options.kdf ?? 'scrypt'
  const { key, params } = await deriveKey(options.password, salt, kdfName, options.argon2Hash)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    magic: ENCRYPTION_MAGIC,
    version: ENCRYPTION_FORMAT_VERSION,
    algorithm: 'aes-256-gcm',
    kdf: params,
    cipher: {
      nonce: nonce.toString('base64'),
      tag: tag.toString('base64'),
      data: data.toString('base64'),
    },
    plaintextSha256: sha256Buffer(plain),
  }
}

/** Decrypt an envelope back to plaintext bytes. */
/** User-facing decryption failure (wrong/missing password, corrupted payload). */
export class VaultDecryptError extends Error {
  constructor(message: string, readonly code: 'BAD_PASSWORD' | 'PASSWORD_REQUIRED') {
    super(message)
    this.name = 'VaultDecryptError'
  }
}

export async function decryptBytes(
  envelope: EncryptedEnvelope,
  password: string,
  argon2Hash?: EncryptOptions['argon2Hash'],
): Promise<Buffer> {
  if (!password) throw new Error('password is required for decryption')
  if (envelope.magic !== ENCRYPTION_MAGIC) throw new Error('not a dsh-vault encrypted envelope')
  if (envelope.version !== ENCRYPTION_FORMAT_VERSION) {
    throw new Error(`unsupported encryption format version: ${envelope.version}`)
  }
  const salt = Buffer.from(envelope.kdf.salt, 'base64')
  const { key } = await deriveKey(password, salt, envelope.kdf.name, argon2Hash, envelope.kdf)
  const nonce = Buffer.from(envelope.cipher.nonce, 'base64')
  const tag = Buffer.from(envelope.cipher.tag, 'base64')
  const data = Buffer.from(envelope.cipher.data, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)
  let plain: Buffer
  try {
    plain = Buffer.concat([decipher.update(data), decipher.final()])
  } catch {
    // GCM auth failure: Node's message ("Unsupported state or unable to
    // authenticate data") is meaningless to users.
    throw new VaultDecryptError('wrong password or corrupted snapshot', 'BAD_PASSWORD')
  }
  const digest = sha256Buffer(plain)
  const expected = Buffer.from(envelope.plaintextSha256, 'hex')
  const actual = Buffer.from(digest, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('plaintext checksum mismatch after decryption')
  }
  return plain
}

export function serializeEnvelope(envelope: EncryptedEnvelope): Buffer {
  return Buffer.from(JSON.stringify(envelope), 'utf8')
}

export function parseEnvelope(buf: Buffer): EncryptedEnvelope {
  const parsed = JSON.parse(buf.toString('utf8')) as EncryptedEnvelope
  if (parsed.magic !== ENCRYPTION_MAGIC) throw new Error('invalid vault envelope magic')
  return parsed
}

/** Redact any string that looks like a secret before logging. */
export function redactForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > 8 && /(?:key|token|secret|password|credential)/i.test(value)) {
      return '[redacted]'
    }
    if (/^[A-Za-z0-9+/=]{40,}$/.test(value)) return '[redacted]'
    return value
  }
  if (Array.isArray(value)) return value.map(redactForLog)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/(password|secret|token|api[_-]?key|credential|authorization)/i.test(k)) {
        out[k] = '[redacted]'
      } else {
        out[k] = redactForLog(v)
      }
    }
    return out
  }
  return value
}
