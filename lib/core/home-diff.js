import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { walkHome } from './home-scope.js';
const EXPECTED = [
    { re: /^profiles\/[^/]+\/package\.json$/, why: 'local plugin specs are rewritten to the restored plugin-sources/ copies' },
    { re: /^profiles\/[^/]+\/pnpm-lock\.yaml$/, why: 'pnpm re-resolves the rewritten local specs' },
    { re: /^profiles\/[^/]+\/\.plugin-manager\//, why: 'plugin manager state written by the install on this machine' },
];
function expectedWhy(rel) {
    return EXPECTED.find((e) => e.re.test(rel))?.why;
}
async function sha(abs) {
    const h = createHash('sha256');
    await new Promise((resolve, reject) => {
        createReadStream(abs).on('data', (c) => h.update(c)).on('end', () => resolve()).on('error', reject);
    });
    return h.digest('hex');
}
async function listing(dshHome, agentsHome, opts) {
    const files = await walkHome(dshHome, opts);
    if (agentsHome) {
        files.push(...(await walkHome(join(agentsHome, 'skills'), opts, 'agents-home/skills')));
        try {
            if ((await stat(join(agentsHome, 'AGENTS.md'))).isFile())
                files.push({ rel: 'agents-home/AGENTS.md', abs: join(agentsHome, 'AGENTS.md') });
        }
        catch {
            // none
        }
    }
    return new Map(files.map((f) => [f.rel, f.abs]));
}
export async function diffHomes(input) {
    const opts = { includeSecrets: input.includeSecrets };
    const a = await listing(input.homeA, input.agentsA, opts);
    const b = await listing(input.homeB, input.agentsB, opts);
    const out = { homeA: input.homeA, homeB: input.homeB, identical: 0, onlyInA: [], onlyInB: [], changed: [], expected: [], clean: true };
    const all = [...new Set([...a.keys(), ...b.keys()])].sort();
    for (const rel of all) {
        const pa = a.get(rel);
        const pb = b.get(rel);
        let kind;
        if (pa && pb)
            kind = (await sha(pa)) === (await sha(pb)) ? 'same' : 'changed';
        else
            kind = pa ? 'onlyA' : 'onlyB';
        if (kind === 'same') {
            out.identical++;
            continue;
        }
        const why = expectedWhy(rel);
        if (why) {
            out.expected.push({ path: rel, why });
            continue;
        }
        if (kind === 'onlyA')
            out.onlyInA.push(rel);
        else if (kind === 'onlyB')
            out.onlyInB.push(rel);
        else
            out.changed.push(rel);
    }
    out.clean = out.onlyInA.length === 0 && out.onlyInB.length === 0 && out.changed.length === 0;
    return out;
}
export function formatHomeDiff(d) {
    const lines = [];
    lines.push(`A: ${d.homeA}`, `B: ${d.homeB}`, `identical files: ${d.identical}`);
    const section = (title, items) => {
        lines.push(`${title}: ${items.length}`);
        for (const i of items)
            lines.push(`  ${i}`);
    };
    section('only in A', d.onlyInA);
    section('only in B', d.onlyInB);
    section('content differs', d.changed);
    lines.push(`expected differences (rewritten by restore): ${d.expected.length}`);
    for (const e of d.expected)
        lines.push(`  ${e.path}  — ${e.why}`);
    lines.push(d.clean ? 'RESULT: identical (except documented excludes / expected rewrites)' : 'RESULT: DIFFERENT');
    return `${lines.join('\n')}\n`;
}
//# sourceMappingURL=home-diff.js.map