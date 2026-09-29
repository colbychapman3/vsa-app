// Log sheet forms → kit-06 events. One form can be several events; the store
// saves them all or none after the engine accepts them. No math here.
// Times: only what Colby entered or confirmed with "Now" becomes occurred_at;
// an empty time is null ("time not provided"). recorded_at is the phone's clock.
import { activeEvents, formatHM, parseHM, toAbs, type BreakEntry, type DeckStatus, type OpTime, type Reject, type VsaEvent } from '../engine/index.ts';
import type { State } from '../storage/store.ts';

export type Ctx = {
  operationId: string;
  opDate: string;       // Day 1 as YYYY-MM-DD
  offset: string;       // terminal UTC offset for this operation, e.g. "-04:00"
  recordedAt: string;   // phone clock, ISO with offset (processing time)
  state: State;         // current state, for sequence numbers and correction targets
};

export const REASONS = ['Recount', 'Typo', 'Checker update'] as const;
export const BREAK_REASONS = ['Wrong time', 'Duplicate', 'Logged by mistake'] as const;

const reject = (error: string): Reject => ({ ok: false, error });

export function iso(ctx: Ctx, t: OpTime): string {
  const d = new Date(`${ctx.opDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + t.day - 1);
  return `${d.toISOString().slice(0, 10)}T${t.hm}:00${ctx.offset}`;
}

// UTC offset of the phone's time zone on a given date, as "+HH:MM"/"-HH:MM".
export function offsetFor(date: Date): string {
  const m = -date.getTimezoneOffset(), a = Math.abs(m);
  return `${m < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// The "Now" button: the phone's local time on the operation's own day count.
// Before Day 1 there is no operation day, so nothing is filled in.
export function nowOpTime(opDate: string, now: Date): OpTime | null {
  const [y, m, d] = opDate.split('-').map(Number);
  const day = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000) + 1;
  if (day < 1) return null;
  return { day, hm: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` };
}

// Builds events with sequence numbers after the stored log.
function builder(ctx: Ctx) {
  let seq = (ctx.state.log.events.at(-1)?.sequence ?? 0) + 1;
  const out: VsaEvent[] = [];
  const add = (e: {
    type: VsaEvent['event_type']; metric: string; value: VsaEvent['payload']['value']; kind?: VsaEvent['payload']['count_kind'];
    workstream?: 'auto_discharge' | 'operation'; deck?: string | null; hatch?: string | null; commodity?: string | null;
    at?: OpTime | null; period?: [string, string] | null; reason?: string | null; supersedes?: string | null; inputs?: string[];
    provenance?: VsaEvent['provenance'];
  }) => {
    const id = `${ctx.operationId}-${seq}`;
    out.push({
      schema_version: '1.0', event_id: id, operation_id: ctx.operationId, sequence: seq++, idempotency_key: id, event_type: e.type,
      scope: { workstream: e.workstream ?? 'auto_discharge', deck: e.deck ?? null, hatch: e.hatch ?? null, commodity: e.commodity ?? null, destination: null },
      occurred_at: e.at ? iso(ctx, e.at) : null, recorded_at: ctx.recordedAt, actor: 'colby', source_ids: ['vsa-app'], provenance: e.provenance ?? 'user_report',
      supersedes_event_id: e.supersedes ?? null,
      payload: { metric: e.metric, value: e.value, unit: null, count_kind: e.kind ?? 'not_applicable',
        period_start: e.period?.[0] ?? null, period_end: e.period?.[1] ?? null, reason: e.reason ?? null, input_event_ids: e.inputs ?? [] },
    });
  };
  return { add, out };
}

// ---------- Hourly count ----------

export type HourForm = {
  day: number;
  start: string;                       // "HH:MM"; hours follow the day's start time
  count: number;
  drivers?: number | null;             // blank keeps whatever is logged
  brands?: Record<string, number> | null;
  stopMin?: number | null;
  reason?: string | null;              // required when this changes an hour already logged
};

// A new hour is observations. Re-entering an hour corrects only the values that
// changed (total, each brand, drivers, stop time), each keeping its history.
export function hourEvents(ctx: Ctx, f: HourForm): VsaEvent[] | Reject {
  const endMin = parseHM(f.start)! + 60; // the 23:00 hour ends at 00:00 the next day
  const period: [string, string] = [iso(ctx, { day: f.day, hm: f.start }), iso(ctx, endMin >= 1440 ? { day: f.day + 1, hm: formatHM(endMin) } : { day: f.day, hm: formatHM(endMin) })];
  const existing = activeEvents(ctx.state.log).filter((e) => e.payload.period_start === period[0]);
  const find = (metric: string, commodity: string | null) => existing.find((e) => e.payload.metric === metric && e.scope.commodity === commodity);

  const wanted: { metric: string; commodity: string | null; value: number; kind: 'interval' | 'not_applicable' }[] = [
    { metric: 'field_units', commodity: null, value: f.count, kind: 'interval' },
    ...Object.entries(f.brands ?? {}).map(([b, v]) => ({ metric: 'field_units', commodity: b, value: v, kind: 'interval' as const })),
    ...(f.drivers != null ? [{ metric: 'drivers', commodity: null, value: f.drivers, kind: 'not_applicable' as const }] : []),
    ...(f.stopMin != null ? [{ metric: 'productive_minutes', commodity: null, value: f.stopMin, kind: 'not_applicable' as const }] : []),
  ];
  const changes = wanted.filter((w) => find(w.metric, w.commodity)?.payload.value !== w.value);
  if (!changes.length) return reject('Nothing to save: these values are already logged for that hour.');
  if (changes.some((w) => find(w.metric, w.commodity)) && !f.reason?.trim()) {
    return reject(`Pick a reason for changing the ${f.start} hour. The old value is kept.`);
  }
  const { add, out } = builder(ctx);
  for (const w of changes) {
    const old = find(w.metric, w.commodity);
    add({ type: old ? 'correction' : 'observation', metric: w.metric, value: w.value, kind: w.kind, commodity: w.commodity, period,
      supersedes: old?.event_id ?? null, reason: old ? f.reason!.trim() : null });
  }
  return out;
}

// ---------- Deck ----------

export type DeckForm = {
  deck: string;
  status: DeckStatus;
  skipped: boolean;
  // The whole sheet, as the tracker saves it: every hatch's box, null = blank = unknown.
  // The sheet opens pre-filled with the current counts (view.deckSheet().prefill).
  hatchRemaining: Record<string, number | null>;
  deckRemaining: number | null;
  time: OpTime | null;
};

// A deck save is a full snapshot (Colby chose tracker behavior, 2026-09-26): only
// what differs from the current deck is written; a cleared box records "unknown".
export function deckEvents(ctx: Ctx, f: DeckForm): VsaEvent[] | Reject {
  const { add, out } = builder(ctx);
  const cur = ctx.state.decks.find((d) => d.id === f.deck);
  if (!cur) return reject(`Deck ${f.deck} is not on this vessel.`);
  const statusChanged = f.status !== cur.status;
  if (statusChanged) add({ type: 'status_change', metric: 'deck_status', value: f.status, deck: f.deck, at: f.time });
  if (f.status === 'notStarted' && f.skipped !== cur.skipped) add({ type: 'status_change', metric: 'deck_skipped', value: f.skipped, deck: f.deck, at: f.time });
  if (f.status === 'active' || f.status === 'paused') {
    // Counts exist only on an Active/Paused deck (they carry over between the two); otherwise start blank.
    const have = cur.status === 'active' || cur.status === 'paused' ? cur.entered : { hatches: {} as Record<string, number>, deck: null };
    const put = (hatch: string | null, want: number | null, had: number | null) => {
      if (want === had) return;
      add({ type: 'observation', metric: 'vessel_remaining', value: want, kind: 'remaining', deck: f.deck, hatch, at: f.time,
        provenance: want === null ? 'unknown' : 'user_report' });
    };
    for (const h of cur.hatches) put(h.h, f.hatchRemaining[h.h] ?? null, have.hatches[h.h] ?? null);
    put(null, f.deckRemaining, have.deck);
  }
  return out.length ? out : reject(`Nothing to save: ${cur.label} already shows these values.`);
}

export function heightEvents(ctx: Ctx, deck: string, m: number, time: OpTime | null): VsaEvent[] {
  const { add, out } = builder(ctx);
  add({ type: 'observation', metric: 'deck_height_m', value: m, deck, at: time });
  return out;
}

// ---------- Breaks and shifts ----------

export function breakStartEvents(ctx: Ctx, time: OpTime | null): VsaEvent[] {
  const { add, out } = builder(ctx);
  add({ type: 'pause', metric: 'break', value: null, workstream: 'operation', at: time });
  return out;
}

export function breakEndEvents(ctx: Ctx, time: OpTime | null): VsaEvent[] {
  const { add, out } = builder(ctx);
  add({ type: 'resume', metric: 'break', value: null, workstream: 'operation', at: time });
  return out;
}

export function endShiftEvents(ctx: Ctx, time: OpTime | null): VsaEvent[] {
  const { add, out } = builder(ctx);
  add({ type: 'status_change', metric: 'shift', value: 'ended', workstream: 'operation', at: time });
  return out;
}

export function nextDayEvents(ctx: Ctx, time: OpTime | null): VsaEvent[] {
  const { add, out } = builder(ctx);
  add({ type: 'status_change', metric: 'shift', value: 'started', workstream: 'operation', at: time });
  return out;
}

// "Finish today" → shiftEnd null; "Carries to Day 2" → a Day 1 shift end time.
export function shiftSettingsEvents(ctx: Ctx, shiftEnd: string | null, nextStart: string): VsaEvent[] | Reject {
  const { add, out } = builder(ctx);
  const plan = ctx.state.plan;
  if (shiftEnd !== plan.shiftEnd) add({ type: 'observation', metric: 'plan_shift_end', value: shiftEnd, workstream: 'operation' });
  if (nextStart !== plan.nextStart) add({ type: 'observation', metric: 'plan_next_start', value: nextStart, workstream: 'operation' });
  return out.length ? out : reject('Nothing to save: these shift settings are already set.');
}

// ---------- Clerk and discrepancies ----------

export function clerkEvents(ctx: Ctx, remaining: number, time: OpTime | null): VsaEvent[] | Reject {
  if (!Number.isInteger(remaining) || remaining < 0) return reject('Enter the clerk’s remaining count as a whole number.');
  const { add, out } = builder(ctx);
  add({ type: 'observation', metric: 'clerk_remaining', value: remaining, kind: 'remaining', at: time });
  return out;
}

// `key` is set when a banner is tracked, so the banner shows it's on the list.
export function openDiscrepancyEvents(ctx: Ctx, text: string, time: OpTime | null, key: string | null = null): VsaEvent[] | Reject {
  const t = text.trim();
  if (!t) return reject('Describe what doesn’t match.');
  if (t.length > 200) return reject('Keep it under 200 characters.');
  const { add, out } = builder(ctx);
  add({ type: 'discrepancy_opened', metric: 'discrepancy', value: key, workstream: 'operation', reason: t, at: time });
  return out;
}

export function resolveDiscrepancyEvents(ctx: Ctx, issueId: string, time: OpTime | null): VsaEvent[] {
  const { add, out } = builder(ctx);
  add({ type: 'discrepancy_resolved', metric: 'discrepancy', value: null, workstream: 'operation', inputs: [issueId], at: time });
  return out;
}

// ---------- Workday drivers ----------

// Drivers are set once per operation day (e.g. Day 1 = 70, Day 2 = 50) and used for every
// hour of that day that has no count of its own. Changing a day's figure is a correction.
export function workdayDriversEvents(ctx: Ctx, day: number, n: number, reason?: string | null): VsaEvent[] | Reject {
  if (!Number.isInteger(day) || day < 1) return reject('Pick the operation day.');
  if (!Number.isInteger(n) || n < 1) return reject('Enter the day’s drivers as a whole number (1 or more).');
  const period: [string, string] = [iso(ctx, { day, hm: '00:00' }), iso(ctx, { day: day + 1, hm: '00:00' })];
  const old = activeEvents(ctx.state.log).find((e) => e.payload.metric === 'workday_drivers' && e.payload.period_start === period[0]);
  if (old?.payload.value === n) return reject(`Nothing to save: Day ${day} is already set to ${n} drivers.`);
  if (old && !reason?.trim()) return reject(`Pick a reason for changing Day ${day}’s drivers. The old value is kept.`);
  const { add, out } = builder(ctx);
  add({ type: old ? 'correction' : 'observation', metric: 'workday_drivers', value: n, workstream: 'operation', period,
    supersedes: old?.event_id ?? null, reason: old ? reason!.trim() : null });
  return out;
}

// ---------- Break log edits ----------
// Corrections keep the old times in the log. Removing a break supersedes it with "void".

const eventById = (ctx: Ctx, id: string) => ctx.state.log.events.find((e) => e.event_id === id);

// A correction of `target` (same scope, metric and period, as the engine requires).
function correctionOf(add: ReturnType<typeof builder>['add'], target: VsaEvent, value: VsaEvent['payload']['value'], at: OpTime | null, reason: string) {
  const p = target.payload;
  add({ type: 'correction', metric: p.metric, value, workstream: 'operation', at,
    period: p.period_start && p.period_end ? [p.period_start, p.period_end] : null, supersedes: target.event_id, reason });
}

export function missedBreakEvents(ctx: Ctx, start: OpTime | null, end: OpTime | null): VsaEvent[] | Reject {
  if (!start || !end) return reject('Enter when the break started and ended.');
  if (toAbs(end)! <= toAbs(start)!) return reject('The break end must be after its start.');
  const { add, out } = builder(ctx);
  add({ type: 'observation', metric: 'break', value: null, workstream: 'operation', period: [iso(ctx, start), iso(ctx, end)] });
  return out;
}

export function editBreakEvents(ctx: Ctx, b: BreakEntry, start: OpTime | null, end: OpTime | null, reason: string | null): VsaEvent[] | Reject {
  if (b.kind === 'shift' || !b.startId) return reject('Shift changes can’t be edited here.');
  if (!start) return reject('Enter when the break started.');
  const why = reason?.trim();
  if (b.kind === 'missed') {
    if (!end) return reject('Enter when the break ended.');
    if (toAbs(start) === b.startAbs && toAbs(end) === b.endAbs) return reject('Nothing to save: the break already has these times.');
    if (!why) return reject('Pick a reason for changing this break. The old times are kept.');
    if (toAbs(end)! <= toAbs(start)!) return reject('The break end must be after its start.');
    // A missed break's times are its period, which a correction can't change: remove it and add it again.
    const { add, out } = builder(ctx);
    correctionOf(add, eventById(ctx, b.startId)!, 'void', null, why);
    add({ type: 'observation', metric: 'break', value: null, workstream: 'operation', period: [iso(ctx, start), iso(ctx, end)] });
    return out;
  }
  if (end && !b.endId) return reject('This break is still in progress. End it from the Log sheet first.');
  const startChanged = toAbs(start) !== b.startAbs, endChanged = !!end && toAbs(end) !== b.endAbs;
  if (!startChanged && !endChanged) return reject('Nothing to save: the break already has these times.');
  if (!why) return reject('Pick a reason for changing this break. The old times are kept.');
  const { add, out } = builder(ctx);
  if (startChanged) correctionOf(add, eventById(ctx, b.startId)!, null, start, why);
  if (endChanged) correctionOf(add, eventById(ctx, b.endId!)!, null, end, why);
  return out;
}

export function removeBreakEvents(ctx: Ctx, b: BreakEntry, reason: string | null): VsaEvent[] | Reject {
  if (b.kind === 'shift' || !b.startId) return reject('Shift changes can’t be removed here.');
  const why = reason?.trim();
  if (!why) return reject('Pick a reason for removing this break. It stays in the log, marked removed.');
  const { add, out } = builder(ctx);
  correctionOf(add, eventById(ctx, b.startId)!, 'void', null, why);
  if (b.endId) correctionOf(add, eventById(ctx, b.endId)!, 'void', null, why);
  return out;
}
