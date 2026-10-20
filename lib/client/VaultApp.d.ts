import { VaultApi } from './api.js';
import type { RestoreRequestBody } from './lib/requests.js';
import type { BackupCategory } from '../core/types.js';
import './theme.css';
export type VaultTab = 'overview' | 'backup' | 'restore' | 'storage' | 'snapshots' | 'schedule';
export interface BackupInput {
    targetId?: string;
    directory?: string;
    exportFile?: string;
    overwrite?: boolean;
    encrypt: boolean;
    password?: string;
    includeSecrets: boolean;
    notes?: string;
    categories?: BackupCategory[];
}
export type RestoreInput = RestoreRequestBody;
export interface PreviewInput {
    targetId?: string;
    snapshotId?: string;
    importPath?: string;
    password?: string;
    conflict?: 'keep-current' | 'use-backup';
    conflicts?: Record<string, 'keep-current' | 'use-backup'>;
}
export interface VaultAppProps {
    api?: VaultApi;
    /** Host locale tag e.g. "zh-CN" / "en-US"; the UI follows it. */
    hostLocale?: string;
    initialTab?: VaultTab;
}
export declare function VaultApp({ api: apiProp, hostLocale, initialTab }: VaultAppProps): import("react").JSX.Element;
//# sourceMappingURL=VaultApp.d.ts.map