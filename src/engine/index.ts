// project(baseline, events) → the full autos state, or the first rejection.
// This is the one call later phases use. To append, project(existing + new) and
// store the new events only if it succeeds.
import { validateBaseline, type Baseline } from './baseline.ts';
import { deckCalc, deckUpdate, heightInfo, type DeckState, type DeckStatus } from './decks.ts';
import { replay, activeEvents, historyOf, type VsaEvent } from './events.ts';
import { buildPeriods, summarize, checkHour, hourDriverRate, type HourEntry } from './production.ts';
import { ledger, currentDrivers, type Phase } from './ledger.ts';
import { eta, vesselClearBy, type Ops } from './eta.ts';
import { fromIso, toAbs, eventTimeLabel, parseHM, type OpTime, type Reject } from './time.ts';

export * from './time.ts';
export * from './baseline.ts';
export * from './decks.ts';
export * from './fit.ts';
export * from './events.ts';
export * from './production.ts';
export * from './ledger.ts';
export * from './eta.ts';

const STATUS_LABEL: Record<DeckStatus, string> = { notStarted: 'Not started', active: 'Active', paused: 'Paused', complete: 'Complete', unknown: 'Unknown' };
const STATUSES = Object.keys(STATUS_LABEL) as DeckStatus[];
const fail = (error: string, event_id?: string): Reject & { event_id?: string } => ({ ok: false, error, ...(event_id ? { event_id } : {}) });

// Baseline dates are "M/D/YYYY" (tracker) or "YYYY-MM-DD".
export function operationDate(b: Baseline): string | null {
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(b.date);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
}

export function project(baseline: Baseline, events: VsaEvent[], operationId: string) {
  const base = validateBaseline(baseline);
  if (!base.ok) return fail(`Baseline problems: ${base.errors.join(' ')}`);
  const opDate = operationDate(baseline);
  if (!opDate) return fail(`Baseline date "${baseline.date}" is not a date.`);
  const log = replay(events, operationId);
  if ('error' in log) return log;

  const at = (iso: string | null): OpTime | null | Reject => (iso == null ? null : fromIso(iso, opDate));
  const deckById = new Map(baseline.decks.map((d) => [d.id, d]));
  const decks: Record<string, DeckState & { time?: OpTime | null; heightConfirmed?: { m: number; time: string } | null; history?: { status: DeckStatus; time: string }[] }> = {};
  const hours = new Map<string, HourEntry & { key: string; was?: number[] }>();
  const ops: Ops & { shiftEnd?: string | null } = { day: 1 };
  const breakLog: { start: string; end: string | null }[] = [];
  const plan: { shiftEnd: string | null; nextStart: string | null } = { shiftEnd: null, nextStart: null };
  const clerks: { remaining: number; time: string; seq: number }[] = [];
  const issues = new Map<string, { id: string; key: string | null; text: string; openedAt: string; status: 'open' | 'resolved'; resolvedAt: string | null }>();
  let recStart = 0; // sequence of the latest break/shift-end start

  for (const e of activeEvents(log)) {
    const p = e.payload, id = e.event_id, sc = e.scope;
    if (sc.workstream !== 'auto_discharge' && sc.workstream !== 'operation') return fail(`Event ${id}: ${sc.workstream} is not tracked by this engine (autos only).`, id);
    const occurred = at(e.occurred_at);
    if (occurred && 'error' in occurred) return fail(occurred.error, id);

    if (['field_units', 'drivers', 'productive_minutes'].includes(p.metric)) {
      if (!p.period_start || !p.period_end) return fail(`Event ${id}: ${p.metric} needs the hour it covers.`, id);
      const s = fromIso(p.period_start, opDate), z = fromIso(p.period_end, opDate);
      if ('error' in s) return fail(s.error, id);
      if ('error' in z) return fail(z.error, id);
      if (toAbs(z)! - toAbs(s)! !== 60) return fail(`Event ${id}: field counts are hourly; ${p.period_start}–${p.period_end} is not one hour.`, id);
      const key = `${s.day}|${s.hm}`;
      const h = hours.get(key) ?? { key, day: s.day, start: s.hm, count: NaN };
      if (p.metric === 'field_units') {
        if (p.count_kind !== 'interval') return fail(`Event ${id}: field_units must be an hourly interval count.`, id);
        if (sc.commodity == null) {
          h.count = p.value as number;
          h.was = historyOf(log, id).slice(0, -1).map((x) => x.payload.value as number); // earlier values, kept
        }
        else h.brands = { ...h.brands, [sc.commodity]: p.value as number };
      } else if (p.metric === 'drivers') {
        h.drivers = p.value as number;
      } else {
        h.stopMin = p.value as number;
      }
      hours.set(key, h);
      continue;
    }

    switch (p.metric) {
      case 'deck_status':
      case 'deck_skipped':
      case 'deck_height_m':
      case 'vessel_remaining': {
        const d = sc.deck ? deckById.get(sc.deck) : undefined;
        if (!d) return fail(`Event ${id}: deck ${sc.deck} is not in the baseline.`, id);
        const cur = decks[d.id] ?? { status: 'notStarted' as DeckStatus };
        let next: typeof cur = { ...cur };
        if (p.metric === 'deck_status') {
          if (!STATUSES.includes(p.value as DeckStatus)) return fail(`Event ${id}: deck status "${p.value}" is not allowed.`, id);
          next = { ...cur, status: p.value as DeckStatus, skipped: p.value === 'notStarted' ? cur.skipped : false,
            history: [...(cur.history ?? []), { status: p.value as DeckStatus, time: eventTimeLabel(occurred) }] };
        } else if (p.metric === 'deck_skipped') {
          next = { ...cur, skipped: p.value === true };
        } else if (p.metric === 'deck_height_m') {
          if (typeof p.value !== 'number' || !(p.value > 0)) return fail(`Event ${id}: deck height must be a positive number of metres.`, id);
          decks[d.id] = { ...cur, heightConfirmed: { m: p.value, time: eventTimeLabel(occurred) } };
          continue;
        } else {
          if (cur.status !== 'active' && cur.status !== 'paused') return fail(`Event ${id}: ${d.label} is ${STATUS_LABEL[cur.status]}; set it Active or Paused before logging a count.`, id);
          // null (provenance unknown) takes a count back to unknown.
          const hatches = { ...cur.hatchRemaining };
          if (sc.hatch) { if (p.value === null) delete hatches[sc.hatch]; else hatches[sc.hatch] = p.value as number; }
          next = sc.hatch ? { ...cur, hatchRemaining: hatches } : { ...cur, deckRemaining: p.value as number | null };
        }
        const u = deckUpdate(d, next, false);
        if ('error' in u) return fail(u.error, id);
        // The deck's time is the latest save's time; a save with no time is "time not provided", never an earlier time.
        decks[d.id] = { ...cur, ...u, time: occurred, history: next.history };
        continue;
      }
      case 'clerk_remaining':
        if ((p.value as number) > base.start) return fail(`Chief clerk remaining (${p.value}) exceeds starting cargo (${base.start}) by ${(p.value as number) - base.start}. Check the count.`, id);
        clerks.push({ remaining: p.value as number, time: occurred ? eventTimeLabel(occurred) : 'time not provided', seq: e.sequence });
        continue;
      case 'break':
        if (e.event_type === 'pause') {
          if (!occurred) return fail(`Event ${id}: enter the break start time.`, id);
          Object.assign(ops, { onBreak: true, breakStart: occurred.hm, day: occurred.day }); recStart = e.sequence;
          breakLog.push({ start: eventTimeLabel(occurred), end: null });
        } else if (e.event_type === 'resume') {
          if (!occurred) return fail(`Event ${id}: enter the time work resumed.`, id);
          ops.onBreak = false;
          const open = breakLog.at(-1);
          if (open && open.end == null) open.end = eventTimeLabel(occurred);
        }
        continue;
      case 'shift':
        if (!occurred) return fail(`Event ${id}: shift changes need a time.`, id);
        if (p.value === 'ended') {
          Object.assign(ops, { shiftEnded: true, onBreak: false, day: occurred.day, shiftEnd: occurred.hm }); recStart = e.sequence;
          breakLog.push({ start: `Shift end ${eventTimeLabel(occurred)}`, end: null });
        } else if (p.value === 'started') {
          Object.assign(ops, { shiftEnded: false, day: occurred.day }); if (occurred.day > 1) plan.nextStart = occurred.hm;
          const open = breakLog.at(-1);
          if (open && open.end == null) open.end = eventTimeLabel(occurred);
        }
        else return fail(`Event ${id}: shift value must be "ended" or "started".`, id);
        continue;
      case 'plan_shift_end':
      case 'plan_next_start':
        // A null Day 1 shift end means "works until finished".
        if (p.metric === 'plan_shift_end' && p.value === null) { plan.shiftEnd = null; continue; }
        if (typeof p.value !== 'string' || parseHM(p.value) == null) return fail(`Event ${id}: ${p.metric} must be an HH:MM time.`, id);
        plan[p.metric === 'plan_shift_end' ? 'shiftEnd' : 'nextStart'] = p.value;
        continue;
      case 'discrepancy':
        if (e.event_type === 'discrepancy_opened') issues.set(id, { id, key: p.reason && typeof p.value === 'string' ? p.value : null, text: p.reason ?? String(p.value ?? ''), openedAt: eventTimeLabel(occurred), status: 'open', resolvedAt: null });
        else if (e.event_type === 'discrepancy_resolved') {
          const target = p.input_event_ids[0];
          const issue = target ? issues.get(target) : undefined;
          if (!issue || issue.status !== 'open') return fail(`Event ${id}: discrepancy ${target} is not open.`, id);
          issue.status = 'resolved';
          issue.resolvedAt = eventTimeLabel(occurred);
        }
        continue;
      default:
        return fail(`Event ${id}: metric "${p.metric}" is not tracked by this engine.`, id);
    }
  }

  // Whole-sheet check per deck: hatch counts must agree with a deck total when both are complete.
  for (const [id, st] of Object.entries(decks)) {
    const u = deckUpdate(deckById.get(id)!, st);
    if ('error' in u) return fail(u.error);
  }

  // Hourly entries: validate, then check the field total against starting cargo.
  const brandNames = Object.keys(base.brandStart);
  const entries: HourEntry[] = [];
  for (const h of hours.values()) {
    if (Number.isNaN(h.count)) return fail(`Hour ${eventTimeLabel({ day: h.day, hm: h.start })} has a brand split or drivers but no total count.`);
    const bad = checkHour(h, brandNames, baseline.breaks);
    if (bad) return fail(`Hour ${eventTimeLabel({ day: h.day, hm: h.start })}: ${bad.error}`);
    const { key: _key, ...entry } = h;
    entries.push(entry);
  }
  const periods = buildPeriods(entries, baseline.breaks);
  const summary = summarize(periods);
  if (summary.field > base.start) {
    return fail(`This makes the field total ${summary.field.toLocaleString('en-US')}, which exceeds starting cargo (${base.start.toLocaleString('en-US')}) by ${(summary.field - base.start).toLocaleString('en-US')}. Check the count.`);
  }

  const deckResults = baseline.decks.map((d) => {
    const st = decks[d.id];
    return { ...deckCalc(d, st), height: heightInfo(d, st?.heightConfirmed ?? null), time: st?.time ? eventTimeLabel(st.time) : null, history: st?.history ?? [],
      entered: { hatches: { ...st?.hatchRemaining }, deck: st?.deckRemaining ?? null } }; // what Colby last entered (sheet pre-fill)
  });
  const phase: Phase = ops.shiftEnded ? 'shift_end' : ops.onBreak ? 'break' : 'working';
  const clerk = phase === 'working' ? null : clerks.filter((c) => c.seq > recStart).at(-1) ?? null;
  const drivers = currentDrivers(periods, baseline.labor);
  const L = ledger({ decks: deckResults, periods, phase, drivers, clerk: clerk && { remaining: clerk.remaining, time: clerk.time } });
  const forecast = eta({
    remaining: L.vesselRemaining ?? L.fieldBalance,
    basis: L.vesselRemaining != null ? 'vessel' : 'field',
    periods,
    schedule: { dayStart: baseline.start, nextStart: plan.nextStart, shiftEnd: plan.shiftEnd, breaks: baseline.breaks, clearByMin: vesselClearBy(baseline.destinations) },
    ops,
  });

  const corrections = log.events.filter((e) => e.supersedes_event_id && !log.supersededBy[e.event_id])
    .map((e) => ({ event_id: e.event_id, metric: e.payload.metric, history: historyOf(log, e.event_id).map((x) => x.payload.value), reason: e.payload.reason }));

  return {
    ok: true as const,
    operationId,
    vessel: baseline.vessel,
    baselineDiscrepancies: base.discrepancies,
    decks: deckResults,
    periods: periods.map((p) => ({ ...p, driverRate: hourDriverRate(p) })),
    production: summary,
    ...L,
    eta: forecast,
    ops: { ...ops, phase },
    plan,
    issues: [...issues.values()],
    breakLog,
    corrections,
    log,
  };
}
