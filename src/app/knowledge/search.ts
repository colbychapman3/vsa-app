// Offline keyword search over the knowledge pack (assets/knowledge/index.json, built by
// scripts/build-knowledge.mjs). Pure: no UI, no storage, no AI. Deterministic: equal scores keep document order.
// Answers are the pack's own passages with their citation; no result means "not found", never a guess.

export type Chunk = { id: string; doc: string; cite: string; heading: string; text: string; words: number; flag?: string };
export type KnowledgeIndex = {
  version: number; builtAt: string; contentHash: string;
  sources: { doc: string; file: string; note: string; flag?: string; passages: number }[];
  chunks: Chunk[];
  terms: Record<string, [number, number][]>; // token -> [[chunk number, weighted count]]
};
export type Hit = { chunk: Chunk; score: number; matched: string[] };
export type Result = { hits: Hit[]; related: Hit[]; tokens: string[]; message: string | null }; // related: weaker matches, shown only when there are no hits

export const NOT_FOUND = 'Not found in the loaded documents.';
export const COVERAGE = 0.6; // a passage must contain at least this share of the query's words

// Mirrors the tokenizer in scripts/build-knowledge.mjs; tests/knowledge.test.ts checks the two agree.
const STOP = new Set('a an and are as at be by can do does for from has have how i if in is it its me of on or so than that the then there these this to was we what when where which who why will with you your go goes get'.split(' '));
const stem = (w: string) => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') ? w.slice(0, -1) : w);
export const tokens = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && (w.length > 1 || /\d/.test(w)) && !STOP.has(w)).map(stem);

// Words people type that the documents spell another way (query side only; the index is unchanged). A group matches a
// passage if any spelling is in it. Kept to abbreviations: a looser link (parked ~ park) lets unrelated passages pass.
const SAME: string[][] = [['ev', 'evs', 'bev', 'bevs', 'electric']];
const groupOf = (t: string) => SAME.find((g) => g.includes(t)) ?? [t];

export function search(index: KnowledgeIndex, query: string, limit = 10): Result {
  const q = [...new Set(tokens(query))];
  if (!q.length) return { hits: [], related: [], tokens: q, message: query.trim() ? NOT_FOUND : null };
  const groups = [...new Map(q.map((t) => { const g = groupOf(t); return [g.join('|'), g] as const; })).values()];
  const n = index.chunks.length;
  const score = new Map<number, { s: number; groups: number; matched: string[] }>();
  for (const g of groups) {
    const best = new Map<number, { s: number; matched: string }>(); // per passage: the best spelling in this group
    for (const t of g) {
      const posting = index.terms[t];
      if (!posting) continue;
      const idf = Math.log(1 + n / posting.length);
      for (const [c, tf] of posting) {
        const v = idf * (1 + Math.log(tf));
        if (!best.has(c) || v > best.get(c)!.s) best.set(c, { s: v, matched: t });
      }
    }
    for (const [c, b] of best) {
      const cur = score.get(c) ?? { s: 0, groups: 0, matched: [] };
      cur.s += b.s; cur.groups += 1; cur.matched.push(b.matched);
      score.set(c, cur);
    }
  }
  const need = Math.max(1, Math.ceil(COVERAGE * groups.length));
  const ranked = [...score.entries()].sort((a, b) => b[1].s - a[1].s || a[0] - b[0]); // ties: document order
  const toHit = ([c, v]: [number, { s: number; matched: string[] }]): Hit => ({ chunk: index.chunks[c], score: v.s, matched: v.matched });
  const hits = ranked.filter(([, v]) => v.groups >= need).slice(0, limit).map(toHit);
  const related = hits.length ? [] : ranked.slice(0, 3).map(toHit); // weaker: at least one word, not an answer
  return { hits, related, tokens: [...new Set(groups.flat())], message: hits.length ? null : NOT_FOUND };
}

// Text split into plain and matching pieces, for highlighting.
export function segments(text: string, toks: string[]): { t: string; hit: boolean }[] {
  const want = new Set(toks);
  return text.split(/([A-Za-z0-9]+)/).filter((s) => s !== '').map((s) => ({ t: s, hit: /^[A-Za-z0-9]+$/.test(s) && tokens(s).some((x) => want.has(x)) }));
}

// A short excerpt around the first matching word (whole words only).
export function snippet(text: string, toks: string[], max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const want = new Set(toks);
  const m = [...flat.matchAll(/[A-Za-z0-9]+/g)].find((x) => tokens(x[0]).some((t) => want.has(t)));
  const at = m?.index ?? 0;
  let start = Math.max(0, at - Math.floor(max / 4));
  if (start > 0) { const sp = flat.indexOf(' ', start); start = sp < 0 || sp > at ? start : sp + 1; }
  let end = Math.min(flat.length, start + max);
  if (end < flat.length) { const sp = flat.lastIndexOf(' ', end); end = sp > start ? sp : end; }
  return `${start > 0 ? '… ' : ''}${flat.slice(start, end)}${end < flat.length ? ' …' : ''}`;
}
