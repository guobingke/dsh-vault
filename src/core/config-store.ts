import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DEFAULT_RETENTION } from './retention.js'
import { vaultConfigPath, vaultTargetsPath } from './paths.js'
import type {
  ScheduleConfig,
  StorageTargetConfig,
  VaultSettings,
} from './types.js'

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  intervalMinutes: 1440,
  targetId: 'local-default',
  encrypt: false,
  includeSecrets: false,
  retention: { ...DEFAULT_RETENTION },
}

export const DEFAULT_SETTINGS: VaultSettings = {
  retention: { ...DEFAULT_RETENTION },
  schedule: { ...DEFAULT_SCHEDULE },
  preferredKdf: 'scrypt',
}

export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
}

export async function loadSettings(dataDir: string): Promise<VaultSettings> {
  const stored = await readJsonFile<Partial<VaultSettings>>(vaultConfigPath(dataDir), {})
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    retention: { ...DEFAULT_RETENTION, ...stored.retention },
    schedule: { ...DEFAULT_SCHEDULE, ...stored.schedule, retention: { ...DEFAULT_RETENTION, ...stored.schedule?.retention } },
  }
}

export async function saveSettings(dataDir: string, settings: VaultSettings): Promise<void> {
  await writeJsonFile(vaultConfigPath(dataDir), settings)
}

export async function loadTargets(dataDir: string): Promise<StorageTargetConfig[]> {
  return readJsonFile<StorageTargetConfig[]>(vaultTargetsPath(dataDir), [])
}

export async function saveTargets(dataDir: string, targets: StorageTargetConfig[]): Promise<void> {
  // Strip inline tokens/secrets from persisted GitHub/WebDAV/S3 where possible? We persist what the user configured;
  // file mode is 0600. Never log these values.
  await writeJsonFile(vaultTargetsPath(dataDir), targets)
}

export function defaultLocalTarget(directory: string): StorageTargetConfig {
  return {
    kind: 'local',
    id: 'local-default',
    label: 'Local folder',
    directory,
    encryptByDefault: false,
  }
}
