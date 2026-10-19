import type { StorageTargetConfig } from './types.js';
/** Placeholder returned to the browser in place of stored secrets. */
export declare const SECRET_MASK = "********";
export declare function isSecretMask(value: unknown): boolean;
/** True when the incoming value means "keep whatever is already stored". */
export declare function shouldKeepExistingSecret(incoming: unknown): boolean;
/** Public view of a storage target: never echo real passwords / tokens / secret keys. */
export declare function maskTargetSecrets(config: StorageTargetConfig): StorageTargetConfig;
/**
 * Merge an upsert payload with the previously stored target.
 * Masked / empty secret fields keep the existing stored value.
 */
export declare function mergeTargetSecrets(incoming: StorageTargetConfig, existing: StorageTargetConfig | undefined): StorageTargetConfig;
//# sourceMappingURL=target-secrets.d.ts.map