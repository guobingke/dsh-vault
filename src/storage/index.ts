import type { StorageTargetConfig } from '../core/types.js'
import { GitHubStorageAdapter } from './github.js'
import { LocalStorageAdapter } from './local.js'
import { S3StorageAdapter } from './s3.js'
import type { StorageAdapter, StorageAdapterFactoryContext } from './types.js'
import { WebDavStorageAdapter } from './webdav.js'

export type { StorageAdapter, StorageAdapterFactoryContext } from './types.js'
export { LocalStorageAdapter } from './local.js'
export { GitHubStorageAdapter } from './github.js'
export { WebDavStorageAdapter, parsePropfind } from './webdav.js'
export { S3StorageAdapter, signS3Request, buildS3SigningKey, parseListObjects } from './s3.js'

export function createStorageAdapter(
  config: StorageTargetConfig,
  ctx: StorageAdapterFactoryContext = {},
): StorageAdapter {
  switch (config.kind) {
    case 'local':
      return new LocalStorageAdapter(config)
    case 'github':
      return new GitHubStorageAdapter(config, ctx)
    case 'webdav':
      return new WebDavStorageAdapter(config)
    case 's3':
      return new S3StorageAdapter(config)
    default: {
      const _exhaustive: never = config
      throw new Error(`unknown storage kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

export class StorageRegistry {
  private adapters = new Map<string, StorageAdapter>()
  private configs = new Map<string, StorageTargetConfig>()

  constructor(
    configs: StorageTargetConfig[] = [],
    private readonly ctx: StorageAdapterFactoryContext = {},
  ) {
    for (const config of configs) this.upsert(config)
  }

  upsert(config: StorageTargetConfig): StorageAdapter {
    const adapter = createStorageAdapter(config, this.ctx)
    this.adapters.set(config.id, adapter)
    this.configs.set(config.id, config)
    return adapter
  }

  remove(id: string): void {
    this.adapters.delete(id)
    this.configs.delete(id)
  }

  get(id: string): StorageAdapter {
    const adapter = this.adapters.get(id)
    if (!adapter) throw new Error(`storage target not found: ${id}`)
    return adapter
  }

  list(): StorageTargetConfig[] {
    return [...this.configs.values()]
  }

  getAdapter(id: string): StorageAdapter {
    return this.get(id)
  }
}
