import { snapshotTimeFromId } from '../core/manifest.js'
import type { GitHubTargetConfig, SnapshotInfo } from '../core/types.js'
import type { StorageAdapter, StorageAdapterFactoryContext } from './types.js'
import { ENCRYPTED_EXTENSION, ARCHIVE_EXTENSION } from '../core/types.js'

interface GitHubContentItem {
  name: string
  path: string
  sha: string
  size: number
  type: string
  download_url?: string | null
}

export type GitHubFetch = typeof fetch

export class GitHubStorageAdapter implements StorageAdapter {
  readonly id: string
  readonly kind = 'github'
  readonly label: string
  private readonly owner: string
  private readonly repo: string
  private readonly branch: string
  private readonly pathPrefix: string
  private readonly tokenDirect?: string
  private readonly tokenCredential?: string
  private readonly resolveSecret?: StorageAdapterFactoryContext['resolveSecret']
  private readonly fetchImpl: GitHubFetch

  constructor(
    config: GitHubTargetConfig,
    ctx: StorageAdapterFactoryContext = {},
    fetchImpl: GitHubFetch = fetch,
  ) {
    this.id = config.id
    this.label = config.label
    this.owner = config.owner
    this.repo = config.repo
    this.branch = config.branch ?? 'main'
    this.pathPrefix = (config.pathPrefix ?? 'dsh-vault').replace(/^\/+|\/+$/g, '')
    this.tokenDirect = config.token
    this.tokenCredential = config.tokenCredential
    this.resolveSecret = ctx.resolveSecret
    this.fetchImpl = fetchImpl
  }

  private async token(): Promise<string> {
    if (this.tokenDirect) return this.tokenDirect
    if (this.tokenCredential && this.resolveSecret) {
      const v = await this.resolveSecret(this.tokenCredential)
      if (v) return v
    }
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN
    throw new Error('GitHub token not available (set token, credential ref, or GITHUB_TOKEN)')
  }

  private objectPath(snapshotId: string, encrypted: boolean): string {
    const ext = encrypted ? ENCRYPTED_EXTENSION : ARCHIVE_EXTENSION
    return `${this.pathPrefix}/${snapshotId}${ext}`
  }

  private api(path: string): string {
    return `https://api.github.com/repos/${this.owner}/${this.repo}${path}`
  }

  private async headers(json = true): Promise<Record<string, string>> {
    const token = await this.token()
    return {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'dsh-vault',
      ...(json ? { 'content-type': 'application/json' } : {}),
    }
  }

  async put(snapshotId: string, data: Buffer): Promise<{ remoteKey: string }> {
    const encrypted = data.toString('utf8', 0, 64).includes('dsh-vault-encrypted')
    const path = this.objectPath(snapshotId, encrypted)
    let sha: string | undefined
    const existing = await this.fetchImpl(this.api(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`), {
      headers: await this.headers(),
    })
    if (existing.ok) {
      const body = (await existing.json()) as { sha?: string }
      sha = body.sha
    }
    const res = await this.fetchImpl(this.api(`/contents/${path}`), {
      method: 'PUT',
      headers: await this.headers(),
      body: JSON.stringify({
        message: `dsh-vault: snapshot ${snapshotId}`,
        content: data.toString('base64'),
        branch: this.branch,
        ...(sha ? { sha } : {}),
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GitHub put failed (${res.status}): ${text.slice(0, 200)}`)
    }
    return { remoteKey: path }
  }

  async get(snapshotIdOrKey: string): Promise<Buffer> {
    const path = snapshotIdOrKey.includes('/')
      ? snapshotIdOrKey
      : await this.resolvePath(snapshotIdOrKey)
    const res = await this.fetchImpl(this.api(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`), {
      headers: await this.headers(),
    })
    if (!res.ok) throw new Error(`GitHub get failed (${res.status})`)
    const body = (await res.json()) as { content?: string; encoding?: string }
    if (!body.content) throw new Error('GitHub content missing')
    return Buffer.from(body.content.replace(/\n/g, ''), (body.encoding as BufferEncoding) || 'base64')
  }

  private async resolvePath(snapshotId: string): Promise<string> {
    const list = await this.list()
    const hit = list.find((s) => s.id === snapshotId)
    if (!hit) throw new Error(`snapshot not found: ${snapshotId}`)
    return hit.remoteKey
  }

  async list(): Promise<SnapshotInfo[]> {
    const res = await this.fetchImpl(
      this.api(`/contents/${this.pathPrefix}?ref=${encodeURIComponent(this.branch)}`),
      { headers: await this.headers() },
    )
    if (res.status === 404) return []
    if (!res.ok) throw new Error(`GitHub list failed (${res.status})`)
    const items = (await res.json()) as GitHubContentItem[]
    if (!Array.isArray(items)) return []
    return items
      .filter((i) => i.type === 'file')
      .map((i) => {
        const encrypted = i.name.endsWith(ENCRYPTED_EXTENSION)
        const id = i.name.replace(/\.tar\.gz$/i, '').replace(/\.dshvault$/i, '')
        return {
          id,
          targetId: this.id,
          remoteKey: i.path,
          // Contents API listings carry no timestamps; the id encodes creation time.
          createdAt: snapshotTimeFromId(id) ?? new Date(0).toISOString(),
          bytes: i.size,
          encrypted,
          includeSecrets: false,
        } satisfies SnapshotInfo
      })
  }

  async delete(snapshotIdOrKey: string): Promise<void> {
    const path = snapshotIdOrKey.includes('/')
      ? snapshotIdOrKey
      : await this.resolvePath(snapshotIdOrKey)
    const metaRes = await this.fetchImpl(this.api(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`), {
      headers: await this.headers(),
    })
    if (!metaRes.ok) throw new Error(`GitHub delete lookup failed (${metaRes.status})`)
    const meta = (await metaRes.json()) as { sha: string }
    const res = await this.fetchImpl(this.api(`/contents/${path}`), {
      method: 'DELETE',
      headers: await this.headers(),
      body: JSON.stringify({
        message: `dsh-vault: delete ${path}`,
        sha: meta.sha,
        branch: this.branch,
      }),
    })
    if (!res.ok) throw new Error(`GitHub delete failed (${res.status})`)
  }
}
