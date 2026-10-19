import { createHash, createHmac } from 'node:crypto'
import type { S3TargetConfig, SnapshotInfo } from '../core/types.js'
import { ARCHIVE_EXTENSION, ENCRYPTED_EXTENSION } from '../core/types.js'
import type { StorageAdapter } from './types.js'

export type S3Fetch = typeof fetch

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function buildS3SigningKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  return hmac(kService, 'aws4_request')
}

export interface SignedRequest {
  url: string
  headers: Record<string, string>
}

/** Create AWS SigV4 headers for a single S3-compatible request. */
export function signS3Request(input: {
  method: string
  endpoint: string
  region: string
  bucket: string
  key: string
  accessKeyId: string
  secretAccessKey: string
  body?: Buffer
  forcePathStyle?: boolean
  now?: Date
  extraHeaders?: Record<string, string>
}): SignedRequest {
  const now = input.now ?? new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const region = input.region || 'auto'
  const service = 's3'
  const endpointUrl = new URL(input.endpoint)
  const host = endpointUrl.host
  const pathStyle = input.forcePathStyle ?? !host.startsWith(`${input.bucket}.`)
  const canonicalUri = pathStyle
    ? `/${input.bucket}/${input.key.split('/').map(encodeRfc3986).join('/')}`
    : `/${input.key.split('/').map(encodeRfc3986).join('/')}`
  const url = pathStyle
    ? `${endpointUrl.origin}/${input.bucket}/${input.key}`
    : `${endpointUrl.protocol}//${input.bucket}.${host}/${input.key}`

  const payloadHash = sha256Hex(input.body ?? Buffer.alloc(0))
  const headers: Record<string, string> = {
    host: pathStyle ? host : `${input.bucket}.${host}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...input.extraHeaders,
  }
  if (input.body) headers['content-length'] = String(input.body.length)

  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort()
  const signedHeaders = signedHeaderKeys.join(';')
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]!.trim()}\n`).join('')
  const canonicalRequest = [
    input.method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const signingKey = buildS3SigningKey(input.secretAccessKey, dateStamp, region, service)
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return { url, headers }
}

export class S3StorageAdapter implements StorageAdapter {
  readonly id: string
  readonly kind = 's3'
  readonly label: string
  private readonly config: S3TargetConfig
  private readonly fetchImpl: S3Fetch
  private readonly prefix: string

  constructor(config: S3TargetConfig, fetchImpl: S3Fetch = fetch) {
    this.id = config.id
    this.label = config.label
    this.config = config
    this.fetchImpl = fetchImpl
    this.prefix = (config.pathPrefix ?? 'dsh-vault').replace(/^\/+|\/+$/g, '')
  }

  private objectKey(name: string): string {
    return `${this.prefix}/${name}`
  }

  private fileName(snapshotId: string, data: Buffer): string {
    const encrypted = data.toString('utf8', 0, 64).includes('dsh-vault-encrypted')
    return `${snapshotId}${encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION}`
  }

  async put(snapshotId: string, data: Buffer): Promise<{ remoteKey: string }> {
    const name = this.fileName(snapshotId, data)
    const key = this.objectKey(name)
    const signed = signS3Request({
      method: 'PUT',
      endpoint: this.config.endpoint,
      region: this.config.region ?? 'auto',
      bucket: this.config.bucket,
      key,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      body: data,
      forcePathStyle: this.config.forcePathStyle,
      extraHeaders: { 'content-type': 'application/octet-stream' },
    })
    const res = await this.fetchImpl(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: new Uint8Array(data),
    })
    if (!res.ok) throw new Error(`S3 put failed (${res.status})`)
    return { remoteKey: name }
  }

  async get(snapshotIdOrKey: string): Promise<Buffer> {
    const name = snapshotIdOrKey.includes('.') ? snapshotIdOrKey : await this.resolveName(snapshotIdOrKey)
    const signed = signS3Request({
      method: 'GET',
      endpoint: this.config.endpoint,
      region: this.config.region ?? 'auto',
      bucket: this.config.bucket,
      key: this.objectKey(name),
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      forcePathStyle: this.config.forcePathStyle,
    })
    const res = await this.fetchImpl(signed.url, { method: 'GET', headers: signed.headers })
    if (!res.ok) throw new Error(`S3 get failed (${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  }

  private async resolveName(snapshotId: string): Promise<string> {
    const list = await this.list()
    const hit = list.find((s) => s.id === snapshotId)
    if (!hit) throw new Error(`snapshot not found: ${snapshotId}`)
    return hit.remoteKey
  }

  async list(): Promise<SnapshotInfo[]> {
    const prefix = `${this.prefix}/`
    // ListObjectsV2 via query string — signed with empty body.
    const endpointUrl = new URL(this.config.endpoint)
    const pathStyle = this.config.forcePathStyle ?? true
    const listPath = pathStyle ? `/${this.config.bucket}` : `/`
    const host = pathStyle ? endpointUrl.host : `${this.config.bucket}.${endpointUrl.host}`
    const query = `list-type=2&prefix=${encodeRfc3986(prefix)}`
    const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const dateStamp = amzDate.slice(0, 8)
    const region = this.config.region ?? 'auto'
    const payloadHash = sha256Hex('')
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
    const canonicalRequest = ['GET', listPath, query, canonicalHeaders, signedHeaders, payloadHash].join('\n')
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')
    const signingKey = buildS3SigningKey(this.config.secretAccessKey, dateStamp, region, 's3')
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    const url = pathStyle
      ? `${endpointUrl.origin}${listPath}?${query}`
      : `${endpointUrl.protocol}//${host}/?${query}`
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        authorization,
      },
    })
    if (!res.ok) throw new Error(`S3 list failed (${res.status})`)
    const xml = await res.text()
    return parseListObjects(xml, this.id, this.prefix)
  }

  async delete(snapshotIdOrKey: string): Promise<void> {
    const name = snapshotIdOrKey.includes('.') ? snapshotIdOrKey : await this.resolveName(snapshotIdOrKey)
    const signed = signS3Request({
      method: 'DELETE',
      endpoint: this.config.endpoint,
      region: this.config.region ?? 'auto',
      bucket: this.config.bucket,
      key: this.objectKey(name),
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      forcePathStyle: this.config.forcePathStyle,
    })
    const res = await this.fetchImpl(signed.url, { method: 'DELETE', headers: signed.headers })
    if (!res.ok && res.status !== 204) throw new Error(`S3 delete failed (${res.status})`)
  }
}

export function parseListObjects(xml: string, targetId: string, prefix: string): SnapshotInfo[] {
  const out: SnapshotInfo[] = []
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!)
  const sizes = [...xml.matchAll(/<Size>(\d+)<\/Size>/g)].map((m) => Number(m[1]))
  const modified = [...xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)].map((m) => m[1]!)
  keys.forEach((key, i) => {
    const name = key.startsWith(prefix + '/') ? key.slice(prefix.length + 1) : key.split('/').pop()!
    if (!name.endsWith(ARCHIVE_EXTENSION) && !name.endsWith(ENCRYPTED_EXTENSION)) return
    const id = name.replace(/\.tar\.gz$/i, '').replace(/\.dshvault$/i, '')
    out.push({
      id,
      targetId,
      remoteKey: name,
      createdAt: modified[i] ? new Date(modified[i]!).toISOString() : new Date(0).toISOString(),
      bytes: sizes[i] ?? 0,
      encrypted: name.endsWith(ENCRYPTED_EXTENSION),
      includeSecrets: false,
    })
  })
  return out
}
