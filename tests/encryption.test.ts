import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  decryptBytes,
  encryptBytes,
  parseEnvelope,
  redactForLog,
  serializeEnvelope,
} from '../src/core/encryption.js'

describe('encryption', () => {
  it('round-trips with scrypt + aes-256-gcm', async () => {
    const plain = Buffer.from('hello vault secrets')
    const envelope = await encryptBytes(plain, { password: 'correct horse battery', kdf: 'scrypt' })
    assert.equal(envelope.magic, 'dsh-vault-encrypted')
    assert.equal(envelope.algorithm, 'aes-256-gcm')
    assert.equal(envelope.kdf.name, 'scrypt')
    const back = await decryptBytes(envelope, 'correct horse battery')
    assert.equal(back.toString('utf8'), plain.toString('utf8'))
  })

  it('fails on wrong password', async () => {
    const envelope = await encryptBytes(Buffer.from('data'), { password: 'one' })
    await assert.rejects(() => decryptBytes(envelope, 'two'))
  })

  it('serializes and parses envelope', async () => {
    const envelope = await encryptBytes(Buffer.from('abc'), { password: 'pw' })
    const buf = serializeEnvelope(envelope)
    const parsed = parseEnvelope(buf)
    const plain = await decryptBytes(parsed, 'pw')
    assert.equal(plain.toString(), 'abc')
  })

  it('falls back from argon2id to scrypt when argon2 hasher absent', async () => {
    const envelope = await encryptBytes(Buffer.from('x'), { password: 'pw', kdf: 'argon2id' })
    assert.equal(envelope.kdf.name, 'scrypt')
  })

  it('uses injected argon2 hasher when provided', async () => {
    const envelope = await encryptBytes(Buffer.from('argon'), {
      password: 'pw',
      kdf: 'argon2id',
      argon2Hash: (_password, salt, opts) => {
        // deterministic fake argon2 for tests
        const out = Buffer.alloc(opts.hashLength, 7)
        salt.copy(out)
        return out
      },
    })
    assert.equal(envelope.kdf.name, 'argon2id')
    const plain = await decryptBytes(envelope, 'pw', (_password, salt, opts) => {
      const out = Buffer.alloc(opts.hashLength, 7)
      salt.copy(out)
      return out
    })
    assert.equal(plain.toString(), 'argon')
  })

  it('redacts secrets for logs', () => {
    const redacted = redactForLog({ password: 'hunter2', token: 'abc', ok: true, nested: { apiKey: 'x' } })
    assert.deepEqual(redacted, {
      password: '[redacted]',
      token: '[redacted]',
      ok: true,
      nested: { apiKey: '[redacted]' },
    })
  })
})
