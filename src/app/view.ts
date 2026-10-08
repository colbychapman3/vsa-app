// Display-only derivations the VSA Live tracker makes while drawing screens
// (viewSnap, viewDecks, viewHourly, hourGraph, viewPlan). No protocol math here:
// every number comes from the engine's project() state; this only picks, rounds
// and words it the way the tracker does. Pure and tested (tests/view.test.ts).
import { CLEAR_BY_MIN, TYPE_LABEL, formatHM, parseHM, preBreak, toAbs, backNotMarked, gassingAlert, STATUS_LABEL, vanTally, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';

export type Tone = 'break' | 'red' | 'orange' | 'green';
export type Banner = { tone: Tone; title: string; sub: string; trackable: boolean; tracked: boolean; go?: 'hourly' | 'decks' }; // go: the tab that addresses the warning

const fmt = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('en-US'));
const m2 = (m: number) => `${m.toFixed(2)} m`;
type Deck = State['decks'][number];
const h0 = (d: Deck) => d.hatches.every((h) => h.qty != null); // true: counts per hatch are on the paperwork
const isLow = (d: Deck) => d.height.level === 'hard' && d.status !== 'complete';
const isUnconfirmed = (d: Deck) => d.height.level === 'soft' && d.status !== 'complete';

// ---------- Photo evidence ----------
// Photos are records of where and when something was seen. Nothing here touches a count or rate.

type Photo = State['evidence'][number];
const plural = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;
const livePhotos = (s: State) => s.evidence.filter((x) => !x.removed);
// One record can hold several photos (the first plus `more`): every count shown anywhere is of photos, not records.
export const photoCount = (x: { more?: string[] }) => 1 + (x.more?.length ?? 0);
const photosIn = (list: Photo[]) => list.reduce((n, x) => n + photoCount(x), 0);
const deckName = (s: State, id: string) => s.decks.find((d) => d.id === id)?.label ?? id;
const hatchLabel = (s: State, x: Photo) => `${deckName(s, x.deck)} ${x.hatch}`;

// "Accident, D9 H3, 2 photos" lines, one per type and place (and per time when `withTime`).
function photoLines(s: State, list: Photo[], withTime: boolean): string[] {
  const groups = new Map<string, { text: string; n: number }>();
  for (const x of list) {
    const when = withTime && x.at ? `${x.at.day > 1 ? `Day ${x.at.day} ` : ''}${x.at.hm}` : '';
    const key = `${x.type}|${x.deck}|${x.hatch}|${when}`;
    const g = groups.get(key) ?? { text: `${TYPE_LABEL[x.type]}, ${hatchLabel(s, x)}${when ? `, ${when}` : ''}`, n: 0 };
    g.n += photoCount(x);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => `${g.text}, ${plural(g.n)}`);
}

// Which photo types exist (not removed); a report is offered only for these.
export const photoTypesPresent = (s: State) => TYPES_ORDER.filter((t) => livePhotos(s).some((x) => x.type === t));
const TYPES_ORDER = Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[];

// The logged hour a time falls in (the hour before a break ends at the break), or undefined.
export function periodAt(s: State, at: { day: number; hm: string }) {
  const t = toAbs(at)!;
  return s.periods.find((q) => {
    const a = (q.day - 1) * 1440 + parseHM(q.start)!, z = (q.day - 1) * 1440 + (preBreak(q.start, s.breaks) ?? parseHM(q.start)! + 60);
    return t >= a && t < z;
  });
}

// Notes for the Hourly tab: a photo inside a logged hour goes on that hour's row. No time = "time not provided".
// A time outside every logged hour (a break, an hour not logged yet) is listed on its own, never forced into an hour.
export function photoHourNotes(s: State) {
  const perHour = new Map<string, Photo[]>(), noTime: Photo[] = [], outside: Photo[] = [];
  for (const x of livePhotos(s)) {
    if (!x.at) { noTime.push(x); continue; }
    const p = periodAt(s, x.at);
    if (!p) { outside.push(x); continue; }
    const k = `${p.day}|${p.start}`;
    perHour.set(k, [...(perHour.get(k) ?? []), x]);
  }
  return {
    forHour: (day: number, start: string) => photoLines(s, perHour.get(`${day}|${start}`) ?? [], false),
    noTime: photoLines(s, noTime, false),
    outside: photoLines(s, outside, true),
  };
}

// The photos of one deck for its sheet: current ones first, removed ones after with the reason.
export function deckPhotos(s: State, deckId: string) {
  const row = (x: Photo) => ({
    id: x.id, path: x.photo, more: x.more ?? [], count: photoCount(x), type: x.type, title: `${TYPE_LABEL[x.type]} · ${x.hatch}`,
    meta: `${x.at ? `${x.at.day > 1 ? `Day ${x.at.day} ` : ''}${x.at.hm}` : x.atLabel}${x.reason ? ` · ${x.reason}` : ''}${x.edited ? ' · edited' : ''}`,
    vins: x.vins.length ? `VIN${x.vins.length === 1 ? '' : 's'}: ${x.vins.join(', ')}` : null,
    warn: x.vinWarnings, notes: x.notes,
  });
  const mine = s.evidence.filter((x) => x.deck === deckId);
  return {
    current: mine.filter((x) => !x.removed).map(row),
    removed: mine.filter((x) => x.removed).map((x) => ({ id: x.id, text: `${TYPE_LABEL[x.type]} · ${x.hatch}`, meta: `Removed ${x.removedAt} · ${x.removedReason}` })),
  };
}

// Tab badges: low decks with cargo left (Decks); unconfirmed heights with cargo left (Plan).
export function badges(s: State) {
  return { decks: s.decks.filter(isLow).length, plan: s.decks.filter(isUnconfirmed).length };
}

export function subtitles(s: State, b: Baseline) {
  const last = s.periods.at(-1);
  const through = last ? `${last.day > 1 ? `Day ${last.day} ` : ''}${formatHM(preBreak(last.start, s.breaks) ?? parseHM(last.start)! + 60)}` : null;
  return {
    snap: through ? `${b.date} · Field counts through ${through}` : b.date,
    decks: 'Working view · what’s left aboard, H4 → H1',
    hourly: 'Official field record · autos per hour',
    plan: `${b.date} · Start ${b.start}`,
  };
}

// ---------- Snapshot ----------

export function snapshot(s: State, b: Baseline, nowMin: number) {
  const recon = s.ops.phase !== 'working';
  const endShift = s.ops.phase === 'shift_end';
  const label = endShift ? 'End-of-shift reconciliation' : 'Break reconciliation';
  const when = endShift ? 'at end of shift' : 'at break';
  const openIssues = s.issues.filter((i) => i.status === 'open');
  const tracked = (title: string) => openIssues.some((i) => i.key === title);
  const alert = (tone: Tone, title: string, sub: string, go?: Banner['go']): Banner => ({ tone, title, sub, trackable: true, tracked: tracked(title), go });
  const nextStart = s.plan.nextStart ?? b.start;

  const banners: Banner[] = [];
  if (s.ops.shiftEnded) banners.push({ tone: 'break', title: 'SHIFT ENDED', sub: `At ${s.ops.shiftEnd} · Day ${s.ops.day + 1} starts ${nextStart}`, trackable: false, tracked: false });
  else if (s.ops.onBreak) banners.push({ tone: 'break', title: 'ON BREAK', sub: `From ${s.ops.breakStart}`, trackable: false, tracked: false });
  if (s.field > s.start) banners.push(alert('red', `Field count exceeds starting cargo by ${fmt(s.field - s.start)}`, `Field ${fmt(s.field)} · Starting ${fmt(s.start)} · Check hourly entries`, 'hourly'));
  if (recon) {
    const v = s.variance;
    if (v == null) banners.push({ tone: 'orange', title: `${endShift ? 'End-of-shift' : 'Break'} reconciliation waiting on deck counts`, sub: `Add a remaining count for ${s.missingDecks.join(', ')} to compare ship and field.`, trackable: false, tracked: false, go: 'decks' });
    else if (v < 0) banners.push(alert('red', `${label}: field exceeds ship by ${fmt(-v)}`, `Ship progress ${fmt(s.progress)} · Field ${fmt(s.field)} · These should match ${when}`, 'decks'));
    else if (v > 0) banners.push(alert('orange', `${label}: ship is ${fmt(v)} ahead of field`, `Ship progress ${fmt(s.progress)} · Field ${fmt(s.field)} · No cars should be in transit ${when}`, 'decks'));
    else banners.push({ tone: 'green', title: `${endShift ? 'End-of-shift' : 'Break'} reconciliation: ship and field match`, sub: `Both at ${fmt(s.field)}`, trackable: false, tracked: false });
    for (const br of s.brands) {
      if (br.variance == null || br.variance === 0) continue;
      banners.push(alert(br.variance < 0 ? 'red' : 'orange', `${label}: ${br.name} field ${br.variance < 0 ? 'exceeds' : 'is short of'} cleared by ${fmt(Math.abs(br.variance))}`,
        `Field ${fmt(br.field)} · Cleared from ship ${fmt(br.cleared)}`, 'hourly'));
    }
  }
  const nowAbs = (s.ops.day - 1) * 1440 + nowMin;
  if (s.eta.etaAbs != null && s.vesselRemaining !== 0 && !recon && nowAbs > s.eta.etaAbs) {
    banners.push({ tone: 'orange', title: 'Forecast passed · completion not reported', sub: 'Log a count or update decks to refresh.', trackable: false, tracked: false, go: 'hourly' });
  }

  // Break strip: next scheduled break today and clear-by per side. Hidden while reconciling.
  const breaks = b.breaks.map((x) => parseHM(x)!).sort((x, y) => x - y);
  const next = breaks.find((x) => x > nowMin);
  const sideCut: Partial<Record<'N' | 'S', number>> = {};
  for (const d of b.destinations) sideCut[d.side] = d.clearBy;
  const strip = recon ? null : next == null ? { breakAt: null, clearBy: [] as { side: string; at: string }[] } : {
    breakAt: formatHM(next),
    clearBy: [
      ...(sideCut.S != null ? [{ side: 'South', at: formatHM(next - sideCut.S) }] : []),
      ...(sideCut.N != null ? [{ side: 'North', at: formatHM(next - sideCut.N) }] : []),
    ],
  };

  // Hero.
  const known = s.vesselRemaining != null;
  const pct = known ? s.percentComplete : s.percentFieldCounted;
  let clerkBadge: { ok: boolean; text: string } | null = null;
  let clerkLine: { tone: 'red' | 'green' | 'muted'; text: string } | null = null;
  if (recon) {
    const c = s.clerk; // the engine's clerk check: match / mismatch / unknown
    const off = c && s.vesselRemaining != null ? Math.abs(c.remaining - s.vesselRemaining) : null; // size of the gap, for wording only
    if (c?.status === 'match') {
      clerkBadge = { ok: true, text: 'Matches clerk' };
      clerkLine = { tone: 'green', text: `Chief clerk at ${c.time}: ${fmt(c.remaining)}` };
    } else if (c?.status === 'mismatch') {
      clerkBadge = { ok: false, text: `Off by ${fmt(off)}` };
      clerkLine = { tone: 'red', text: `Discrepancy: ${fmt(off)} autos · Chief clerk ${c.time}: ${fmt(c.remaining)} · Yours: ${fmt(s.vesselRemaining)}` };
    } else if (c) clerkLine = { tone: 'muted', text: `Chief clerk at ${c.time}: ${fmt(c.remaining)} · can’t compare until every active deck has a remaining count` };
    else clerkLine = { tone: 'muted', text: 'Chief clerk count not logged for this break.' };
  }
  const rows: { k: string; v: string; sub?: string }[] = [];
  if (known) rows.push({ k: 'Ship progress', v: fmt(s.progress) });
  rows.push({ k: 'Field record', v: fmt(s.field) });
  let gapNote: string | null = null;
  if (s.variance != null && !recon) {
    const dv = s.drivers;
    // Colby, 2026-10-08: only which side is ahead and by how much; no warning when the gap passes the driver count.
    if (s.variance < 0) gapNote = `Field is ${fmt(-s.variance)} over ship progress.`;
    else {
      rows.push({ k: 'Gap (in transit)', v: fmt(s.variance), sub: dv ? `of ${dv.n} drivers` : undefined });
      if (s.variance > 0) gapNote = `Field is ${fmt(s.variance)} under ship progress.`;
    }
  }
  // The field record box (Colby, 2026-10-08): the official hourly counts, apart from the vessel balance. `rows` above stays the full
  // list (screens 01-03 pin it); the hero shows only what is about the ship.
  const lastP = s.periods.at(-1);
  const fieldRecord = {
    rows: [
      { k: 'Field count', v: fmt(s.field) },
      { k: 'Field balance', v: fmt(s.fieldBalance), sub: 'starting − field' },
      ...(s.variance != null && s.variance >= 0 ? [{ k: 'In transit', v: fmt(s.variance), sub: s.drivers ? `of ${s.drivers.n} drivers` : undefined }] : []),
      { k: 'Last hour logged', v: lastP ? `${lastP.day > 1 ? `Day ${lastP.day} ` : ''}${lastP.start} · ${fmt(lastP.count)}` : '—' },
      { k: 'Counted hours', v: String(s.production.countedHours) },
    ] as { k: string; v: string; sub?: string }[],
    note: 'Hourly field counts are the official record. Autos only; H/H is never added.',
  };
  const hero = {
    label: known ? 'VESSEL REMAINING' : 'FIELD BALANCE',
    value: fmt(known ? s.vesselRemaining : s.fieldBalance),
    of: `of ${fmt(s.start)} autos · ${pct == null ? '—' : pct.toFixed(1)}%${known ? ' complete' : ''}`,
    // Under the bar: how many are done (left, under the dark part) and how many to go (right). Both come from the same ledger as the headline.
    barLeft: known ? `${fmt(s.progress)} done` : `${fmt(s.field)} counted`,
    barRight: `${fmt(known ? s.vesselRemaining : s.fieldBalance)} to go`,
    pct: pct ?? 0,
    clerkBadge, clerkLine, rows, heroRows: rows.filter((r) => r.k === 'Ship progress'), gapNote,
    unknownNote: known ? null : `Vessel remaining unknown · needs a remaining count on ${s.missingDecks.join(', ')}`,
  };

  // Tiles.
  const e = s.eta;
  const basisRem = s.vesselRemaining ?? s.fieldBalance;
  const eta = s.vesselRemaining === 0 ? { value: '0', day: null, notes: ['Nothing remaining on vessel'], dashed: e.etaAbs == null }
    : e.etaAbs != null ? {
      value: formatHM(e.etaAbs),
      day: e.etaAbs >= 1440 ? `Day ${Math.floor(e.etaAbs / 1440) + 1}` : null,
      notes: [`${fmt(basisRem)} ÷ ${Math.round(e.rate!)}/hr pace (last ${e.hoursUsed} hr)`, ...(e.basisNote ? ['Based on field balance'] : [])],
      dashed: false,
    } : { value: '—', day: null, notes: [e.reason ?? ''], dashed: true };
  const p = s.production;
  const ha = {
    value: p.ha == null ? '—' : String(Math.round(p.ha)),
    perHr: p.ha != null,
    notes: p.ha == null ? ['No counted hours yet'] : [
      `${fmt(s.field)} ÷ ${p.countedHours} counted hr`,
      ...(p.pace != null ? [`Pace ${Math.round(p.pace)}/hr over ${(p.prodMin / 60).toFixed(2)} productive hr`] : []),
    ],
  };

  // Remaining by brand.
  const left = s.brands.filter((x) => x.remaining == null || x.remaining > 0).length;
  const brands = {
    total: fmt(known ? s.vesselRemaining : null),
    left, count: s.brands.length, finished: s.brands.length - left,
    rows: s.brands.map((x) => ({ name: x.name, remaining: fmt(x.remaining), start: fmt(x.start), pct: x.remaining == null ? null : (x.remaining / x.start) * 100 })), // null: no bar (unknown ≠ finished)
  };

  return { banners, strip, openIssues: openIssues.length, hero, fieldRecord, eta, ha, brands, side: sideSplit(s, b) };
}

// Side split from destinations; autos left per side only when each brand goes to one side.
export function sideSplit(s: State, b: Baseline) {
  const cb = b.destinations.reduce((m, d) => Math.max(m, d.clearBy || 0), 0);
  const missing = b.destinations.filter((d) => typeof d.autos !== 'number').map((d) => d.name);
  if (missing.length) {
    const unknown = { pct: '—', autos: null, note: 'unknown' };
    return { unknown: `Auto counts missing for ${missing.join(', ')}; side split unknown.`, northPct: null, clearByNote: '', north: unknown, south: unknown };
  }
  const autos = { N: 0, S: 0 }, bSide: Record<string, 'N' | 'S' | 'mixed'> = {};
  for (const d of b.destinations) {
    autos[d.side] += d.autos ?? 0;
    for (const br of d.brands ?? []) bSide[br] = bSide[br] && bSide[br] !== d.side ? 'mixed' : d.side;
  }
  const remaining = (side: 'N' | 'S'): number | null => {
    let r = 0;
    for (const br of s.brands) {
      const x = bSide[br.name];
      if (x === 'mixed') return null;
      if (x === side) { if (br.remaining == null) return null; r += br.remaining; }
    }
    return r;
  };
  const tot = autos.N + autos.S, pn = tot ? (autos.N / tot) * 100 : 0;
  const col = (side: 'N' | 'S', pc: number) => {
    const r = autos[side] ? remaining(side) : 0;
    return { pct: `${pc.toFixed(1)}%`, autos: autos[side] as number | null, note: autos[side] ? `${fmt(autos[side])} autos · ${r == null ? 'remaining unknown' : `${fmt(r)} left`}` : 'None to this side' };
  };
  return {
    unknown: null,
    northPct: pn as number | null,
    clearByNote: cb ? `Clear-by −${[autos.S && `${CLEAR_BY_MIN.Southside} S`, autos.N && `${CLEAR_BY_MIN.Northside} N`].filter(Boolean).join(' / ')}` : '',
    north: col('N', pn),
    south: col('S', 100 - pn),
  };
}

// ---------- Decks ----------

export function heightChip(d: Deck): { tone: 'red' | 'orange' | 'plain'; text: string } {
  const h = d.height;
  if (h.current == null) return { tone: 'plain', text: 'Height unknown' };
  if (h.level === 'hard') return { tone: 'red', text: `${m2(h.current)} · low deck, no vans` };
  if (h.level === 'soft') return { tone: 'orange', text: `${m2(h.current)} · unconfirmed` };
  return { tone: 'plain', text: `Height ${m2(h.current)}${h.confirmed ? ' · confirmed' : ''}` };
}

export const STATUS_PILL = { active: 'Active', paused: 'Paused', notStarted: 'Not started', complete: 'Complete', unknown: 'Unknown' } as const;
export const pill = (d: Deck) => (d.status === 'notStarted' && d.skipped ? 'Skipped' : STATUS_PILL[d.status]);

export function decksView(s: State) {
  const low = s.decks.filter(isLow).map((d) => ({
    id: d.id,
    title: `${d.label} is a low deck: ${m2(d.height.current!)} · shuttle vans can’t drive on`,
    sub: `${d.height.confirmed ? `Confirmed ${d.height.confirmed.time}` : 'Per stow plan'} · ${d.rem == null ? 'remaining count needed' : `${fmt(d.rem)} autos remaining`}`,
  }));
  const unconfirmed = s.decks.filter(isUnconfirmed).length;
  const rows = s.decks.map((d) => ({
    id: d.id,
    label: d.label,
    pill: pill(d),
    status: d.status,
    remaining: fmt(d.rem),
    start: fmt(d.start),
    low: d.height.level === 'hard',
    cleared: d.status === 'complete'
      ? `Cleared ${Object.entries(d.brandStart).map(([b, q]) => `${fmt(q)} ${b}`).join(' + ')} · ${d.time == null ? 'time not provided' : /^(Logged|time not)/.test(d.time) ? d.time : `at ${d.time}`}`
      : null,
    height: heightChip(d),
    photos: photosIn(livePhotos(s).filter((x) => x.deck === d.id)),
    // Deck-level split (game plan): one line for the deck; hatch chips show the hatch name only.
    split: h0(d) ? null : Object.entries(d.brandStart).map(([b, q]) => `${fmt(q)} ${b}`).join(' + '),
    hatches: d.hatches.map((h) => ({ h: h.h, text: h.qty == null ? '' : h.items.map((i) => `${i.brand} ${i.qty}`).join(' + '), photos: photosIn(livePhotos(s).filter((x) => x.deck === d.id && x.hatch === h.h)) })),
  }));
  return { low, unconfirmed, rows };
}

// Decks still to work: everything not Complete (Not started, Active, Paused, Unknown, skipped ones included: they still hold cargo).
export const decksRemaining = <T extends { status: string }>(rows: T[]): T[] => rows.filter((r) => r.status !== 'complete');

// High & Heavy count for Plan (its own ledger). Unknown when a row was not read, or when the rows don't add to the
// printed game plan TOTAL (stored as hhTotal; null = not read). Reference baselines without hhTotal show their rows' sum.
export function hhText(b: Record<string, unknown>): string {
  const hh = b.hh as { qty: number | null }[] | undefined;
  if (!hh || hh.some((x) => x.qty == null)) return '—';
  const sum = hh.reduce((t, x) => t + x.qty!, 0);
  if ('hhTotal' in b && b.hhTotal !== sum) return '—';
  return fmt(sum);
}

export function deckSheet(d: Deck, b: Baseline) {
  const heights = b.decks.find((x) => x.id === d.id)?.heights ?? [];
  return {
    title: `${d.label} · ${fmt(d.start)} autos`,
    pill: pill(d),
    remaining: fmt(d.rem),
    height: heightChip(d),
    possible: heights.length ? `Possible: ${heights.map((h) => h.m.toFixed(2)).join(' / ')} m` : 'Possible heights not on the stow plan',
    hatches: d.hatches.map((h) => ({ h: h.h, qty: h.qty, rem: h.rem, brands: h.qty == null ? 'count not on paperwork' : h.items.map((i) => `${i.brand} ${i.qty}`).join(' + ') })),
    // Deck-level split (game plan): the brands are known for the deck, not per hatch.
    split: h0(d) ? null : Object.entries(d.brandStart).map(([b, q]) => `${fmt(q)} ${b}`).join(' + '),
    history: d.history.slice(-3).map((x) => `${x.time} ${STATUS_PILL[x.status]}`),
    // The sheet opens with what was last entered (Active/Paused only); clearing a box saves "unknown".
    prefill: d.status === 'active' || d.status === 'paused' ? d.entered : { hatches: {}, deck: null },
  };
}

// ---------- Hourly ----------

// "H/H started 08:30" / "H/H complete 10:00" / "H/H ended with the shift" for the markers inside an hour.
export function hhTagsFor(s: State, x: { day: number; start: string }): string[] {
  const a = (x.day - 1) * 1440 + parseHM(x.start)!;
  const z = (x.day - 1) * 1440 + (preBreak(x.start, s.breaks) ?? parseHM(x.start)! + 60);
  const within = (abs: number | null) => abs != null && abs >= a && abs < z;
  return s.hh.passes.flatMap((p) => [
    ...(within(p.start.abs) ? [`H/H started ${p.start.label}`] : []),
    ...(p.end ? (within(p.end.abs) ? [`H/H complete ${p.end.label}`] : []) : p.endedWithShift && within(p.endAbs) ? ['H/H ended with the shift'] : []),
  ]);
}

export function hourlyView(s: State, b?: Baseline) {
  const p = s.production;
  // Field over ship is red only when the ship must equal the field (a break or shift end); mid-work it's just the gap to watch.
  const reconciling = s.ops.phase !== 'working';
  const brandTable = s.brands.map((b) => {
    const d = b.variance == null ? null : 0 - b.variance; // field − cleared, as the tracker shows it
    return {
      name: b.name,
      field: `${b.fieldExact ? '' : '≥ '}${fmt(b.field)}`,
      cleared: fmt(b.cleared),
      diff: d == null ? { tone: 'plain' as const, text: '—' } : d > 0 ? { tone: reconciling ? 'red' as const : 'plain' as const, text: `+${fmt(d)} field over` } : d < 0 ? { tone: 'plain' as const, text: `${fmt(-d)} in transit` } : { tone: 'plain' as const, text: '0' },
    };
  });
  const max = Math.max(1, ...s.periods.map((x) => x.count));
  const ph = photoHourNotes(s);
  const multi = s.periods.some((x) => x.day > 1);
  const rows = s.periods.map((x, i) => {
    const start = parseHM(x.start)!;
    return {
      dayHeader: multi && (i === 0 || s.periods[i - 1].day !== x.day) ? `Day ${x.day}` : null,
      range: `${x.start}–${formatHM(preBreak(x.start, s.breaks) ?? start + 60)}`,
      count: fmt(x.count),
      barPct: (x.count / max) * 100,
      short: x.short ? (x.min != null ? `Stopped ${formatHM(start + x.min)} · ${x.min} min worked · pace ${Math.round(x.pace!)}/hr` : 'Stoppage time not set') : null,
      shortUnset: x.short && x.min == null,
      // An hour with fewer minutes for a stated reason (the 07:00 safety meeting), not a break.
      minNote: !x.short && x.reason && x.min != null ? `${x.min} min worked (${x.reason.toLowerCase()}) · pace ${Math.round(x.pace!)}/hr` : null,
      // Why a pre-break hour runs lower: each destination side stops clear-by minutes before the break (protocol App. C).
      cutoff: x.short && b ? cutoffNote(b, preBreak(x.start, s.breaks)) : null,
      corrected: x.was?.length ? `Was ${x.was.map(fmt).join(' → ')} · original kept` : null,
      delta: x.delta == null ? null
        : `${x.delta >= 0 ? '+' : '−'}${fmt(Math.round(Math.abs(x.delta)))}${x.deltaPaced ? '/hr pace' : ''}${x.deltaPct == null ? '' : ` (${x.deltaPct >= 0 ? '+' : '−'}${Math.abs(x.deltaPct).toFixed(1)}%)`} vs prior hour`,
      photos: ph.forHour(x.day, x.start),
      // H/H markers that fall inside this hour (awareness only: no count, never added to the auto count).
      hhTags: hhTagsFor(s, x),
      brands: x.brands ? Object.entries(x.brands).map(([b, v]) => ({ b, v: fmt(v) })) : [],
      drivers: typeof x.drivers === 'number' && x.drivers > 0
        ? `${x.drivers} drivers${x.driversFrom === 'day' ? ` (Day ${x.day} setting)` : ''} · ${x.driverRate.rate != null ? `${x.driverRate.rate.toFixed(2)} per driver per productive hr` : 'per-driver rate needs the stoppage time'}`
        : null,
    };
  });
  return {
    stats: { ha: p.ha == null ? '—' : String(Math.round(p.ha)), haNote: `${fmt(s.field)} ÷ ${p.countedHours} hr`, pace: p.pace == null ? '—' : String(Math.round(p.pace)), paceNote: p.pace == null ? 'no productive time' : 'per productive hr', total: fmt(s.field) },
    paceLine: p.pace != null ? `Pace = ${fmt(p.prodCount)} ÷ ${(p.prodMin / 60).toFixed(2)} productive hr. Pre-break hours count only the minutes worked before stoppage.${s.periods.some((x) => x.reason) ? ' A day that starts at 07:00 counts its first hour as 50 minutes (safety meeting 07:00-07:10).' : ''}` : null,
    unsetShort: p.unsetShort.length ? `Stoppage time not set for ${p.unsetShort.map((x) => `${x}–${formatHM(preBreak(x, s.breaks) ?? parseHM(x)! + 60)}`).join(', ')}` : null,
    brandTable,
    unsplitNote: s.unsplit ? `${fmt(s.unsplit)} autos were logged without a brand split, so brand field totals are minimums.` : null,
    rows,
    photosNoTime: ph.noTime, photosOutside: ph.outside,
    graph: s.periods.length ? graph(s) : null,
  };
}

function cutoffNote(b: Baseline, breakMin: number | null): string | null {
  if (breakMin == null) return null;
  const sides = new Map<'N' | 'S', number>();
  for (const d of b.destinations) sides.set(d.side, d.clearBy);
  const parts = ([['S', 'Southside'], ['N', 'Northside']] as const).filter(([k]) => sides.has(k))
    .map(([k, name]) => `${name} −${sides.get(k)} min (stop ${formatHM(breakMin - sides.get(k)!)})`);
  return parts.length ? `Clear-by before the ${formatHM(breakMin)} break: ${parts.join(' · ')}` : null;
}

// Tracker hourGraph(): pace line (count for hours with no pace), counts labeled,
// dashed average pace, orange dots for short hours. 340×220 viewBox.
export function graph(s: State) {
  const P = s.periods, multi = P.some((x) => x.day > 1);
  const vals = P.map((x) => (x.pace != null ? x.pace : x.count)), avg = s.production.pace;
  const all = vals.concat(avg != null ? [avg] : []);
  let lo = Math.min(...all), hi = Math.max(...all);
  const span = Math.max(hi - lo, 20), raw = (span * 1.5) / 4;
  const step = [5, 10, 20, 25, 50, 100].find((x) => x >= raw) ?? 100;
  lo = Math.max(0, Math.floor((lo - span * 0.2) / step) * step);
  hi = Math.ceil((hi + span * 0.25) / step) * step;
  const nT = Math.round((hi - lo) / step);
  const W = 340, H = 220, L = 36, R = 26, T = 16, Bm = 40, iw = W - L - R, ih = H - T - Bm, pad = 18;
  const x = (i: number) => L + pad + (P.length === 1 ? (iw - 2 * pad) / 2 : (i * (iw - 2 * pad)) / (P.length - 1));
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo)) * ih;
  return {
    W, H, L, R, T, Bm,
    grid: Array.from({ length: nT + 1 }, (_, k) => ({ y: y(lo + step * k), label: String(Math.round(lo + step * k)) })),
    avgY: avg != null ? y(avg) : null,
    points: P.map((q, i) => ({ x: x(i), y: y(vals[i]), count: String(q.count), short: q.short, xLabel: `${multi && q.day > 1 ? `D${q.day} ` : ''}${q.start.slice(0, 2)}` })),
    note: `Numbers are each hour’s count; the line is its pace per full hour. Dashed line = average pace${avg != null ? ` (${Math.round(avg)}/hr)` : ''}.`,
    hasShort: P.some((q) => q.short),
  };
}

// ---------- Plan ----------

export function planView(s: State, b: Baseline, recheck: ReadonlySet<string> = new Set()) {
  const pending = s.decks.filter((d) => d.status !== 'complete' && (d.height.level === 'soft' || recheck.has(d.id)));
  const confirmed = s.decks.filter((d) => d.height.confirmed && !recheck.has(d.id));
  const heights = {
    pending: pending.map((d) => ({
      id: d.id, label: d.label,
      stow: `Stow plan: ${d.height.stow ? m2(d.height.stow.m) : '—'}`,
      options: [...(b.decks.find((x) => x.id === d.id)?.heights ?? [])].sort((x, y) => y.m - x.m)
        .map((h) => ({ m: h.m, label: `Set at ${m2(h.m)}`, selected: d.height.confirmed?.m === h.m })),
    })),
    confirmed: confirmed.map((d) => ({ id: d.id, text: `${d.label} ${m2(d.height.current!)} ✓ · change`, low: d.height.level === 'hard' })),
  };
  const open = s.issues.filter((i) => i.status === 'open');
  const resolved = s.issues.filter((i) => i.status === 'resolved').slice(-5);
  const v = (b.verification ?? {}) as { status?: string; discrepancies?: string[]; missing?: string[]; checks?: string[] };
  const labor = (b.labor ?? {}) as { autoDrivers?: number; gangs?: number[]; vanDrivers?: number; heavyGang?: number };
  return {
    heights,
    issues: {
      open: open.map((i) => ({ id: i.id, text: i.text, opened: i.openedAt.startsWith('Logged') ? i.openedAt : `Opened ${i.openedAt}` })),
      resolved: resolved.length ? `Recently resolved: ${resolved.map((i) => `${i.text} (${i.resolvedAt})`).join(' · ')}` : null,
    },
    // Ship-specific notes: current ones, then removed ones (kept in the log, shown greyed with the reason).
    notes: {
      current: s.notes.filter((n) => !n.removed).map((n) => ({ id: n.id, title: n.title, text: n.text, meta: `${n.createdAt}${n.edited ? ' · edited' : ''}${n.source === 'photo-read' ? ' · read from a photo' : ''}` })),
      removed: s.notes.filter((n) => n.removed).map((n) => ({ id: n.id, text: n.text, meta: `Removed ${n.removedAt} · ${n.removedReason}` })),
    },
    baseline: {
      start: fmt(s.start),
      brands: s.brands.map((x) => `${fmt(x.start)} ${x.name}`).join(' + '),
      hh: hhText(b),
      // 'verified' comes with reference baselines; a new vessel's load list check says it in words (Setup › Load list).
      verified: v.status === 'verified' || v.status === 'Load list matches the decks',
      status: v.status && v.status !== 'verified' ? v.status : null,
      discrepancyLines: v.discrepancies ?? [],
      discrepancies: `${(v.discrepancies ?? []).length} discrepancies`,
      missing: (v.missing ?? []).length ? `Missing: ${v.missing!.join(', ')}` : 'Nothing missing',
      checks: v.checks ?? [],
      sources: `Sources: ${((b.sources as string[] | undefined) ?? []).join('; ')}`,
    },
    // H/H timeline (awareness only, spec 7g): state, each pass, and what was observed on the car hours. Never a cause.
    hh: {
      text: s.hh.text,
      units: hhText(b as unknown as Record<string, unknown>),
      passes: s.hh.passes.map((p, i) => `Pass ${i + 1}: started ${p.start.label}; ${p.end ? `complete ${p.end.label}` : p.endedWithShift ? 'ended with the shift (no closing time entered)' : 'still active'}`),
      lines: s.hh.analysis?.lines ?? [],
    },
    labor: {
      start: b.start,
      autoDrivers: `${fmt(labor.autoDrivers)}${labor.gangs ? ` · ${labor.gangs.join(' + ')}` : ''}`,
      vanDrivers: fmt(labor.vanDrivers),
      heavyGang: fmt(labor.heavyGang),
    },
    forecast: {
      breaks: `${b.breaks.map((x) => formatHM(parseHM(x)!)).join(' and ')} · 1 hour each`,
      dayEnd: s.plan.shiftEnd ?? 'Works until finished',
      nextStart: s.plan.nextStart ?? b.start,
    },
    destinations: {
      title: `Destinations from Berth ${String(b.berth)}`,
      rows: b.destinations.map((d) => ({
        name: `${d.name} · ${d.side === 'N' ? 'Northside' : 'Southside'}`,
        autos: fmt(d.autos),
        note: `${(d.brands ?? []).join(' + ')} · ${d.mi == null ? '—' : d.mi.toFixed(2)} mi · ${d.ref || 'no reference time'} · clear-by −${d.clearBy} min`,
      })),
      footnote: 'Miles: measured route distances (Protocol App. D). Reference times: cycle scope (one-way vs round trip) unspecified.',
    },
    // Drivers are set once per workday; Day 2 is always offered so it can be set ahead.
    workday: Array.from({ length: Math.max(2, s.ops.day, ...Object.keys(s.workdayDrivers).map(Number)) }, (_, i) => {
      const day = i + 1, n = s.workdayDrivers[day];
      return { day, label: `Day ${day} drivers`, value: n != null ? `${fmt(n)} drivers` : `Not set${labor.autoDrivers != null ? ` (labor order ${fmt(labor.autoDrivers)})` : ''}`, n: n ?? null };
    }),
    // Operations start on the hour unless delayed; an actual start is shown only when one was recorded.
    dayStarts: Object.entries(s.dayStarts).map(([k, d]) => ({
      day: Number(k), label: `Day ${k} start`, planned: d.planned, actual: d.actual, cause: d.cause,
      value: d.actual == null ? `Planned ${d.planned}` : `Started ${d.actual}${d.lateMin > 0 ? ` (late ${d.lateMin} min)` : ''}`,
    })),
    breakLog: s.breakLog.map((x) => ({
      label: x.kind === 'shift' ? 'Shift' : x.kind === 'missed' ? 'Break · added later' : x.edited ? 'Break · edited' : 'Break',
      value: x.end ? `${x.start}–${x.end}` : `${x.start} · in progress`,
    })),
  };
}


// ---------- Log sheet: hour picker (tracker logSheet) ----------

// Hours for the current day follow the day's start time. Hours that would run through a
// break start are left out (the engine refuses them). Default: the hour after the last
// one logged today, skipping the break hour; otherwise the first open hour.
export function hourOptions(s: State, b: Baseline) {
  const day = s.ops.day;
  const breaks = b.breaks.map((x) => parseHM(x)!);
  const dayStart = parseHM(day > 1 ? s.plan.nextStart ?? b.start : b.start)!;
  const logged = new Set(s.periods.filter((p) => p.day === day).map((p) => p.start));
  const hours: { start: string; end: string; short: boolean; logged: boolean }[] = [];
  for (let m = dayStart; m <= 23 * 60; m += 60) {
    const start = formatHM(m);
    const cut = breaks.find((x) => m < x && x < m + 60); // a break inside the hour: it runs to the break and is the short hour
    hours.push({ start, end: formatHM(cut ?? m + 60), short: cut != null || breaks.includes(m + 60), logged: logged.has(start) });
    if (cut != null) m = cut; // resume after the break hour
  }
  const last = s.periods.filter((p) => p.day === day).at(-1);
  let next = last ? (preBreak(last.start, b.breaks) ?? parseHM(last.start)! + 60) : dayStart;
  if (breaks.includes(next)) next += 60;
  const open = hours.find((h) => h.start === formatHM(next)) ?? hours.find((h) => !h.logged) ?? hours[0];
  return { day, hours, defaultStart: open?.start ?? null };
}

// ---------- Van list (Plan) ----------
// Display strings for the shuttle van list. Counts come from vanTally; a blank stays "not recorded", never a default.
const vanTime = (t: { day: number; hm: string } | null) => (t == null ? 'time not provided' : t.day > 1 ? `Day ${t.day} ${t.hm}` : t.hm);

export function vanView(s: State) {
  const t = vanTally(s.vans);
  const rows = s.vans.map((v) => {
    const numberLines = v.changes.filter((c) => !c.assignment && (c.field === 'number' || c.field === 'driver')).reverse(); // newest first
    const other = v.changes.filter((c) => c.assignment || (c.field !== 'number' && c.field !== 'driver')).reverse();
    return {
      id: v.id, slot: v.slot, removed: v.removed, removedNote: v.removed ? `Removed ${v.removedAt} · ${v.removedReason}` : null,
      title: v.number ? `Van ${v.number}` : `Van slot ${v.slot}`,
      driver: v.driver ?? (v.number ? 'Driver not recorded' : null),
      status: STATUS_LABEL[v.status], statusKey: v.status, lasher: v.lasher,
      times: v.number ? `Out ${vanTime(v.out)} · In ${vanTime(v.in)}` : null,
      gas: v.gas ? `Gas ${v.gas}` : v.number ? 'Gas not recorded' : null,
      gassed: v.gassed === 'gassed' ? { tone: 'green' as const, text: `Gassed ✓${v.gassedAt ? ` ${vanTime(v.gassedAt)}` : ''}` }
        : v.gassed === 'not_gassed' ? { tone: 'red' as const, text: `Not gassed${v.gassedNote ? `: ${v.gassedNote}` : ''}` }
        : v.number ? { tone: 'plain' as const, text: 'Gassing not recorded' } : null,
      remarks: v.remarks,
      history: numberLines.map((c) => ({ text: c.text, at: c.at, note: c.note })),
      allChanges: other.map((c) => ({ text: c.assignment ? `${c.text} (first entry)` : c.text, at: c.at, note: c.note })),
    };
  });
  return {
    exists: s.vans.length > 0,
    header: `${t.assigned} of ${t.total} vans assigned`,
    counts: `Out ${t.out} · Back ${t.back} · Not out yet ${t.notOut}`,
    lashers: `Lasher vans ${t.lashers}`,
    gassing: `Gassed ${t.gassed} · Not gassed ${t.notGassed} · Not recorded ${t.notRecorded} (of ${t.assigned})`,
    alert: gassingAlert(s.vans, s.vesselRemaining),
    backToMark: backNotMarked(s.vans).map((v) => ({ id: v.id, label: `Van ${v.number}` })),
    rows: [...rows.filter((r) => !r.removed), ...rows.filter((r) => r.removed)],
  };
}

// ---------- Sidebar vessel list ----------
// LIVE and TEST are listed apart (a TEST vessel never sits among live ones). The open vessel leads its group,
// the rest newest date first; an unreadable date sorts last. Archived vessels stay hidden unless shown or open.
type RowLike = { operationId: string; name: string; isTest: boolean; date: string; archived: boolean };
const dateKey = (d: string): number => {
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d.trim());
  const t = us ? Date.UTC(+us[3], +us[1] - 1, +us[2]) : /^\d{4}-\d{2}-\d{2}$/.test(d.trim()) ? Date.parse(`${d.trim()}T00:00:00Z`) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};
export function sidebarVessels<R extends RowLike>(rows: R[], currentId: string, showArchived = false): { live: R[]; test: R[] } {
  const rank = (a: R, b: R) => (a.operationId === currentId ? -1 : b.operationId === currentId ? 1
    : dateKey(a.date) === dateKey(b.date) ? a.name.localeCompare(b.name) : dateKey(b.date) > dateKey(a.date) ? 1 : -1);
  const shown = rows.filter((r) => showArchived || !r.archived || r.operationId === currentId).sort(rank);
  return { live: shown.filter((r) => !r.isTest), test: shown.filter((r) => r.isTest) };
}

// Startup: try the last-opened vessel first, then the others in list order, so one vessel that cannot open never locks the app.
export const startOrder = (ids: string[], last: string | null): string[] => (last && ids.includes(last) ? [last, ...ids.filter((i) => i !== last)] : ids);

// Opens the first vessel that works, in startOrder; returns which vessels failed and why, so the app can say so.
export async function openFirst(ids: string[], last: string | null, open: (id: string) => Promise<void>): Promise<{ opened: string | null; failed: { id: string; error: string }[] }> {
  const failed: { id: string; error: string }[] = [];
  for (const id of startOrder(ids, last)) {
    try { await open(id); return { opened: id, failed }; }
    catch (e) { failed.push({ id, error: (e as Error).message }); }
  }
  return { opened: null, failed };
}

// ---------- Backup nudges ----------
// The phone's log is the only official record. When entries are not in a saved copy, the app says so and offers
// one tap to save one. TEST vessels are practice data, so they are never nagged.
export const offerCopy = (unsaved: number, isTest: boolean): boolean => unsaved > 0 && !isTest;
export function unsavedNote(unsaved: number, lastAt: string | null): string | null {
  if (unsaved <= 0) return null;
  const n = `${unsaved.toLocaleString('en-US')} ${unsaved === 1 ? 'entry' : 'entries'} not backed up.`;
  return lastAt ? `${n} Last copy: ${lastAt.replace('T', ' ').slice(0, 16)} (phone clock).` : `${n} No copy saved yet.`;
}
