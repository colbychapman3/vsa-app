// Builds assets/knowledge/index.json from docs/knowledge-src/*.md (Brain exports, converted PDFs).
// Passages are cut at headings (about 150-300 words, long sections split at line boundaries), each with a
// citation, plus a keyword index. Deterministic: same sources and date give the same bytes.
//   node scripts/build-knowledge.mjs [--date YYYY-MM-DD] [--out path]
// The tokenizer below is mirrored in src/app/knowledge/search.ts; tests/knowledge.test.ts checks they agree.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SRC = 'docs/knowledge-src';
const MAX_WORDS = 300;

// Order is the tie-break order in search results (document order).
const SOURCES = [
  { file: 'sop-ver-2024.md', doc: 'SOP Ver. 2024', kind: 'sop', note: 'A markdown rendering without page numbers; the original PDF wins on any difference.' },
  { file: 'VSA-Operating-Protocol-v1.1.md', doc: 'Operating Protocol v1.1', kind: 'num', note: 'Converted from the PDF; the PDF wins on any difference. The Project Instructions (v2.1) outrank it.' },
  { file: 'VSA-Glossary.md', doc: 'VSA Glossary v1.1', kind: 'num', note: 'Status column kept: Confirmed, Industry or Needs definition. Colby’s current instruction and the SOPs outrank it.' },
  { file: '02-Stevedoring-Operations-Reference.md', doc: 'Stevedoring Operations Reference (rev. 2)', kind: 'plain', superseded: 'Superseded where it conflicts with Protocol Appendix C.', note: 'Older than the protocol. Where it disagrees with Protocol Appendix C (sides and cutoffs), Appendix C wins (Colby, 2026-09-30).' },
];

// ---- tokenizer (mirrored in src/app/knowledge/search.ts) ----
const STOP = new Set('a an and are as at be by can do does for from has have how i if in is it its me of on or so than that the then there these this to was we what when where which who why will with you your go goes get'.split(' '));
const stem = (w) => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') ? w.slice(0, -1) : w);
export const tokens = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && (w.length > 1 || /\d/.test(w)) && !STOP.has(w)).map(stem);

// ---- citations ----
function cite(kind, h2, h3) {
  const num = (h) => { const m = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(h); return m ? `§${m[1]} ${m[2]}` : h; };
  const app = (h) => { const m = /^(Appendix [A-Z]):\s*(.*)$/.exec(h); return m ? `${m[1]}, ${m[2]}` : num(h); };
  if (kind === 'sop') {
    const c = /^Chapter (\d+):\s*(.*)$/.exec(h2 ?? '');
    if (!c) return h2 ?? 'Front matter';
    if (!h3) return `Ch. ${c[1]}, ${c[2]}`;
    const s = /^(Section|Case) (\d+):\s*(.*)$/.exec(h3);
    return s ? `Ch. ${c[1]} ${s[1] === 'Section' ? `§${s[2]}` : `Case ${s[2]}`}, ${s[3]}` : `Ch. ${c[1]}, ${h3}`;
  }
  if (kind === 'num') return h3 ? app(h3) : h2 ? app(h2) : 'Front matter';
  return h3 ?? h2 ?? 'Front matter';
}

// ---- markdown to plain passage lines ----
const clean = (s) => s.replace(/\*\*|__|`/g, '').replace(/^(\s*)[-*]\s+/, '$1• ').replace(/^>\s*/, '').replace(/\s+$/, '');
function lines(body) {
  const out = []; let head = null;
  for (const raw of body) {
    const l = raw.trim();
    if (!l || /^---+$/.test(l) || l.startsWith('# ')) continue; // blank, rule, or the document title
    if (l.startsWith('|')) {
      const cells = l.replace(/^\||\|$/g, '').split('|').map((c) => clean(c.trim()));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator row
      if (!head) { head = cells; continue; }
      out.push(cells.map((c, i) => (c ? `${head[i] ?? ''}: ${c}` : '')).filter(Boolean).join('; '));
      continue;
    }
    head = null;
    out.push(clean(raw).trim());
  }
  return out.filter(Boolean);
}

export function build(date, srcDir = SRC) {
  const chunks = [], sources = [], hash = createHash('sha256');
  for (const src of SOURCES) {
    const bytes = readFileSync(`${srcDir}/${src.file}`);
    const text = bytes.toString('utf8').replace(/\r\n/g, '\n'); // a Windows checkout (CRLF) must build the same pack as Linux (LF)
    hash.update(src.file).update(text);
    // Split into sections at ## and ### headings.
    const secs = []; let h2 = null, h3 = null, cur = { h2, h3, body: [] };
    for (const l of text.split('\n')) {
      const m = /^(#{2,3})\s+(.*?)\s*$/.exec(l);
      if (m) {
        secs.push(cur);
        const title = clean(m[2]);
        if (m[1] === '##') { h2 = title; h3 = null; } else h3 = title;
        cur = { h2, h3, body: [] };
      } else cur.body.push(l);
    }
    secs.push(cur);
    let count = 0;
    for (const sec of secs) {
      const ls = lines(sec.body);
      if (!ls.length) continue;
      const label = cite(src.kind, sec.h2, sec.h3);
      const parts = []; let part = [], words = 0;
      for (const l of ls) {
        const w = l.split(/\s+/).length;
        if (part.length && words + w > MAX_WORDS) { parts.push(part); part = []; words = 0; }
        part.push(l); words += w;
      }
      parts.push(part);
      parts.forEach((p, i) => {
        const body = p.join('\n');
        chunks.push({
          id: `${src.file.replace(/\.md$/, '')}#${count++}`, doc: src.doc, cite: `${src.doc}, ${label}${parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : ''}`,
          heading: sec.h3 ?? sec.h2 ?? 'Front matter', text: body, words: body.split(/\s+/).length, ...(src.superseded ? { flag: src.superseded } : {}),
        });
      });
    }
    sources.push({ doc: src.doc, file: src.file, note: src.note, ...(src.superseded ? { flag: src.superseded } : {}), passages: count });
  }
  // Keyword index: token -> [[chunk number, count]]. Heading words count double (a heading hit matters more).
  const terms = {};
  chunks.forEach((c, n) => {
    const tf = {};
    for (const t of [...tokens(c.text), ...tokens(c.heading), ...tokens(c.heading)]) tf[t] = (tf[t] ?? 0) + 1;
    for (const [t, k] of Object.entries(tf)) (terms[t] ??= []).push([n, k]);
  });
  const sorted = Object.fromEntries(Object.keys(terms).sort().map((k) => [k, terms[k]]));
  return { version: 1, builtAt: date, contentHash: hash.digest('hex'), sources, chunks, terms: sorted };
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const date = arg('--date', new Date().toISOString().slice(0, 10));
  const out = arg('--out', 'assets/knowledge/index.json');
  const idx = build(date);
  const json = JSON.stringify(idx);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  const words = idx.chunks.map((c) => c.words);
  console.log(`${idx.chunks.length} passages from ${idx.sources.length} documents, ${(json.length / 1024).toFixed(0)} KB, ${Math.min(...words)}-${Math.max(...words)} words each, built ${date}, hash ${idx.contentHash.slice(0, 12)}`);
}
