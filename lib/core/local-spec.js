import path from 'node:path';
import { homedir } from 'node:os';
const TARBALL_RE = /\.(tgz|tar\.gz|tar)$/i;
export function isTarballPath(p) {
    return TARBALL_RE.test(p.trim());
}
/** `C:\x`, `C:/x`, `\\server\share`. */
export function isWindowsAbsPath(p) {
    return /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\[^\\]/.test(p);
}
/** `/x` but not `//server/share` (which is Windows UNC, not POSIX). */
export function isPosixAbsPath(p) {
    return p.startsWith('/') && !p.startsWith('//');
}
/** Normalize the platform names written by older snapshots and Node. */
export function normalizePlatformName(value) {
    const v = value?.trim().toLowerCase();
    if (!v)
        return undefined;
    if (v === 'windows' || v === 'win' || v === 'win32')
        return 'win32';
    if (v === 'mac' || v === 'macos' || v === 'osx' || v === 'darwin')
        return 'darwin';
    if (v === 'linux')
        return 'linux';
    return v;
}
/** True when both platforms are known and differ after normalization. */
export function platformsDiffer(sourcePlatform, targetPlatform) {
    const source = normalizePlatformName(sourcePlatform);
    const target = normalizePlatformName(targetPlatform);
    return Boolean(source && target && source !== target);
}
/**
 * A local path that belongs to another operating system and cannot be opened here.
 * Relative paths and `~/...` stay portable and are deliberately excluded.
 */
export function isForeignLocalPath(p, sourcePlatform, targetPlatform = process.platform) {
    const source = normalizePlatformName(sourcePlatform);
    const target = normalizePlatformName(targetPlatform);
    if (!source || !target)
        return false;
    if (source === target)
        return false;
    return source === 'win32' ? isWindowsAbsPath(p) : isPosixAbsPath(p);
}
export function parseLocalSpec(spec) {
    if (!spec)
        return null;
    const raw = spec.trim();
    const m = raw.match(/^(link|file|portal|workspace|catalog):(.*)$/i);
    if (!m) {
        // Bare tarball paths ("./x.tgz", "C:\\x.tgz") are also local installs.
        if (isTarballPath(raw) && (isWindowsAbsPath(raw) || /^(\.{1,2}[\\/]|[\\/]|~[\\/])/.test(raw))) {
            return { kind: 'path', protocol: 'file', raw, path: raw, tarball: true };
        }
        return null;
    }
    const protocol = m[1].toLowerCase();
    let rest = m[2];
    if (protocol === 'workspace' || protocol === 'catalog')
        return { kind: 'unsupported', protocol, raw };
    // file:///C:/x or file:///home/x (URL form)
    if (/^\/\/\//.test(rest)) {
        rest = rest.slice(2);
        if (/^\/[a-zA-Z]:[\\/]/.test(rest))
            rest = rest.slice(1);
        try {
            rest = decodeURIComponent(rest);
        }
        catch {
            // keep as is
        }
    }
    return { kind: 'path', protocol: protocol, raw, path: rest, tarball: isTarballPath(rest) };
}
/**
 * Absolute path a local spec refers to, as pnpm would resolve it from `profileDir`.
 * Works on Windows-style strings even when running on POSIX (tests), and vice versa.
 */
export function resolveLocalSpecPath(specPath, profileDir, opts = {}) {
    const platform = opts.platform ?? process.platform;
    const win = platform === 'win32' || isWindowsAbsPath(profileDir);
    const P = win ? path.win32 : path.posix;
    let p = specPath.trim();
    if (p === '~' || p.startsWith('~/') || p.startsWith('~\\'))
        p = P.join(opts.home ?? homedir(), p.slice(1));
    if (win) {
        if (isWindowsAbsPath(p))
            return P.normalize(p);
        if (p.startsWith('/') && !p.startsWith('//'))
            return P.normalize(p); // drive-relative; rare
        return P.resolve(profileDir, p);
    }
    if (isWindowsAbsPath(p))
        return path.win32.normalize(p); // a machine-1 Windows path seen on POSIX: keep it, it just won't exist
    return P.resolve(profileDir, p);
}
/** Path string for a spec written into package.json (pnpm accepts forward slashes everywhere). */
export function specPath(abs) {
    return abs.replace(/\\/g, '/');
}
function firstMatch(text, re) {
    const m = text.match(re);
    return m?.[1];
}
/**
 * Classify raw pnpm / dsh output for one plugin. `ownPaths` are this plugin's own
 * local source paths; an ENOENT for any other path means another dependency in the
 * same manifest broke the install.
 */
export function classifyInstallFailure(detail, ownPaths = [], name) {
    const text = detail ?? '';
    const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
    const own = ownPaths.map(norm);
    const enoent = firstMatch(text, /ENOENT[^'"\n]*?['"]([^'"\n]+)['"]/) ??
        firstMatch(text, /Could not install from ["']([^"'\n]+)["'] as it does not exist/);
    if (enoent) {
        const n = norm(enoent);
        const isOwn = own.some((p) => n === p || n.startsWith(`${p}/`));
        if (!isOwn) {
            return { reason: 'blocked-by-other', subject: enoent, summary: `blocked by another dependency that cannot be resolved here: ${enoent}` };
        }
        return { reason: isTarballPath(enoent) ? 'tarball-missing' : 'local-source-missing', subject: enoent, summary: `local source missing: ${enoent}` };
    }
    if (/spawn git ENOENT|Command failed with ENOENT: git|'git' 不是内部或外部命令|'git' is not recognized|git: (command )?not found|git: No such file/i.test(text)) {
        return { reason: 'git-missing', subject: name, summary: 'git is required to install this plugin from GitHub but was not found' };
    }
    const gitRepo = firstMatch(text, /git ls-remote (\S+)/) ?? firstMatch(text, /(https:\/\/codeload\.github\.com\/[^\s/]+\/[^\s/]+)/);
    if (gitRepo && /ERR_PNPM_FETCH_404|404|Repository not found|could not read Username|Authentication failed|exit code 128|fatal:/i.test(text)) {
        return { reason: 'git-unavailable', subject: gitRepo, summary: `the git repository is not reachable: ${gitRepo}` };
    }
    if (/ERR_PNPM_NO_MATCHING_VERSION|No matching version found|npm ERR! 404|ERR_PNPM_FETCH_404|E404|is not in the npm registry|404 Not Found|Not Found - 404/i.test(text)) {
        const pkg = firstMatch(text, /GET https?:\/\/[^/\s]+\/([^\s:]+)/) ?? name;
        let subject = pkg;
        try {
            subject = pkg ? decodeURIComponent(pkg) : pkg;
        }
        catch { /* keep */ }
        return { reason: 'registry-not-found', subject, summary: `not found in the npm registry${subject ? `: ${subject}` : ''}` };
    }
    if (/不是内部或外部命令|is not recognized as an internal or external command|command not found|spawn \S+ ENOENT|pnpm was not found|no dsh carrier/i.test(text)) {
        return { reason: 'installer-missing', summary: 'pnpm / dsh installer not found on this machine' };
    }
    if (/ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ERR_PNPM_META_FETCH_FAIL|socket hang up|network/i.test(text)) {
        return { reason: 'network', summary: 'network error while contacting the npm registry' };
    }
    if (/allow-version|incompatible/i.test(text)) {
        return { reason: 'incompatible', summary: 'plugin version is not compatible with this dsh version' };
    }
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const err = lines.find((l) => /ERR_|error|failed/i.test(l)) ?? lines[0] ?? 'install failed';
    return { reason: 'unknown', summary: err.slice(0, 200) };
}
/* --------------------------------------------------------------------------
 * Windows console output: cmd.exe / pnpm on a Chinese system print GBK (cp936).
 * ------------------------------------------------------------------------ */
export function decodeConsoleOutput(buf, platform = process.platform) {
    if (buf.length === 0)
        return '';
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    }
    catch {
        if (platform === 'win32') {
            try {
                return new TextDecoder('gb18030').decode(buf);
            }
            catch {
                // ICU without gb18030 — fall through
            }
        }
        return buf.toString('utf8');
    }
}
/** git+…, github:/gitlab:/bitbucket:, owner/repo shorthand, or an http(s) tarball URL. */
export function isRemoteNonRegistrySpec(spec) {
    if (!spec)
        return false;
    const s = spec.replace(/^npm:[^@]+@/, '');
    if (/^(git\+|git:|github:|gitlab:|bitbucket:|gist:)/i.test(s))
        return true;
    if (/^https?:\/\//i.test(s))
        return true;
    return /^[\w.-]+\/[\w.-]+(#.*)?$/.test(s) && !s.startsWith('@');
}
//# sourceMappingURL=local-spec.js.map