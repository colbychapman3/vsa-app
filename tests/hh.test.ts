// Phase 7g: H/H start / complete markers, repeatable passes, and the car hours grouped by whether H/H was on
// (spec docs/specs/phase-7g-hh-timeline.md; Colby, 2026-10-05). H/H is awareness only: markers never touch an auto count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type VsaEvent, type Reject } from '../src/engine/index.ts';
import { buildPasses, type HhMarker } from '../src/engine/hh.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { answer, routeQuestion } from '../src/app/assistant.ts';
import { buildReport } from '../src/app/report.ts';
import { hourlyView, planView } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-HH';

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-hh-'));
  const db = openNodeDb(join(dir, 'vsa.db'));
  const store = await openStore(db);
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: { ...glovis, start: '08:00' }, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const save = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(OP, evs);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  const refused = async (evs: VsaEvent[] | Reject) => {
    if (!Array.isArray(evs)) return evs.error;
    const r = await store.append(OP, evs);
    assert.ok(!r.ok, 'expected a refusal');
    return r.ok ? '' : r.error;
  };
  const hours = async (rows: [string, number, number, number?][]) => {
    for (const [start, count, drivers, stop] of rows) await save(E.hourEvents(ctx(), { day: 1, start, count, drivers, ...(stop ? { stopMin: stop } : {}) }));
  };
  return { ctx, save, refused, hours, get state() { return state; } };
}
const T = (hm: string, day = 1) => ({ day, hm });
const DAY_HOURS: [string, number, number, number?][] = [['08:00', 100, 60], ['09:00', 110, 60], ['10:00', 120, 70], ['11:00', 90, 70, 45]];

test('a pass: start 08:30, complete 10:00. 09:00 is inside it, 10:00 and 11:00 are clear, 08:00 holds the start', async (tc) => {
  const s = await setup(tc);
  await s.hours(DAY_HOURS);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('08:30')));
  await s.save(E.hhMarkerEvents(s.ctx(), 'completed', T('10:00')));
  const hh = s.state.hh;
  assert.equal(hh.passes.length, 1);
  assert.equal(hh.status, 'complete');
  assert.equal(hh.text, 'H/H complete 10:00');
  const a = hh.analysis!;
  assert.deepEqual([a.active.hours, a.clear.hours, a.transition, a.before], [['09:00'], ['10:00', '11:00'], ['08:00'], []]);
  assert.deepEqual([a.active.ha, a.clear.ha], [110, 105]);
  assert.equal(a.active.pace, 110);
  assert.equal(a.clear.pace, 120); // 210 autos in 1.75 productive hours: the short 11:00 hour counts its 45 minutes
  assert.deepEqual([a.active.drivers, a.clear.drivers], [60, 70]);
  assert.equal(a.lines[0], 'H.A. 110 with H/H active (1 h) and 105 after it cleared (2 h). Pace 110/hr and 120/hr.');
  assert.match(a.lines[1], /Drivers on cars averaged 60 and 70/);
  assert.ok(a.lines.some((l) => l.startsWith('Observed, not proven')));
  assert.ok(a.lines.every((l) => !/because/i.test(l))); // describes, never states a cause
  assert.ok(a.lines.includes('Hours holding an H/H start or end, counted in neither: 08:00.'));
});

test('every hour counts: a group with one hour is shown, an empty group says none yet and gives no comparison', async (tc) => {
  const s = await setup(tc);
  await s.hours([['08:00', 100, 60], ['09:00', 110, 60]]);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('08:00')));
  await s.save(E.hhMarkerEvents(s.ctx(), 'completed', T('09:00')));
  const a = s.state.hh.analysis!;
  assert.deepEqual([a.active.n, a.clear.n], [1, 1]); // one hour each: compared, denominators shown
  assert.match(a.lines[0], /H\.A\. 100 with H\/H active \(1 h\) and 110 after it cleared \(1 h\)/);

  const t = await setup(tc);
  await t.hours([['08:00', 100, 60], ['09:00', 110, 60]]);
  await t.save(E.hhMarkerEvents(t.ctx(), 'started', T('08:00')));
  const b = t.state.hh.analysis!;
  assert.equal(b.clear.n, 0);
  assert.ok(b.lines.some((l) => l.includes('After H/H cleared: none yet.')));
  assert.ok(!b.lines.some((l) => l.includes('Observed, not proven'))); // no comparison with an empty side
});

test('H/H is awareness only: markers change no auto count, balance or pace', async (tc) => {
  const s = await setup(tc);
  await s.hours(DAY_HOURS);
  const before = { field: s.state.field, rem: s.state.vesselRemaining, bal: s.state.fieldBalance, prod: s.state.production, ha: s.state.production.ha };
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('08:30')));
  await s.save(E.hhMarkerEvents(s.ctx(), 'completed', T('10:00')));
  assert.deepEqual({ field: s.state.field, rem: s.state.vesselRemaining, bal: s.state.fieldBalance, prod: s.state.production, ha: s.state.production.ha }, before);
});

test('a log with no markers: no passes, status not started, no analysis', async (tc) => {
  const s = await setup(tc);
  await s.hours(DAY_HOURS);
  assert.deepEqual([s.state.hh.passes.length, s.state.hh.status, s.state.hh.analysis], [0, 'notStarted', null]);
});

test('order is checked, with the exact message', async (tc) => {
  const s = await setup(tc);
  assert.match(await s.refused(E.hhMarkerEvents(s.ctx(), 'completed', T('10:00'))), /H\/H complete at 10:00 has no start before it\. Log the start first/);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('08:30')));
  assert.match(await s.refused(E.hhMarkerEvents(s.ctx(), 'started', T('09:00'))), /H\/H is already started since 08:30\. Mark it complete first, or correct that start\./);
  assert.match(await s.refused(E.hhMarkerEvents(s.ctx(), 'completed', T('08:30'))), /H\/H complete \(08:30\) must be after its start \(08:30\)/);
  assert.match(await s.refused(E.hhMarkerEvents(s.ctx(), 'completed', T('08:10'))), /must be after its start \(08:30\)/);
  assert.match(await s.refused(E.hhMarkerEvents(s.ctx(), 'started', { day: 1, hm: '25:99' })), /isn’t valid/);
  assert.equal(s.state.hh.passes.length, 1); // nothing refused was saved
});

test('multiple passes: complete, start again, active again; a still-open pass is active', async (tc) => {
  const s = await setup(tc);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('08:30')));
  await s.save(E.hhMarkerEvents(s.ctx(), 'completed', T('10:00')));
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('13:00')));
  assert.equal(s.state.hh.passes.length, 2);
  assert.equal(s.state.hh.status, 'active');
  assert.equal(s.state.hh.text, 'H/H active again since 13:00');
  await s.save(E.hhMarkerEvents(s.ctx(), 'completed', T('14:30')));
  assert.deepEqual(s.state.hh.passes.map((p) => [p.start.label, p.end?.label]), [['08:30', '10:00'], ['13:00', '14:30']]);
  assert.equal(s.state.hh.text, 'H/H complete 14:30');
});

test('no closing time: the pass ends with the shift and says so; a real complete replaces that', async (tc) => {
  const s = await setup(tc);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('13:00')));
  assert.equal(s.state.hh.status, 'active'); // shift end not logged yet: still active
  await s.save(E.endShiftEvents(s.ctx(), T('17:00'), 'N'));
  const p = s.state.hh.passes[0];
  assert.deepEqual([p.end, p.endAbs, p.endedWithShift], [null, 17 * 60, true]);
  assert.equal(s.state.hh.status, 'endedWithShift');
  assert.match(s.state.hh.text, /ended with the shift \(started 13:00; no closing time entered\)/);
  await s.save(E.hhMarkerEvents(s.ctx(), 'completed', T('16:00')));
  const q = s.state.hh.passes[0];
  assert.deepEqual([q.end?.label, q.endAbs, q.endedWithShift], ['16:00', 16 * 60, false]);
});

test('a pass the shift closed does not block the next day: a start after the shift end is a new pass', async (tc) => {
  const s = await setup(tc);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('15:00')));
  await s.save(E.endShiftEvents(s.ctx(), T('17:00'), 'N'));
  await s.save(E.nextDayEvents(s.ctx(), T('07:30', 2)));
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('08:00', 2)));
  assert.deepEqual(s.state.hh.passes.map((p) => [p.endedWithShift, p.endAbs]), [[true, 17 * 60], [false, null]]);
  assert.equal(s.state.hh.status, 'active');
  assert.match(s.state.hh.text, /H\/H active again since Day 2 08:00/);
});

test('hours after a shift-end-closed pass are clear; a pass open with no shift end leaves later hours transition', async (tc) => {
  const s = await setup(tc);
  await s.hours(DAY_HOURS);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('09:00')));
  const open = s.state.hh.analysis!;
  assert.deepEqual([open.active.hours, open.transition, open.before], [['09:00', '10:00', '11:00'], [], ['08:00']]); // still active: no end yet
  assert.equal(open.clear.n, 0);
});

test('a time not entered is saved as the phone processing time, labeled', async (tc) => {
  const s = await setup(tc);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', null));
  const m = s.state.hh.passes[0].start;
  assert.equal(m.processing, true);
  assert.equal(m.label, '20:00 (processing time)');
  assert.equal(m.abs, 20 * 60);
});

test('corrections: a changed time supersedes and keeps history, needs a reason; removal is a marked void; a start can not be removed under its complete', async (tc) => {
  const s = await setup(tc);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('08:30')));
  await s.save(E.hhMarkerEvents(s.ctx(), 'completed', T('10:00')));
  const endId = s.state.hh.passes[0].end!.id, startId = s.state.hh.passes[0].start.id;
  assert.match(String(E.editHhMarkerEvents(s.ctx(), endId, T('10:15'), null) && (E.editHhMarkerEvents(s.ctx(), endId, T('10:15'), null) as Reject).error), /Pick a reason for changing this H\/H time/);
  await s.save(E.editHhMarkerEvents(s.ctx(), endId, T('10:15'), 'Wrong time'));
  assert.equal(s.state.hh.passes[0].end!.label, '10:15');
  assert.equal(s.state.hh.passes.length, 1); // replaced, not added
  assert.ok(s.state.log.events.some((e) => e.payload.metric === 'hh_phase' && e.occurred_at?.includes('T10:00') && !e.supersedes_event_id)); // the old time is still in the log
  // the start can't be removed while its complete stands
  assert.match(await s.refused(E.removeHhMarkerEvents(s.ctx(), startId, 'Logged by mistake')), /has no start before it/);
  // remove the complete first (with a reason), then the start
  assert.match((E.removeHhMarkerEvents(s.ctx(), s.state.hh.passes[0].end!.id, null) as Reject).error, /Pick a reason for removing this H\/H marker/);
  await s.save(E.removeHhMarkerEvents(s.ctx(), s.state.hh.passes[0].end!.id, 'Logged by mistake'));
  assert.equal(s.state.hh.passes[0].end, null);
  await s.save(E.removeHhMarkerEvents(s.ctx(), s.state.hh.passes[0].start.id, 'Logged by mistake'));
  assert.deepEqual([s.state.hh.passes.length, s.state.hh.status], [0, 'notStarted']);
  // a correction can't turn a start into a complete
  const t = await setup(tc);
  await t.save(E.hhMarkerEvents(t.ctx(), 'started', T('08:30')));
  const ev = E.editHhMarkerEvents(t.ctx(), t.state.hh.passes[0].start.id, T('08:40'), 'Wrong time') as VsaEvent[];
  ev[0].payload.value = 'completed';
  assert.match(await t.refused(ev), /not which one it is/);
});

test('screens: hourly tags, Plan card, completion report block and Ask all say the same thing, with no cause', async (tc) => {
  const s = await setup(tc);
  await s.hours(DAY_HOURS);
  const none = hourlyView(s.state).rows.every((r) => r.hhTags.length === 0);
  assert.ok(none);
  assert.deepEqual(buildReport('completion', s.state, glovis, { isTest: true, generatedAt: '12:05' }).sections.find((x) => x.title === 'H/H timeline')!.lines, ['No H/H start or complete was logged.']);
  await s.save(E.hhMarkerEvents(s.ctx(), 'started', T('08:30')));
  await s.save(E.hhMarkerEvents(s.ctx(), 'completed', T('10:00')));
  const rows = hourlyView(s.state).rows;
  assert.deepEqual(rows.map((r) => r.hhTags), [['H/H started 08:30'], [], ['H/H complete 10:00'], []]);
  const plan = planView(s.state, { ...glovis, start: '08:00' }).hh;
  assert.equal(plan.text, 'H/H complete 10:00');
  assert.deepEqual(plan.passes, ['Pass 1: started 08:30; complete 10:00']);
  const rep = buildReport('completion', s.state, glovis, { isTest: true, generatedAt: '12:05' });
  const sec = rep.sections.find((x) => x.title === 'H/H timeline')!;
  assert.ok(sec.lines!.includes('Pass 1: started 08:30; complete 10:00'));
  assert.ok(sec.lines!.some((l) => l.startsWith('Observed, not proven')));
  assert.equal(rep.sections.filter((x) => /^\d+\. /.test(x.title)).length, 15); // protocol 9.3's fifteen sections are untouched
  const ask = answer(routeQuestion('When did H/H finish?', s.state), s.state, glovis, 0, { chunks: [] } as never);
  assert.equal(routeQuestion('When did H/H finish?', s.state).k, 'hh');
  assert.equal(routeQuestion('Is heavy done yet', s.state).k, 'hh');
  assert.equal(routeQuestion('How are heavy units handled at the terminal', s.state).k, 'knowledge'); // a procedure question stays a document search
  assert.equal(ask.lines[0], 'H/H complete 10:00');
  assert.ok(ask.lines.every((l) => !/because/i.test(l)));
  const none2 = await setup(tc);
  assert.deepEqual(answer({ k: 'hh' }, none2.state, glovis, 0, { chunks: [] } as never).lines, ['No H/H start or complete has been logged.']);
});

test('buildPasses: orders by time, not by when each was saved', () => {
  const m = (id: string, kind: 'started' | 'completed', abs: number): HhMarker => ({ id, kind, abs, label: `${abs}`, processing: false });
  const r = buildPasses([m('c', 'completed', 600), m('s', 'started', 510)], []);
  assert.ok('passes' in r && r.passes.length === 1 && r.passes[0].end?.id === 'c');
  const bad = buildPasses([m('a', 'started', 100), m('b', 'started', 200)], []);
  assert.ok('error' in bad && bad.id === 'b');
});
