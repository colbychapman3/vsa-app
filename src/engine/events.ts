// Append-only event log (kit file 06 envelope) and replay.
// Checks log integrity only: operation, duplicates, sequence, corrections, overlaps.
// What each metric means for the ledgers is decided by project() in index.ts.
import type { Reject } from './time.ts';
import type { EvidenceData } from './evidence.ts';
import type { VanData } from './vans.ts';

export type Workstream = 'auto_discharge' | 'hh_discharge' | 'static_discharge' | 'auto_loadback' | 'hh_loadback' | 'lashing' | 'operation';
export type EventType = 'initialize' | 'observation' | 'correction' | 'status_change' | 'pause' | 'resume' | 'discrepancy_opened' | 'discrepancy_resolved' | 'forecast_created' | 'note.added' | 'note.corrected' | 'note.removed' | 'evidence.added' | 'evidence.corrected' | 'evidence.removed' | 'van.added' | 'van.corrected' | 'van.removed';
export type CountKind = 'interval' | 'cumulative' | 'remaining' | 'not_applicable';
export type Scope = { workstream: Workstream; deck: string | null; hatch: string | null; commodity: string | null; destination: string | null };

export type VsaEvent = {
  schema_version: '1.0';
  event_id: string;
  operation_id: string;
  sequence: number;
  idempotency_key: string;
  event_type: EventType;
  scope: Scope;
  occurred_at: string | null; // reported event time; null = time not provided
  recorded_at: string;        // processing time, never an event time
  actor: string;
  source_ids: string[];
  provenance: 'source_fact' | 'user_report' | 'calculated' | 'forecast' | 'unknown';
  supersedes_event_id: string | null;
  payload: {
    metric: string;
    value: number | string | boolean | null;
    unit: string | null;
    count_kind: CountKind;
    period_start: string | null;
    period_end: string | null;
    reason: string | null;
    input_event_ids: string[];
    cause?: string | null;      // day_start only: why it started late (Late vessel, Ramp problem, ...); optional, for the record
    title?: string | null;      // plan_note only: optional short title
    source?: 'typed' | 'photo-read'; // plan_note only: how the text got here
    photo?: string | null;      // plan_note only: kept photo file path (none while typed-only)
    evidence?: EvidenceData;    // evidence only (added / corrected): what the photo shows and where
    van?: VanData;              // van only (added / corrected): the row's values after this event
  };
};

export type EventLog = {
  operationId: string;
  events: VsaEvent[];                   // every accepted event, in sequence order
  supersededBy: Record<string, string>; // event_id → the correction that replaced it
};

export type Change = { target: string; from: VsaEvent['payload']['value']; to: VsaEvent['payload']['value']; net: number | null };

const WORKSTREAMS = ['auto_discharge', 'hh_discharge', 'static_discharge', 'auto_loadback', 'hh_loadback', 'lashing', 'operation'];
const EVENT_TYPES = ['initialize', 'observation', 'correction', 'status_change', 'pause', 'resume', 'discrepancy_opened', 'discrepancy_resolved', 'forecast_created', 'note.added', 'note.corrected', 'note.removed', 'evidence.added', 'evidence.corrected', 'evidence.removed', 'van.added', 'van.corrected', 'van.removed'];
// Event types that replace an earlier event (and must name it, with a reason).
export const SUPERSEDING: readonly string[] = ['correction', 'note.corrected', 'note.removed', 'evidence.corrected', 'evidence.removed', 'van.corrected', 'van.removed'];
const COUNT_KINDS = ['interval', 'cumulative', 'remaining', 'not_applicable'];
const PROVENANCE = ['source_fact', 'user_report', 'calculated', 'forecast', 'unknown'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const reject = (error: string): Reject => ({ ok: false, error });
// The shape check alone lets month 13 or minute 99 through; Date.parse must also read it.
const badTime = (t: unknown) => typeof t !== 'string' || !ISO.test(t) || Number.isNaN(Date.parse(t));

export function emptyLog(operationId: string): EventLog {
  return { operationId, events: [], supersededBy: {} };
}

// Stable JSON (sorted keys) so re-delivery compares by content, not key order.
function canon(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canon).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canon((x as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(x);
}

function checkEnvelope(e: VsaEvent): string | null {
  if (e.schema_version !== '1.0') return 'schema_version must be "1.0".';
  for (const k of ['event_id', 'operation_id', 'idempotency_key', 'actor'] as const) if (typeof e[k] !== 'string' || !e[k]) return `${k} is required.`;
  if (!Number.isInteger(e.sequence) || e.sequence < 1) return `Event ${e.event_id}: sequence must be a whole number of 1 or more.`;
  if (!EVENT_TYPES.includes(e.event_type)) return `Event ${e.event_id}: event_type "${e.event_type}" is not allowed.`;
  if (!PROVENANCE.includes(e.provenance)) return `Event ${e.event_id}: provenance "${e.provenance}" is not allowed.`;
  if (!e.scope || !WORKSTREAMS.includes(e.scope.workstream)) return `Event ${e.event_id}: scope workstream "${e.scope?.workstream}" is not allowed.`;
  if (badTime(e.recorded_at)) return `Event ${e.event_id}: recorded_at must be a date-time with UTC offset.`;
  if (e.occurred_at !== null && badTime(e.occurred_at)) return `Event ${e.event_id}: occurred_at must be null or a date-time with UTC offset.`;
  if (!Array.isArray(e.source_ids)) return `Event ${e.event_id}: source_ids must be a list.`;
  const p = e.payload;
  if (!p || typeof p.metric !== 'string' || !p.metric) return `Event ${e.event_id}: payload metric is required.`;
  if (p.reason !== null && typeof p.reason !== 'string') return `Event ${e.event_id}: reason must be text.`;
  if (!COUNT_KINDS.includes(p.count_kind)) return `Event ${e.event_id}: count_kind "${p.count_kind}" is not allowed.`;
  // A count is a whole number, or null with provenance 'unknown' (kit file 15: unknown = null, class unknown).
  // Only a vessel remaining count can go back to unknown (the deck sheet's cleared box).
  const unknownCount = p.metric === 'vessel_remaining' && p.value === null && e.provenance === 'unknown';
  if (p.count_kind !== 'not_applicable' && !unknownCount && !(Number.isInteger(p.value) && (p.value as number) >= 0)) {
    return `Event ${e.event_id}: ${p.metric} must be a whole number of 0 or more (got ${p.value}).`;
  }
  for (const k of ['period_start', 'period_end'] as const) if (p[k] !== null && badTime(p[k])) return `Event ${e.event_id}: ${k} must be null or a date-time with UTC offset.`;
  if (p.period_start && p.period_end && Date.parse(p.period_end) <= Date.parse(p.period_start)) return `Event ${e.event_id}: period_end must be after period_start.`;
  if (SUPERSEDING.includes(e.event_type) ? !e.supersedes_event_id : e.supersedes_event_id !== null) {
    return SUPERSEDING.includes(e.event_type) ? `Correction ${e.event_id} must name the event it replaces.` : `Event ${e.event_id}: Only a correction can replace another event.`;
  }
  return null;
}

const sameScope = (a: Scope, b: Scope) => canon(a) === canon(b);
const isInterval = (e: VsaEvent) => e.payload.count_kind === 'interval' && e.payload.period_start !== null && e.payload.period_end !== null;

export function activeEvents(log: EventLog): VsaEvent[] {
  return log.events.filter((e) => !log.supersededBy[e.event_id]);
}

// Oldest → newest values for the chain ending at eventId. The id map is built once per finished
// events array (logs are never edited after replay), not on every call.
const idMaps = new WeakMap<readonly VsaEvent[], Map<string, VsaEvent>>();
export function historyOf(log: EventLog, eventId: string): VsaEvent[] {
  let byId = idMaps.get(log.events);
  if (!byId) { byId = new Map(log.events.map((e) => [e.event_id, e])); idMaps.set(log.events, byId); }
  const chain: VsaEvent[] = [];
  for (let e = byId.get(eventId); e; e = e.supersedes_event_id ? byId.get(e.supersedes_event_id) : undefined) chain.unshift(e);
  return chain;
}

// Replay works on an accumulator that owns its log and keeps lookup indexes, so each event costs the
// same however long the log is. appendEvent() builds one from an existing log and stays immutable.
type Acc = {
  log: EventLog;
  idAt: Map<string, number>;      // event_id → position in log.events
  keyAt: Map<string, number>;     // idempotency_key → position in log.events
  live: Map<string, VsaEvent[]>;  // metric + scope → interval events not yet replaced, in log order
};
const bucketOf = (e: VsaEvent) => JSON.stringify([e.payload.metric, canon(e.scope)]);

function index(acc: Acc, e: VsaEvent, at: number) {
  if (!acc.idAt.has(e.event_id)) acc.idAt.set(e.event_id, at);
  if (!acc.keyAt.has(e.idempotency_key)) acc.keyAt.set(e.idempotency_key, at);
  if (isInterval(e) && !acc.log.supersededBy[e.event_id]) {
    const k = bucketOf(e), b = acc.live.get(k);
    if (b) b.push(e); else acc.live.set(k, [e]);
  }
}

function accOf(log: EventLog): Acc {
  const acc: Acc = { log: { operationId: log.operationId, events: [...log.events], supersededBy: { ...log.supersededBy } }, idAt: new Map(), keyAt: new Map(), live: new Map() };
  acc.log.events.forEach((e, i) => index(acc, e, i));
  return acc;
}

// Adds e to acc (changing it) only if every check passes; otherwise acc is untouched.
function accAppend(acc: Acc, e: VsaEvent): { change: Change | null; duplicate: boolean } | Reject {
  const log = acc.log;
  if (e?.operation_id !== log.operationId) return reject(`Event ${e?.event_id} belongs to operation ${e?.operation_id}, not ${log.operationId}. Not applied.`);
  const bad = checkEnvelope(e);
  if (bad) return reject(bad);

  const hits = [acc.keyAt.get(e.idempotency_key), acc.idAt.get(e.event_id)].filter((i): i is number => i !== undefined);
  if (hits.length) {
    const same = log.events[Math.min(...hits)]; // the earliest event sharing the key or the id
    if (canon(same) === canon(e)) return { change: null, duplicate: true }; // re-delivery: no-op
    return reject(`${e.idempotency_key} was already used with different content. Not applied.`);
  }
  const last = log.events.at(-1);
  if (last && e.sequence <= last.sequence) return reject(`Event ${e.event_id}: sequence ${e.sequence} is not after ${last.sequence}.`);

  let change: Change | null = null;
  let target: VsaEvent | undefined;
  if (e.supersedes_event_id) {
    const at = acc.idAt.get(e.supersedes_event_id);
    target = at === undefined ? undefined : log.events[at];
    if (!target) return reject(`Correction ${e.event_id}: ${e.supersedes_event_id} is not in this operation's log.`);
    const by = log.supersededBy[target.event_id];
    if (by) return reject(`Correction ${e.event_id}: ${target.event_id} was already replaced by ${by}; correct ${by} instead.`);
    const tp = target.payload, p = e.payload;
    if (!sameScope(target.scope, e.scope) || tp.metric !== p.metric || tp.count_kind !== p.count_kind || tp.period_start !== p.period_start || tp.period_end !== p.period_end) {
      return reject(`Correction ${e.event_id} must keep the same scope, metric and period as ${target.event_id}. Changing those needs a reviewed remapping.`);
    }
    // A van's change note is Colby's to fill in or leave blank; every other correction needs a reason.
    if ((!p.reason || !p.reason.trim()) && e.event_type !== 'van.corrected') return reject(`Correction ${e.event_id} needs a reason.`);
    change = { target: target.event_id, from: tp.value, to: p.value, net: typeof tp.value === 'number' && typeof p.value === 'number' ? p.value - tp.value : null };
  }

  if (isInterval(e)) {
    const s = Date.parse(e.payload.period_start!), t = Date.parse(e.payload.period_end!);
    // Only unreplaced intervals of the same metric and scope can clash; the event being corrected is not one.
    const clash = acc.live.get(bucketOf(e))?.find((x) => x.event_id !== e.supersedes_event_id
      && Date.parse(x.payload.period_start!) < t && s < Date.parse(x.payload.period_end!));
    if (clash) return reject(`Event ${e.event_id}: ${e.payload.metric} ${e.payload.period_start}–${e.payload.period_end} overlaps ${clash.event_id}. Correct ${clash.event_id} instead.`);
  }

  if (target) { // accepted: the target is replaced for good, so it can no longer clash
    log.supersededBy[target.event_id] = e.event_id;
    if (isInterval(target)) {
      const k = bucketOf(target), b = acc.live.get(k)?.filter((x) => x !== target);
      if (b) acc.live.set(k, b);
    }
  }
  log.events.push(e);
  index(acc, e, log.events.length - 1);
  return { change, duplicate: false };
}

export function appendEvent(log: EventLog, e: VsaEvent): { log: EventLog; change: Change | null; duplicate: boolean } | Reject {
  const acc = accOf(log);
  const r = accAppend(acc, e);
  if ('error' in r) return r;
  return r.duplicate ? { log, change: null, duplicate: true } : { log: acc.log, change: r.change, duplicate: false };
}

// Rebuild the log from events in sequence order. Stops at the first rejection.
export function replay(events: VsaEvent[], operationId: string): EventLog | (Reject & { event_id?: string }) {
  const acc = accOf(emptyLog(operationId));
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const r = accAppend(acc, e);
    if ('error' in r) return { ...r, event_id: e?.event_id };
  }
  return acc.log;
}
