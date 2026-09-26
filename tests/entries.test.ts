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
  assert.equal(row('UPP').cleared, 'Cleared 199 Kia · Logged at 20:00 UTC-04:00 (processing time, not event time)'); // no time entered: labeled save time
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

test('empty time: occurred_at stays null; the phone clock is only the labeled processing time', async (tc) => {
  const s = await setup(tc);
  const evs = E.deckEvents(s.ctx(), { deck: 'UPP', status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }) as VsaEvent[];
  assert.ok(evs.every((e) => e.occurred_at === null && e.recorded_at === '2026-09-21T20:00:00-04:00'));
  assert.match(E.offsetFor(new Date()), /^[+-]\d{2}:\d{2}$/);
  assert.equal(E.iso({ ...s.ctx() }, t('07:30', 2)), '2026-09-22T07:30:00-04:00');
});

// ---- Checkpoint A review findings (2026-09-26). Each reproduces the bug first. ----

test('review 1: a deck cleared with no time never borrows an earlier update’s time', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D9', status: 'active', skipped: false, hatchRemaining: { H4: 24, H3: null, H2: null, H1: null }, deckRemaining: null, time: t('14:50') }));
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D9', status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }));
  assert.equal(decksView(s.state).rows.find((r) => r.id === 'D9')!.cleared, 'Cleared 398 Hyundai · Logged at 20:00 UTC-04:00 (processing time, not event time)'); // its own save time, labeled — never 14:50
});

test('review 2: a discrepancy can only be resolved once', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.openDiscrepancyEvents(s.ctx(), 'x', t('10:00')));
  const id = s.state.issues[0].id;
  await s.ok(E.resolveDiscrepancyEvents(s.ctx(), id, t('10:10')));
  const r = await s.save(E.resolveDiscrepancyEvents(s.ctx(), id, t('11:30')));
  assert.ok(!r.ok && /is not open/.test(r.error));
  assert.equal(planView(s.state, glovis).issues.resolved, 'Recently resolved: x (10:10)');
});

test('review 3: a brand that is not on the vessel is refused in an hourly split', async (tc) => {
  const s = await setup(tc);
  const r = await s.save(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100, brands: { Hyundai: 60, Kia: 30, Honda: 10 } }));
  assert.deepEqual(r, { ok: false, error: 'Hour 08:00: Honda is not on this vessel.' });
});

test('review 4 (Colby chose A): the deck sheet is a full snapshot — clearing a hatch makes it unknown again', async (tc) => {
  const s = await setup(tc);
  const d1 = (h3: number | null, h2: number | null, total: number | null = null) =>
    E.deckEvents(s.ctx(), { deck: 'D1', status: 'active', skipped: false, hatchRemaining: { H3: h3, H2: h2 }, deckRemaining: total, time: t('09:00') });
  await s.ok(d1(5, 67));
  assert.equal(s.state.decks.find((d) => d.id === 'D1')!.rem, 72);
  await s.ok(d1(null, 67));                 // H3 cleared → unknown → deck remaining unknown
  const d = s.state.decks.find((x) => x.id === 'D1')!;
  assert.deepEqual([d.hatches[0].rem, d.rem], [null, null]);
  assert.equal(s.state.vesselRemaining, null);
  await s.ok(d1(null, null, 60));           // all hatches blank, deck total only: accepted (other direction: round 2 R1 test)
  assert.equal(s.state.decks.find((x) => x.id === 'D1')!.rem, 60);
  // History keeps the earlier counts; nothing was overwritten.
  assert.ok(s.state.log.events.some((e) => e.scope.deck === 'D1' && e.scope.hatch === 'H3' && e.payload.value === 5));
  // Saving the same snapshot again changes nothing and says so.
  assert.deepEqual(d1(null, null, 60), { ok: false, error: 'Nothing to save: D1 already shows these values.' });
});

test('review 7: Now gives the phone time on the right operation day', () => {
  assert.deepEqual(E.nowOpTime('2026-09-21', new Date(2026, 8, 21, 14, 7)), { day: 1, hm: '14:07' });
  assert.deepEqual(E.nowOpTime('2026-09-21', new Date(2026, 8, 22, 7, 30)), { day: 2, hm: '07:30' });
  assert.equal(E.nowOpTime('2026-09-21', new Date(2026, 8, 20, 23, 0)), null); // before the operation: no guess
});

test('review (optional): the 23:00 hour ends at 00:00 the next day', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '23:00', count: 50 }));
  assert.equal(s.state.periods.at(-1)!.start, '23:00');
  assert.equal(s.state.log.events.at(-1)!.payload.period_end, '2026-09-22T00:00:00-04:00'); // ends Day 2 00:00
});

// ---- Review round 2 (2026-09-26) ----

test('round 2 R1: a consistent deck sheet is accepted when hatches and total change together', async (tc) => {
  const s = await setup(tc);
  const d1 = (h3: number | null, h2: number | null, total: number | null) =>
    E.deckEvents(s.ctx(), { deck: 'D1', status: 'active', skipped: false, hatchRemaining: { H3: h3, H2: h2 }, deckRemaining: total, time: t('09:00') });
  await s.ok(d1(5, 67, 72));
  await s.ok(d1(10, 67, 77));             // both change; the final sheet agrees
  assert.equal(s.state.decks.find((d) => d.id === 'D1')!.rem, 77);
  await s.ok(d1(null, null, 60));         // total only
  await s.ok(d1(10, 55, null));           // back to hatches, total cleared
  assert.equal(s.state.decks.find((d) => d.id === 'D1')!.rem, 65);
  // The whole-sheet check still refuses a sheet that disagrees with itself.
  const r = await s.save(d1(10, 55, 70));
  assert.ok(!r.ok && r.error === 'Hatch counts add to 65 but deck total says 70. Fix one.', JSON.stringify(r));
});

test('round 2 R2: "unknown" (null) is only valid for a vessel remaining count', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.breakStartEvents(s.ctx(), t('12:00')));
  const evs = E.clerkEvents(s.ctx(), 100, t('12:05')) as VsaEvent[];
  evs[0].payload.value = null; evs[0].provenance = 'unknown';
  const r = await s.save(evs);
  assert.ok(!r.ok && /clerk_remaining must be a whole number of 0 or more/.test(r.error), JSON.stringify(r));
});

// ---- Review round 3 (2026-09-26): the engine guards every source, not just the app's forms ----

test('round 3: clerk and deck counts must be remaining counts with whole numbers, from any source', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.breakStartEvents(s.ctx(), t('12:00')));
  const clerk = (value: VsaEvent['payload']['value'], kind: VsaEvent['payload']['count_kind']) => {
    const evs = E.clerkEvents(s.ctx(), 100, t('12:05')) as VsaEvent[];
    evs[0].payload.value = value; evs[0].payload.count_kind = kind;
    return evs;
  };
  for (const [value, kind] of [[null, 'not_applicable'], [-5, 'not_applicable'], ['abc', 'not_applicable']] as const) {
    const r = await s.save(clerk(value, kind));
    assert.ok(!r.ok && /clerk_remaining must be a remaining count/.test(r.error), `${value}: ${JSON.stringify(r)}`);
  }
  await s.ok(E.deckEvents(s.ctx(), { deck: 'UPP', status: 'active', skipped: false, hatchRemaining: { H4: 50, H3: null, H2: null }, deckRemaining: null, time: t('12:10') }));
  const evs = E.deckEvents(s.ctx(), { deck: 'UPP', status: 'active', skipped: false, hatchRemaining: { H4: null, H3: null, H2: null }, deckRemaining: null, time: t('12:11') }) as VsaEvent[];
  evs[0].payload.count_kind = 'not_applicable'; evs[0].provenance = 'user_report';
  const r = await s.save(evs);
  assert.ok(!r.ok && /vessel_remaining must be a remaining count/.test(r.error), JSON.stringify(r));
  assert.equal(s.state.decks.find((d) => d.id === 'UPP')!.hatches[0].rem, 50); // unchanged
});

test('round 3 (optional): a stop time on a full hour is refused; the whole-sheet deck error names its event', async (tc) => {
  const s = await setup(tc);
  const r = await s.save(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 200, stopMin: 45 }));
  assert.deepEqual(r, { ok: false, error: 'Hour 08:00: A stop time only applies to the hour before a break.' });
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D1', status: 'active', skipped: false, hatchRemaining: { H3: 5, H2: 67 }, deckRemaining: 72, time: t('09:00') }));
  const bad = E.deckEvents(s.ctx(), { deck: 'D1', status: 'active', skipped: false, hatchRemaining: { H3: 5, H2: 67 }, deckRemaining: 70, time: t('09:05') }) as VsaEvent[];
  const r2 = await s.save(bad);
  assert.deepEqual(r2, { ok: false, error: 'Hatch counts add to 72 but deck total says 70. Fix one.', event_id: bad.at(-1)!.event_id });
});

// ---- Review round 4 (2026-09-26): one value per hour and field; strict types from any source ----

test('round 4 R1: a second value for the same hour is refused — correct the first instead', async (tc) => {
  const s = await setup(tc);
  const base = E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100, drivers: 70 }) as VsaEvent[];
  await s.ok(base);
  const dup = (metric: string, value: number, periodStart = base[0].payload.period_start!, periodEnd = base[0].payload.period_end!) => {
    const evs = E.clerkEvents(s.ctx(), 0, null) as VsaEvent[]; // borrow a well-formed envelope, then reshape
    const e = evs[0];
    e.payload = { ...e.payload, metric, value, count_kind: metric === 'field_units' ? 'interval' : 'not_applicable', period_start: periodStart, period_end: periodEnd };
    return evs;
  };
  const r1 = await s.save(dup('drivers', 40));
  assert.ok(!r1.ok && /Hour 08:00 already has drivers \(event TEST-ENTRIES-\d+\); correct that event instead\./.test(r1.error), JSON.stringify(r1));
  // Same wall-clock hour sent with another UTC offset (DST change, import): still the same hour.
  const r2 = await s.save(dup('field_units', 5, '2026-09-21T08:00:00-05:00', '2026-09-21T09:00:00-05:00'));
  assert.ok(!r2.ok && /Hour 08:00 already has field_units/.test(r2.error), JSON.stringify(r2));
  assert.deepEqual([s.state.field, s.state.periods[0].drivers], [100, 70]); // nothing replaced
});

test('round 4 R2 (rule revised in round 5, Colby chose A): 11:30–12:30 across the noon break is refused', async (tc) => {
  const s = await setup(tc);
  const evs = E.hourEvents(s.ctx(), { day: 1, start: '11:00', count: 100, stopMin: 45 }) as VsaEvent[];
  for (const e of evs) { e.payload.period_start = '2026-09-21T11:30:00-04:00'; e.payload.period_end = '2026-09-21T12:30:00-04:00'; }
  const r = await s.save(evs);
  assert.ok(!r.ok && /Hour 11:30–12:30 runs through the 12:00 break/.test(r.error), JSON.stringify(r));
});

test('round 4 R3 and strict types: skipped must be true/false; empty discrepancy and odd break events refused', async (tc) => {
  const s = await setup(tc);
  const skip = E.deckEvents(s.ctx(), { deck: 'D7', status: 'notStarted', skipped: true, hatchRemaining: {}, deckRemaining: null, time: null }) as VsaEvent[];
  skip[0].payload.value = 'true';
  const r1 = await s.save(skip);
  assert.ok(!r1.ok && /deck_skipped must be true or false/.test(r1.error), JSON.stringify(r1));

  const d = E.openDiscrepancyEvents(s.ctx(), 'x', null) as VsaEvent[];
  d[0].payload.reason = '  '; d[0].payload.value = null;
  const r2 = await s.save(d);
  assert.ok(!r2.ok && /discrepancy needs a description/.test(r2.error), JSON.stringify(r2));

  const b = E.breakStartEvents(s.ctx(), t('12:00')) as VsaEvent[];
  b[0].event_type = 'observation';
  const r3 = await s.save(b);
  assert.ok(!r3.ok && /break must be a pause or resume/.test(r3.error), JSON.stringify(r3));

  const h = E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100, drivers: 7 }) as VsaEvent[];
  h[1].payload.count_kind = 'remaining';
  const r4 = await s.save(h);
  assert.ok(!r4.ok && /drivers must not be a count kind/.test(r4.error), JSON.stringify(r4));
});

// ---- Review round 5 (2026-09-26): Colby chose A — hours follow the day's start time ----

test('round 5 R1: a 07:30 start logs 07:30–08:30 hours; an hour across a break start is refused', async (tc) => {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-entries-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  const b = { ...glovis, start: '07:30' };
  assert.ok((await store.createVessel({ operationId: OP, baseline: b, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const save = async (evs: VsaEvent[] | Reject) => { const r = await store.append(OP, evs as VsaEvent[]); if (r.ok) state = r.state; return r; };
  assert.ok((await save(E.hourEvents(ctx(), { day: 1, start: '07:30', count: 100 }))).ok);
  assert.ok((await save(E.hourEvents(ctx(), { day: 1, start: '10:30', count: 120 }))).ok);
  const r = await save(E.hourEvents(ctx(), { day: 1, start: '11:30', count: 60 }));
  assert.ok(!r.ok && /Hour 11:30–12:30 runs through the 12:00 break/.test(r.error), JSON.stringify(r));
  assert.deepEqual(state.periods.map((p) => p.start), ['07:30', '10:30']);
  // Day 2 starting 07:30 after end of shift.
  assert.ok((await save(E.endShiftEvents(ctx(), t('17:00')))).ok);
  assert.ok((await save(E.nextDayEvents(ctx(), t('07:30', 2)))).ok);
  assert.ok((await save(E.hourEvents(ctx(), { day: 2, start: '07:30', count: 50 }))).ok);
  assert.equal(state.periods.at(-1)!.day, 2);
});

test('round 5 (import-only): brand only on counts; reasons must be text; strict event types; whole-minute periods', async (tc) => {
  const s = await setup(tc);
  const h = E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100, drivers: 70 }) as VsaEvent[];
  h[1].scope.commodity = 'Kia';
  let r = await s.save(h);
  assert.ok(!r.ok && /only a field count can name a brand/.test(r.error), JSON.stringify(r));

  const d = E.openDiscrepancyEvents(s.ctx(), 'x', null) as VsaEvent[];
  (d[0].payload as { reason: unknown }).reason = 5;
  r = await s.save(d);
  assert.ok(!r.ok && /reason must be text/.test(r.error), JSON.stringify(r));

  const sh = E.endShiftEvents(s.ctx(), t('17:00')) as VsaEvent[];
  sh[0].event_type = 'observation';
  r = await s.save(sh);
  assert.ok(!r.ok && /shift must be a status change/.test(r.error), JSON.stringify(r));

  const dx = E.openDiscrepancyEvents(s.ctx(), 'x', null) as VsaEvent[];
  dx[0].event_type = 'observation';
  r = await s.save(dx);
  assert.ok(!r.ok && /discrepancy must be opened or resolved/.test(r.error), JSON.stringify(r));

  const sec = E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }) as VsaEvent[];
  sec[0].payload.period_start = '2026-09-21T08:00:30-04:00'; sec[0].payload.period_end = '2026-09-21T09:00:30-04:00';
  r = await s.save(sec);
  assert.ok(!r.ok && /whole minutes/.test(r.error), JSON.stringify(r));
});
