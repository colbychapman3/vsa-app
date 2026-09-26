// Every Log form, saved through the real store (node:sqlite), then read back
// through project() and the view model. TEST data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VsaEvent, Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { snapshot, decksView, hourlyView, planView } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-ENTRIES';
const t = (hm: string, day = 1) => ({ day, hm });

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-entries-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); }); // close first: Windows locks open files
  const c = await store.createVessel({ operationId: OP, baseline: glovis, isTest: true });
  assert.ok(c.ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  // Save a form's events; on success keep the new state (the app does the same).
  const save = async (evs: VsaEvent[] | Reject) => {
    if (!Array.isArray(evs)) return evs;
    const r = await store.append(OP, evs);
    if (r.ok) state = r.state;
    return r;
  };
  const ok = async (evs: VsaEvent[] | Reject) => { const r = await save(evs); assert.ok(r.ok, JSON.stringify(r)); };
  return { store, ctx, save, ok, get state() { return state; } };
}

test('hourly count: new hour, brand split, drivers, pre-break stop time', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 253, brands: { Hyundai: 200, Kia: 53 }, drivers: 70 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '11:00', count: 186, drivers: 68, stopMin: 45 }));
  const [h8, h11] = s.state.periods;
  assert.deepEqual([h8.start, h8.count, h8.brands, h8.drivers], ['08:00', 253, { Hyundai: 200, Kia: 53 }, 70]);
  assert.deepEqual([h11.short, h11.min, h11.pace], [true, 45, 248]);
  // Short hour without a stop time is refused by the engine; nothing saved.
  const before = s.state.log.events.length;
  const r = await s.save(E.hourEvents(s.ctx(), { day: 1, start: '17:00', count: 150 }));
  assert.deepEqual(r, { ok: false, error: 'Hour 17:00: Pick when production stopped before the 18:00 break.' });
  assert.equal(s.state.log.events.length, before);
});

test('re-entering an hour corrects only what changed, needs a reason, keeps history', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '14:00', count: 235, drivers: 70 }));
  assert.deepEqual(E.hourEvents(s.ctx(), { day: 1, start: '14:00', count: 241, drivers: 70 }),
    { ok: false, error: 'Pick a reason for changing the 14:00 hour. The old value is kept.' });
  assert.deepEqual(E.hourEvents(s.ctx(), { day: 1, start: '14:00', count: 235, drivers: 70, reason: 'Recount' }),
    { ok: false, error: 'Nothing to save: these values are already logged for that hour.' });

  const evs = E.hourEvents(s.ctx(), { day: 1, start: '14:00', count: 241, drivers: 70, reason: 'Recount' }) as VsaEvent[];
  assert.deepEqual(evs.map((e) => [e.event_type, e.payload.metric, e.payload.value, e.payload.reason]), [['correction', 'field_units', 241, 'Recount']]);
  await s.ok(evs);
  assert.equal(s.state.field, 241);
  assert.deepEqual(s.state.periods[0].was, [235]);
  assert.equal(hourlyView(s.state).rows[0].corrected, 'Was 235 · original kept');

  // Adding a brand split later is new information, not a correction; a second change chains.
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '14:00', count: 241, brands: { Hyundai: 200, Kia: 41 }, reason: 'Recount' }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '14:00', count: 240, brands: { Hyundai: 199, Kia: 41 }, reason: 'Checker update' }));
  assert.deepEqual(s.state.periods[0].was, [235, 241]);
  assert.deepEqual(s.state.periods[0].brands, { Hyundai: 199, Kia: 41 });
  assert.equal(s.state.log.events.filter((e) => e.payload.metric === 'field_units').length, 6); // nothing overwritten
});

test('deck update: status, hatches, time; over-quantity refused; Now vs no time', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D9', status: 'active', skipped: false, hatchRemaining: { H4: 24, H3: 123, H2: 103, H1: 69 }, deckRemaining: null, time: t('14:50') }));
  await s.ok(E.deckEvents(s.ctx(), { deck: 'UPP', status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }));
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D7', status: 'notStarted', skipped: true, hatchRemaining: {}, deckRemaining: null, time: t('08:10') }));
  const d = decksView(s.state);
  const row = (id: string) => d.rows.find((r) => r.id === id)!;
  assert.deepEqual([row('D9').pill, row('D9').remaining], ['Active', '319']);
  assert.equal(row('UPP').cleared, 'Cleared 199 Kia · time not provided');
  assert.equal(row('D7').pill, 'Skipped');
  assert.deepEqual(s.state.decks.find((x) => x.id === 'D9')!.history, [{ status: 'active', time: '14:50' }]);

  const r = await s.save(E.deckEvents(s.ctx(), { deck: 'UPP', status: 'active', skipped: false, hatchRemaining: { H3: 110 }, deckRemaining: null, time: null }));
  assert.ok(!r.ok && r.error === 'H3 exceeds its 106 autos by 4. Check the count.');
  assert.equal(decksView(s.state).rows.find((x) => x.id === 'UPP')!.pill, 'Complete'); // nothing saved
});

test('deck height confirmation clears the Plan badge; a low deck shows on Decks', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.heightEvents(s.ctx(), 'D7', 1.7, t('08:05')));
  await s.ok(E.heightEvents(s.ctx(), 'D9', 2.0, t('08:06')));
  const d = decksView(s.state);
  assert.deepEqual(d.low.map((x) => x.sub), ['Confirmed 08:05 · 163 autos remaining']);
  assert.deepEqual(planView(s.state, glovis).heights.confirmed.map((x) => x.text), ['D9 2.00 m ✓ · change', 'D7 1.70 m ✓ · change']);
});

test('break, clerk, end of shift, next day and shift settings', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 250 }));
  await s.ok(E.breakStartEvents(s.ctx(), t('12:00')));
  await s.ok(E.clerkEvents(s.ctx(), 1719, t('12:05')));
  assert.equal(s.state.ops.phase, 'break');
  // No decks cleared yet, so the ship still shows 1,969: the clerk's 1,719 is flagged, not trusted.
  assert.equal(snapshot(s.state, glovis, 12 * 60 + 10).hero.clerkLine?.text, 'Discrepancy: 250 autos · Chief clerk 12:05: 1,719 · Yours: 1,969');
  await s.ok(E.breakEndEvents(s.ctx(), t('13:00')));
  assert.deepEqual(planView(s.state, glovis).breakLog, [{ label: 'Break', value: '12:00–13:00' }]);

  // A break needs its time: an empty time is refused by the engine.
  const r = await s.save(E.breakStartEvents(s.ctx(), null));
  assert.ok(!r.ok && /enter the break start time/.test(r.error));

  await s.ok(E.shiftSettingsEvents(s.ctx(), '17:00', '07:00'));
  assert.deepEqual(planView(s.state, glovis).forecast, { breaks: '12:00 and 18:00 · 1 hour each', dayEnd: '17:00', nextStart: '07:00' });
  assert.deepEqual(E.shiftSettingsEvents(s.ctx(), '17:00', '07:00'), { ok: false, error: 'Nothing to save: these shift settings are already set.' });
  await s.ok(E.endShiftEvents(s.ctx(), t('17:00')));
  assert.deepEqual(snapshot(s.state, glovis, 17 * 60 + 5).banners[0], { tone: 'break', title: 'SHIFT ENDED', sub: 'At 17:00 · Day 2 starts 07:00', trackable: false, tracked: false });
  await s.ok(E.nextDayEvents(s.ctx(), t('07:00', 2)));
  assert.deepEqual([s.state.ops.day, s.state.ops.phase], [2, 'working']);
  await s.ok(E.hourEvents(s.ctx(), { day: 2, start: '07:00', count: 200 }));
  assert.deepEqual(s.state.periods.at(-1)!.day, 2);

  // "Finish today" clears the Day 1 shift end.
  await s.ok(E.shiftSettingsEvents(s.ctx(), null, '07:00'));
  assert.equal(planView(s.state, glovis).forecast.dayEnd, 'Works until finished');

  assert.deepEqual(E.clerkEvents(s.ctx(), -3, null), { ok: false, error: 'Enter the clerk’s remaining count as a whole number.' });
});

test('discrepancy: open, track a banner, resolve; empty text refused', async (tc) => {
  const s = await setup(tc);
  assert.deepEqual(E.openDiscrepancyEvents(s.ctx(), '   ', null), { ok: false, error: 'Describe what doesn’t match.' });
  await s.ok(E.openDiscrepancyEvents(s.ctx(), 'D12 H2 count disagreed with checker', t('10:20')));
  const title = 'Break reconciliation: ship is 10 ahead of field';
  await s.ok(E.openDiscrepancyEvents(s.ctx(), `${title}. Ship progress 930 · Field 920`, t('12:06'), title));
  assert.equal(s.state.issues.find((i) => i.key === title)?.status, 'open');
  const first = s.state.issues[0].id;
  await s.ok(E.resolveDiscrepancyEvents(s.ctx(), first, t('10:45')));
  const p = planView(s.state, glovis);
  assert.equal(p.issues.open.length, 1);
  assert.equal(p.issues.resolved, 'Recently resolved: D12 H2 count disagreed with checker (10:45)');
});

test('empty time is saved as "time not provided", never the phone clock', async (tc) => {
  const s = await setup(tc);
  const evs = E.deckEvents(s.ctx(), { deck: 'UPP', status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null });
  assert.ok(evs.every((e) => e.occurred_at === null && e.recorded_at === '2026-09-21T20:00:00-04:00'));
  assert.match(E.offsetFor(new Date()), /^[+-]\d{2}:\d{2}$/);
  assert.equal(E.iso({ ...s.ctx() }, t('07:30', 2)), '2026-09-22T07:30:00-04:00');
});
