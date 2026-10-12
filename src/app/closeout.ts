// Phase 3, the coach at closeout (Game Plan, 2026-10-12). One list of what is left, the forecast scorecard, and the answer sheet.
// Display-only: every number comes from the engine's state. The ticks and the "what slowed you down" line are Colby's own words,
// kept like the report notes (local settings, not the official record).
import { absFromIso, fromAbs, forecastError, formatHM, operationDate, parseHM, TYPE_LABEL, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { completeBlockers, completeLine } from './complete.ts';
import { etaHistory } from './etaHistory.ts';

const n = (x: number) => x.toLocaleString('en-US');

// Things only Colby can see. The order is the order that would hurt most if forgotten.
export const TICKS = [
  { key: 'loadback', label: 'Load-back closed' },
  { key: 'lashing', label: 'Lashing closed' },
  { key: 'vans', label: 'Vans gassed' },
  { key: 'photos', label: 'Damage photos logged' },
  { key: 'hh', label: 'H&H kept separate from the auto counts' },
] as const;
export type TickKey = (typeof TICKS)[number]['key'];

// Ticks are kept in the vessel's log (closeout_check events), so they travel with the export.
export const ticked = (s: State, k: TickKey) => s.closeoutChecks?.[k] === true;
// The answer to this question is kept with the vessel itself: a Plan note with this title, so it is in the log and the export.
export const SLOWED_QUESTION = 'What slowed you down today?';
export const slowedNote = (s: State) => s.notes.filter((x) => !x.removed && x.title === SLOWED_QUESTION).at(-1) ?? null;

export type Row = { id: string; label: string; detail: string; ok: boolean; kind: 'check' | 'tick'; go?: 'decks' | 'hourly' | 'snap' };

export function coachList(s: State): { rows: Row[]; left: number; clear: boolean } {
  const rows: Row[] = [];
  // Field against decks: every deck counted, ship equals field overall and by brand. (Open issues have their own row.)
  const b = completeBlockers(s).filter((x) => !/open issue/.test(x.text));
  rows.push(b.length === 0
    ? { id: 'decks', label: 'Field matches the decks', detail: 'Every deck is counted and ship equals field, overall and by brand.', ok: true, kind: 'check' }
    : { id: 'decks', label: 'Field matches the decks', detail: `${b[0].text}${b.length > 1 ? ` (+${b.length - 1} more)` : ''}`, ok: false, kind: 'check', go: b[0].go });
  const open = s.issues.filter((i) => i.status === 'open').length;
  rows.push(open === 0
    ? { id: 'issues', label: 'Discrepancies closed', detail: 'No open discrepancies.', ok: true, kind: 'check' }
    : { id: 'issues', label: 'Discrepancies closed', detail: `${open} open discrepanc${open === 1 ? 'y' : 'ies'}.`, ok: false, kind: 'check', go: 'snap' });
  const photos = s.evidence.filter((e) => !e.removed).length;
  for (const t of TICKS) {
    const detail = t.key === 'photos' ? `${photos === 0 ? 'No photo records in the app' : `${photos} photo record${photos === 1 ? '' : 's'} in the app`}. Tick when every damage photo is logged.`
      : t.key === 'hh' ? 'The other stevedore counts H&H; it is never added to the auto counts.'
      : 'Your word: the app does not track it.';
    rows.push({ id: t.key, label: t.label, detail, ok: ticked(s, t.key), kind: 'tick' });
  }
  const left = rows.filter((r) => !r.ok).length;
  return { rows, left, clear: left === 0 };
}

// The finish, once the vessel is at 0. The hourly counts give the end of the last counted hour (a short hour ends at its
// recorded stop). The deck save that took the ship to 0 is closer when it falls inside that hour: its typed time, else its save
// time (processing time, so the finish was at or before it). A save after the hour (decks caught up later) is not used.
export type Finish = { abs: number; from: 'deck' | 'hour' };
export function actualFinish(s: State, b: Baseline): Finish | null {
  if (s.vesselRemaining !== 0) return null;
  const p = [...s.periods].sort((a, c) => a.day - c.day || (parseHM(a.start) ?? 0) - (parseHM(c.start) ?? 0)).filter((x) => x.count > 0).at(-1);
  const st = p ? parseHM(p.start) : null;
  if (!p || st == null) return null;
  const hourStart = (p.day - 1) * 1440 + st, hourEnd = hourStart + (p.min ?? 60);
  const op = operationDate(b);
  const deck = op ? s.log.events.filter((e) => e.payload.metric === 'deck_status' || e.payload.metric === 'vessel_remaining').at(-1) : undefined;
  const at = deck && op ? absFromIso(deck.occurred_at ?? deck.recorded_at, op) : null;
  return at != null && at > hourStart && at <= hourEnd ? { abs: at, from: 'deck' } : { abs: hourEnd, from: 'hour' };
}
export const actualFinishAbs = (s: State, b: Baseline) => actualFinish(s, b)?.abs ?? null;
const finishFrom = (f: Finish) => (f.from === 'deck' ? 'when the last deck was saved' : 'end of the last counted hour');
const clock = (abs: number) => `${formatHM(abs % 1440)}${abs >= 1440 ? ` (Day ${Math.floor(abs / 1440) + 1})` : ''}`;
const errText = (min: number) => min === 0 ? 'on the forecast' : `${Math.abs(min)} min ${min > 0 ? 'later' : 'earlier'} than forecast`;

export type Scorecard = { actual: string | null; rows: { label: string; forecast: string; result: string; signedMin: number }[]; note: string | null };

// How close the forecast came: the first forecast of the day and the last one before the finish, each against the actual finish.
export function scorecard(s: State, b: Baseline): Scorecard {
  const fin = actualFinish(s, b);
  const act = fin?.abs ?? null;
  if (fin == null || act == null) return { actual: null, rows: [], note: s.vesselRemaining === 0 ? 'The finish time could not be read from the hourly counts, so the forecast is not scored.' : 'Scored once the vessel reaches 0.' };
  const pts = etaHistory(b, s.log.events, s.operationId).filter((p) => p.etaAbs != null);
  const picks = pts.length === 0 ? [] : pts.length === 1 ? [{ p: pts[0], label: `After ${pts[0].hour}` }] : [{ p: pts[0], label: `First forecast, after ${pts[0].hour}` }, { p: pts[pts.length - 1], label: `Last forecast, after ${pts[pts.length - 1].hour}` }];
  const rows = picks.flatMap(({ p, label }) => {
    const e = forecastError({ milestone: 'cars_complete', at: fromAbs(p.etaAbs!) }, { milestone: 'cars_complete', at: fromAbs(act) });
    return 'signedMin' in e ? [{ label, forecast: `FORECAST ${clock(p.etaAbs!)}`, result: errText(e.signedMin), signedMin: e.signedMin }] : [];
  });
  return { actual: clock(act), rows, note: rows.length === 0 ? 'No forecast was shown before the finish, so there is nothing to score.' : `Scored against the finish ${finishFrom(fin)}. Cars only: not H&H, load-back or lashing.` };
}

// The sheet that goes to the superintendent and/or the operations manager (Colby picks who at send time).
export function answerSheet(s: State, b: Baseline, o: { isTest: boolean; closeout: { rows: Row[] } }): string {
  const L: string[] = [];
  const c = completeLine(s);
  L.push(`${o.isTest ? 'TEST · ' : ''}${s.vessel} · ${b.date}`);
  L.push(`Status: ${c.text}`);
  L.push(`Autos counted in the field: ${n(s.field)} of ${n(s.start)}`);
  L.push(s.vesselRemaining == null ? `Vessel remaining: unknown (field balance ${n(s.fieldBalance ?? s.start - s.field)})` : `Vessel remaining: ${n(s.vesselRemaining)}`);
  const fin = actualFinish(s, b);
  if (fin) L.push(`Finish: ${clock(fin.abs)} (${finishFrom(fin)})`);
  else if (s.steady.etaAbs != null) L.push(`Finish: FORECAST ${clock(s.steady.etaAbs)}, not an actual`);
  else L.push('Finish: unknown');
  const p = s.production;
  L.push(`H.A. ${p.ha == null ? 'unknown' : `${Math.round(p.ha)}/hr over ${p.countedHours} counted hours`} · Pace ${p.pace == null ? 'unknown' : `${Math.round(p.pace)}/hr`}`);
  const dmg = s.evidence.filter((e) => !e.removed);
  L.push(dmg.length === 0 ? 'Damage and stowage records: none in the app' : `Damage and stowage records: ${dmg.length} (${[...new Set(dmg.map((e) => TYPE_LABEL[e.type]))].join(', ')})`);
  const left = o.closeout.rows.filter((r) => !r.ok);
  L.push(left.length === 0 ? 'Open items: none' : `Open items: ${left.map((r) => (r.kind === 'tick' ? `${r.label} not confirmed` : r.detail)).join(' ')}`);
  const slow = slowedNote(s)?.text.trim();
  if (slow) L.push(`${SLOWED_QUESTION} ${slow}`);
  L.push('Counts are the field record; H&H is counted separately and is not included.');
  return L.join('\n');
}
