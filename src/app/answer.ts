// The answer after Save (Act II, Colby 2026-10-11): an entry earns an answer, not an echo of the number just typed.
// Compares the state before the save with the state after it: what changed (remaining, H.A., how far the forecast moved)
// and only what needs action now. Silence means nothing needs the user: no warning is invented to fill the card.
// Pure: reads the same views the screens read, so the card can never disagree with the Snapshot.
import { formatHM, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { snapshot } from './view.ts';
import { paceWatch } from './whatif.ts';
import { alerts } from './assistant.ts';

export type Delta = { text: string; good: boolean | null }; // good: true = better, false = worse, null = neutral
export type Fig = { k: string; v: string; tag: 'CALCULATED' | 'FORECAST' | null; d: Delta | null; sub?: string | null }; // sub: the denominator
// official: the hourly field count, the official record (board 2.1b); decks: when the deck counts were saved and what was carried
// since; stale: decks still on an older count than the latest save; action: the one tap that answers it (decks older than the last hour).
export type Answer = { head: string; figs: Fig[]; why: string | null; watch: string[]; quiet: string | null; changed: boolean;
  official: { v: string; through: string }; decks: string | null; stale: string | null; short: string | null; action: 'update-decks' | null }; // changed: the save moved a ledger or raised something; why: what moved the finish

const fmt = (n: number) => n.toLocaleString('en-US');

export function answerAfterSave(before: State, after: State, b: Baseline, nowMin: number, head: string): Answer {
  const snap = snapshot(after, b, nowMin);
  const figs: Fig[] = [];

  // Remaining: the same ledger the hero shows (vessel remaining when every active deck has a count, else the field balance).
  const remNow = after.vesselRemaining ?? after.fieldBalance;
  const remWas = before.vesselRemaining ?? before.fieldBalance;
  const sameLedger = (before.vesselRemaining == null) === (after.vesselRemaining == null);
  figs.push({
    k: after.vesselRemaining != null ? 'Remaining' : 'Field balance',
    v: snap.hero.value,
    tag: null,
    d: sameLedger && remNow != null && remWas != null && remNow !== remWas
      ? { text: remNow < remWas ? `${fmt(remWas - remNow)} fewer` : `${fmt(remNow - remWas)} more`, good: null }
      : null,
  });

  // H.A. and Pace: whole cars per hour, as the tiles show them, each with its denominator (board 2.1b).
  const r = (x: number) => Math.round(x);
  const step = (now: number | null, was: number | null): Delta | null => now != null && was != null
    ? r(now) === r(was) ? null // no change says nothing: left off
      : r(now) > r(was) ? { text: `up ${r(now) - r(was)}, was ${r(was)}`, good: true } : { text: `down ${r(was) - r(now)}, was ${r(was)}`, good: false }
    : null;
  const p = after.production;
  figs.push({ k: 'H.A.', v: snap.ha.value, tag: 'CALCULATED', d: step(p.ha, before.production.ha), sub: p.ha == null ? null : snap.ha.haLine });
  figs.push({ k: 'Pace', v: snap.ha.pace, tag: 'CALCULATED', d: step(p.pace, before.production.pace), sub: p.pace == null ? null : `${fmt(p.prodCount)} ÷ ${fmt(p.prodMin)} productive min` });

  // Finish: the ETA, a forecast, labeled as one. Sooner is better.
  const eNow = after.steady.etaAbs, eWas = before.steady.etaAbs;
  figs.push({
    k: 'Finish',
    v: snap.eta.day ? `${snap.eta.day} ${snap.eta.value}` : snap.eta.value,
    tag: 'FORECAST',
    d: eNow != null && eWas != null && after.vesselRemaining !== 0
      ? Math.round(eNow) === Math.round(eWas) ? null
        : eNow < eWas ? { text: `${moved(eWas - eNow)} sooner`, good: true } : { text: `${moved(eNow - eWas)} later`, good: false }
      : null,
  });

  // Why the finish moved (Design B): only the inputs the forecast uses, the recent pace and the cars it divides.
  let why: string | null = null;
  const fin = figs.find((x) => x.k === 'Finish')!.d;
  if (fin) {
    const parts: string[] = [];
    // The forecast starts from the end of the last logged hour. If that moved and the cars to go didn't (no deck update),
    // the same cars now start an hour later: say so, it's usually the biggest reason and the fix is a deck count. When the steady
    // finish carried the deck count forward (state.steady) that effect is already cancelled, so it is not the reason.
    if (after.eta.fromAbs !== before.eta.fromAbs && remNow != null && remNow === remWas && !after.steady.carry) parts.push(`no deck update since the last hour, so ${fmt(remNow)} still to go`);
    const pNow = after.eta.rate, pWas = before.eta.rate;
    if (pNow != null && pWas != null && r(pNow) !== r(pWas)) parts.push(`pace ${r(pNow)}/hr, was ${r(pWas)}/hr`);
    if (remNow != null && remWas != null && remNow !== remWas && sameLedger) parts.push(remNow < remWas ? `${fmt(remWas - remNow)} fewer to go` : `${fmt(remNow - remWas)} more to go`);
    if (parts.length) why = `Why it moved: ${parts.join('; ')}.`;
  }

  // What needs action now: decks the pace can't clear before the cutoff, and anything that became an open item with this
  // save. Standing items the user already knows about are left out. No clear-by clock times (Colby: they needn't be shown).
  const watch: string[] = [...paceWatch(after, b, nowMin)];
  const was = new Set(alerts(before, b));
  for (const a of alerts(after, b)) if (!was.has(a)) watch.push(a);
  // A red or orange Snapshot banner this save raised (a break or shift-end reconciliation that doesn't match, a field count over
  // starting cargo): the card never says "nothing needs you" over a warning the Snapshot is showing.
  const shown = new Set(snapshot(before, b, nowMin).banners.map((x) => x.title));
  for (const x of snap.banners) if ((x.tone === 'red' || x.tone === 'orange') && !shown.has(x.title)) watch.push(`${x.title}.`);

  const changed = after.field !== before.field || after.vesselRemaining !== before.vesselRemaining || after.ops.phase !== before.ops.phase || watch.length > 0;
  // Decks: when they were last saved and what the finish carried since (an estimate), and which decks are still on an older count.
  const open = after.decks.filter((d) => d.status !== 'complete');
  const saves = open.map((d) => after.deckSaves[d.id]).filter((x): x is number => x != null);
  const asOf = saves.length ? Math.max(...saves) : null;
  const clock = (abs: number) => `${abs >= 1440 ? `Day ${Math.floor(abs / 1440) + 1} ` : ''}${formatHM(abs % 1440)}`;
  const carry = after.steady.carry;
  const decks = asOf == null ? null : `Decks saved ${clock(asOf)}${carry ? `; about ${fmt(Math.round(carry.cars))} cars cleared since (estimate)` : ''}.`;
  const older = new Map<string, string[]>();
  for (const d of open) { const t = after.deckSaves[d.id]; if (t != null && asOf != null && t < asOf) older.set(clock(t), [...(older.get(clock(t)) ?? []), d.label]); }
  const stale = older.size ? [...older].map(([t, l]) => `${l.join(', ')} still as of ${t}`).join('; ') + '.' : null;
  const action = asOf != null && after.eta.fromAbs != null && asOf < after.eta.fromAbs && (after.vesselRemaining ?? after.fieldBalance ?? 0) > 0 ? 'update-decks' as const : null;
  // A short hour saved: its count is low because work stopped early, not because it was slow (HANDOFF_SPEC 3.2).
  const last = after.periods.at(-1);
  const short = after.periods.length > before.periods.length && last?.short && last.min != null && last.pace != null
    ? `Short hour: ${fmt(last.count)} in ${last.min} min is pace ${r(last.pace)}/hr, not a slow hour.` : null;
  return { head, figs, why, watch, quiet: watch.length || action ? null : 'Nothing needs your attention right now.', changed,
    official: { v: fmt(after.field), through: snap.fieldRecord.tile.through }, decks, stale, short, action };
}

const moved = (m: number) => { const x = Math.round(m); return x >= 60 ? `${Math.floor(x / 60)} hr${x % 60 ? ` ${x % 60} min` : ''}` : `${x} min`; };
