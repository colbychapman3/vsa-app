// Assistant (Phase 6d), pure. Routes a typed question to one fixed intent, fills the answer from the same view
// model the screens use, parses the three confirmable actions, and plans the 25-minute Plan reminders.
// The on-device model (if any) may only pick an intent from this list; it never writes an answer or a number.
import { formatHM, parseHM, type Baseline } from '../engine/index.ts';
import { TERMINAL, terminalInfo } from '../engine/terminal.ts';
import type { State } from '../storage/store.ts';
import { NOT_FOUND, search, type KnowledgeIndex } from './knowledge/search.ts';
import { decksView, hourlyView, planView, snapshot } from './view.ts';

export type Where = 'snap' | 'decks' | 'hourly' | 'plan';
export type Intent =
  | { k: 'remaining' } | { k: 'pace' } | { k: 'eta' } | { k: 'decks' } | { k: 'alerts' }
  | { k: 'deck'; deck: string }
  | { k: 'distance'; zone: string | null }
  | { k: 'clearby'; zone: string | null }
  | { k: 'knowledge'; q: string }
  | { k: 'missing'; what: string }; // a deck or zone that is not on this vessel / not in the directory
export type Answer = {
  title: string;
  lines: string[];
  tags: ('FORECAST' | 'CALCULATED')[];
  where: Where | null;                       // "Show me" target
  passages?: { cite: string; text: string; flag?: string }[];
};

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Zones ----------
// "Zone 1" is its own lot; "MB Field" said alone means MBZ (protocol glossary).
const ALIASES: [RegExp, string][] = [
  [/\bzone 1\b/, 'Zone 1 (MB Field)'], [/\b(mbz|mb field|mercedes)\b/, 'MBZ (Mercedes)'], [/\bbmw\b/, 'BMW Field'], [/\bavp\b/, 'AVP Yard'],
];
export function findZone(text: string): string | null {
  const t = norm(text);
  for (const [re, name] of ALIASES) if (re.test(t)) return name;
  const hit = TERMINAL.filter((d) => new RegExp(`\\b${norm(d.name.replace(/\s*\(.*\)/, ''))}\\b`).test(t)).sort((a, b) => b.name.length - a.name.length)[0];
  return hit?.name ?? null;
}
// "zone q", "zone z" etc. that look like a zone request but name nothing in the directory.
const zoneWord = (text: string) => /\b(zone|site|yard|gate)\s+\w+/i.exec(text)?.[0] ?? null;

// ---------- Intents ----------
export const QUICK: { label: string; ask: string }[] = [
  { label: 'Vessel remaining', ask: 'How many autos are remaining?' },
  { label: 'This hour / pace', ask: 'What is the pace this hour?' },
  { label: 'ETA', ask: 'What is the ETA?' },
  { label: 'Decks left', ask: 'Which decks are left?' },
  { label: 'Open alerts', ask: 'What alerts are open?' },
  { label: 'Distance to a zone', ask: 'Distance to ' },
];

const deckIn = (text: string, s: State): string | null | 'missing' => {
  const m = /\b(?:deck|dk|d)\s*0*(\d{1,2}|upp|upper)\b/i.exec(text);
  if (!m) return null;
  const want = m[1].toLowerCase().replace('upper', 'upp');
  const d = s.decks.find((x) => x.label.toLowerCase().replace(/^deck\s*/, '') === want || x.id.toLowerCase() === `d${want}` || x.id.toLowerCase() === want);
  return d ? d.id : 'missing';
};

export function routeQuestion(text: string, s: State): Intent {
  const t = norm(text);
  const d = deckIn(text, s);
  if (d === 'missing') return { k: 'missing', what: `${/\b(?:deck|dk|d)\s*\S+/i.exec(text)![0]} is not on this vessel.` };
  if (d) return { k: 'deck', deck: d };
  const zone = findZone(text);
  const zw = zoneWord(text);
  if (/\b(distance|miles?|mi|how far)\b/.test(t)) {
    if (!zone && zw) return { k: 'missing', what: `${zw} is not in the terminal directory.` };
    return { k: 'distance', zone };
  }
  if (/\b(clear by|clear-by|cutoff|cut off|clearby)\b/.test(t) || /clear.?by/.test(t)) return { k: 'clearby', zone };
  if (/\b(alert|alerts|discrepanc\w*|open issues?)\b/.test(t)) return { k: 'alerts' };
  if (/\b(eta|finish|finished|complete by|done by|when (will|do) we)\b/.test(t)) return { k: 'eta' };
  if (/\b(pace|h\.?a\.?|hourly average|this hour|per hour|rate)\b/.test(t)) return { k: 'pace' };
  if (/\b(decks? left|which decks|decks remaining|decks)\b/.test(t)) return { k: 'decks' };
  if (/\b(remaining|left|how many)\b/.test(t)) return { k: 'remaining' };
  return { k: 'knowledge', q: text };
}

// What the model may return (its whole output): an intent kind plus an optional deck or zone it must have copied.
export const INTENT_SCHEMA = {
  type: 'object', title: 'Intent', required: ['kind'],
  properties: {
    kind: { type: 'string', description: 'One of: remaining, pace, eta, decks, alerts, deck, distance, clearby, knowledge' },
    deck: { type: 'string', description: 'Deck label as the person wrote it, only for kind=deck' },
    zone: { type: 'string', description: 'Zone, site or yard name as the person wrote it, only for kind=distance or clearby' },
  },
};
// A model pick is used only if the kind is on the list and any deck or zone it names exists. Otherwise null (keyword search runs).
export function checkIntent(raw: unknown, s: State, question: string): Intent | null {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return null; } }
  if (!o || typeof o !== 'object') return null;
  const { kind, deck, zone } = o as Record<string, unknown>;
  switch (kind) {
    case 'remaining': case 'pace': case 'eta': case 'decks': case 'alerts': return { k: kind };
    case 'knowledge': return { k: 'knowledge', q: question };
    case 'deck': { const r = typeof deck === 'string' ? deckIn(`deck ${deck.replace(/^\s*deck\s*/i, '')}`, s) : null; return r && r !== 'missing' ? { k: 'deck', deck: r } : null; }
    case 'distance': case 'clearby': { const z = typeof zone === 'string' ? findZone(zone) : null; return z ? { k: kind, zone: z } : null; }
    default: return null;
  }
}

// ---------- Answers ----------
export function answer(i: Intent, s: State, b: Baseline, nowMin: number, index: KnowledgeIndex): Answer {
  const snap = () => snapshot(s, b, nowMin);
  switch (i.k) {
    case 'remaining': {
      const h = snap().hero;
      return { title: h.label === 'VESSEL REMAINING' ? 'Vessel remaining' : 'Field balance', lines: [`${h.value} ${h.of}`, ...(h.unknownNote ? [h.unknownNote] : []), ...h.rows.map((r) => `${r.k}: ${r.v}`)], tags: [], where: 'snap' };
    }
    case 'pace': {
      const ha = snap().ha, hv = hourlyView(s, b), last = hv.rows.at(-1);
      return {
        title: 'Pace', where: 'hourly', tags: ['CALCULATED'],
        lines: [
          last ? `Last logged hour ${last.range}: ${last.count} autos${last.short ? ` · ${last.short}` : ''}` : 'No hour logged yet.',
          ha.value === '—' ? `H.A.: unknown · ${ha.notes[0]}` : `H.A. ${ha.value}/hr · ${ha.notes[0]}`,
          hv.stats.pace === '—' ? `Pace: unknown · ${hv.stats.paceNote}` : `Pace ${hv.stats.pace}/hr · ${ha.notes[1]?.replace(/^Pace \d+\/hr /, '') ?? hv.stats.paceNote}`,
        ],
      };
    }
    case 'eta': {
      const e = snap().eta;
      if (e.dashed) return { title: 'ETA', lines: [`ETA unknown · ${e.notes[0] || 'not enough data yet'}`], tags: [], where: 'snap' };
      return { title: 'ETA', tags: e.value === '0' ? [] : ['FORECAST'], where: 'snap', lines: [e.value === '0' ? e.notes[0] : `${e.value}${e.day ? ` (${e.day})` : ''}`, ...(e.value === '0' ? [] : e.notes), ...(e.value === '0' ? [] : ['Forecast only: completion is never marked automatically.'])] };
    }
    case 'decks': {
      const rows = decksView(s).rows.filter((r) => r.status !== 'complete');
      return { title: 'Decks left', where: 'decks', tags: [], lines: rows.length ? rows.map((r) => `${r.label} · ${r.pill} · ${r.remaining === '—' ? 'remaining count needed' : `${r.remaining} of ${r.start}`}`) : ['Every deck is complete.'] };
    }
    case 'deck': {
      const r = decksView(s).rows.find((x) => x.id === i.deck)!;
      return { title: r.label, where: 'decks', tags: [], lines: [`${r.pill} · ${r.remaining === '—' ? 'remaining count needed' : `${r.remaining} of ${r.start} remaining`}`, ...r.hatches.map((h) => `${h.h}: ${h.text}`), r.height.text, ...(r.cleared ? [r.cleared] : [])] };
    }
    case 'alerts': {
      const a = alerts(s, b);
      return { title: 'Open alerts', where: 'plan', tags: [], lines: a.length ? a : ['No Plan alerts are open.'] };
    }
    case 'distance': {
      if (!i.zone) return { title: 'Distance', where: null, tags: [], lines: ['Which zone? Type for example “distance to Zone 3”.'] };
      const t = terminalInfo(i.zone, b.berth as string | number);
      if (!t) return { title: 'Distance', where: null, tags: [], lines: [`${i.zone} is not in the terminal directory.`] };
      return { title: 'Distance', where: 'plan', tags: [], lines: [t.mi == null ? `${t.name}: no measured distance on file for Berth ${String(b.berth)}.` : `${t.name}: ${t.mi.toFixed(2)} mi from Berth ${String(b.berth)} (measured; one-way or round trip not stated)`] };
    }
    case 'clearby': {
      const brk = b.breaks.map((x) => formatHM(parseHM(x)!)).join(' and ');
      if (!i.zone) return { title: 'Clear-by', where: 'snap', tags: [], lines: [`Breaks at ${brk}, 1 hour each.`, 'Clear-by before a break: Northside 15 min, Southside 30 min.', 'Say a zone for its side.'] };
      const t = terminalInfo(i.zone, b.berth as string | number);
      if (!t) return { title: 'Clear-by', where: null, tags: [], lines: [`${i.zone} is not in the terminal directory.`] };
      return { title: 'Clear-by', where: 'snap', tags: [], lines: [`${t.name}: ${t.side === 'S' ? 'Southside' : 'Northside'}, clear ${t.clearBy} min before the break (breaks at ${brk}).`] };
    }
    case 'missing': return { title: 'Not on this vessel', where: null, tags: [], lines: [i.what] };
    case 'knowledge': {
      const r = search(index, i.q, 3);
      const shown = r.hits.length ? r.hits : r.related; // no real match: the closest passages, clearly not an answer
      return { title: 'From the documents', where: null, tags: [], lines: r.hits.length ? [] : [NOT_FOUND, ...(r.related.length ? ['Closest passages, not an answer:'] : [])], passages: shown.map((h) => ({ cite: h.chunk.cite, text: h.chunk.text, flag: h.chunk.flag })) };
    }
  }
}

// ---------- Plan alerts (shared by the Ask sheet and reminders) ----------
// Deck heights waiting for confirmation + open discrepancies, as on the Plan tab.
export function alerts(s: State, b: Baseline): string[] {
  const p = planView(s, b);
  return [...p.heights.pending.map((h) => `${h.label} height not confirmed`), ...p.issues.open.map((x) => x.text)];
}

// ---------- Actions ----------
export type Action =
  | { k: 'hourly'; count: number; start: string | null }
  | { k: 'note'; text: string }
  | { k: 'vessel' };

// A number, time or text is taken only from what was typed. Nothing is filled in otherwise.
export function parseAction(text: string): Action | null {
  const n = /^\s*note\s*[:\-]\s*(\S[\s\S]*)$/i.exec(text);
  if (n) return { k: 'note', text: n[1].trim() };
  if (/\b(new|start|add|create)\s+(a\s+|another\s+)?(new\s+)?vessel\b/i.test(text)) return { k: 'vessel' };
  const h = /^\s*log\s+(\d{1,3}(?:,\d{3})+|\d+)(?:\s*(?:autos?|cars?|units?))?(?:\s+(?:at|for)\s+(\d{1,2})(?::(\d{2}))?)?\s*\.?\s*$/i.exec(text);
  if (h) {
    const hh = h[2] == null ? null : Number(h[2]), mm = h[3] == null ? 0 : Number(h[3]);
    return { k: 'hourly', count: Number(h[1].replace(/,/g, '')), start: hh == null || hh > 23 || mm > 59 ? null : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
  }
  return null;
}

// ---------- Reminders ----------
export const REMINDER_MIN = 25;
export type ReminderPlan = { text: string; atMin: number[] }; // minutes from now, one notification each

// Reminders resume when work resumes: skipped inside the scheduled breaks, none after shift end or on a break now.
// Only the rest of today is planned (re-planned whenever the app opens or the vessel changes).
export function reminderPlan(s: State, b: Baseline, nowMin: number, isTest: boolean, max = 20): ReminderPlan | null {
  const a = alerts(s, b);
  if (!a.length || s.ops.onBreak || s.ops.shiftEnded) return null;
  const end = s.plan.shiftEnd ? parseHM(s.plan.shiftEnd) : null;
  const breaks = b.breaks.map((x) => parseHM(x)!).filter((x) => x != null);
  const atMin: number[] = [];
  for (let k = 1; k <= max; k++) {
    const t = nowMin + k * REMINDER_MIN;
    if (t >= 1440 || (end != null && t >= end)) break;
    if (breaks.some((x) => t >= x && t < x + 60)) continue;
    atMin.push(k * REMINDER_MIN);
  }
  if (!atMin.length) return null;
  const labels = a.map((x) => (x.length > 40 ? `${x.slice(0, 39)}…` : x));
  return { text: `${isTest ? 'TEST · ' : ''}${a.length} Plan alert${a.length === 1 ? '' : 's'} open: ${labels.join(', ')}`, atMin };
}
