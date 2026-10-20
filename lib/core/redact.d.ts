/**
 * Credential redaction for plaintext snapshots, API responses and logs (H-04, H-05).
 */
export declare const REDACTED = "***";
/** Strip URL userinfo. `ssh://git@host` (user only, no secret) is kept. */
export declare function stripUrlCredentials(text: string): string;
export declare function redactText(text: string): string;
export declare function containsCredentials(text: string): boolean;
/** Deep copy with credential-looking strings and secret-named keys redacted. */
export declare function redactDeep<T>(value: T, depth?: number): T;
/** Text redaction for one collected file; null when unchanged or not text. */
export declare function redactFileData(data: Buffer, maxBytes?: number): Buffer | null;
//# sourceMappingURL=redact.d.ts.map