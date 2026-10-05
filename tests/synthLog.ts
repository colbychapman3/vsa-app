// A synthetic but valid vessel log of any length, for the replay equivalence and scaling tests.
// Two days of hourly counts (total plus two brands), then notes that are added, edited and removed,
// so replay exercises correction chains (historyOf) as well as plain appends. TEST data only.
import type { VsaEvent } from '../src/engine/index.ts';

export const SYNTH_OP = 'TEST-SYNTH';
// Never 11:00 or 17:00: those hours are the short pre-break hours and need a recorded stop time.
const HOURS = [8, 9, 10, 13, 14, 15, 16];

const p2 = (n: number) => String(n).padStart(2, '0');
const base = (op: string, n: number) => ({
  schema_version: '1.0', event_id: `${op}-${n}`, operation_id: op, sequence: n, idempotency_key: `${op}-${n}`,
  occurred_at: null, recorded_at: '2026-09-21T20:00:00-04:00', actor: 'synth_fixture', source_ids: ['TEST'], provenance: 'user_report',
});
const notePayload = (value: string | null, reason: string | null) => ({
  metric: 'plan_note', value, unit: null, count_kind: 'not_applicable', period_start: null, period_end: null, reason, input_event_ids: [], title: null, source: 'typed', photo: null,
});
const NOTE_SCOPE = { workstream: 'operation', deck: null, hatch: null, commodity: null, destination: null };

export function synthLog(count: number, op = SYNTH_OP): VsaEvent[] {
  const out: VsaEvent[] = [];
  const push = (e: object) => { out.push(e as VsaEvent); };
  const hourly = (n: number, day: number, h: number, commodity: string | null) => {
    const date = `2026-09-${p2(20 + day)}`;
    push({
      ...base(op, n), event_type: 'observation', supersedes_event_id: null,
      scope: { workstream: 'auto_discharge', deck: null, hatch: null, commodity, destination: null },
      payload: { metric: 'field_units', value: commodity ? 10 : 20, unit: null, count_kind: 'interval', period_start: `${date}T${p2(h)}:00:00-04:00`, period_end: `${date}T${p2(h + 1)}:00:00-04:00`, reason: null, input_event_ids: [] },
    });
  };
  for (let day = 1; day <= 2; day++) for (const h of HOURS) for (const c of [null, 'Hyundai', 'Kia']) if (out.length < count) hourly(out.length + 1, day, h, c);

  const heads: string[] = []; // current head event id of each live note
  for (let k = 0; out.length < count; k++) {
    const n = out.length + 1;
    const id = `${op}-${n}`;
    const target = heads.length > 2 ? heads.shift()! : null;
    if (k % 5 === 4 && target) {
      push({ ...base(op, n), event_type: 'note.removed', supersedes_event_id: target, scope: NOTE_SCOPE, payload: notePayload(null, 'Added by mistake') });
    } else if ((k % 5 === 2 || k % 5 === 3) && target) {
      push({ ...base(op, n), event_type: 'note.corrected', supersedes_event_id: target, scope: NOTE_SCOPE, payload: notePayload(`edit ${n}`, 'Typo') });
      heads.push(id);
    } else {
      if (target) heads.unshift(target);
      push({ ...base(op, n), event_type: 'note.added', supersedes_event_id: null, scope: NOTE_SCOPE, payload: notePayload(`note ${n}`, null) });
      heads.push(id);
    }
  }
  return out;
}
