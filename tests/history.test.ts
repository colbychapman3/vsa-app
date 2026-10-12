// Phase 5, the no loop: finished ships teach the next one (rates, forecast error, what slowed us), never their cargo or counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VsaEvent, Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { SLOWED_QUESTION } from '../src/app/closeout.ts';
import { biasLine, historyLine, lessons, shipResult, themesOf, type ShipResult } from '../src/app/history.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-VESSEL-HISTORY';

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-history-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    if (!Array.isArray(evs)) assert.fail(JSON.stringify(evs));
    const r = await store.append(OP, evs);
    assert.ok(r.ok, JSON.stringify(r));
    state = r.state;
  };
  const refused = async (evs: VsaEvent[] | Reject, msg: RegExp) => {
    const before = state.log.events.length;
    const r = Array.isArray(evs) ? await store.append(OP, evs) : evs;
    assert.ok(!r.ok && msg.test(r.error), JSON.stringify(r));
    assert.equal(state.log.events.length, before);
  };
  // Every deck complete and the field count equal to the ship's: remaining 0, nothing open.
  const finish = async () => {
    for (const d of state.decks) await ok(E.deckEvents(ctx(), { deck: d.id, status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }));
    const hrs = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
    let left = state.start;
    for (const [i, h] of hrs.entries()) { const c = i === hrs.length - 1 ? left : Math.min(left, 245); await ok(E.hourEvents(ctx(), { day: 1, start: h, count: c, ...(h === '11:00' ? { stopMin: 45 } : {}) })); left -= c; }
  };
  return { ctx, ok, refused, finish, get state() { return state; } };
}



const r = (o: Partial<ShipResult>): ShipResult => ({ id: 'X', name: 'Ship', date: '9/1/2026', isTest: false, prodCount: 0, prodMin: 0, field: 0, countedHours: 0, pace: null, ha: null, forecastErrMin: null, slowed: null, ...o });

test('a ship teaches only once Colby has marked it complete; then it carries its pace, forecast error and answer', async (tc) => {
  const s = await setup(tc);
  // Hours counted while the decks are still being cleared, so a forecast shows after each hour.
  const hrs = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
  let left = s.state.start;
  for (const [i, h] of hrs.entries()) { const c = i === hrs.length - 1 ? left : Math.min(left, 245); await s.ok(E.hourEvents(s.ctx(), { day: 1, start: h, count: c, ...(h === '11:00' ? { stopMin: 45 } : {}) })); left -= c; }
  for (const d of s.state.decks) await s.ok(E.deckEvents(s.ctx(), { deck: d.id, status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }));
  await s.ok(E.slowedEvents(s.ctx(), 'Vans short after lunch', SLOWED_QUESTION));
  assert.equal(shipResult(OP, s.state, glovis, true), null); // at 0, but not marked: not finished
  await s.ok(E.completeVesselEvents(s.ctx(), null));
  const res = shipResult(OP, s.state, glovis, true)!;
  assert.equal(res.isTest, true);
  assert.equal(res.slowed, 'Vans short after lunch');
  assert.equal(res.prodCount, s.state.production.prodCount);
  assert.equal(res.pace, s.state.production.pace);
  assert.equal(typeof res.forecastErrMin, 'number');
});

test('themes come from plain keywords, an answer can hit several, and nothing matched is Other', () => {
  assert.deepEqual(themesOf('Vans short, waited on drivers'), ['Shuttle vans', 'Drivers and labor', 'Waiting and delays']);
  assert.deepEqual(themesOf('Lightning stop at 14:00'), ['Weather', 'Waiting and delays']);
  assert.deepEqual(themesOf('Nothing much'), ['Other']);
  assert.deepEqual(themesOf('caravan'), ['Other']); // whole words only
});

test('lessons pool rates across ships, rank the most common slowdown, and never mix TEST with LIVE', () => {
  const all = [
    r({ id: 'A', prodCount: 600, prodMin: 120, field: 600, countedHours: 3, forecastErrMin: 20, slowed: 'Vans short' }),
    r({ id: 'B', prodCount: 300, prodMin: 120, field: 300, countedHours: 2, forecastErrMin: -10, slowed: 'Rain, and the vans were late' }),
    r({ id: 'C', prodCount: 0, prodMin: 0, field: 0, countedHours: 0, slowed: null }),
    r({ id: 'T', isTest: true, prodCount: 9999, prodMin: 60, field: 9999, countedHours: 1, forecastErrMin: 500, slowed: 'Weather' }),
  ];
  const l = lessons(all, false);
  assert.equal(l.ships, 3);
  assert.equal(l.pace, 225); // 900 autos ÷ 4 productive hours, pooled (not an average of averages)
  assert.equal(l.paceShips, 2);
  assert.equal(l.ha, 180); // 900 ÷ 5 counted hours
  assert.equal(l.bias, 5); // (20 − 10) ÷ 2
  assert.deepEqual(l.themes[0], { name: 'Shuttle vans', ships: 2 });
  assert.ok(!l.results.some((x) => x.isTest));
  const t = lessons(all, true);
  assert.equal(t.ships, 1);
  assert.equal(t.pace, 9999);
});

test('no finished ships: every figure is unknown, never zero, and the lines stay silent', () => {
  const l = lessons([], false);
  assert.deepEqual([l.ships, l.pace, l.ha, l.bias], [0, null, null, null]);
  assert.equal(biasLine(l), null);
  assert.equal(historyLine(l, 1578), null);
});

test('the lines say history, never a forecast, and name how many ships stand behind them', () => {
  const l = lessons([r({ prodCount: 600, prodMin: 120, forecastErrMin: 20 }), r({ prodCount: 300, prodMin: 120, forecastErrMin: 10 })], false);
  assert.equal(biasLine(l), 'Past ships: finished on average 15 min later than their last forecast (2 finished ships).');
  assert.equal(historyLine(l, 1578), "Past ships ran 225/hr pace (2 finished ships). At that pace 1,578 autos take about 7.0 productive hours. History, not this ship's forecast.");
  const t = lessons([r({ isTest: true, forecastErrMin: -7 })], true);
  assert.equal(biasLine(t), 'Past TEST ships: finished on average 7 min earlier than their last forecast (1 finished ship).');
});
