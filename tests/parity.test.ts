// Full parity: scripted Glovis Condor 101 shifts through the tracker's compute()
// and the engine's project(). Each scenario is written once in the tracker's own
// shape; toEvents() turns it into kit-06 events for the engine. TEST data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project, type VsaEvent, type HourEntry, type DeckState } from '../src/engine/index.ts';
import { loadTracker } from './tracker.ts';

const glovis = JSON.parse(readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8'));
const OP = 'TEST-GLOVIS-PARITY';
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

type Scenario = {
  name: string;
  decks?: Record<string, DeckState>;
  hourly?: HourEntry[];
  ops?: { day: number; onBreak?: boolean; breakStart?: string; shiftEnded?: boolean; shiftEnd?: string };
  plan?: { shiftEnd?: string; nextStart?: string };
  expect?: (s: any) => void;
};

function iso(day: number, hm: string): string {
  const d = new Date(Date.UTC(2026, 8, 21 + day - 1));
  return `${d.toISOString().slice(0, 10)}T${hm}:00-04:00`;
}
function addHour(hm: string): string {
  const m = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) + 60;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function toEvents(s: Scenario): VsaEvent[] {
  const out: VsaEvent[] = [];
  const ev = (type: VsaEvent['event_type'], metric: string, value: VsaEvent['payload']['value'], kind: VsaEvent['payload']['count_kind'],
    o: { deck?: string; hatch?: string; commodity?: string; at?: string | null; period?: [string, string] } = {}) => {
    const n = out.length + 1;
    out.push({
      schema_version: '1.0', event_id: `P${n}`, operation_id: OP, sequence: n, idempotency_key: `P${n}`, event_type: type,
      scope: { workstream: ['break', 'shift', 'plan_shift_end', 'plan_next_start'].includes(metric) ? 'operation' : 'auto_discharge', deck: o.deck ?? null, hatch: o.hatch ?? null, commodity: o.commodity ?? null, destination: null },
      occurred_at: o.at ?? null, recorded_at: '2026-09-21T20:00:00-04:00', actor: 'parity_fixture', source_ids: ['TEST'], provenance: 'user_report',
      supersedes_event_id: null,
      payload: { metric, value, unit: null, count_kind: kind, period_start: o.period?.[0] ?? null, period_end: o.period?.[1] ?? null, reason: null, input_event_ids: [] },
    });
  };
  if (s.plan?.shiftEnd) ev('observation', 'plan_shift_end', s.plan.shiftEnd, 'not_applicable');
  if (s.plan?.nextStart) ev('observation', 'plan_next_start', s.plan.nextStart, 'not_applicable');
  for (const [deck, st] of Object.entries(s.decks ?? {})) {
    ev('status_change', 'deck_status', st.status, 'not_applicable', { deck });
    if (st.skipped) ev('status_change', 'deck_skipped', true, 'not_applicable', { deck });
    for (const [hatch, v] of Object.entries(st.hatchRemaining ?? {})) ev('observation', 'vessel_remaining', v, 'remaining', { deck, hatch });
    if (st.deckRemaining != null) ev('observation', 'vessel_remaining', st.deckRemaining, 'remaining', { deck });
  }
  for (const h of s.hourly ?? []) {
    const period: [string, string] = [iso(h.day, h.start), iso(h.day, addHour(h.start))];
    ev('observation', 'field_units', h.count, 'interval', { period });
    for (const [b, v] of Object.entries(h.brands ?? {})) ev('observation', 'field_units', v, 'interval', { commodity: b, period });
    if (h.drivers != null) ev('observation', 'drivers', h.drivers, 'not_applicable', { period });
    if (h.stopMin != null) ev('observation', 'productive_minutes', h.stopMin, 'not_applicable', { period });
  }
  if (s.ops?.onBreak) ev('pause', 'break', null, 'not_applicable', { at: iso(s.ops.day, s.ops.breakStart!) });
  if (s.ops?.shiftEnded) ev('status_change', 'shift', 'ended', 'not_applicable', { at: iso(s.ops.day, s.ops.shiftEnd!) });
  return out;
}

function tracker(s: Scenario) {
  const t = loadTracker();
  t.S.baseline = glovis;
  t.S.decks = plain(s.decks ?? {});
  t.S.hourly = Object.fromEntries((s.hourly ?? []).map((h) => [`d${h.day}p${h.start.replace(':', '')}`, plain(h)]));
  t.S.ops = plain(s.ops ?? {});
  t.S.plan = plain(s.plan ?? {});
  return plain(t.compute());
}

// Hours whose brand splits match the lunch deck state below exactly (Hyundai 579, Kia 351).
const MORNING: HourEntry[] = [
  { day: 1, start: '08:00', count: 253, brands: { Hyundai: 180, Kia: 73 }, drivers: 70 },
  { day: 1, start: '09:00', count: 266, brands: { Hyundai: 170, Kia: 96 }, drivers: 70 },
  { day: 1, start: '10:00', count: 225, brands: { Hyundai: 130, Kia: 95 }, drivers: 68 },
  { day: 1, start: '11:00', count: 186, brands: { Hyundai: 99, Kia: 87 }, drivers: 68, stopMin: 45 },
];
const LUNCH_DECKS: Record<string, DeckState> = {
  UPP: { status: 'complete' }, D12: { status: 'complete' }, D8: { status: 'complete' }, D6: { status: 'complete' }, D5: { status: 'complete' },
  D4: { status: 'paused', hatchRemaining: { H3: 116, H2: 105, H1: 7 } },
};
const DEMO_DECKS: Record<string, DeckState> = {
  UPP: { status: 'complete' }, D12: { status: 'complete' }, D8: { status: 'complete' }, D6: { status: 'complete' },
  D5: { status: 'complete' }, D4: { status: 'complete' }, D2: { status: 'complete' },
  D1: { status: 'active', hatchRemaining: { H3: 0, H2: 30 } },
  D9: { status: 'active', hatchRemaining: { H4: 24, H3: 123, H2: 103, H1: 69 } },
  D7: { status: 'notStarted', skipped: true },
};
const AFTERNOON: HourEntry[] = [
  { day: 1, start: '13:00', count: 248, drivers: 68 },
  { day: 1, start: '14:00', count: 241, drivers: 70 },
];

const SCENARIOS: Scenario[] = [
  { name: 'start of shift', expect: (s) => { assert.equal(s.vesselRemaining, 1969); assert.equal(s.eta.reason, 'Needs production data'); } },
  { name: 'mixed deck progress, working', decks: DEMO_DECKS, hourly: [...MORNING, ...AFTERNOON] },
  { name: 'Active deck with no count', decks: { ...DEMO_DECKS, D9: { status: 'active' } }, hourly: [...MORNING, ...AFTERNOON],
    expect: (s) => { assert.equal(s.vesselRemaining, null); assert.equal(s.eta.basisNote !== null, true); } },
  { name: 'short hour stopped at :30', decks: LUNCH_DECKS, hourly: [...MORNING.slice(0, 3), { ...MORNING[3], stopMin: 30 }] },
  { name: 'lunch: ship = field (green)', decks: LUNCH_DECKS, hourly: MORNING, ops: { day: 1, onBreak: true, breakStart: '12:00' },
    expect: (s) => { assert.equal(s.reconciliation.status, 'match'); assert.equal(s.reconciliation.countsMatch, true); } },
  { name: 'lunch: ship ahead (warning)', decks: LUNCH_DECKS, hourly: [...MORNING.slice(0, 3), { ...MORNING[3], count: 176, brands: { Hyundai: 89, Kia: 87 } }], ops: { day: 1, onBreak: true, breakStart: '12:00' },
    expect: (s) => { assert.equal(s.reconciliation.status, 'warning'); assert.equal(s.variance, 10); } },
  { name: 'end of shift: field ahead (alarm)', decks: { ...LUNCH_DECKS, D4: { status: 'paused', hatchRemaining: { H3: 118, H2: 105, H1: 7 } } }, hourly: MORNING,
    plan: { shiftEnd: '17:00', nextStart: '08:00' }, ops: { day: 1, shiftEnded: true, shiftEnd: '17:00' },
    expect: (s) => { assert.equal(s.reconciliation.status, 'alarm'); assert.equal(s.variance, -2); } },
  { name: 'Day 2 ETA after shift end', decks: DEMO_DECKS, hourly: [...MORNING, ...AFTERNOON],
    plan: { shiftEnd: '15:00', nextStart: '07:00' }, ops: { day: 1, shiftEnded: true, shiftEnd: '15:00' },
    expect: (s) => { assert.equal(s.eta.eta.day, 2); assert.equal(s.eta.label, 'FORECAST'); } },
  { name: 'Day 2 production', decks: DEMO_DECKS, hourly: [...MORNING, ...AFTERNOON, { day: 2, start: '07:00', count: 120, drivers: 50 }],
    plan: { shiftEnd: '15:00', nextStart: '07:00' },
    expect: (s) => { assert.equal(s.periods.at(-1).day, 2); } },
];

for (const sc of SCENARIOS) {
  test(`parity: ${sc.name}`, () => {
    const want = tracker(sc);
    const got = project(glovis, toEvents(sc), OP);
    assert.ok(got.ok, JSON.stringify(got));
    if (!got.ok) return;
    assert.equal(got.start, want.start, 'start');
    assert.equal(got.vesselRemaining, want.vRem, 'vessel remaining');
    assert.equal(got.progress, want.progress, 'progress');
    assert.deepEqual(got.missingDecks, want.missing, 'missing decks');
    assert.equal(got.field, want.field, 'field');
    assert.equal(got.fieldBalance, want.fieldBal, 'field balance');
    assert.equal(got.variance, want.transit, 'ship − field');
    assert.equal(got.production.ha, want.ha, 'H.A.');
    assert.equal(got.production.pace, want.pace, 'pace');
    assert.equal(got.production.prodMin, want.prodMin, 'productive minutes');
    assert.deepEqual(got.drivers, want.drivers, 'drivers');
    assert.equal(got.ops.phase !== 'working', want.recon, 'reconciliation phase');
    const cols = (p: any) => [p.day, p.start, p.count, p.short, p.min, p.pace, p.delta, p.deltaPct];
    assert.deepEqual(got.periods.map(cols), want.periods.map(cols), 'periods');
    assert.deepEqual(got.brands.map((b) => [b.name, b.start, b.remaining, b.field, b.cleared, b.variance == null ? null : 0 - b.variance]),
      want.brands.map((b: any) => [b.name, b.start, b.rem, b.field, b.cleared, b.diff]), 'brands');
    assert.deepEqual(got.decks.map((d) => [d.id, d.status, d.rem, d.height.level]), want.decks.map((d: any) => [d.id, d.status, d.rem, d.hi.level]), 'decks');
    assert.equal(got.eta.etaAbs, want.eta.eta, 'ETA');
    assert.equal(got.eta.rate, want.eta.rate, 'ETA rate');
    assert.equal(got.eta.fromAbs, want.eta.from, 'ETA from');
    sc.expect?.(got);
  });
}

test('project rejects what the tracker would refuse to save', () => {
  const over = toEvents({ name: 'x', hourly: [{ day: 1, start: '08:00', count: 1970 }] });
  assert.deepEqual(project(glovis, over, OP), { ok: false, error: 'This makes the field total 1,970, which exceeds starting cargo (1,969) by 1. Check the count.' });
  const noStop = toEvents({ name: 'x', hourly: [{ day: 1, start: '11:00', count: 100 }] });
  assert.deepEqual(project(glovis, noStop, OP), { ok: false, error: 'Hour 11:00: Pick when production stopped before the 12:00 break.' });
  const hatch = toEvents({ name: 'x', decks: { UPP: { status: 'active', hatchRemaining: { H3: 110 } } } });
  assert.deepEqual(project(glovis, hatch, OP), { ok: false, error: 'H3 exceeds its 106 autos by 4. Check the count.', event_id: 'P2' });
  const completeCount = toEvents({ name: 'x', decks: { UPP: { status: 'complete', hatchRemaining: { H3: 5 } } } });
  assert.match((project(glovis, completeCount, OP) as { error: string }).error, /Upper is Complete; set it Active or Paused/);
});

test('project: a correction replaces an hour and keeps its history (T5 in the app flow)', () => {
  const evs = toEvents({ name: 'x', hourly: [{ day: 1, start: '08:00', count: 250 }] });
  evs.push({ ...plain(evs[0]), event_id: 'C1', idempotency_key: 'C1', sequence: 99, event_type: 'correction', supersedes_event_id: 'P1',
    payload: { ...evs[0].payload, value: 275, reason: 'Checker recount' } });
  const s = project(glovis, evs, OP);
  assert.ok(s.ok);
  if (!s.ok) return;
  assert.equal(s.field, 275);
  assert.deepEqual(s.corrections, [{ event_id: 'C1', metric: 'field_units', history: [250, 275], reason: 'Checker recount' }]);
});

test('project: other workstreams (H&H, load-back, lashing) are refused, never mixed into autos', () => {
  const evs = toEvents({ name: 'x', hourly: [{ day: 1, start: '08:00', count: 10 }] });
  evs[0].scope.workstream = 'hh_discharge';
  assert.match((project(glovis, evs, OP) as { error: string }).error, /hh_discharge is not tracked by this engine \(autos only\)/);
});

test('project: kit multi-hour interval is refused with a clear reason (events-level replay covers it)', () => {
  const kit = readFileSync(new URL('./fixtures/events.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const b = { ...glovis, date: '2026-09-23' };
  assert.match((project(b, kit, 'TEST-CORRECTION') as { error: string }).error, /field counts are hourly/);
});
