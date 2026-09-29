// Display-only derivations the VSA Live tracker makes while drawing screens
// (viewSnap, viewDecks, viewHourly, hourGraph, viewPlan). No protocol math here:
// every number comes from the engine's project() state; this only picks, rounds
// and words it the way the tracker does. Pure and tested (tests/view.test.ts).
import { formatHM, parseHM, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';

export type Tone = 'break' | 'red' | 'orange' | 'green';
export type Banner = { tone: Tone; title: string; sub: string; trackable: boolean; tracked: boolean };

const fmt = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('en-US'));
const m2 = (m: number) => `${m.toFixed(2)} m`;
type Deck = State['decks'][number];
const isLow = (d: Deck) => d.height.level === 'hard' && d.status !== 'complete';
const isUnconfirmed = (d: Deck) => d.height.level === 'soft' && d.status !== 'complete';

// Tab badges: low decks with cargo left (Decks); unconfirmed heights with cargo left (Plan).
export function badges(s: State) {
  return { decks: s.decks.filter(isLow).length, plan: s.decks.filter(isUnconfirmed).length };
}

export function subtitles(s: State, b: Baseline) {
  const last = s.periods.at(-1);
  const through = last ? `${last.day > 1 ? `Day ${last.day} ` : ''}${formatHM(parseHM(last.start)! + 60)}` : null;
  return {
    snap: `${b.date} · ${through ? `Field counts through ${through}` : 'No counts yet'}`,
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
  const alert = (tone: Tone, title: string, sub: string): Banner => ({ tone, title, sub, trackable: true, tracked: tracked(title) });
  const nextStart = s.plan.nextStart ?? b.start;

  const banners: Banner[] = [];
  if (s.ops.shiftEnded) banners.push({ tone: 'break', title: 'SHIFT ENDED', sub: `At ${s.ops.shiftEnd} · Day ${s.ops.day + 1} starts ${nextStart}`, trackable: false, tracked: false });
  else if (s.ops.onBreak) banners.push({ tone: 'break', title: 'ON BREAK', sub: `From ${s.ops.breakStart}`, trackable: false, tracked: false });
  if (s.field > s.start) banners.push(alert('red', `Field count exceeds starting cargo by ${fmt(s.field - s.start)}`, `Field ${fmt(s.field)} · Starting ${fmt(s.start)} · Check hourly entries`));
  if (recon) {
    const v = s.variance;
    if (v == null) banners.push({ tone: 'orange', title: `${endShift ? 'End-of-shift' : 'Break'} reconciliation waiting on deck counts`, sub: `Add a remaining count for ${s.missingDecks.join(', ')} to compare ship and field.`, trackable: false, tracked: false });
    else if (v < 0) banners.push(alert('red', `${label}: field exceeds ship by ${fmt(-v)}`, `Ship progress ${fmt(s.progress)} · Field ${fmt(s.field)} · These should match ${when}`));
    else if (v > 0) banners.push(alert('orange', `${label}: ship is ${fmt(v)} ahead of field`, `Ship progress ${fmt(s.progress)} · Field ${fmt(s.field)} · No cars should be in transit ${when}`));
    else banners.push({ tone: 'green', title: `${endShift ? 'End-of-shift' : 'Break'} reconciliation: ship and field match`, sub: `Both at ${fmt(s.field)}`, trackable: false, tracked: false });
    for (const br of s.brands) {
      if (br.variance == null || br.variance === 0) continue;
      banners.push(alert(br.variance < 0 ? 'red' : 'orange', `${label}: ${br.name} field ${br.variance < 0 ? 'exceeds' : 'is short of'} cleared by ${fmt(Math.abs(br.variance))}`,
        `Field ${fmt(br.field)} · Cleared from ship ${fmt(br.cleared)}`));
    }
  }
  const nowAbs = (s.ops.day - 1) * 1440 + nowMin;
  if (s.eta.etaAbs != null && s.vesselRemaining !== 0 && !recon && nowAbs > s.eta.etaAbs) {
    banners.push({ tone: 'orange', title: 'Forecast passed · completion not reported', sub: 'Log a count or update decks to refresh.', trackable: false, tracked: false });
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
    if (s.variance < 0) gapNote = `Field is ${fmt(-s.variance)} ahead of ship progress · recheck deck counts; reconciles at break`;
    else if (dv && s.variance > dv.n) gapNote = `Gap ${fmt(s.variance)} is more than ${dv.n} drivers (${dv.src}) · recheck counts`;
    else rows.push({ k: 'Gap (in transit)', v: fmt(s.variance), sub: dv ? `of ${dv.n} drivers` : undefined });
  }
  const hero = {
    label: known ? 'VESSEL REMAINING' : 'FIELD BALANCE',
    value: fmt(known ? s.vesselRemaining : s.fieldBalance),
    of: `of ${fmt(s.start)} autos · ${pct == null ? '—' : pct.toFixed(1)}% ${known ? 'complete' : 'field-counted'}`,
    pct: pct ?? 0,
    clerkBadge, clerkLine, rows, gapNote,
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

  return { banners, strip, openIssues: openIssues.length, hero, eta, ha, brands, side: sideSplit(s, b) };
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
    clearByNote: cb ? `Clear-by −${autos.S ? '30 S / ' : ''}${autos.N ? '15 N' : ''}` : '',
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
    hatches: d.hatches.map((h) => ({ h: h.h, text: h.items.map((i) => `${i.brand} ${i.qty}`).join(' + ') })),
  }));
  return { low, unconfirmed, rows };
}

export function deckSheet(d: Deck, b: Baseline) {
  const heights = b.decks.find((x) => x.id === d.id)?.heights ?? [];
  return {
    title: `${d.label} · ${fmt(d.start)} autos`,
    pill: pill(d),
    remaining: fmt(d.rem),
    height: heightChip(d),
    possible: heights.length ? `Possible: ${heights.map((h) => h.m.toFixed(2)).join(' / ')} m` : 'Possible heights not on the stow plan',
    hatches: d.hatches.map((h) => ({ h: h.h, qty: h.qty, rem: h.rem, brands: h.items.map((i) => `${i.brand} ${i.qty}`).join(' + ') })),
    history: d.history.slice(-3).map((x) => `${x.time} ${STATUS_PILL[x.status]}`),
    // The sheet opens with what was last entered (Active/Paused only); clearing a box saves "unknown".
    prefill: d.status === 'active' || d.status === 'paused' ? d.entered : { hatches: {}, deck: null },
  };
}

// ---------- Hourly ----------

export function hourlyView(s: State) {
  const p = s.production;
  const brandTable = s.brands.map((b) => {
    const d = b.variance == null ? null : 0 - b.variance; // field − cleared, as the tracker shows it
    return {
      name: b.name,
      field: `${b.fieldExact ? '' : '≥ '}${fmt(b.field)}`,
      cleared: fmt(b.cleared),
      diff: d == null ? { tone: 'plain' as const, text: '—' } : d > 0 ? { tone: 'red' as const, text: `+${fmt(d)} field over` } : d < 0 ? { tone: 'plain' as const, text: `${fmt(-d)} in transit` } : { tone: 'plain' as const, text: '0' },
    };
  });
  const max = Math.max(1, ...s.periods.map((x) => x.count));
  const multi = s.periods.some((x) => x.day > 1);
  const rows = s.periods.map((x, i) => {
    const start = parseHM(x.start)!;
    return {
      dayHeader: multi && (i === 0 || s.periods[i - 1].day !== x.day) ? `Day ${x.day}` : null,
      range: `${x.start}–${formatHM(start + 60)}`,
      count: fmt(x.count),
      barPct: (x.count / max) * 100,
      short: x.short ? (x.min != null ? `Stopped ${formatHM(start + x.min)} · ${x.min} min worked · pace ${Math.round(x.pace!)}/hr` : 'Stoppage time not set') : null,
      shortUnset: x.short && x.min == null,
      corrected: x.was?.length ? `Was ${x.was.map(fmt).join(' → ')} · original kept` : null,
      delta: x.delta == null ? null
        : `${x.delta >= 0 ? '+' : '−'}${fmt(Math.round(Math.abs(x.delta)))}${x.deltaPaced ? '/hr pace' : ''} (${x.deltaPct! >= 0 ? '+' : '−'}${Math.abs(x.deltaPct!).toFixed(1)}%) vs prior hour`,
      brands: x.brands ? Object.entries(x.brands).map(([b, v]) => ({ b, v: fmt(v) })) : [],
      drivers: typeof x.drivers === 'number' && x.drivers > 0
        ? `${x.drivers} drivers · ${x.driverRate.rate != null ? `${x.driverRate.rate.toFixed(2)} per driver per productive hr` : 'per-driver rate needs the stoppage time'}`
        : null,
    };
  });
  return {
    stats: { ha: p.ha == null ? '—' : String(Math.round(p.ha)), haNote: `${fmt(s.field)} ÷ ${p.countedHours} hr`, pace: p.pace == null ? '—' : String(Math.round(p.pace)), paceNote: p.pace == null ? 'no productive time' : 'per productive hr', total: fmt(s.field) },
    paceLine: p.pace != null ? `Pace = ${fmt(p.prodCount)} ÷ ${(p.prodMin / 60).toFixed(2)} productive hr. Pre-break hours count only the minutes worked before stoppage.` : null,
    unsetShort: p.unsetShort.length ? `Stoppage time not set for ${p.unsetShort.map((x) => `${x}–${formatHM(parseHM(x)! + 60)}`).join(', ')}` : null,
    brandTable,
    unsplitNote: s.unsplit ? `${fmt(s.unsplit)} autos were logged without a brand split, so brand field totals are minimums.` : null,
    rows,
    graph: s.periods.length ? graph(s) : null,
  };
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
  const hh = b.hh as { qty: number }[] | undefined; // undefined = not on the baseline = unknown
  const labor = (b.labor ?? {}) as { autoDrivers?: number; gangs?: number[]; vanDrivers?: number; heavyGang?: number };
  const sides = sideSplit(s, b);
  return {
    heights,
    issues: {
      open: open.map((i) => ({ id: i.id, text: i.text, opened: i.openedAt.startsWith('Logged') ? i.openedAt : `Opened ${i.openedAt}` })),
      resolved: resolved.length ? `Recently resolved: ${resolved.map((i) => `${i.text} (${i.resolvedAt})`).join(' · ')}` : null,
    },
    baseline: {
      start: fmt(s.start),
      brands: s.brands.map((x) => `${fmt(x.start)} ${x.name}`).join(' + '),
      hh: hh ? fmt(hh.reduce((t, x) => t + x.qty, 0)) : '—',
      verified: v.status === 'verified',
      discrepancies: `${(v.discrepancies ?? []).length} discrepancies`,
      missing: (v.missing ?? []).length ? `Missing: ${v.missing!.join(', ')}` : 'Nothing missing',
      checks: v.checks ?? [],
      sources: `Sources: ${((b.sources as string[] | undefined) ?? []).join('; ')}`,
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
    side: {
      unknown: sides.unknown, northPct: sides.northPct,
      north: sides.north.pct, northAutos: `${fmt(sides.north.autos)} autos`, south: sides.south.pct, southAutos: `${fmt(sides.south.autos)} autos`,
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
    if (breaks.some((x) => m < x && x < m + 60)) continue;
    const start = formatHM(m);
    hours.push({ start, end: formatHM(m + 60), short: breaks.includes(m + 60), logged: logged.has(start) });
  }
  const last = s.periods.filter((p) => p.day === day).at(-1);
  let next = last ? parseHM(last.start)! + 60 : dayStart;
  if (breaks.includes(next)) next += 60;
  const open = hours.find((h) => h.start === formatHM(next)) ?? hours.find((h) => !h.logged) ?? hours[0];
  return { day, hours, defaultStart: open?.start ?? null };
}
