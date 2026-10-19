/** Placeholder returned to the browser in place of stored secrets. */
export const SECRET_MASK = '********';
export function isSecretMask(value) {
    return typeof value === 'string' && value === SECRET_MASK;
}
/** True when the incoming value means "keep whatever is already stored". */
export function shouldKeepExistingSecret(incoming) {
    if (incoming === undefined || incoming === null)
        return true;
    if (typeof incoming !== 'string')
        return false;
    if (incoming === '')
        return true;
    return isSecretMask(incoming);
}
/** Public view of a storage target: never echo real passwords / tokens / secret keys. */
export function maskTargetSecrets(config) {
    switch (config.kind) {
        case 'local':
            return { ...config };
        case 'github': {
            const out = { ...config };
            if (config.token)
                out.token = SECRET_MASK;
            else
                delete out.token;
            return out;
        }
        case 'webdav': {
            const out = { ...config };
            if (config.password)
                out.password = SECRET_MASK;
            else
                delete out.password;
            return out;
        }
        case 's3': {
            return {
                ...config,
                secretAccessKey: config.secretAccessKey ? SECRET_MASK : '',
            };
        }
        default: {
            const _exhaustive = config;
            return _exhaustive;
        }
    }
}
/**
 * Merge an upsert payload with the previously stored target.
 * Masked / empty secret fields keep the existing stored value.
 */
export function mergeTargetSecrets(incoming, existing) {
    if (!existing || existing.kind !== incoming.kind || existing.id !== incoming.id) {
        // New target (or kind/id change): strip masks so we never persist the placeholder.
        return stripMasksForNew(incoming);
    }
    switch (incoming.kind) {
        case 'local':
            return { ...incoming };
        case 'github': {
            const prev = existing.kind === 'github' ? existing : undefined;
            const token = shouldKeepExistingSecret(incoming.token) ? prev?.token : incoming.token;
            return { ...incoming, token };
        }
        case 'webdav': {
            const prev = existing.kind === 'webdav' ? existing : undefined;
            const password = shouldKeepExistingSecret(incoming.password) ? prev?.password : incoming.password;
            return { ...incoming, password };
        }
        case 's3': {
            const prev = existing.kind === 's3' ? existing : undefined;
            const secretAccessKey = shouldKeepExistingSecret(incoming.secretAccessKey)
                ? (prev?.secretAccessKey ?? '')
                : incoming.secretAccessKey;
            return { ...incoming, secretAccessKey };
        }
        default: {
            const _exhaustive = incoming;
            return _exhaustive;
        }
    }
}
function stripMasksForNew(incoming) {
    switch (incoming.kind) {
        case 'local':
            return { ...incoming };
        case 'github': {
            const token = isSecretMask(incoming.token) || incoming.token === '' ? undefined : incoming.token;
            return { ...incoming, token };
        }
        case 'webdav': {
            const password = isSecretMask(incoming.password) || incoming.password === ''
                ? undefined
                : incoming.password;
            return { ...incoming, password };
        }
        case 's3': {
            const secretAccessKey = isSecretMask(incoming.secretAccessKey) ? '' : incoming.secretAccessKey;
            return { ...incoming, secretAccessKey };
        }
        default: {
            const _exhaustive = incoming;
            return _exhaustive;
        }
    }
}
//# sourceMappingURL=target-secrets.js.map