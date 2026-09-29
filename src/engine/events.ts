// Append-only event log (kit file 06 envelope) and replay.
// Checks log integrity only: operation, duplicates, sequence, corrections, overlaps.
// What each metric means for the ledgers is decided by project() in index.ts.
import type { Reject } from './time.ts';

export type Workstream = 'auto_discharge' | 'hh_discharge' | 'static_discharge' | 'auto_loadback' | 'hh_loadback' | 'lashing' | 'operation';
export type EventType = 'initialize' | 'observation' | 'correction' | 'status_change' | 'pause' | 'resume' | 'discrepancy_opened' | 'discrepancy_resolved' | 'forecast_created';
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
  };
};

export type EventLog = {
  operationId: string;
  events: VsaEvent[];                   // every accepted event, in sequence order
  supersededBy: Record<string, string>; // event_id → the correction that replaced it
};

export type Change = { target: string; from: VsaEvent['payload']['value']; to: VsaEvent['payload']['value']; net: number | null };

const WORKSTREAMS = ['auto_discharge', 'hh_discharge', 'static_discharge', 'auto_loadback', 'hh_loadback', 'lashing', 'operation'];
const EVENT_TYPES = ['initialize', 'observation', 'correction', 'status_change', 'pause', 'resume', 'discrepancy_opened', 'discrepancy_resolved', 'forecast_created'];
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
  if (e.event_type === 'correction' ? !e.supersedes_event_id : e.supersedes_event_id !== null) {
    return e.event_type === 'correction' ? `Correction ${e.event_id} must name the event it replaces.` : `Event ${e.event_id}: Only a correction can replace another event.`;
  }
  return null;
}

const sameScope = (a: Scope, b: Scope) => canon(a) === canon(b);
const isInterval = (e: VsaEvent) => e.payload.count_kind === 'interval' && e.payload.period_start !== null && e.payload.period_end !== null;

export function activeEvents(log: EventLog): VsaEvent[] {
  return log.events.filter((e) => !log.supersededBy[e.event_id]);
}

// Oldest → newest values for the chain ending at eventId.
export function historyOf(log: EventLog, eventId: string): VsaEvent[] {
  const byId = new Map(log.events.map((e) => [e.event_id, e]));
  const chain: VsaEvent[] = [];
  for (let e = byId.get(eventId); e; e = e.supersedes_event_id ? byId.get(e.supersedes_event_id) : undefined) chain.unshift(e);
  return chain;
}

export function appendEvent(log: EventLog, e: VsaEvent): { log: EventLog; change: Change | null; duplicate: boolean } | Reject {
  if (e?.operation_id !== log.operationId) return reject(`Event ${e?.event_id} belongs to operation ${e?.operation_id}, not ${log.operationId}. Not applied.`);
  const bad = checkEnvelope(e);
  if (bad) return reject(bad);

  const same = log.events.find((x) => x.idempotency_key === e.idempotency_key || x.event_id === e.event_id);
  if (same) {
    if (canon(same) === canon(e)) return { log, change: null, duplicate: true }; // re-delivery: no-op
    return reject(`${e.idempotency_key} was already used with different content. Not applied.`);
  }
  const last = log.events.at(-1);
  if (last && e.sequence <= last.sequence) return reject(`Event ${e.event_id}: sequence ${e.sequence} is not after ${last.sequence}.`);

  let change: Change | null = null;
  const supersededBy = { ...log.supersededBy };
  if (e.supersedes_event_id) {
    const target = log.events.find((x) => x.event_id === e.supersedes_event_id);
    if (!target) return reject(`Correction ${e.event_id}: ${e.supersedes_event_id} is not in this operation's log.`);
    const by = log.supersededBy[target.event_id];
    if (by) return reject(`Correction ${e.event_id}: ${target.event_id} was already replaced by ${by}; correct ${by} instead.`);
    const tp = target.payload, p = e.payload;
    if (!sameScope(target.scope, e.scope) || tp.metric !== p.metric || tp.count_kind !== p.count_kind || tp.period_start !== p.period_start || tp.period_end !== p.period_end) {
      return reject(`Correction ${e.event_id} must keep the same scope, metric and period as ${target.event_id}. Changing those needs a reviewed remapping.`);
    }
    if (!p.reason || !p.reason.trim()) return reject(`Correction ${e.event_id} needs a reason.`);
    supersededBy[target.event_id] = e.event_id;
    change = { target: target.event_id, from: tp.value, to: p.value, net: typeof tp.value === 'number' && typeof p.value === 'number' ? p.value - tp.value : null };
  }

  if (isInterval(e)) {
    const s = Date.parse(e.payload.period_start!), t = Date.parse(e.payload.period_end!);
    const clash = log.events.find((x) => !supersededBy[x.event_id] && x.event_id !== e.supersedes_event_id && isInterval(x)
      && x.payload.metric === e.payload.metric && sameScope(x.scope, e.scope)
      && Date.parse(x.payload.period_start!) < t && s < Date.parse(x.payload.period_end!));
    if (clash) return reject(`Event ${e.event_id}: ${e.payload.metric} ${e.payload.period_start}–${e.payload.period_end} overlaps ${clash.event_id}. Correct ${clash.event_id} instead.`);
  }

  return { log: { operationId: log.operationId, events: [...log.events, e], supersededBy }, change, duplicate: false };
}

// Rebuild the log from events in sequence order. Stops at the first rejection.
export function replay(events: VsaEvent[], operationId: string): EventLog | (Reject & { event_id?: string }) {
  let log = emptyLog(operationId);
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const r = appendEvent(log, e);
    if ('error' in r) return { ...r, event_id: e?.event_id };
    log = r.log;
  }
  return log;
}
