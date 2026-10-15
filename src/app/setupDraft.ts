// New-vessel setup draft: what the user typed or read so far, kept so closing the sheet never loses it.
// Plain logic, no screens and no storage import: the caller hands in a tiny get/set store (the settings prefs).
// A draft is NOT an event and never touches the events table. It holds typed or read text only: no photos.
import type { Allocation, DeckDraft, HhEntry } from './setup.ts';

export const DRAFT_KEY = 'setupDraft';
const VERSION = 1;
const DEFAULT_START = '08:00';

export type DraftStore = { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void> };
// What the game plan read said, without the page scans (those are positions, only used for sharing).
export type DraftRead = { filled: string[]; problems: string[]; notes: string[]; extras: string[]; decks: number; autos: number | null; hhTotal: number | null };
export type SetupDraft = {
  isTest: boolean;
  mode: 'start' | 'form' | 'paste';
  step: number;
  imported: boolean; // a pasted baseline that was opened for review; rebuilt from `paste` when resumed
  v: { vessel: string; date: string; port: string; berth: string; start: string; drivers: string };
  allocs: Allocation[];
  decks: DeckDraft[];
  hh: HhEntry[];
  load: Record<string, string>;
  loadHh: string;
  override: boolean;
  paste: string;
  read: DraftRead | null;
  keep: string[];
  confirmed: number[];
};
export type StoredDraft = { savedAt: string; draft: SetupDraft };

export const blankDraft = (isTest = false): SetupDraft => ({
  isTest, mode: 'start', step: 0, imported: false,
  v: { vessel: '', date: '', port: '', berth: '', start: DEFAULT_START, drivers: '' },
  allocs: [{ brand: '', autos: '', destination: '' }], decks: [], hh: [], load: {}, loadHh: '', override: false, paste: '', read: null, keep: [], confirmed: [],
});

// Has the user given the form anything? Switching TEST/LIVE alone does not count; an untouched form closes with no question.
export function isDirty(d: SetupDraft): boolean {
  const b = blankDraft();
  const filled = (t: string) => t.trim() !== '';
  return (Object.keys(b.v) as (keyof SetupDraft['v'])[]).some((k) => d.v[k].trim() !== b.v[k])
    || d.allocs.some((a) => filled(a.brand) || filled(a.autos) || a.destination !== '')
    || d.decks.length > 0 || d.hh.length > 0
    || Object.values(d.load).some(filled) || filled(d.loadHh)
    || filled(d.paste) || d.imported || d.read != null;
}

export const serializeDraft = (draft: SetupDraft, savedAt: string): string => JSON.stringify({ v: VERSION, savedAt, draft });

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : []);
const numOrNull = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const pair = (x: unknown) => ({ brand: str(rec(x).brand), qty: str(rec(x).qty) });
const list = <T>(x: unknown, f: (y: unknown) => T): T[] => (Array.isArray(x) ? x.map(f) : []);

// Text → draft, or null when it is empty, damaged or from another version. Never throws; a bad draft is simply not offered.
export function parseDraft(text: string | null): StoredDraft | null {
  if (!text) return null;
  let o: Record<string, unknown>;
  try { o = rec(JSON.parse(text)); } catch { return null; }
  if (o.v !== VERSION || typeof o.savedAt !== 'string') return null;
  const d = rec(o.draft);
  if (Object.keys(d).length === 0) return null;
  const v = rec(d.v), r = rec(d.read), b = blankDraft();
  const mode = d.mode === 'form' || d.mode === 'paste' ? d.mode : 'start';
  const draft: SetupDraft = {
    isTest: d.isTest === true, mode, step: Math.min(5, Math.max(0, Math.trunc(numOrNull(d.step) ?? 0))), imported: d.imported === true && str(d.paste).trim() !== '',
    v: { vessel: str(v.vessel), date: str(v.date), port: str(v.port), berth: str(v.berth), start: typeof v.start === 'string' ? v.start : b.v.start, drivers: str(v.drivers) },
    allocs: list(d.allocs, (a) => ({ brand: str(rec(a).brand), autos: str(rec(a).autos), destination: str(rec(a).destination) })),
    decks: list(d.decks, (k) => {
      const x = rec(k);
      return {
        label: str(x.label), total: str(x.total), current: str(x.current),
        split: Array.isArray(x.split) ? x.split.map(pair) : null,
        hatches: list(x.hatches, (h) => ({ h: str(rec(h).h), items: list(rec(h).items, pair) })),
      };
    }),
    hh: list(d.hh, (e) => ({ deck: typeof rec(e).deck === 'string' ? (rec(e).deck as string) : null, qty: numOrNull(rec(e).qty), cargo: str(rec(e).cargo), yard: str(rec(e).yard) })),
    load: Object.fromEntries(Object.entries(rec(d.load)).filter((e): e is [string, string] => typeof e[1] === 'string')),
    loadHh: str(d.loadHh), override: d.override === true, paste: str(d.paste),
    read: d.read == null ? null : { filled: strs(r.filled), problems: strs(r.problems), notes: strs(r.notes), extras: strs(r.extras), decks: numOrNull(r.decks) ?? 0, autos: numOrNull(r.autos), hhTotal: numOrNull(r.hhTotal) },
    keep: strs(d.keep), confirmed: Array.isArray(d.confirmed) ? d.confirmed.filter((n): n is number => typeof n === 'number') : [],
  };
  if (draft.allocs.length === 0) draft.allocs = b.allocs;
  return { savedAt: o.savedAt, draft };
}

// Load / save / clear. Load never throws (a storage hiccup means "no draft", it must not block New vessel); save reports failure so the sheet stays open.
export async function loadDraft(store: DraftStore): Promise<StoredDraft | null> {
  try { return parseDraft(await store.get(DRAFT_KEY)); } catch { return null; }
}
export async function saveDraft(store: DraftStore, draft: SetupDraft, now: Date): Promise<{ ok: true } | { ok: false; error: string }> {
  try { await store.set(DRAFT_KEY, serializeDraft(draft, now.toISOString())); return { ok: true }; }
  catch (e) { return { ok: false, error: `Could not save the draft: ${(e as Error).message}` }; }
}
export async function clearDraft(store: DraftStore): Promise<void> {
  try { await store.set(DRAFT_KEY, ''); } catch { /* an old draft left behind is offered again; never block creating a vessel */ }
}

// One line for the "Resume draft" card: what it is and when it was saved (local time).
export function draftLabel(s: StoredDraft): string {
  const t = new Date(s.savedAt);
  const when = Number.isNaN(t.getTime()) ? '' : ` · saved ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const name = s.draft.v.vessel.trim() || (s.draft.imported ? 'Imported baseline' : 'Vessel not named yet');
  return `${name} · ${s.draft.isTest ? 'TEST' : 'LIVE'}${when}`;
}

// Autosave: keeps the draft current while the user types, so a killed app or a crash loses nothing.
// Pure decisions + an injected timer, so it is tested without a phone. It writes the same single draft as "Save draft and close".
export const AUTOSAVE_MS = 1000;
export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void };
const draftKey = (d: SetupDraft) => JSON.stringify(d);

export function createAutosaver(store: DraftStore, timers: Timers, now: () => Date, delay = AUTOSAVE_MS) {
  let handle: unknown = null;
  let pending: SetupDraft | null = null;
  let lastKey: string | null = null; // what the store already holds (or is about to)
  let settled = false; // created / discarded: nothing more may be written
  const stop = () => { if (handle != null) timers.clear(handle); handle = null; };
  const flush = async (): Promise<void> => {
    stop();
    const d = pending; pending = null;
    if (settled || !d || !isDirty(d)) return; // an untouched or empty form is never saved
    const k = draftKey(d);
    if (k === lastKey) return;
    lastKey = k;
    const r = await saveDraft(store, d, now());
    if (!r.ok) lastKey = null; // try again at the next change or background
  };
  return {
    // Call with the current answers on every change; only a real change restarts the wait.
    schedule(d: SetupDraft) {
      if (settled || !isDirty(d)) { pending = null; stop(); return; }
      const k = draftKey(d);
      if (k === lastKey && pending == null) return;
      if (pending && draftKey(pending) === k) return;
      pending = d; stop(); handle = timers.set(() => { void flush(); }, delay);
    },
    flush, // the app went to the background: save now
    seed(d: SetupDraft) { lastKey = draftKey(d); }, // a resumed draft is already stored
    settle(on: boolean) { settled = on; if (on) { pending = null; stop(); } },
  };
}
