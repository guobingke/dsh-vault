/**
 * Credential redaction for plaintext snapshots, API responses and logs (H-04, H-05).
 */

/** `scheme://user:pass@host` / `https://TOKEN@host` → credentials removed. */
const URL_USERINFO = /\b((?:git\+)?(?:https?|ssh|git|ftp|s3|webdav|davs?):\/\/)([^\s/?#@"'<>]+)@/gi

/** Well-known token shapes (GitHub, GitLab, npm, Slack, AWS, OpenAI/DeepSeek-style keys, JWT-ish bearer). */
const TOKEN_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
  /\bnpm_[A-Za-z0-9]{30,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /(_authToken\s*=\s*)[^\s"']+/gi,
  /(authorization:\s*(?:bearer|token|basic)\s+)[^\s"']+/gi,
]

export const REDACTED = '***'

/** Strip URL userinfo. `ssh://git@host` (user only, no secret) is kept. */
export function stripUrlCredentials(text: string): string {
  return text.replace(URL_USERINFO, (m, scheme: string, info: string) => {
    if (/^ssh:\/\//i.test(scheme) || /^git\+ssh/i.test(scheme)) {
      return info.includes(':') ? `${scheme}${info.split(':')[0]}@` : m
    }
    return scheme
  })
}

export function redactText(text: string): string {
  let out = stripUrlCredentials(text)
  for (const re of TOKEN_PATTERNS) {
    out = out.replace(re, (m, prefix?: string) => (typeof prefix === 'string' && prefix && m.startsWith(prefix) ? `${prefix}${REDACTED}` : REDACTED))
  }
  return out
}

export function containsCredentials(text: string): boolean {
  return redactText(text) !== text
}

const SECRET_KEY = /^(password|passwd|passphrase|secret|secretAccessKey|accessKeyId|accessKey|token|apiKey|api_key|authToken|_authToken|authorization|privateKey|clientSecret)$/i

/** Deep copy with credential-looking strings and secret-named keys redacted. */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 40) return value
  if (typeof value === 'string') return redactText(value) as T
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as T
  if (value && typeof value === 'object' && !(value instanceof Buffer)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) && typeof v === 'string' && v && v !== REDACTED ? REDACTED : redactDeep(v, depth + 1)
    }
    return out as T
  }
  return value
}

/** Text redaction for one collected file; null when unchanged or not text. */
export function redactFileData(data: Buffer, maxBytes = 4 * 1024 * 1024): Buffer | null {
  if (data.length === 0 || data.length > maxBytes || data.includes(0)) return null
  const text = data.toString('utf8')
  const next = redactText(text)
  return next === text ? null : Buffer.from(next, 'utf8')
}
