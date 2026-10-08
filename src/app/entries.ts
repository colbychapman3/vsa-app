// Log sheet forms → kit-06 events. One form can be several events; the store
// saves them all or none after the engine accepts them. No math here.
// Times: only what Colby entered or confirmed with "Now" becomes occurred_at;
// an empty time is null ("time not provided"). recorded_at is the phone's clock.
import { activeEvents, backNotMarked, BLANK_VAN, checkEvidence, checkVan, evidencePath, MAX_VANS, needsReason, numberHeldBy, trimVan, type VanData, dayStartProblem, formatHM, parseHM, preBreak, toAbs, type BreakEntry, type DeckStatus, type EvidenceData, type EvidenceType, type OpTime, type Reject, type VsaEvent } from '../engine/index.ts';
import type { State } from '../storage/store.ts';

export type Ctx = {
  operationId: string;
  opDate: string;       // Day 1 as YYYY-MM-DD
  offset: string;       // terminal UTC offset for this operation, e.g. "-04:00"
  recordedAt: string;   // phone clock, ISO with offset (processing time)
  state: State;         // current state, for sequence numbers and correction targets
};

export const REASONS = ['Recount', 'Typo', 'Checker update'] as const;
export const START_CAUSES = ['Late vessel', 'Ramp problem', 'Accident'] as const; // plus "Other…" (free text)
export const BREAK_REASONS = ['Wrong time', 'Duplicate', 'Logged by mistake'] as const;

const reject = (error: string): Reject => ({ ok: false, error });

// A time that isn't a real day and HH:MM would throw inside iso(); refuse it as a normal form error instead.
const badTimes = (...ts: (OpTime | null)[]): Reject | null =>
  ts.some((t) => t && toAbs(t) == null) ? reject('That time isn’t valid. Enter the day and a time as HH:MM.') : null;

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
    provenance?: VsaEvent['provenance']; cause?: string | null;
    extra?: { title?: string | null; source?: 'typed' | 'photo-read'; photo?: string | null; evidence?: EvidenceData; van?: VanData }; // plan_note / evidence / van fields
  }) => {
    const id = `${ctx.operationId}-${seq}`;
    out.push({
      schema_version: '1.0', event_id: id, operation_id: ctx.operationId, sequence: seq++, idempotency_key: id, event_type: e.type,
      scope: { workstream: e.workstream ?? 'auto_discharge', deck: e.deck ?? null, hatch: e.hatch ?? null, commodity: e.commodity ?? null, destination: null },
      occurred_at: e.at ? iso(ctx, e.at) : null, recorded_at: ctx.recordedAt, actor: 'colby', source_ids: ['vsa-app'], provenance: e.provenance ?? 'user_report',
      supersedes_event_id: e.supersedes ?? null,
      payload: { metric: e.metric, value: e.value, unit: null, count_kind: e.kind ?? 'not_applicable',
        period_start: e.period?.[0] ?? null, period_end: e.period?.[1] ?? null, reason: e.reason ?? null, input_event_ids: e.inputs ?? [], ...(e.cause ? { cause: e.cause } : {}), ...(e.extra ?? {}) },
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
  const bt = badTimes({ day: f.day, hm: f.start });
  if (bt) return bt;
  // The 23:00 hour ends at 00:00 the next day; the hour before a break ends at the break (07:30 day: 11:30–12:00).
  const endMin = preBreak(f.start, ctx.state.breaks) ?? parseHM(f.start)! + 60;
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
  const isVoid = (m: string, c: string | null) => find(m, c)?.payload.value === 'void';
  // An hour that was taken back is logged again without a reason: nothing is held for it (like re-setting a cleared day's drivers).
  if (changes.some((w) => find(w.metric, w.commodity) && !isVoid(w.metric, w.commodity)) && !f.reason?.trim()) {
    return reject(`Pick a reason for changing the ${f.start} hour. The old value is kept.`);
  }
  const { add, out } = builder(ctx);
  for (const w of changes) {
    const old = find(w.metric, w.commodity);
    add({ type: old ? 'correction' : 'observation', metric: w.metric, value: w.value, kind: w.kind, commodity: w.commodity, period,
      supersedes: old?.event_id ?? null, reason: old ? (isVoid(w.metric, w.commodity) ? 'Hour logged again after it was removed' : f.reason!.trim()) : null });
  }
  return out;
}

// Taking a wrongly logged hour back (Colby, 2026-10-08: "I selected the wrong hour"). Every value of the hour is corrected to
// 'void' with the reason; the log keeps them, the hour leaves the record. A real zero-count hour is a count of 0, not this.
export const HOUR_REMOVE_REASONS = ['Wrong hour', 'Logged by mistake', 'Duplicate'] as const; // plus "Other…"
export function removeHourEvents(ctx: Ctx, f: { day: number; start: string; reason: string | null }): VsaEvent[] | Reject {
  const bt = badTimes({ day: f.day, hm: f.start });
  if (bt) return bt;
  const endMin = preBreak(f.start, ctx.state.breaks) ?? parseHM(f.start)! + 60;
  const period: [string, string] = [iso(ctx, { day: f.day, hm: f.start }), iso(ctx, endMin >= 1440 ? { day: f.day + 1, hm: formatHM(endMin) } : { day: f.day, hm: formatHM(endMin) })];
  const live = activeEvents(ctx.state.log).filter((e) => e.payload.period_start === period[0] && e.payload.value !== 'void' && ['field_units', 'drivers', 'productive_minutes'].includes(e.payload.metric));
  if (!live.length) return reject(`The ${f.start} hour is not logged, so there is nothing to remove.`);
  if (!f.reason?.trim()) return reject(`Pick a reason for removing the ${f.start} hour. Its values stay in the log, marked removed.`);
  const { add, out } = builder(ctx);
  for (const e of live) add({ type: 'correction', metric: e.payload.metric, value: 'void', kind: e.payload.count_kind, commodity: e.scope.commodity, period, supersedes: e.event_id, reason: f.reason.trim() });
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
  const bt = badTimes(f.time);
  if (bt) return bt;
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

export function heightEvents(ctx: Ctx, deck: string, m: number, time: OpTime | null): VsaEvent[] | Reject {
  if (!Number.isFinite(m) || m <= 0) return reject('Enter the deck height in metres, as a number above 0.');
  const bt = badTimes(time);
  if (bt) return bt;
  const { add, out } = builder(ctx);
  add({ type: 'observation', metric: 'deck_height_m', value: m, deck, at: time });
  return out;
}

// ---------- Breaks and shifts ----------

export function breakStartEvents(ctx: Ctx, time: OpTime | null): VsaEvent[] | Reject {
  const bt = badTimes(time);
  if (bt) return bt;
  const { add, out } = builder(ctx);
  add({ type: 'pause', metric: 'break', value: null, workstream: 'operation', at: time });
  return out;
}

export function breakEndEvents(ctx: Ctx, time: OpTime | null): VsaEvent[] | Reject {
  const bt = badTimes(time);
  if (bt) return bt;
  const { add, out } = builder(ctx);
  add({ type: 'resume', metric: 'break', value: null, workstream: 'operation', at: time });
  return out;
}

export function endShiftEvents(ctx: Ctx, time: OpTime | null): VsaEvent[] | Reject {
  const bt = badTimes(time);
  if (bt) return bt;
  const { add, out } = builder(ctx);
  add({ type: 'status_change', metric: 'shift', value: 'ended', workstream: 'operation', at: time });
  return out;
}

// ---------- H/H timeline (spec 7g): awareness only, a time and nothing else ----------

export const HH_REASONS = ['Wrong time', 'Logged by mistake'] as const; // plus "Other…" (free text)

// "H/H started" / "H/H complete". An empty time is saved as null: the engine then uses the phone's processing time, labeled.
export function hhMarkerEvents(ctx: Ctx, kind: 'started' | 'completed', time: OpTime | null): VsaEvent[] | Reject {
  const bt = badTimes(time);
  if (bt) return bt;
  const { add, out } = builder(ctx);
  add({ type: 'status_change', metric: 'hh_phase', value: kind, workstream: 'operation', at: time });
  return out;
}

// Change the time of a saved marker (the old time stays in the log) or remove it (it stays, marked removed). A reason is required.
export function editHhMarkerEvents(ctx: Ctx, markerId: string, time: OpTime | null, reason: string | null): VsaEvent[] | Reject {
  const target = eventById(ctx, markerId);
  if (!target || target.payload.metric !== 'hh_phase') return reject('That H/H marker is not in the log.');
  if (!time) return reject('Enter the corrected time.');
  const bt = badTimes(time);
  if (bt) return bt;
  const why = reason?.trim();
  if (!why) return reject('Pick a reason for changing this H/H time. The old time is kept.');
  const { add, out } = builder(ctx);
  correctionOf(add, target, target.payload.value, time, why);
  return out;
}

export function removeHhMarkerEvents(ctx: Ctx, markerId: string, reason: string | null): VsaEvent[] | Reject {
  const target = eventById(ctx, markerId);
  if (!target || target.payload.metric !== 'hh_phase') return reject('That H/H marker is not in the log.');
  const why = reason?.trim();
  if (!why) return reject('Pick a reason for removing this H/H marker. It stays in the log, marked removed.');
  const { add, out } = builder(ctx);
  correctionOf(add, target, 'void', null, why);
  return out;
}

export function nextDayEvents(ctx: Ctx, time: OpTime | null): VsaEvent[] | Reject {
  const bt = badTimes(time);
  if (bt) return bt;
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
  const bt = badTimes(time);
  if (bt) return bt;
  const { add, out } = builder(ctx);
  add({ type: 'observation', metric: 'clerk_remaining', value: remaining, kind: 'remaining', at: time });
  return out;
}

// `key` is set when a banner is tracked, so the banner shows it's on the list.
export function openDiscrepancyEvents(ctx: Ctx, text: string, time: OpTime | null, key: string | null = null): VsaEvent[] | Reject {
  const t = text.trim();
  if (!t) return reject('Describe what doesn’t match.');
  if (t.length > 200) return reject('Keep it under 200 characters.');
  const bt = badTimes(time);
  if (bt) return bt;
  const { add, out } = builder(ctx);
  add({ type: 'discrepancy_opened', metric: 'discrepancy', value: key, workstream: 'operation', reason: t, at: time });
  return out;
}

export function resolveDiscrepancyEvents(ctx: Ctx, issueId: string, time: OpTime | null): VsaEvent[] | Reject {
  const bt = badTimes(time);
  if (bt) return bt;
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
  const head = activeEvents(ctx.state.log).find((e) => e.payload.metric === 'workday_drivers' && e.payload.period_start === period[0]);
  const old = head?.payload.value === 'void' ? null : head; // a cleared day is set again by correcting the clear
  if (old?.payload.value === n) return reject(`Nothing to save: Day ${day} is already set to ${n} drivers.`);
  if (old && !reason?.trim()) return reject(`Pick a reason for changing Day ${day}’s drivers. The old value is kept.`);
  const { add, out } = builder(ctx);
  add({ type: head ? 'correction' : 'observation', metric: 'workday_drivers', value: n, workstream: 'operation', period,
    supersedes: head?.event_id ?? null, reason: old ? reason!.trim() : head ? 'Set again after clearing' : null });
  return out;
}

// Back to unknown (e.g. a figure entered for the wrong day). Needs a reason; the log keeps it.
export function clearWorkdayDriversEvents(ctx: Ctx, day: number, reason: string | null): VsaEvent[] | Reject {
  if (!Number.isInteger(day) || day < 1) return reject('Pick the operation day.');
  const old = activeEvents(ctx.state.log).find((e) => e.payload.metric === 'workday_drivers' && e.payload.period_start === iso(ctx, { day, hm: '00:00' }) && e.payload.value !== 'void');
  if (!old) return reject(`Day ${day}’s drivers aren’t set.`);
  if (!reason?.trim()) return reject(`Pick a reason for clearing Day ${day}’s drivers. The old value is kept.`);
  const { add, out } = builder(ctx);
  add({ type: 'correction', metric: 'workday_drivers', value: 'void', workstream: 'operation', period: [old.payload.period_start!, old.payload.period_end!],
    supersedes: old.event_id, reason: reason.trim() });
  return out;
}

// ---------- Day's actual start ----------

// Operations start at the planned time unless something delays them. Only a later, exact start
// is recorded (occurred_at = that time); no event = the planned start applies. Changing it is a
// correction with a reason; clearing supersedes it with "void". The cause is optional, for the record.
export function dayStartEvents(ctx: Ctx, day: number, hm: string, cause?: string | null, reason?: string | null): VsaEvent[] | Reject {
  if (!Number.isInteger(day) || day < 1) return reject('Pick the operation day.');
  const st = ctx.state.dayStarts;
  const row = st[day] ?? st[day > 1 ? 2 : 1];
  const time = hm.trim().padStart(5, '0');
  const bad = dayStartProblem(day, time, row.planned, row.firstBreak);
  if (bad) return reject(bad);
  const period: [string, string] = [iso(ctx, { day, hm: '00:00' }), iso(ctx, { day: day + 1, hm: '00:00' })];
  const head = activeEvents(ctx.state.log).find((e) => e.payload.metric === 'day_start' && e.payload.period_start === period[0]);
  const old = head?.payload.value === 'void' ? null : head; // a cleared day is set again by correcting the clear
  const why = cause?.trim() || null;
  if (old && old.payload.value === formatHM(parseHM(time)!) && (old.payload.cause ?? null) === why) return reject(`Nothing to save: Day ${day} already shows this start (${time}).`);
  if (old && !reason?.trim()) return reject(`Pick a reason for changing Day ${day}’s start time. The old time is kept.`);
  const { add, out } = builder(ctx);
  add({ type: head ? 'correction' : 'observation', metric: 'day_start', value: formatHM(parseHM(time)!), workstream: 'operation', period, at: { day, hm: time },
    supersedes: head?.event_id ?? null, reason: old ? reason!.trim() : head ? 'Set again after clearing' : null, cause: why });
  return out;
}

// Back to the planned start. Needs a reason; the log keeps the old time.
export function clearDayStartEvents(ctx: Ctx, day: number, reason: string | null): VsaEvent[] | Reject {
  if (!Number.isInteger(day) || day < 1) return reject('Pick the operation day.');
  const old = activeEvents(ctx.state.log).find((e) => e.payload.metric === 'day_start' && e.payload.period_start === iso(ctx, { day, hm: '00:00' }) && e.payload.value !== 'void');
  if (!old) return reject(`Day ${day} has no actual start recorded; the planned start applies.`);
  if (!reason?.trim()) return reject(`Pick a reason for clearing Day ${day}’s start time. The old time is kept.`);
  const { add, out } = builder(ctx);
  add({ type: 'correction', metric: 'day_start', value: 'void', workstream: 'operation', period: [old.payload.period_start!, old.payload.period_end!],
    supersedes: old.event_id, reason: reason.trim() });
  return out;
}

// ---------- Break log edits ----------
// Corrections keep the old times in the log. Removing a break supersedes it with "void".

// An old break start that never got an end (e.g. Break start tapped twice).
export const STRANDED = 'This break never got an end time. If it’s a duplicate, remove it. Otherwise remove it and add it again as a missed break with both times.';

const eventById = (ctx: Ctx, id: string) => ctx.state.log.events.find((e) => e.event_id === id);

// A correction of `target` (same scope, metric and period, as the engine requires).
function correctionOf(add: ReturnType<typeof builder>['add'], target: VsaEvent, value: VsaEvent['payload']['value'], at: OpTime | null, reason: string) {
  const p = target.payload;
  add({ type: 'correction', metric: p.metric, value, workstream: 'operation', at,
    period: p.period_start && p.period_end ? [p.period_start, p.period_end] : null, supersedes: target.event_id, reason });
}

// The break that's on now: the latest open break while the shift is on break.
export function isCurrentBreak(s: State, b: BreakEntry): boolean {
  return s.ops.phase === 'break' && b.kind === 'break' && b.endAbs == null && s.breakLog.filter((x) => x.kind === 'break' && x.endAbs == null).at(-1) === b;
}

// A break being added or changed must not overlap another break. Checked here, not on
// replay, so an earlier entry can never block logging the break that's happening now.
function overlap(s: State, startAbs: number, endAbs: number, self: BreakEntry | null): Reject | null {
  const hm = (a: number) => (a >= 1440 ? `Day ${Math.floor(a / 1440) + 1} ${formatHM(a)}` : formatHM(a));
  const span = endAbs === Infinity ? `${hm(startAbs)} (in progress)` : `${hm(startAbs)}–${hm(endAbs)}`;
  for (const b of s.breakLog) {
    if (b === self || b.kind === 'shift') continue;
    const bEnd = b.endAbs ?? (isCurrentBreak(s, b) ? Infinity : null);
    if (bEnd == null) continue; // an old start that never got an end: remove it (see the break sheet)
    if (startAbs < bEnd && b.startAbs < endAbs) return reject(`${span} overlaps the break ${b.start}${b.end ? `–${b.end}` : ' (in progress)'}. Change the times, or fix that break first.`);
  }
  return null;
}

export function missedBreakEvents(ctx: Ctx, start: OpTime | null, end: OpTime | null): VsaEvent[] | Reject {
  if (!start || !end) return reject('Enter when the break started and ended.');
  const bt = badTimes(start, end);
  if (bt) return bt;
  if (toAbs(end)! <= toAbs(start)!) return reject('The break end must be after its start.');
  const o = overlap(ctx.state, toAbs(start)!, toAbs(end)!, null);
  if (o) return o;
  const { add, out } = builder(ctx);
  add({ type: 'observation', metric: 'break', value: null, workstream: 'operation', period: [iso(ctx, start), iso(ctx, end)] });
  return out;
}

export function editBreakEvents(ctx: Ctx, b: BreakEntry, start: OpTime | null, end: OpTime | null, reason: string | null): VsaEvent[] | Reject {
  if (b.kind === 'shift' || !b.startId) return reject('Shift changes can’t be edited here.');
  if (!start) return reject('Enter when the break started.');
  const bt = badTimes(start, end);
  if (bt) return bt;
  const why = reason?.trim();
  if (b.kind === 'missed') {
    if (!end) return reject('Enter when the break ended.');
    if (toAbs(start) === b.startAbs && toAbs(end) === b.endAbs) return reject('Nothing to save: the break already has these times.');
    if (!why) return reject('Pick a reason for changing this break. The old times are kept.');
    if (toAbs(end)! <= toAbs(start)!) return reject('The break end must be after its start.');
    const o = overlap(ctx.state, toAbs(start)!, toAbs(end)!, b);
    if (o) return o;
    // A missed break's times are its period, which a correction can't change: remove it and add it again.
    const { add, out } = builder(ctx);
    correctionOf(add, eventById(ctx, b.startId)!, 'void', null, why);
    add({ type: 'observation', metric: 'break', value: null, workstream: 'operation', period: [iso(ctx, start), iso(ctx, end)] });
    return out;
  }
  if (!b.endId && !isCurrentBreak(ctx.state, b)) return reject(STRANDED);
  if (end && !b.endId) return reject('This break is still in progress. End it from the Log sheet first.');
  const startChanged = toAbs(start) !== b.startAbs, endChanged = !!end && toAbs(end) !== b.endAbs;
  if (!startChanged && !endChanged) return reject('Nothing to save: the break already has these times.');
  if (!why) return reject('Pick a reason for changing this break. The old times are kept.');
  if (toAbs(end ?? start)! <= toAbs(start)! && end) return reject('The break end must be after its start.');
  const o = overlap(ctx.state, toAbs(start)!, end ? toAbs(end)! : b.endAbs ?? Infinity, b); // an empty end box keeps the saved end
  if (o) return o;
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

// ---------- Plan notes ----------

export const NOTE_REASONS = ['Typo', 'New information', 'Added by mistake'] as const; // plus "Other…" (free text)

export type NoteForm = { title?: string | null; text: string; time?: OpTime | null; source?: 'typed' | 'photo-read'; photo?: string | null };

export function addNoteEvents(ctx: Ctx, f: NoteForm): VsaEvent[] | Reject {
  const text = f.text.trim();
  if (!text) return reject('A note needs text.');
  const bt = badTimes(f.time ?? null);
  if (bt) return bt;
  const { add, out } = builder(ctx);
  add({ type: 'note.added', metric: 'plan_note', value: text, workstream: 'operation', at: f.time ?? null,
    extra: { title: f.title?.trim() || null, source: f.source ?? 'typed', photo: f.photo ?? null } });
  return out;
}

function currentNote(ctx: Ctx, id: string) {
  const n = ctx.state.notes.find((x) => x.id === id);
  if (!n) return reject('That note is not on this vessel.');
  if (n.removed) return reject('That note was removed. Add a new note instead.');
  return n;
}

// An edit supersedes the current version (reason required); the old text stays in history.
export function editNoteEvents(ctx: Ctx, id: string, f: { title?: string | null; text: string }, reason: string | null): VsaEvent[] | Reject {
  const n = currentNote(ctx, id);
  if ('ok' in n) return n;
  const text = f.text.trim();
  if (!text) return reject('A note needs text.');
  const title = f.title?.trim() || null;
  if (text === n.text && title === n.title) return reject('Nothing to save: the note is unchanged.');
  if (!reason?.trim()) return reject('Pick a reason for changing this note. The old text is kept.');
  const { add, out } = builder(ctx);
  add({ type: 'note.corrected', metric: 'plan_note', value: text, workstream: 'operation', supersedes: n.headId, reason: reason.trim(),
    extra: { title, source: n.source, photo: n.photo } });
  return out;
}

// Removal is an entry, never a delete: the note stays in the log, marked removed, with its reason.
export function removeNoteEvents(ctx: Ctx, id: string, reason: string | null): VsaEvent[] | Reject {
  const n = currentNote(ctx, id);
  if ('ok' in n) return n;
  if (!reason?.trim()) return reject('Pick a reason for removing this note. It stays in the log, marked removed.');
  const { add, out } = builder(ctx);
  add({ type: 'note.removed', metric: 'plan_note', value: null, workstream: 'operation', supersedes: n.headId, reason: reason.trim() });
  return out;
}

// ---------- Photo evidence ----------

export const PHOTO_REMOVE_REASONS = ['Taken by mistake', 'Duplicate', 'Wrong vessel'] as const; // plus "Other…"
export const EVIDENCE_CHANGE_REASONS = ['Wrong deck or hatch', 'Wrong time', 'Typo', 'New information'] as const; // plus "Other…"
export const EVIDENCE_REMOVE_REASONS = ['Taken by mistake', 'Duplicate', 'Wrong vessel'] as const;

// The id the next saved event will get; the photo file is named for it (evidence/<vesselId>/<eventId>.jpg).
export const nextEventId = (s: State) => `${s.operationId}-${(s.log.events.at(-1)?.sequence ?? 0) + 1}`;

// The photo files for `n` records saved one after another (a multi-photo upload): each record is one event and its file is named for
// that event, so the i-th record's file is named for the sequence number i places after the next one. The engine enforces the name.
export const nextEvidencePaths = (s: State, n: number): string[] => {
  const first = (s.log.events.at(-1)?.sequence ?? 0) + 1;
  return Array.from({ length: n }, (_, i) => evidencePath(s.operationId, `${s.operationId}-${first + i}`));
};

export type EvidenceForm = { type: EvidenceType | null; deck: string; hatch: string; reason: string; vins: string[]; notes?: string | null; time: OpTime | null; photo?: string | null; more?: string[] };

// Every field Colby must give, named when missing. Place and VINs are checked against the baseline by the engine's checkEvidence.
// Used by the screen before it copies a photo, and by the builders below (one set of words).
export function evidenceProblem(state: State, f: EvidenceForm, photo: string | null | undefined): string | null {
  const bad = checkEvidence({ type: f.type ?? undefined, deck: f.deck, hatch: f.hatch, reason: f.reason.trim(), vins: f.vins.map((v) => v.trim()).filter(Boolean), notes: f.notes?.trim() || null, photo: photo ?? '', more: f.more }, state.decks);
  if (bad) return bad;
  if (f.type && !needsReason(f.type) && f.reason.trim()) return 'Poor stowage and pre-stow photos take no reason: the photo type is the reason.';
  if (!f.time) return 'Enter the time, or tap Now.';
  return badTimes(f.time)?.error ?? null;
}

function evidenceData(ctx: Ctx, f: EvidenceForm, photo: string | null | undefined): EvidenceData | Reject {
  const bad = evidenceProblem(ctx.state, f, photo);
  if (bad) return reject(bad);
  return { type: f.type!, deck: f.deck, hatch: f.hatch, reason: f.reason.trim(), vins: f.vins.map((v) => v.trim().toUpperCase()).filter(Boolean), notes: f.notes?.trim() || null, photo: photo!, ...(f.more?.length ? { more: f.more } : {}) };
}

export function addEvidenceEvents(ctx: Ctx, f: EvidenceForm): VsaEvent[] | Reject {
  const d = evidenceData(ctx, f, f.photo);
  if ('ok' in d) return d;
  const { add, out } = builder(ctx);
  add({ type: 'evidence.added', metric: 'evidence', value: d.type, workstream: 'operation', at: f.time, extra: { evidence: d } });
  return out;
}

function currentEvidence(ctx: Ctx, id: string) {
  const x = ctx.state.evidence.find((e) => e.id === id);
  if (!x) return reject('That photo is not on this vessel.');
  if (x.removed) return reject('That photo was removed. Add a new photo instead.');
  return x;
}

// An edit supersedes the current version (reason required). The photo file itself stays as taken.
export function editEvidenceEvents(ctx: Ctx, id: string, f: EvidenceForm, reason: string | null): VsaEvent[] | Reject {
  const x = currentEvidence(ctx, id);
  if ('ok' in x) return x;
  // The first photo changes only to one of the record's own files (taking the first out promotes the next); anything else keeps it.
  const own = [x.photo, ...(x.more ?? [])];
  const d = evidenceData(ctx, f, f.photo && own.includes(f.photo) ? f.photo : x.photo);
  if ('ok' in d) return d;
  const same = d.photo === x.photo && d.type === x.type && d.deck === x.deck && d.hatch === x.hatch && d.reason === x.reason && d.notes === x.notes
    && d.vins.join() === x.vins.join() && (d.more ?? []).join() === (x.more ?? []).join() && toAbs(f.time!) === (x.at ? toAbs(x.at) : null);
  if (same) return reject('Nothing to save: the photo record is unchanged.');
  if (!reason?.trim()) return reject('Pick a reason for changing this photo record. The old values are kept.');
  const { add, out } = builder(ctx);
  add({ type: 'evidence.corrected', metric: 'evidence', value: d.type, workstream: 'operation', at: f.time, supersedes: x.headId, reason: reason.trim(), extra: { evidence: d } });
  return out;
}

// Taking one or several photos out of a record (Colby, 2026-10-09). The photos stay on the phone and in the log's earlier versions;
// the record just stops listing them. Taking out the first promotes the next. Taking out all of them removes the record.
export function removePhotosEvents(ctx: Ctx, id: string, paths: string[], reason: string | null): VsaEvent[] | Reject {
  const x = currentEvidence(ctx, id);
  if ('ok' in x) return x;
  const files = [x.photo, ...(x.more ?? [])];
  if (!paths.length) return reject('Select the photos to remove first.');
  if (paths.some((p) => !files.includes(p))) return reject('A selected photo is not part of this record.');
  if (!reason?.trim()) return reject('Pick a reason for removing the photos. They stay in the log.');
  const left = files.filter((p) => !paths.includes(p));
  if (!left.length) return removeEvidenceEvents(ctx, id, reason);
  return editEvidenceEvents(ctx, id, { type: x.type, deck: x.deck, hatch: x.hatch, reason: x.reason, vins: x.vins, notes: x.notes, time: x.at, photo: left[0], more: left.slice(1) }, reason);
}

// Removal is an entry, never a delete: the record and the photo file stay, marked removed, with the reason.
export function removeEvidenceEvents(ctx: Ctx, id: string, reason: string | null): VsaEvent[] | Reject {
  const x = currentEvidence(ctx, id);
  if ('ok' in x) return x;
  if (!reason?.trim()) return reject('Pick a reason for removing this photo. It stays in the log, marked removed.');
  const { add, out } = builder(ctx);
  add({ type: 'evidence.removed', metric: 'evidence', value: null, workstream: 'operation', supersedes: x.headId, reason: reason.trim() });
  return out;
}


// ---------- Van list ----------

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

// Plan › Vans: "How many vans?" creates that many empty slots in one save; raising the count later adds more at the end.
export function addVanSlotsEvents(ctx: Ctx, count: number): VsaEvent[] | Reject {
  if (!Number.isInteger(count) || count < 1) return reject(`Choose how many vans, 1 to ${MAX_VANS}.`);
  const live = ctx.state.vans.filter((v) => !v.removed).length;
  if (live + count > MAX_VANS) return reject(`The list holds up to ${MAX_VANS} vans. It has ${live}, so you can add ${MAX_VANS - live} more.`);
  const { add, out } = builder(ctx);
  for (let i = 0; i < count; i++) add({ type: 'van.added', metric: 'van', value: null, workstream: 'operation', extra: { van: { ...BLANK_VAN } } });
  return out;
}

function currentVan(ctx: Ctx, id: string) {
  const v = ctx.state.vans.find((x) => x.id === id);
  if (!v) return reject('That van row is not on this vessel.');
  if (v.removed) return reject('That van row was removed. Add a new slot instead.');
  return v;
}
const dataOf = (v: VanData): VanData => ({ number: v.number, driver: v.driver, lasher: v.lasher, out: v.out, in: v.in, gas: v.gas, gassed: v.gassed, gassedAt: v.gassedAt, gassedNote: v.gassedNote, remarks: v.remarks });

// A change to a van row supersedes the current version and keeps it in the history. The note is optional: Colby's own words on why.
export function editVanEvents(ctx: Ctx, id: string, patch: Partial<VanData>, note: string | null): VsaEvent[] | Reject {
  const v = currentVan(ctx, id);
  if ('ok' in v) return v;
  const cleaned = Object.fromEntries(Object.entries(patch).map(([k, x]) => [k, blank(x)])) as Partial<VanData>;
  const next = trimVan({ ...dataOf(v), ...cleaned });
  // Changing the status away from Gassed clears its time; a time typed with any other status is refused by checkVan.
  if ('gassed' in cleaned && cleaned.gassed !== 'gassed' && !('gassedAt' in cleaned)) next.gassedAt = null;
  const bad = checkVan(next);
  if (bad) return reject(bad);
  if (next.number) {
    const held = numberHeldBy(ctx.state.vans, next.number, v.id);
    if (held) return reject(`Van ${next.number} is already on Van slot ${held.slot}. A van number can be on one row only; change that row first.`);
  }
  const bt = [next.out, next.in, next.gassedAt].map((t) => (t ? badTimes(t) : null)).find(Boolean);
  if (bt) return bt;
  if (JSON.stringify(next) === JSON.stringify(dataOf(v))) return reject('Nothing to save: the van row is unchanged.');
  const { add, out } = builder(ctx);
  add({ type: 'van.corrected', metric: 'van', value: null, workstream: 'operation', supersedes: v.headId, reason: note?.trim() || null, extra: { van: next } });
  return out;
}

// Removal is an entry, never a delete: the row stays in the log, marked removed, with the reason.
export function removeVanEvents(ctx: Ctx, id: string, reason: string | null): VsaEvent[] | Reject {
  const v = currentVan(ctx, id);
  if ('ok' in v) return v;
  if (!reason?.trim()) return reject('Say why this van row is removed. It stays in the log, marked removed.');
  const { add, out } = builder(ctx);
  add({ type: 'van.removed', metric: 'van', value: null, workstream: 'operation', supersedes: v.headId, reason: reason.trim() });
  return out;
}

// The shortcut: mark these Back vans Gassed (optional time). Only vans that are Back and not yet marked either way qualify.
export function markGassedEvents(ctx: Ctx, ids: string[], time: OpTime | null): VsaEvent[] | Reject {
  const ok = new Set(backNotMarked(ctx.state.vans).map((v) => v.id));
  const wrong = ids.find((i) => !ok.has(i));
  if (wrong) return reject('Only vans that are checked in and not yet marked can be marked gassed this way.');
  if (!ids.length) return reject('No vans to mark: none are checked in and unmarked.');
  if (time) { const bt = badTimes(time); if (bt) return bt; }
  const { add, out } = builder(ctx);
  for (const id of ids) {
    const v = ctx.state.vans.find((x) => x.id === id)!;
    add({ type: 'van.corrected', metric: 'van', value: null, workstream: 'operation', supersedes: v.headId, extra: { van: { ...dataOf(v), gassed: 'gassed', gassedAt: time } } });
  }
  return out;
}

// Photo read: confirmed rows go into the empty (Not assigned) slots in order from the top, in one save.
// A number already on the list, or repeated in these rows, is refused; nothing is guessed or skipped silently.
export function fillVanSlotsEvents(ctx: Ctx, rows: { number: string; driver: string | null }[]): VsaEvent[] | Reject {
  const free = ctx.state.vans.filter((v) => !v.removed && v.number == null);
  if (!rows.length) return reject('No van rows to add.');
  if (rows.length > free.length) return reject(`${rows.length} rows but only ${free.length} empty slot${free.length === 1 ? '' : 's'}. Add more slots first, or remove rows.`);
  const seen = new Set<string>();
  const { add, out } = builder(ctx);
  for (let i = 0; i < rows.length; i++) {
    const number = rows[i].number.trim(), driver = rows[i].driver?.trim() || null;
    // Keep whatever the slot already holds (a driver, lasher label or remarks entered before the number): only number and a read name change.
    const next = trimVan({ ...dataOf(free[i]), number, driver: driver ?? free[i].driver });
    const bad = checkVan(next);
    if (bad) return reject(`Row ${i + 1} (${number || 'no number'}): ${bad}`);
    const held = numberHeldBy(ctx.state.vans, number);
    if (held) return reject(`Van ${number} is already on Van slot ${held.slot}.`);
    if (seen.has(number.toLowerCase())) return reject(`Van ${number} is listed twice in these rows.`);
    seen.add(number.toLowerCase());
    add({ type: 'van.corrected', metric: 'van', value: null, workstream: 'operation', supersedes: free[i].headId, extra: { van: next } });
  }
  return out;
}
