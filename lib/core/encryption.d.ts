import type { EncryptionAlgorithm, KdfAlgorithm } from './types.js';
export declare const ENCRYPTION_MAGIC = "dsh-vault-encrypted";
export declare const ENCRYPTION_FORMAT_VERSION: 1;
export interface EncryptedEnvelope {
    magic: typeof ENCRYPTION_MAGIC;
    version: typeof ENCRYPTION_FORMAT_VERSION;
    algorithm: EncryptionAlgorithm;
    kdf: {
        name: KdfAlgorithm;
        salt: string;
        /** scrypt N or argon2 memoryCost */
        N?: number;
        r?: number;
        p?: number;
        /** argon2 timeCost */
        timeCost?: number;
        memoryCost?: number;
        parallelism?: number;
    };
    cipher: {
        nonce: string;
        tag: string;
        data: string;
    };
    /** SHA-256 of plaintext; never contains secrets in logs — callers must not print envelope.cipher. */
    plaintextSha256: string;
}
export interface EncryptOptions {
    password: string;
    kdf?: KdfAlgorithm;
    /** Injected for tests. */
    argon2Hash?: (password: string, salt: Buffer, opts: Argon2Params) => Promise<Buffer> | Buffer;
}
export interface Argon2Params {
    timeCost: number;
    memoryCost: number;
    parallelism: number;
    hashLength: number;
}
/** Encrypt plaintext bytes into a JSON-serializable envelope. */
export declare function encryptBytes(plain: Buffer, options: EncryptOptions): Promise<EncryptedEnvelope>;
/** Decrypt an envelope back to plaintext bytes. */
/** User-facing decryption failure (wrong/missing password, corrupted payload). */
export declare class VaultDecryptError extends Error {
    readonly code: 'BAD_PASSWORD' | 'PASSWORD_REQUIRED';
    constructor(message: string, code: 'BAD_PASSWORD' | 'PASSWORD_REQUIRED');
}
export declare function decryptBytes(envelope: EncryptedEnvelope, password: string, argon2Hash?: EncryptOptions['argon2Hash']): Promise<Buffer>;
export declare function serializeEnvelope(envelope: EncryptedEnvelope): Buffer;
export declare function parseEnvelope(buf: Buffer): EncryptedEnvelope;
/** Redact any string that looks like a secret before logging. */
export declare function redactForLog(value: unknown): unknown;
//# sourceMappingURL=encryption.d.ts.map