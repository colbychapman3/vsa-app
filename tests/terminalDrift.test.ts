// src/engine/terminal.ts is the one code source for destination sides, pre-break cutoffs and berth miles.
// The same facts also live in text the app searches or Colby reads. The Zone 7-9 correction (2026-10-05)
// had to touch six places by hand; these tests read the other copies and fail when one disagrees.
// The PDF itself can't be parsed here: if the text copy and the PDF ever differ, the PDF wins (see CLAUDE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TERMINAL } from '../src/engine/terminal.ts';

const read = (p: string) => readFileSync(new URL(`../docs/${p}`, import.meta.url), 'utf8');
const sideOf = (s: 'N' | 'S') => (s === 'S' ? 'Southside' : 'Northside');
const miles = (s: string) => Number(s.replace(/\(.*\)/, '').replace('mi', '').trim().replace(/^\./, '0.'));
type C = Record<string, { side: string; cutoff: number }>;
type D = Record<string, number[]>;

// Protocol text copy (extracted from the PDF): one value per line.
function pdfText(): { c: C; d: D } {
  const lines = read('14_Operating_Protocol_v1.1_TEXT.md').split('\n').map((l) => l.trim());
  const iC = lines.findIndex((l) => /^Appendix C/.test(l)), iD = lines.findIndex((l) => /^Appendix D/.test(l));
  const c: C = {}, d: D = {};
  for (let i = iC; i < iD; i++) if (/^(Northside|Southside)$/.test(lines[i + 1] ?? '') && /^\d+ min$/.test(lines[i + 2] ?? '')) c[lines[i]] = { side: lines[i + 1], cutoff: parseInt(lines[i + 2]) };
  for (let i = iD; i < lines.length; i++) if ([1, 2, 3].every((k) => /mi$/.test(lines[i + k] ?? '')) && !/mi$/.test(lines[i])) d[lines[i].replace(/\s*\*$/, '')] = [1, 2, 3].map((k) => miles(lines[i + k]));
  return { c, d };
}
// Knowledge copy (what the in-app search reads): markdown tables.
function knowledgeTables(): { c: C; d: D; text: string } {
  const text = read('knowledge-src/VSA-Operating-Protocol-v1.1.md'), md = text.split(/\r?\n/);
  const rows = (from: RegExp, to: RegExp) => {
    const a = md.findIndex((l) => from.test(l)), b = md.findIndex((l, i) => i > a && to.test(l));
    return md.slice(a, b < 0 ? undefined : b).filter((l) => l.startsWith('|') && !/^\|[-| ]+\|$/.test(l)).slice(1).map((l) => l.split('|').slice(1, -1).map((x) => x.trim()));
  };
  const c: C = {}, d: D = {};
  for (const r of rows(/^## Appendix C/, /^## Appendix D/)) c[r[0]] = { side: r[1], cutoff: parseInt(r[2]) };
  for (const r of rows(/^## Appendix D/, /^## (?!Appendix D)/)) d[r[0].replace(/\s*\(first-issue.*\)$/, '')] = [r[1], r[2], r[3]].map(miles);
  return { c, d, text };
}

const expectC = (): C => Object.fromEntries(TERMINAL.map((t) => [t.name, { side: sideOf(t.side), cutoff: t.clearBy }]));
const expectD = (): D => Object.fromEntries(TERMINAL.map((t) => [t.name, t.miles]));

test('protocol text copy: Appendix C sides and cutoffs equal terminal.ts', () => assert.deepEqual(pdfText().c, expectC()));
test('protocol text copy: Appendix D berth miles equal terminal.ts', () => assert.deepEqual(pdfText().d, expectD()));
test('knowledge copy: Appendix C sides and cutoffs equal terminal.ts', () => assert.deepEqual(knowledgeTables().c, expectC()));
test('knowledge copy: Appendix D berth miles equal terminal.ts', () => assert.deepEqual(knowledgeTables().d, expectD()));

// "Southside, 30-minute cutoff: Zone 1 (MB Field); MBZ (Mercedes); Zones T, V, X, B; Sites 5, 6; Gate 2." in the protocol,
// and a shorter list in the operations reference. Parsed into destination names and compared with terminal.ts.
const SOUTH = TERMINAL.filter((t) => t.side === 'S').map((t) => t.name);
function expand(list: string): string[] {
  return list.split(/;|,(?![^(]*\))/).flatMap((part) => {
    const m = /^\s*(Zones|Sites)\s+(.+)$/.exec(part);
    return m ? m[2].split(/,|\band\b/).map((x) => `${m[1] === 'Zones' ? 'Zone' : 'Site'} ${x.trim()}`).filter((x) => x.length > 6) : [part.trim()];
  }).filter(Boolean);
}
test('protocol prose: the Southside list names exactly the Southside destinations', () => {
  const m = /\*\*Southside, 30-minute cutoff:\*\*\s*([^\n]+?)\.\s*\n/.exec(knowledgeTables().text);
  assert.ok(m, 'the Southside line was found');
  // Zones T, V, X, B written as "Zones T, V, X, B": bare letters after the first need the word restored.
  const names = m[1].replace(/Zones ([A-Z](?:, [A-Z])*)/, (_, ls: string) => ls.split(', ').map((l) => `Zone ${l}`).join('; ')).replace(/Sites (\d(?:, \d)*)/, (_, ns: string) => ns.split(', ').map((n) => `Site ${n}`).join('; '));
  assert.deepEqual(expand(names).sort(), [...SOUTH].sort());
});

// The operations reference (also read by the in-app search) lists the Southside lots in prose. It once named only four;
// Colby confirmed 2026-10-05 that Appendix C's nine are right and the reference was corrected.
test('operations reference: its Southside list names exactly the Southside destinations', () => {
  const m = /\*\*Southside — 30 min before break:\*\*\s*([^\n]+?)\.\s*Stop at/.exec(read('knowledge-src/02-Stevedoring-Operations-Reference.md'));
  assert.ok(m, 'the Southside line was found');
  const listed = m[1].split(/,(?![^(]*\))/).map((x) => x.trim());
  assert.deepEqual([...listed].sort(), [...SOUTH].sort());
});

test('the drift tests would catch a changed copy (made-up)', () => {
  const bad = expectD();
  bad['Zone 7'] = [1.5, 1.5, 1.7];
  assert.notDeepEqual(pdfText().d, bad);
  assert.notDeepEqual(knowledgeTables().c, { ...expectC(), 'Zone X': { side: 'Northside', cutoff: 15 } });
});
