// Knowledge pack: the build is reproducible and current, every passage is cited, search finds the
// SOP sample questions, and says "not found" when the pack has no answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NOT_FOUND, search, segments, snippet, tokens, type KnowledgeIndex } from '../src/app/knowledge/search.ts';

const PATH = new URL('../assets/knowledge/index.json', import.meta.url);
const index = JSON.parse(readFileSync(PATH, 'utf8')) as KnowledgeIndex;
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

function build(out: string, date: string) {
  execFileSync(process.execPath, ['scripts/build-knowledge.mjs', '--date', date, '--out', out], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
  return readFileSync(out);
}

test('the build is reproducible and the committed pack is current (same sources, same bytes)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-know-'));
  try {
    const a = build(join(dir, 'a.json'), index.builtAt), b = build(join(dir, 'b.json'), index.builtAt);
    assert.equal(sha(a), sha(b));
    assert.equal(sha(a), sha(readFileSync(PATH)), 'assets/knowledge/index.json is stale: run node scripts/build-knowledge.mjs');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pack size is reported and under 15 MB; it records a build date and source hash', () => {
  const bytes = statSync(PATH).size;
  console.log(`knowledge pack: ${index.chunks.length} passages, ${(bytes / 1024).toFixed(0)} KB, built ${index.builtAt}`);
  assert.ok(bytes < 15 * 1024 * 1024);
  assert.match(index.builtAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(index.contentHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(index.sources.map((s) => s.doc), ['SOP Ver. 2024', 'Operating Protocol v1.1', 'VSA Glossary v1.1', 'Stevedoring Operations Reference (rev. 2)']);
});

test('every passage has a document and a chapter/section citation', () => {
  for (const c of index.chunks) {
    assert.ok(c.doc && c.text.trim() && c.heading, c.id);
    assert.ok(c.cite.startsWith(`${c.doc}, `) && c.cite.length > c.doc.length + 4, c.cite);
    if (c.doc === 'SOP Ver. 2024') assert.match(c.cite, /, (Ch\. \d|Front matter|Document Overview)/, c.cite);
    if (c.doc === 'Operating Protocol v1.1') assert.match(c.cite, /, (§\d|Appendix [A-E]|Front matter|Standard Start Command)/, c.cite);
    if (c.doc === 'VSA Glossary v1.1') assert.match(c.cite, /, (§\d|Front matter)/, c.cite);
    assert.ok(c.words <= 320, `${c.cite} has ${c.words} words`);
  }
});

test('the operations reference is marked superseded where it conflicts with Protocol Appendix C, on its source and every passage', () => {
  const flag = 'Superseded where it conflicts with Protocol Appendix C.';
  const src = index.sources.find((s) => s.doc.startsWith('Stevedoring'))!;
  assert.equal(src.flag, flag);
  const ops = index.chunks.filter((c) => c.doc === src.doc);
  assert.ok(ops.length > 0 && ops.every((c) => c.flag === flag));
  assert.ok(index.chunks.filter((c) => c.doc !== src.doc).every((c) => !c.flag));
  // A search that reaches the old Southside list shows the flag on that result.
  const r = search(index, 'Southside 30 min before break Zone 1 MBZ Zone T Zone V');
  assert.ok(r.hits.some((h) => h.chunk.flag === flag), 'the flagged passage is reachable and carries its flag');
});

test('glossary rows keep their Status', () => {
  const src = readFileSync(new URL('../docs/knowledge-src/VSA-Glossary.md', import.meta.url), 'utf8').split(/\r?\n/);
  const rows = src.filter((l) => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l) && !/^\| (Term|Abbreviation) /.test(l));
  const packed = index.chunks.filter((c) => c.doc === 'VSA Glossary v1.1').flatMap((c) => c.text.split('\n')).filter((l) => l.startsWith('Term: '));
  assert.equal(packed.length, rows.length);
  assert.ok(packed.every((l) => /; Status: (Confirmed|Industry|Needs definition)/.test(l)), 'a glossary row lost its Status');
});

// The four sample questions from the spec (SOP Ver. 2024).
const QUESTIONS: [string, string, RegExp][] = [
  ['20 km/h hold speed limit', 'Ch. 2 §2', /20 km\/h/],
  ['BEV report threshold (50 C)', 'Ch. 4 §2', /50°C/],
  ['belt scrapping cut size', 'Ch. 3 §3', /Cut damage > 2mm width or > 10mm length/],
  ['which label goes on a low-clearance sports car', 'Ch. 4 §3', /LOW SPOILER/],
];
for (const [q, where, fact] of QUESTIONS) {
  test(`SOP question "${q}" returns ${where} in the top 3 with the quoted fact`, () => {
    const r = search(index, q);
    const i = r.hits.findIndex((h) => h.chunk.cite.includes(`SOP Ver. 2024, ${where},`));
    console.log(`"${q}" -> rank ${i + 1}: ${r.hits[0]?.chunk.cite}`);
    assert.ok(i >= 0 && i < 3, r.hits.map((h) => h.chunk.cite).join(' | '));
    assert.match(r.hits[i].chunk.text, fact);
  });
}

test('known facts from the protocol and glossary are found', () => {
  assert.ok(search(index, 'clear-by rule Northside 15 min Southside 30 min').hits.slice(0, 3).some((h) => /Operating Protocol v1.1, §7\.3/.test(h.chunk.cite)));
  assert.match(search(index, 'MB Field alone means').hits[0].chunk.text, /MBZ/);
});

test('nonsense and off-topic queries say not found, never a guess', () => {
  for (const q of ['xyzzy plugh', 'quantum flux capacitor', 'what is the crane capacity at berth 2']) {
    const r = search(index, q);
    assert.deepEqual([r.hits.length, r.message], [0, NOT_FOUND], q);
  }
  assert.equal(NOT_FOUND, 'Not found in the loaded documents.');
  assert.deepEqual(search(index, '   '), { hits: [], related: [], tokens: [], message: null }); // nothing typed: no message
  assert.equal(search(index, 'the of and').message, NOT_FOUND); // only filler words
});

test('ranking is deterministic, and equal scores keep document order', () => {
  const a = search(index, 'hold speed limit');
  assert.deepEqual(search(index, 'hold speed limit'), a);
  for (let i = 1; i < a.hits.length; i++) {
    const [p, q] = [a.hits[i - 1], a.hits[i]];
    assert.ok(p.score > q.score || (p.score === q.score && index.chunks.indexOf(p.chunk) < index.chunks.indexOf(q.chunk)));
  }
});

test('the search tokenizer matches the one that built the keyword index', () => {
  index.chunks.forEach((c, n) => {
    const tf: Record<string, number> = {};
    for (const t of [...tokens(c.text), ...tokens(c.heading), ...tokens(c.heading)]) tf[t] = (tf[t] ?? 0) + 1;
    for (const [t, k] of Object.entries(tf)) assert.ok(index.terms[t]?.some(([cn, ck]) => cn === n && ck === k), `${c.id}: ${t}`);
  });
  assert.equal(Object.values(index.terms).reduce((s, p) => s + p.length, 0), index.chunks.reduce((s, c, n) => { const set = new Set([...tokens(c.text), ...tokens(c.heading)]); return s + set.size; }, 0));
});

test('highlight and snippet use whole words only and keep the passage text', () => {
  const t = 'Strict 20 km/h (12 mph) speed limit inside cargo holds.';
  const toks = tokens('hold speed');
  assert.deepEqual(segments(t, toks).filter((s) => s.hit).map((s) => s.t), ['speed', 'holds']);
  assert.equal(segments(t, toks).map((s) => s.t).join(''), t);
  const long = `${'alpha beta '.repeat(40)}the BEV showing temperature above 50 degrees ${'gamma delta '.repeat(40)}`;
  const s = snippet(long, tokens('bev'), 120);
  assert.match(s, /BEV/);
  assert.ok(s.length <= 130 && s.startsWith('… ') && s.endsWith(' …'), s);
  assert.equal(snippet('short text', tokens('short')), 'short text');
});

test('the pack holds no credentials', () => {
  assert.doesNotMatch(index.chunks.map((c) => c.text).join('\n'), /password|passwd|api[_ -]?key|secret|bearer |sk-[A-Za-z0-9]{10}/i);
});

test('EV and parking words: EV/BEV/electric find the BEV passage; near-misses are labeled related, never hits', () => {
  const cites = (q: string) => search(index, q).hits.map((h) => h.chunk.cite);
  for (const q of ['EV', 'EVs safety', 'electric vehicle', 'BEV temperature']) assert.ok(cites(q).some((c) => c.includes('Battery Electric Vehicle (BEV) Safety')), q);
  // The pack says nothing about where EVs park: no hit may claim to answer that; only a labeled related list.
  const r = search(index, 'hybrid charging station location');
  assert.deepEqual(r.hits, []);
  assert.equal(r.message, NOT_FOUND);
  const none = search(index, 'zebra unicorn xylophone');
  assert.deepEqual([none.hits, none.related], [[], []]);
  assert.ok(search(index, 'where can EV cars be parked').tokens.includes('bev'), 'matched spellings are highlighted');
});
