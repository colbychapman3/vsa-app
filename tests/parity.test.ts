// Full parity: scripted Glovis Condor 101 shifts (tests/scenarios.ts) through the
// tracker's compute() and the engine's project(). TEST data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project } from '../src/engine/index.ts';
import { loadTracker } from './tracker.ts';
import { glovis, OP, plain, toEvents, SCENARIOS, type Scenario } from './scenarios.ts';

function tracker(s: Scenario) {
  const t = loadTracker();
  t.S.baseline = glovis;
  t.S.decks = plain(s.decks ?? {});
  t.S.hourly = Object.fromEntries((s.hourly ?? []).map((h) => [`d${h.day}p${h.start.replace(':', '')}`, plain(h)]));
  t.S.ops = plain(s.ops ?? {});
  t.S.plan = plain(s.plan ?? {});
  return plain(t.compute());
}

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
