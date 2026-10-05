// project(baseline, events) → the full autos state, or the first rejection.
// This is the one call later phases use. To append, project(existing + new) and
// store the new events only if it succeeds.
import { validateBaseline, type Baseline } from './baseline.ts';
import { deckCalc, deckUpdate, heightInfo, type DeckState, type DeckStatus } from './decks.ts';
import { checkEvidence, checkVin, evidencePath, type EvidenceData } from './evidence.ts';
import { checkVan, diffVan, trimVan, vanStatus, type VanSlot } from './vans.ts';
import { replay, activeEvents, historyOf, type VsaEvent } from './events.ts';
import { buildPeriods, summarize, checkHour, hourDriverRate, isShort, SAFETY_MEETING, type HourEntry } from './production.ts';
import { ledger, currentDrivers, type Phase } from './ledger.ts';
import { eta, vesselClearBy, type Ops } from './eta.ts';
import { fromIso, toAbs, eventTimeLabel, parseHM, formatHM, type OpTime, type Reject } from './time.ts';

export * from './time.ts';
export * from './baseline.ts';
export * from './decks.ts';
export * from './fit.ts';
export * from './events.ts';
export * from './production.ts';
export * from './ledger.ts';
export * from './eta.ts';
export * from './evidence.ts';
export * from './vans.ts';

// A ship-specific note (Plan tab). The current text, plus every earlier version.
export type PlanNote = {
  id: string; headId: string; title: string | null; text: string; source: 'typed' | 'photo-read'; photo: string | null;
  createdAt: string; edited: boolean; removed: boolean; removedReason: string | null; removedAt: string | null;
  history: { title: string | null; text: string; at: string; reason: string | null }[]; // oldest to newest
};

// A photo record (Log › Photo). The current values, plus every earlier version; removed ones stay, flagged.
// `at` is the time Colby entered (null = time not provided); `atLabel` says which kind of time is shown.
export type EvidenceItem = EvidenceData & {
  id: string; headId: string; at: OpTime | null; atLabel: string; vinWarnings: string[];
  edited: boolean; removed: boolean; removedReason: string | null; removedAt: string | null;
  history: { reason: string; vins: string[]; notes: string | null; at: string; changeReason: string | null }[]; // oldest to newest
};

// One row of the break log. startId/endId are the current events to correct (null = not editable here).
export type BreakEntry = {
  kind: 'break' | 'missed' | 'shift';
  start: string; end: string | null;
  startAbs: number; endAbs: number | null; // minutes since Day 1 00:00
  startId: string | null; endId: string | null;
  edited: boolean;
};

const STATUS_LABEL: Record<DeckStatus, string> = { notStarted: 'Not started', active: 'Active', paused: 'Paused', complete: 'Complete', unknown: 'Unknown' };
const STATUSES = Object.keys(STATUS_LABEL) as DeckStatus[];
const fail = (error: string, event_id?: string): Reject & { event_id?: string } => ({ ok: false, error, ...(event_id ? { event_id } : {}) });

// A day's actual start is a later start than planned, before the first break. Shared by the
// engine and the entry form so both refuse with the same words.
export function dayStartProblem(day: number, hm: string, planned: string, firstBreak: string | null): string | null {
  const m = parseHM(hm), pl = parseHM(planned);
  if (m == null) return 'Enter the actual start as HH:MM, for example 08:40.';
  if (pl != null && m < pl) return `Day ${day} start ${formatHM(m)} is earlier than the planned ${formatHM(pl)}. Operations start on the hour; only a later start can be recorded.`;
  const fb = firstBreak ? parseHM(firstBreak) : null;
  if (fb != null && m >= fb) return `Day ${day} start ${formatHM(m)} must be before the ${formatHM(fb)} break.`;
  return null;
}

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
  // CLAUDE.md timestamps: the exact time when given; otherwise the phone's processing
  // time, clearly labeled as such (never as the event time); otherwise "time not provided".
  const when = (occurred: OpTime | null, recordedAt: string) => {
    const m = /T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(recordedAt);
    return eventTimeLabel(occurred, m ? { hm: m[1], tz: m[2] === 'Z' ? 'UTC' : `UTC${m[2]}` } : null);
  };
  const deckById = new Map(baseline.decks.map((d) => [d.id, d]));
  const decks: Record<string, DeckState & { time?: string | null; heightConfirmed?: { m: number; time: string } | null; history?: { status: DeckStatus; time: string }[] }> = {};
  const hours = new Map<string, HourEntry & { key: string; was?: number[] }>();
  const hourValue = new Map<string, string>(); // hour|metric|brand → the one active event holding it
  const ops: Ops & { shiftEnd?: string | null } = { day: 1 };
  const breakLog: BreakEntry[] = [];
  const dayDrivers = new Map<number, { n: number; id: string }>(); // workday driver setting per operation day
  const dayActual = new Map<number, { hm: string; id: string; cause: string | null }>(); // actual (late) start per operation day
  const plan: { shiftEnd: string | null; nextStart: string | null } = { shiftEnd: null, nextStart: null };
  const clerks: { remaining: number; time: string; seq: number }[] = [];
  const noteList: PlanNote[] = [];
  const evidenceList: EvidenceItem[] = [];
  const vanList: VanSlot[] = [];
  const issues = new Map<string, { id: string; key: string | null; text: string; openedAt: string; status: 'open' | 'resolved'; resolvedAt: string | null }>();
  let recStart = 0; // sequence of the latest break/shift-end start
  const lastDeckEvent: Record<string, string> = {}; // for naming the event in whole-sheet errors

  // Each event is applied at its original's place in the log, so a corrected break time
  // takes effect where the break happened, not where the correction was saved.
  const byId = new Map(log.events.map((x) => [x.event_id, x]));
  const rootOf = (x: VsaEvent): VsaEvent => { while (x.supersedes_event_id) x = byId.get(x.supersedes_event_id)!; return x; };
  const ordered = activeEvents(log).map((e) => ({ e, root: rootOf(e) })).sort((a, b) => a.root.sequence - b.root.sequence);
  for (const { e, root } of ordered) {
    const p = e.payload, id = e.event_id, sc = e.scope;
    if (sc.workstream !== 'auto_discharge' && sc.workstream !== 'operation') return fail(`Event ${id}: ${sc.workstream} is not tracked by this engine (autos only).`, id);
    const occurred = at(e.occurred_at);
    if (occurred && 'error' in occurred) return fail(occurred.error, id);

    if (['field_units', 'drivers', 'productive_minutes'].includes(p.metric)) {
      if (!p.period_start || !p.period_end) return fail(`Event ${id}: ${p.metric} needs the hour it covers.`, id);
      const s = fromIso(p.period_start, opDate), z = fromIso(p.period_end, opDate);
      if ('error' in s) return fail(s.error, id);
      if ('error' in z) return fail(z.error, id);
      // Hours follow the day's start time (Colby chose A): 07:30 starts give 07:30–08:30 hours.
      // An hour may not run through a break start: the last hour before a break is short and
      // ends at the break (owner decision: a 07:30 day logs 11:30–12:00).
      const sMin = parseHM(s.hm)!, len = toAbs(z)! - toAbs(s)!;
      const crossed = baseline.breaks.map((b) => parseHM(b)!).find((b) => sMin < b && b < sMin + 60);
      if (crossed != null) {
        if (len !== crossed - sMin) return fail(`Event ${id}: Hour ${s.hm}–${formatHM(sMin + 60)} runs through the ${formatHM(crossed)} break. The hour before a break ends at ${formatHM(crossed)}.`, id);
      } else if (len !== 60) return fail(`Event ${id}: field counts are hourly; ${p.period_start}–${p.period_end} is not one hour.`, id);
      // Unanchored is fine: fromIso above already enforced the full ISO format.
      if (![p.period_start, p.period_end].every((x) => /T\d{2}:\d{2}(:00(\.0+)?)?(Z|[+-])/.test(x!))) return fail(`Event ${id}: hour periods must be whole minutes.`, id);
      if (p.metric !== 'field_units' && sc.commodity) return fail(`Event ${id}: only a field count can name a brand.`, id);
      if (p.metric !== 'field_units' && p.count_kind !== 'not_applicable') return fail(`Event ${id}: ${p.metric} must not be a count kind (count_kind not_applicable).`, id);
      const key = `${s.day}|${s.hm}`;
      // One value per hour and field. A new value must correct the old one (keeps history), never replace it.
      const slot = `${key}|${p.metric}|${sc.commodity ?? ''}`;
      const held = hourValue.get(slot);
      if (held) return fail(`Event ${id}: Hour ${eventTimeLabel(s)} already has ${p.metric}${sc.commodity ? ` for ${sc.commodity}` : ''} (event ${held}); correct that event instead.`, id);
      hourValue.set(slot, id);
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
            history: [...(cur.history ?? []), { status: p.value as DeckStatus, time: when(occurred, e.recorded_at) }] };
        } else if (p.metric === 'deck_skipped') {
          if (typeof p.value !== 'boolean') return fail(`Event ${id}: deck_skipped must be true or false.`, id);
          next = { ...cur, skipped: p.value === true };
        } else if (p.metric === 'deck_height_m') {
          if (typeof p.value !== 'number' || !(p.value > 0)) return fail(`Event ${id}: deck height must be a positive number of metres.`, id);
          decks[d.id] = { ...cur, heightConfirmed: { m: p.value, time: when(occurred, e.recorded_at) } };
          continue;
        } else {
          // Only a remaining count: then the envelope has checked it is a whole number or unknown.
          if (p.count_kind !== 'remaining') return fail(`Event ${id}: vessel_remaining must be a remaining count (a whole number, or unknown).`, id);
          if (cur.status !== 'active' && cur.status !== 'paused') return fail(`Event ${id}: ${d.label} is ${STATUS_LABEL[cur.status]}; set it Active or Paused before logging a count.`, id);
          // null (provenance unknown) takes a count back to unknown.
          const hatches = { ...cur.hatchRemaining };
          if (sc.hatch) { if (p.value === null) delete hatches[sc.hatch]; else hatches[sc.hatch] = p.value as number; }
          next = sc.hatch ? { ...cur, hatchRemaining: hatches } : { ...cur, deckRemaining: p.value as number | null };
        }
        const u = deckUpdate(d, next, false);
        if ('error' in u) return fail(u.error, id);
        // The deck's time is the latest save's time; a save with no time is "time not provided", never an earlier time.
        decks[d.id] = { ...cur, ...u, time: when(occurred, e.recorded_at), history: next.history };
        lastDeckEvent[d.id] = id;
        continue;
      }
      case 'clerk_remaining':
        if (p.count_kind !== 'remaining' || !Number.isInteger(p.value) || (p.value as number) < 0) {
          return fail(`Event ${id}: clerk_remaining must be a remaining count (a whole number of 0 or more).`, id);
        }
        if ((p.value as number) > base.start) return fail(`Chief clerk remaining (${p.value}) exceeds starting cargo (${base.start}) by ${(p.value as number) - base.start}. Check the count.`, id);
        clerks.push({ remaining: p.value as number, time: when(occurred, e.recorded_at), seq: root.sequence });
        continue;
      case 'break': {
        // A correction keeps its original's type (pause, resume, or a missed break added later).
        const edited = e.event_type === 'correction';
        const type = edited ? root.event_type : e.event_type;
        if (edited && p.value === 'void') continue; // removed with a reason; the log keeps it
        if (p.value !== null) return fail(`Event ${id}: a break has no value (only a correction can remove one, with "void").`, id);
        if (type === 'observation') {
          if (!p.period_start || !p.period_end) return fail(`Event ${id}: break must be a pause or resume, or a missed break with its start and end.`, id);
          const s = fromIso(p.period_start, opDate), z = fromIso(p.period_end, opDate);
          if ('error' in s) return fail(s.error, id);
          if ('error' in z) return fail(z.error, id);
          breakLog.push({ kind: 'missed', start: eventTimeLabel(s), end: eventTimeLabel(z), startAbs: toAbs(s)!, endAbs: toAbs(z)!, startId: id, endId: null, edited });
        } else if (type === 'pause') {
          if (!occurred) return fail(`Event ${id}: enter the break start time.`, id);
          Object.assign(ops, { onBreak: true, breakStart: occurred.hm, day: occurred.day }); recStart = root.sequence;
          breakLog.push({ kind: 'break', start: when(occurred, e.recorded_at), end: null, startAbs: toAbs(occurred)!, endAbs: null, startId: id, endId: null, edited });
        } else if (type === 'resume') {
          if (!occurred) return fail(`Event ${id}: enter the time work resumed.`, id);
          ops.onBreak = false;
          const open = breakLog.findLast((x) => x.kind !== 'missed');
          if (open && open.end == null) Object.assign(open, { end: when(occurred, e.recorded_at), endAbs: toAbs(occurred)!, endId: open.kind === 'break' ? id : null, edited: open.edited || edited });
        } else return fail(`Event ${id}: break must be a pause or resume.`, id);
        continue;
      }
      case 'workday_drivers': {
        if (e.event_type !== 'observation' && e.event_type !== 'correction') return fail(`Event ${id}: workday drivers must be an observation.`, id);
        if (p.count_kind !== 'not_applicable') return fail(`Event ${id}: workday_drivers must not be a count kind (count_kind not_applicable).`, id);
        if (!p.period_start || !p.period_end) return fail(`Event ${id}: workday drivers need the day they cover.`, id);
        const s = fromIso(p.period_start, opDate), z = fromIso(p.period_end, opDate);
        if ('error' in s) return fail(s.error, id);
        if ('error' in z) return fail(z.error, id);
        if (s.hm !== '00:00' || z.hm !== '00:00' || z.day !== s.day + 1) return fail(`Event ${id}: workday drivers cover one whole operation day.`, id);
        if (e.event_type === 'correction' && p.value === 'void') continue; // cleared back to unknown; the log keeps it
        if (!Number.isInteger(p.value) || (p.value as number) < 1) return fail(`Event ${id}: the day's drivers must be a whole number of 1 or more. Leave it unset if unknown.`, id);
        const held = dayDrivers.get(s.day);
        if (held) return fail(`Event ${id}: Day ${s.day} already has a driver count (event ${held.id}); correct that event instead.`, id);
        dayDrivers.set(s.day, { n: p.value as number, id });
        continue;
      }
      case 'day_start': {
        if (e.event_type !== 'observation' && e.event_type !== 'correction') return fail(`Event ${id}: a day's start time must be an observation.`, id);
        if (p.count_kind !== 'not_applicable') return fail(`Event ${id}: day_start must not be a count kind (count_kind not_applicable).`, id);
        if (!p.period_start || !p.period_end) return fail(`Event ${id}: a day's start time needs the day it covers.`, id);
        const s = fromIso(p.period_start, opDate), z = fromIso(p.period_end, opDate);
        if ('error' in s) return fail(s.error, id);
        if ('error' in z) return fail(z.error, id);
        if (s.hm !== '00:00' || z.hm !== '00:00' || z.day !== s.day + 1) return fail(`Event ${id}: a day's start time covers one whole operation day.`, id);
        if (e.event_type === 'correction' && p.value === 'void') continue; // back to the planned start; the log keeps it
        if (typeof p.value !== 'string' || parseHM(p.value) == null) return fail(`Event ${id}: day_start must be an HH:MM time.`, id);
        if (p.cause != null && typeof p.cause !== 'string') return fail(`Event ${id}: the cause must be text.`, id);
        if (occurred && (occurred.day !== s.day || occurred.hm !== formatHM(parseHM(p.value)!))) return fail(`Event ${id}: the start time ${p.value} doesn't match the event time ${eventTimeLabel(occurred)}.`, id);
        const held = dayActual.get(s.day);
        if (held) return fail(`Event ${id}: Day ${s.day} already has an actual start (event ${held.id}); correct that event instead.`, id);
        dayActual.set(s.day, { hm: formatHM(parseHM(p.value)!), id, cause: p.cause?.trim() || null });
        continue;
      }
      case 'shift':
        if (e.event_type !== 'status_change') return fail(`Event ${id}: shift must be a status change.`, id);
        if (!occurred) return fail(`Event ${id}: shift changes need a time.`, id);
        if (p.value === 'ended') {
          Object.assign(ops, { shiftEnded: true, onBreak: false, day: occurred.day, shiftEnd: occurred.hm }); recStart = root.sequence;
          breakLog.push({ kind: 'shift', start: `Shift end ${when(occurred, e.recorded_at)}`, end: null, startAbs: toAbs(occurred)!, endAbs: null, startId: null, endId: null, edited: false });
        } else if (p.value === 'started') {
          Object.assign(ops, { shiftEnded: false, day: occurred.day }); if (occurred.day > 1) plan.nextStart = occurred.hm;
          const open = breakLog.findLast((x) => x.kind !== 'missed');
          if (open && open.end == null) Object.assign(open, { end: when(occurred, e.recorded_at), endAbs: toAbs(occurred)! });
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
      case 'plan_note': {
        // Ship-specific notes: text only. A note never changes a count, ledger or forecast.
        const T = e.event_type;
        if (sc.workstream !== 'operation') return fail(`Event ${id}: a note belongs to the operation, not to ${sc.workstream}.`, id);
        if (T !== 'note.added' && T !== 'note.corrected' && T !== 'note.removed') return fail(`Event ${id}: a note must be added, corrected or removed.`, id);
        if (root.event_type !== 'note.added') return fail(`Event ${id}: a note chain must start with note.added.`, id);
        if (p.count_kind !== 'not_applicable') return fail(`Event ${id}: a note must not be a count kind (count_kind not_applicable).`, id);
        if (T === 'note.corrected' && byId.get(e.supersedes_event_id!)?.event_type === 'note.removed') return fail(`Event ${id}: that note was removed. Add a new note instead.`, id);
        if (T === 'note.removed') {
          if (p.value !== null) return fail(`Event ${id}: a note removal carries no text.`, id);
        } else {
          if (typeof p.value !== 'string' || !p.value.trim()) return fail(`Event ${id}: a note needs text.`, id);
          if (p.title != null && typeof p.title !== 'string') return fail(`Event ${id}: a note title must be text.`, id);
          if (p.source != null && p.source !== 'typed' && p.source !== 'photo-read') return fail(`Event ${id}: a note source must be typed or photo-read.`, id);
          if (p.photo != null && typeof p.photo !== 'string') return fail(`Event ${id}: a note photo must be a file path.`, id);
        }
        const label = (x: VsaEvent) => { const o = at(x.occurred_at); return when(o && !('error' in o) ? o : null, x.recorded_at); };
        const chain = historyOf(log, id), versions = chain.filter((x) => x.event_type !== 'note.removed'), last = versions.at(-1)!;
        noteList.push({
          id: root.event_id, headId: id, title: last.payload.title?.trim() || null, text: String(last.payload.value).trim(),
          source: last.payload.source ?? 'typed', photo: last.payload.photo ?? null, createdAt: label(root),
          edited: versions.length > 1, removed: T === 'note.removed', removedReason: T === 'note.removed' ? p.reason : null, removedAt: T === 'note.removed' ? label(e) : null,
          history: versions.map((x) => ({ title: x.payload.title?.trim() || null, text: String(x.payload.value).trim(), at: label(x), reason: x.event_type === 'note.corrected' ? x.payload.reason : null })),
        });
        continue;
      }
      case 'evidence': {
        // Photo evidence: where and when something was seen. It never changes a count, ledger or forecast.
        const T = e.event_type;
        if (sc.workstream !== 'operation') return fail(`Event ${id}: a photo record belongs to the operation, not to ${sc.workstream}.`, id);
        if (T !== 'evidence.added' && T !== 'evidence.corrected' && T !== 'evidence.removed') return fail(`Event ${id}: a photo record must be added, corrected or removed.`, id);
        if (root.event_type !== 'evidence.added') return fail(`Event ${id}: a photo record chain must start with evidence.added.`, id);
        if (p.count_kind !== 'not_applicable') return fail(`Event ${id}: a photo record must not be a count kind (count_kind not_applicable).`, id);
        if (T === 'evidence.corrected' && byId.get(e.supersedes_event_id!)?.event_type === 'evidence.removed') return fail(`Event ${id}: that photo was removed. Add a new photo instead.`, id);
        if (T === 'evidence.removed') {
          if (p.value !== null || p.evidence) return fail(`Event ${id}: a photo removal carries no photo details.`, id);
        } else {
          const bad = checkEvidence(p.evidence, baseline.decks);
          if (bad) return fail(`Event ${id}: ${bad}`, id);
          // The file is named for its first event, inside this vessel's own folder (a TEST photo can't sit in a LIVE vessel).
          if (p.evidence!.photo !== evidencePath(operationId, root.event_id)) return fail(`Event ${id}: the photo file must be ${evidencePath(operationId, root.event_id)}.`, id);
        }
        const label = (x: VsaEvent) => { const o = at(x.occurred_at); return when(o && !('error' in o) ? o : null, x.recorded_at); };
        const chain = historyOf(log, id), versions = chain.filter((x) => x.event_type !== 'evidence.removed'), last = versions.at(-1)!;
        const d = last.payload.evidence!;
        const lastAt = at(last.occurred_at);
        evidenceList.push({
          ...d, vins: [...d.vins], notes: d.notes?.trim() || null,
          id: root.event_id, headId: id, at: lastAt && !('error' in lastAt) ? lastAt : null, atLabel: label(last),
          vinWarnings: d.vins.map((v) => { const c = checkVin(v); return c.ok ? c.warning : null; }).filter((w): w is string => !!w),
          edited: versions.length > 1, removed: T === 'evidence.removed', removedReason: T === 'evidence.removed' ? p.reason : null, removedAt: T === 'evidence.removed' ? label(e) : null,
          history: versions.map((x) => ({ reason: x.payload.evidence!.reason, vins: x.payload.evidence!.vins, notes: x.payload.evidence!.notes?.trim() || null, at: label(x), changeReason: x.event_type === 'evidence.corrected' ? x.payload.reason : null })),
        });
        continue;
      }
      case 'van': {
        // The ship's shuttle van list: its own ledger. A van row never changes a count, ledger or forecast.
        const T = e.event_type;
        if (sc.workstream !== 'operation') return fail(`Event ${id}: a van row belongs to the operation, not to ${sc.workstream}.`, id);
        if (T !== 'van.added' && T !== 'van.corrected' && T !== 'van.removed') return fail(`Event ${id}: a van row must be added, corrected or removed.`, id);
        if (root.event_type !== 'van.added') return fail(`Event ${id}: a van row chain must start with van.added.`, id);
        if (p.count_kind !== 'not_applicable') return fail(`Event ${id}: a van row must not be a count kind (count_kind not_applicable).`, id);
        if (T === 'van.corrected' && byId.get(e.supersedes_event_id!)?.event_type === 'van.removed') return fail(`Event ${id}: that van row was removed. Add a new slot instead.`, id);
        if (T === 'van.removed') {
          if (p.value !== null || p.van) return fail(`Event ${id}: a van removal carries no van details.`, id);
          if (!p.reason?.trim()) return fail(`Event ${id}: removing a van row needs a reason. It stays in the log, marked removed.`, id);
        } else {
          const bad = checkVan(p.van);
          if (bad) return fail(`Event ${id}: ${bad}`, id);
        }
        const label = (x: VsaEvent) => { const o = at(x.occurred_at); return when(o && !('error' in o) ? o : null, x.recorded_at); };
        const chain = historyOf(log, id), versions = chain.filter((x) => x.event_type !== 'van.removed'), d = trimVan(versions.at(-1)!.payload.van!);
        vanList.push({
          ...d, id: root.event_id, headId: id, slot: vanList.length + 1, status: vanStatus(d), createdAt: label(root),
          removed: T === 'van.removed', removedReason: T === 'van.removed' ? p.reason : null, removedAt: T === 'van.removed' ? label(e) : null,
          changes: versions.flatMap((x, i) => (i === 0 ? [] : diffVan(trimVan(versions[i - 1].payload.van!), trimVan(x.payload.van!), label(x), x.payload.reason?.trim() || null, {
            number: versions.slice(0, i).some((y) => y.payload.van!.number != null), driver: versions.slice(0, i).some((y) => y.payload.van!.driver != null),
          }))),
        });
        continue;
      }
      case 'discrepancy':
        if (e.event_type !== 'discrepancy_opened' && e.event_type !== 'discrepancy_resolved') return fail(`Event ${id}: discrepancy must be opened or resolved.`, id);
        if (e.event_type === 'discrepancy_opened' && !(p.reason ?? (typeof p.value === 'string' ? p.value : '')).trim()) return fail(`Event ${id}: a discrepancy needs a description.`, id);
        if (e.event_type === 'discrepancy_opened') issues.set(id, { id, key: p.reason && typeof p.value === 'string' ? p.value : null, text: p.reason ?? String(p.value ?? ''), openedAt: when(occurred, e.recorded_at), status: 'open', resolvedAt: null });
        else if (e.event_type === 'discrepancy_resolved') {
          const target = p.input_event_ids[0];
          const issue = target ? issues.get(target) : undefined;
          if (!issue || issue.status !== 'open') return fail(`Event ${id}: discrepancy ${target} is not open.`, id);
          issue.status = 'resolved';
          issue.resolvedAt = when(occurred, e.recorded_at);
        }
        continue;
      default:
        return fail(`Event ${id}: metric "${p.metric}" is not tracked by this engine.`, id);
    }
  }

  // A van number sits on one current row only (a swapped-out number is free again; the history keeps it).
  const heldNumbers = new Map<string, VanSlot>();
  for (const v of vanList) {
    if (v.removed || v.number == null) continue;
    const key = v.number.toLowerCase(), first = heldNumbers.get(key);
    if (first) return fail(`Van ${v.number} is already on Van slot ${first.slot}. A van number can be on one row only; change one of them first.`, v.headId);
    heldNumbers.set(key, v);
  }

  // Break log: an edited break must still end after it starts. Overlaps are checked when a
  // break is added or edited (entries.ts), so they can never block logging a live break.
  for (const b of breakLog) {
    if ((b.edited || b.kind === 'missed') && b.endAbs != null && b.endAbs <= b.startAbs) return fail(`Break ${b.start}–${b.end}: the end must be after the start.`, b.endId ?? b.startId ?? undefined);
  }
  breakLog.sort((a, b) => a.startAbs - b.startAbs);

  // Whole-sheet check per deck: hatch counts must agree with a deck total when both are complete.
  for (const [id, st] of Object.entries(decks)) {
    const u = deckUpdate(deckById.get(id)!, st);
    if ('error' in u) return fail(u.error, lastDeckEvent[id]);
  }

  // Planned start: baseline start on Day 1, the next-day start after that (as the hour picker uses).
  const plannedStart = (day: number) => (day > 1 ? plan.nextStart ?? baseline.start : baseline.start);
  const firstBreak = [...baseline.breaks].sort((a, b) => parseHM(a)! - parseHM(b)!)[0] ?? null;
  for (const [day, a] of dayActual) {
    const bad = dayStartProblem(day, a.hm, plannedStart(day), firstBreak);
    if (bad) return fail(`Event ${a.id}: ${bad}`, a.id);
  }

  // Hourly entries: validate, then check the field total against starting cargo.
  const brandNames = Object.keys(base.brandStart);
  const entries: HourEntry[] = [];
  for (const h of hours.values()) {
    if (Number.isNaN(h.count)) return fail(`Hour ${eventTimeLabel({ day: h.day, hm: h.start })} has a brand split or drivers but no total count.`);
    // The hour's own driver count wins; otherwise the day's workday setting applies.
    const own = h.drivers ?? null, day = dayDrivers.get(h.day)?.n ?? null;
    Object.assign(h, { hourDrivers: own, drivers: own ?? day, driversFrom: own != null ? 'hour' : day != null ? 'day' : null });
    const bad = checkHour(h, brandNames, baseline.breaks);
    if (bad) return fail(`Hour ${eventTimeLabel({ day: h.day, hm: h.start })}: ${bad.error}`);
    // A late start: only the minutes from the actual start count. An hour with no such minutes can't hold a count.
    const actual = dayActual.get(h.day);
    const late = actual ? Math.min(60, Math.max(0, parseHM(actual.hm)! - parseHM(h.start)!)) : 0;
    if (late > 0) {
      const worked = isShort(h.start, baseline.breaks) ? h.stopMin ?? 60 : 60;
      if (worked - late <= 0 && h.count > 0) return fail(`Hour ${eventTimeLabel({ day: h.day, hm: h.start })}: Day ${h.day} work started at ${actual!.hm}, so this hour has no productive time and can't have a count above 0. Log the count in the hour work actually started, or correct the day's start time.`);
      h.lateMin = late;
    }
    if (h.start === SAFETY_MEETING.start && plannedStart(h.day) === SAFETY_MEETING.start) h.safetyMin = SAFETY_MEETING.min;
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
    return { ...deckCalc(d, st), height: heightInfo(d, st?.heightConfirmed ?? null), time: st?.time ?? null, history: st?.history ?? [],
      entered: { hatches: { ...st?.hatchRemaining }, deck: st?.deckRemaining ?? null } }; // what Colby last entered (sheet pre-fill)
  });
  const phase: Phase = ops.shiftEnded ? 'shift_end' : ops.onBreak ? 'break' : 'working';
  const clerk = phase === 'working' ? null : clerks.filter((c) => c.seq > recStart).at(-1) ?? null;
  const today = dayDrivers.get(ops.day);
  const drivers = currentDrivers(periods, baseline.labor, today ? { day: ops.day, n: today.n } : null);
  const L = ledger({ decks: deckResults, periods, phase, drivers, clerk: clerk && { remaining: clerk.remaining, time: clerk.time } });
  const forecast = eta({
    remaining: L.vesselRemaining ?? L.fieldBalance,
    basis: L.vesselRemaining != null ? 'vessel' : 'field',
    periods,
    schedule: { dayStart: baseline.start, nextStart: plan.nextStart, shiftEnd: plan.shiftEnd, breaks: baseline.breaks, clearByMin: vesselClearBy(baseline.destinations), ...(dayActual.size ? { actualStarts: Object.fromEntries([...dayActual].map(([d, a]) => [d, a.hm])) } : {}) },
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
    breaks: baseline.breaks,
    ...L,
    eta: forecast,
    ops: { ...ops, phase },
    plan,
    issues: [...issues.values()],
    notes: noteList, // creation order; removed ones stay, flagged
    evidence: evidenceList, // creation order; removed ones stay, flagged
    vans: vanList, // slot order; removed ones stay, flagged
    breakLog,
    // Per operation day: planned start and the actual start if one was recorded (null = the planned start applies).
    dayStarts: Object.fromEntries(Array.from({ length: Math.max(2, ops.day, ...dayActual.keys()) }, (_, i) => {
      const day = i + 1, a = dayActual.get(day), planned = plannedStart(day);
      return [day, { planned, firstBreak, actual: a?.hm ?? null, lateMin: a ? parseHM(a.hm)! - parseHM(planned)! : 0, cause: a?.cause ?? null, id: a?.id ?? null }];
    })) as Record<number, { planned: string; firstBreak: string | null; actual: string | null; lateMin: number; cause: string | null; id: string | null }>,
    workdayDrivers: Object.fromEntries([...dayDrivers].map(([d, v]) => [d, v.n])) as Record<number, number>,
    corrections,
    log,
  };
}
