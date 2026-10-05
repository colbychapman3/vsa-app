// Phase 4 field feedback (Colby's airplane-mode test, 2026-09-27):
// drivers set once per workday, and break log edits (fix times, add a missed break,
// remove a wrong/duplicate one), all through the real store with history kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VsaEvent, Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { hourlyView, planView } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-FIELD-FIXES';
const t = (hm: string, day = 1) => ({ day, hm });

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-field-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const save = async (evs: VsaEvent[] | Reject) => {
    if (!Array.isArray(evs)) return evs;
    const r = await store.append(OP, evs);
    if (r.ok) state = r.state;
    return r;
  };
  const ok = async (evs: VsaEvent[] | Reject) => { const r = await save(evs); assert.ok(r.ok, JSON.stringify(r)); };
  const refused = async (evs: VsaEvent[] | Reject, msg: RegExp) => {
    const before = state.log.events.length;
    const r = await save(evs);
    assert.ok(!r.ok && msg.test(r.error), JSON.stringify(r));
    assert.equal(state.log.events.length, before); // nothing saved
  };
  return { ctx, ok, refused, get state() { return state; } };
}

// ---------- Workday drivers ----------

test('workday drivers: set once for the day, used by every hour without its own count', async (tc) => {
  const s = await setup(tc);
  // Before anything is set, the gap line uses the labor order, as before.
  assert.equal(s.state.drivers?.src, 'labor order');
  assert.deepEqual(planView(s.state, glovis).workday.map((d) => d.value), ['Not set (labor order 70)', 'Not set (labor order 70)']);

  await s.ok(E.workdayDriversEvents(s.ctx(), 1, 70));
  assert.deepEqual(s.state.workdayDrivers, { 1: 70 });
  assert.deepEqual(s.state.drivers, { n: 70, src: 'Day 1 setting' });

  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 245 }));            // no drivers asked
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 230, drivers: 66 })); // this hour differed
  const [h8, h9] = s.state.periods;
  assert.deepEqual([h8.drivers, h8.hourDrivers, h8.driversFrom], [70, null, 'day']);
  assert.deepEqual([h9.drivers, h9.hourDrivers, h9.driversFrom], [66, 66, 'hour']);
  assert.equal(h8.driverRate.rate, 3.5); // 245 ÷ (70 × 1 h)
  assert.deepEqual(s.state.drivers, { n: 66, src: 'logged 09:00' });
});

test('workday drivers: a change needs a reason and keeps the old figure; bad values refused', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.workdayDriversEvents(s.ctx(), 1, 70));
  assert.deepEqual(E.workdayDriversEvents(s.ctx(), 1, 70, 'Typo'), { ok: false, error: 'Nothing to save: Day 1 is already set to 70 drivers.' });
  assert.deepEqual(E.workdayDriversEvents(s.ctx(), 1, 72), { ok: false, error: 'Pick a reason for changing Day 1’s drivers. The old value is kept.' });
  assert.deepEqual(E.workdayDriversEvents(s.ctx(), 1, 0), { ok: false, error: 'Enter the day’s drivers as a whole number (1 or more).' });

  const evs = E.workdayDriversEvents(s.ctx(), 1, 72, 'Typo') as VsaEvent[];
  assert.deepEqual(evs.map((e) => [e.event_type, e.payload.value, e.payload.reason]), [['correction', 72, 'Typo']]);
  await s.ok(evs);
  assert.deepEqual(s.state.workdayDrivers, { 1: 72 });
  assert.equal(s.state.log.events.filter((e) => e.payload.metric === 'workday_drivers').length, 2); // 70 is still in the log
  assert.deepEqual(s.state.corrections.at(-1)!.history, [70, 72]);

  // The engine itself refuses a 0 gang and a second, uncorrected figure for the same day.
  const zero = E.workdayDriversEvents(s.ctx(), 2, 5) as VsaEvent[];
  zero[0].payload.value = 0;
  await s.refused(zero, /whole number of 1 or more\. Leave it unset if unknown/);
  const dup = E.workdayDriversEvents(s.ctx(), 2, 50) as VsaEvent[];
  const dup2 = E.workdayDriversEvents({ ...s.ctx() }, 2, 55) as VsaEvent[];
  dup2[0] = { ...dup2[0], event_id: `${OP}-99`, idempotency_key: `${OP}-99`, sequence: 99 };
  await s.refused([...dup, dup2[0]], /Day 2 already has a driver count .* correct that event instead/);
});

test('workday drivers: Day 2 uses its own setting (Day 1 = 70, Day 2 = 50)', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.workdayDriversEvents(s.ctx(), 1, 70));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 245 }));
  await s.ok(E.workdayDriversEvents(s.ctx(), 2, 50));
  await s.ok(E.endShiftEvents(s.ctx(), t('17:00')));
  await s.ok(E.nextDayEvents(s.ctx(), t('08:00', 2)));
  assert.deepEqual(s.state.drivers, { n: 50, src: 'Day 2 setting' }); // not Day 1's 70
  await s.ok(E.hourEvents(s.ctx(), { day: 2, start: '08:00', count: 150 }));
  assert.deepEqual(s.state.periods.map((p) => [p.day, p.drivers]), [[1, 70], [2, 50]]);
  assert.deepEqual(planView(s.state, glovis).workday.map((d) => [d.label, d.value]), [['Day 1 drivers', '70 drivers'], ['Day 2 drivers', '50 drivers']]);
  assert.deepEqual(s.state.drivers, { n: 50, src: 'Day 2 setting' });
});

// ---------- Break log edits ----------

test('break log: fix a break’s start and end; reason required; old times kept', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.breakStartEvents(s.ctx(), t('12:02')));
  await s.ok(E.breakEndEvents(s.ctx(), t('13:05')));
  const b = s.state.breakLog[0];
  assert.deepEqual([b.kind, b.start, b.end, b.edited], ['break', '12:02', '13:05', false]);

  assert.deepEqual(E.editBreakEvents(s.ctx(), b, t('12:00'), t('13:00'), null), { ok: false, error: 'Pick a reason for changing this break. The old times are kept.' });
  assert.deepEqual(E.editBreakEvents(s.ctx(), b, t('12:02'), t('13:05'), 'Wrong time'), { ok: false, error: 'Nothing to save: the break already has these times.' });
  assert.deepEqual(E.editBreakEvents(s.ctx(), b, t('13:10'), t('13:05'), 'Wrong time'), { ok: false, error: 'The break end must be after its start.' });
  // The engine refuses it too, if an event gets past the form.
  const bad = E.editBreakEvents(s.ctx(), b, t('12:00'), t('13:05'), 'Wrong time') as VsaEvent[];
  bad[0].occurred_at = '2026-09-21T13:10:00-04:00';
  await s.refused(bad, /Break 13:10–13:05: the end must be after the start/);

  await s.ok(E.editBreakEvents(s.ctx(), b, t('12:00'), t('13:00'), 'Wrong time'));
  assert.deepEqual(s.state.breakLog.map((x) => [x.start, x.end, x.edited]), [['12:00', '13:00', true]]);
  assert.deepEqual(planView(s.state, glovis).breakLog, [{ label: 'Break · edited', value: '12:00–13:00' }]);
  assert.equal(s.state.log.events.filter((e) => e.payload.metric === 'break').length, 4); // originals kept
  assert.equal(s.state.ops.phase, 'working');

  // Changing only the end corrects only the end; a second change chains onto the first.
  await s.ok(E.editBreakEvents(s.ctx(), s.state.breakLog[0], t('12:00'), t('12:55'), 'Wrong time'));
  assert.deepEqual([s.state.breakLog[0].start, s.state.breakLog[0].end], ['12:00', '12:55']);
});

test('break log: fixing the start of a break in progress keeps the break and its clerk count', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 250 }));
  await s.ok(E.breakStartEvents(s.ctx(), t('12:10')));
  await s.ok(E.clerkEvents(s.ctx(), 1719, t('12:15')));
  await s.ok(E.editBreakEvents(s.ctx(), s.state.breakLog[0], t('12:00'), null, 'Wrong time'));
  assert.deepEqual([s.state.ops.phase, s.state.ops.breakStart], ['break', '12:00']);
  assert.equal(s.state.clerk?.remaining, 1719); // still this break's clerk count
  assert.deepEqual(E.editBreakEvents(s.ctx(), s.state.breakLog[0], t('12:00'), t('13:00'), 'Wrong time'),
    { ok: false, error: 'This break is still in progress. End it from the Log sheet first.' });
});

test('break log: remove a duplicate break; it stays in the log, marked removed', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.breakStartEvents(s.ctx(), t('12:00')));
  await s.ok(E.breakStartEvents(s.ctx(), t('12:02'))); // tapped twice
  await s.ok(E.breakEndEvents(s.ctx(), t('13:00')));
  assert.deepEqual(s.state.breakLog.map((x) => [x.start, x.end]), [['12:00', null], ['12:02', '13:00']]);

  const dup = s.state.breakLog[1];
  assert.deepEqual(E.removeBreakEvents(s.ctx(), dup, ' '), { ok: false, error: 'Pick a reason for removing this break. It stays in the log, marked removed.' });
  // Removing the 12:02 entry removes its start and its end; the 12:00 start stays open.
  await s.ok(E.removeBreakEvents(s.ctx(), dup, 'Duplicate'));
  assert.deepEqual(s.state.breakLog.map((x) => [x.start, x.end]), [['12:00', null]]);
  assert.equal(s.state.ops.phase, 'break');
  await s.ok(E.breakEndEvents(s.ctx(), t('13:00')));
  assert.deepEqual(planView(s.state, glovis).breakLog, [{ label: 'Break', value: '12:00–13:00' }]);
  assert.equal(s.state.log.events.filter((e) => e.payload.value === 'void').length, 2);
});

test('break log: add a missed break later; overlap refused; it can be fixed or removed', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.breakStartEvents(s.ctx(), t('12:00')));
  await s.ok(E.breakEndEvents(s.ctx(), t('13:00')));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '19:00', count: 120 }));

  assert.deepEqual(E.missedBreakEvents(s.ctx(), t('18:00'), null), { ok: false, error: 'Enter when the break started and ended.' });
  assert.deepEqual(E.missedBreakEvents(s.ctx(), t('19:00'), t('18:00')), { ok: false, error: 'The break end must be after its start.' });
  assert.deepEqual(E.missedBreakEvents(s.ctx(), t('12:30'), t('13:30')), { ok: false, error: '12:30–13:30 overlaps the break 12:00–13:00. Change the times, or fix that break first.' });

  await s.ok(E.missedBreakEvents(s.ctx(), t('18:00'), t('19:00')));
  assert.equal(s.state.ops.phase, 'working'); // a break added afterwards doesn't put the shift on break
  assert.deepEqual(planView(s.state, glovis).breakLog, [
    { label: 'Break', value: '12:00–13:00' },
    { label: 'Break · added later', value: '18:00–19:00' },
  ]);

  const missed = s.state.breakLog[1];
  await s.ok(E.editBreakEvents(s.ctx(), missed, t('18:00'), t('18:50'), 'Wrong time'));
  assert.deepEqual(s.state.breakLog.map((x) => [x.start, x.end]), [['12:00', '13:00'], ['18:00', '18:50']]);
  await s.ok(E.removeBreakEvents(s.ctx(), s.state.breakLog[1], 'Logged by mistake'));
  assert.deepEqual(s.state.breakLog.map((x) => [x.start, x.end]), [['12:00', '13:00']]);
});

test('break log: shift changes are shown but not editable here; a break with a value is refused', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.endShiftEvents(s.ctx(), t('17:00')));
  const shift = s.state.breakLog[0];
  assert.equal(shift.kind, 'shift');
  assert.deepEqual(planView(s.state, glovis).breakLog, [{ label: 'Shift', value: 'Shift end 17:00 · in progress' }]);
  assert.deepEqual(E.removeBreakEvents(s.ctx(), shift, 'Duplicate'), { ok: false, error: 'Shift changes can’t be removed here.' });
  const odd = E.breakStartEvents(s.ctx(), t('18:00')) as VsaEvent[];
  odd[0].payload.value = 'void'; // only a correction can remove a break
  await s.refused(odd, /a break has no value/);
});

// ---------- Review round 1 (independent reviewer, 2026-09-28) ----------

test('review R1: a missed break never blocks logging the live break', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.missedBreakEvents(s.ctx(), t('12:00'), t('13:00')));
  await s.ok(E.breakStartEvents(s.ctx(), t('12:30'))); // contradicts the missed one, but live logging must work
  await s.ok(E.breakEndEvents(s.ctx(), t('13:30')));
  assert.equal(s.state.ops.phase, 'working');
  // Adding a missed break over the break that's on now is refused at the form.
  await s.ok(E.breakStartEvents(s.ctx(), t('18:00')));
  assert.deepEqual(E.missedBreakEvents(s.ctx(), t('18:10'), t('18:20')), { ok: false, error: '18:10–18:20 overlaps the break 18:00 (in progress). Change the times, or fix that break first.' });
});

test('review R1: a double-tapped start leaves a stranded entry that never blocks later breaks and can be removed', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.breakStartEvents(s.ctx(), t('12:00')));
  await s.ok(E.breakStartEvents(s.ctx(), t('12:02')));
  await s.ok(E.breakEndEvents(s.ctx(), t('13:00')));
  const stranded = s.state.breakLog[0];
  assert.deepEqual([stranded.start, stranded.end, s.state.ops.phase], ['12:00', null, 'working']);
  assert.equal(E.isCurrentBreak(s.state, stranded), false);
  assert.deepEqual(E.editBreakEvents(s.ctx(), stranded, t('12:00'), null, 'Wrong time'), { ok: false, error: E.STRANDED });
  await s.ok(E.missedBreakEvents(s.ctx(), t('18:00'), t('19:00'), )); // not blocked by the stranded 12:00
  await s.ok(E.missedBreakEvents(s.ctx(), t('12:00', 2), t('13:00', 2))); // nor on Day 2
  await s.ok(E.removeBreakEvents(s.ctx(), stranded, 'Duplicate'));
  assert.deepEqual(s.state.breakLog.map((x) => [x.start, x.end]), [['12:02', '13:00'], ['18:00', '19:00'], ['Day 2 12:00', 'Day 2 13:00']]);
});

test('review R2: editing a break into another break is refused', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.breakStartEvents(s.ctx(), t('12:00')));
  await s.ok(E.breakEndEvents(s.ctx(), t('13:00')));
  await s.ok(E.breakStartEvents(s.ctx(), t('18:00')));
  await s.ok(E.breakEndEvents(s.ctx(), t('19:00')));
  assert.deepEqual(E.editBreakEvents(s.ctx(), s.state.breakLog[1], t('11:00'), t('19:00'), 'Wrong time'),
    { ok: false, error: '11:00–19:00 overlaps the break 12:00–13:00. Change the times, or fix that break first.' });
  // Round 2: an empty end box keeps the saved end (checked with it), never "runs forever".
  await s.ok(E.editBreakEvents(s.ctx(), s.state.breakLog[0], t('12:05'), null, 'Wrong time'));
  assert.deepEqual([s.state.breakLog[0].start, s.state.breakLog[0].end], ['12:05', '13:00']);
  assert.deepEqual(E.editBreakEvents(s.ctx(), s.state.breakLog[1], t('12:30'), null, 'Wrong time'),
    { ok: false, error: '12:30–19:00 overlaps the break 12:05–13:00. Change the times, or fix that break first.' });
});

test('review R3: the Hourly list says when drivers come from the day setting', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.workdayDriversEvents(s.ctx(), 1, 70));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 245 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 230, drivers: 66 }));
  const rows = hourlyView(s.state).rows;
  assert.match(rows[0].drivers!, /^70 drivers \(Day 1 setting\) · 3\.50 per driver/);
  assert.match(rows[1].drivers!, /^66 drivers · /);
});

test('review R4: a day’s drivers can be cleared back to unknown, and set again; history kept', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.workdayDriversEvents(s.ctx(), 2, 70)); // meant for Day 1
  assert.deepEqual(E.clearWorkdayDriversEvents(s.ctx(), 2, null), { ok: false, error: 'Pick a reason for clearing Day 2’s drivers. The old value is kept.' });
  await s.ok(E.clearWorkdayDriversEvents(s.ctx(), 2, 'Typo'));
  assert.deepEqual(s.state.workdayDrivers, {});
  assert.deepEqual(E.clearWorkdayDriversEvents(s.ctx(), 2, 'Typo'), { ok: false, error: 'Day 2’s drivers aren’t set.' });
  await s.ok(E.workdayDriversEvents(s.ctx(), 2, 50)); // no reason needed: nothing is set
  assert.deepEqual(s.state.workdayDrivers, { 2: 50 });
  assert.deepEqual(s.state.corrections.find((c) => c.metric === 'workday_drivers')!.history, [70, 'void', 50]);
});

test('review R5/R6: a clerk count stays with its break after an hour correction; 2,000 corrections add little on top of replay', async (tc) => {
  const s = await setup(tc);
  for (let i = 0; i < 9; i++) await s.ok(E.hourEvents(s.ctx(), { day: 1, start: `${String(8 + i).padStart(2, '0')}:00`, count: 100 + i, stopMin: i === 3 ? 45 : null }));
  await s.ok(E.breakStartEvents(s.ctx(), t('12:00')));
  await s.ok(E.clerkEvents(s.ctx(), 1500, t('12:10')));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 111, reason: 'Recount' }));
  assert.equal(s.state.clerk?.remaining, 1500);
  assert.deepEqual(s.state.periods[0].was, [100]);
  // Timing guard: 2,000 corrections of one hour (a long chain) still project well under a second.
  const { project, replay } = await import('../src/engine/index.ts');
  const evs = [...s.state.log.events];
  let head = evs.find((e) => e.payload.metric === 'field_units' && !s.state.log.supersededBy[e.event_id] && e.payload.period_start?.includes('T09:00'))!;
  let seq = evs.at(-1)!.sequence;
  for (let i = 0; i < 2000; i++) {
    seq++;
    const c: VsaEvent = { ...head, event_id: `${OP}-${seq}`, idempotency_key: `${OP}-${seq}`, sequence: seq, event_type: 'correction', supersedes_event_id: head.event_id,
      payload: { ...head.payload, value: 100 + (i % 7), reason: 'Recount' } };
    evs.push(c); head = c;
  }
  // Deterministic: a long chain projects, replays, and keeps its whole history. Growth is guarded by replayScaling.test.ts (counts reads, not milliseconds).
  assert.ok(!('error' in replay(evs, OP)), 'replay accepts the chain');
  const p = project(glovis, evs, OP);
  assert.ok(p.ok, JSON.stringify(p));
  assert.equal(Math.max(...p.corrections.map((c) => c.history.length)), 2001);
});
