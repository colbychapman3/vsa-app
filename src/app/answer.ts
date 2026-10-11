// The answer after Save (Act II, Colby 2026-10-11): an entry earns an answer, not an echo of the number just typed.
// Compares the state before the save with the state after it: what changed (remaining, H.A., how far the forecast moved)
// and only what needs action now. Silence means nothing needs the user: no warning is invented to fill the card.
// Pure: reads the same views the screens read, so the card can never disagree with the Snapshot.
import type { Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { snapshot } from './view.ts';
import { paceWatch } from './whatif.ts';
import { alerts } from './assistant.ts';

export type Delta = { text: string; good: boolean | null }; // good: true = better, false = worse, null = neutral
export type Fig = { k: string; v: string; tag: 'CALCULATED' | 'FORECAST' | null; d: Delta | null };
export type Answer = { head: string; figs: Fig[]; why: string | null; watch: string[]; quiet: string | null; changed: boolean }; // changed: the save moved a ledger or raised something; why: what moved the finish

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

  // H.A.: whole cars per hour, as the tile shows it.
  const haNow = after.production.ha, haWas = before.production.ha;
  const r = (x: number) => Math.round(x);
  figs.push({
    k: 'H.A.',
    v: snap.ha.value,
    tag: 'CALCULATED',
    d: haNow != null && haWas != null
      ? r(haNow) === r(haWas) ? null // no change says nothing: left off
        : r(haNow) > r(haWas) ? { text: `up ${r(haNow) - r(haWas)}`, good: true } : { text: `down ${r(haWas) - r(haNow)}`, good: false }
      : null,
  });

  // Finish: the ETA, a forecast, labeled as one. Sooner is better.
  const eNow = after.eta.etaAbs, eWas = before.eta.etaAbs;
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
  const fin = figs[2].d;
  if (fin) {
    const parts: string[] = [];
    // The forecast starts from the end of the last logged hour. If that moved and the cars to go didn't (no deck update),
    // the same cars now start an hour later: say so, it's usually the biggest reason and the fix is a deck count.
    if (after.eta.fromAbs !== before.eta.fromAbs && remNow != null && remNow === remWas) parts.push(`no deck update since the last hour, so ${fmt(remNow)} still to go`);
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
  return { head, figs, why, watch, quiet: watch.length ? null : 'Nothing needs your attention right now.', changed };
}

const moved = (m: number) => { const x = Math.round(m); return x >= 60 ? `${Math.floor(x / 60)} hr${x % 60 ? ` ${x % 60} min` : ''}` : `${x} min`; };
