// Phase 3, the coach at closeout: the list of what is left, the forecast scorecard and the answer sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VsaEvent, Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { actualFinishAbs, answerSheet, coachList, scorecard, SLOWED_QUESTION, tickNote, TICKS } from '../src/app/closeout.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-VESSEL-CLOSEOUT';

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-closeout-'));
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


const allTicked = Object.fromEntries(TICKS.map((t) => [tickNote(t.key), '1']));

test('a new vessel is not clear: field vs decks is open and every tick is open', async (tc) => {
  const s = await setup(tc);
  const c = coachList(s.state, {});
  assert.equal(c.clear, false);
  assert.equal(c.rows.length, 2 + TICKS.length);
  assert.equal(c.rows[1].ok, true); // nothing is open yet
  assert.equal(c.left, c.rows.length - 1);
  assert.equal(c.rows[0].ok, false);
  assert.match(c.rows[0].detail, /remaining|unknown/);
  assert.equal(c.rows[0].go, 'decks');
});

test('finished and square, but unticked items still keep the vessel from being clear', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  const c = coachList(s.state, {});
  assert.equal(c.rows.find((r) => r.id === 'decks')!.ok, true);
  assert.equal(c.rows.find((r) => r.id === 'issues')!.ok, true);
  assert.equal(c.left, TICKS.length);
  assert.equal(c.clear, false);
  const partly = coachList(s.state, { [tickNote('loadback')]: '1' });
  assert.equal(partly.left, TICKS.length - 1);
});

test('all green and all ticked is clear; a blank or "0" tick is not a tick', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  assert.equal(coachList(s.state, allTicked).clear, true);
  assert.equal(coachList(s.state, { ...allTicked, [tickNote('vans')]: '' }).clear, false);
  assert.equal(coachList(s.state, { ...allTicked, [tickNote('vans')]: '0' }).clear, false);
});

test('an open discrepancy is its own open row and points at the Snapshot', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  const evs = E.openDiscrepancyEvents(s.ctx(), 'Count differs from the clerk', null);
  await s.ok(evs);
  const row = coachList(s.state, allTicked).rows.find((r) => r.id === 'issues')!;
  assert.equal(row.ok, false);
  assert.match(row.detail, /1 open discrepancy/);
  assert.equal(row.go, 'snap');
});

test('actual finish is the end of the last counted hour, and unknown until the vessel is at 0', async (tc) => {
  const s = await setup(tc);
  assert.equal(actualFinishAbs(s.state), null);
  await s.finish();
  assert.equal(actualFinishAbs(s.state), 17 * 60); // last hour 16:00-17:00
});

test('scorecard: unscored before the finish; after it every row is a labeled FORECAST scored against the actual', async (tc) => {
  const s = await setup(tc);
  const before = scorecard(s.state, glovis);
  assert.equal(before.actual, null);
  assert.equal(before.rows.length, 0);
  assert.match(before.note!, /reaches 0/);
  // Hours are counted while the ship's decks are still being cleared, as on a real ship: the forecast shows after each hour.
  const hrs = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
  let left = s.state.start;
  for (const [i, h] of hrs.entries()) { const c = i === hrs.length - 1 ? left : Math.min(left, 245); await s.ok(E.hourEvents(s.ctx(), { day: 1, start: h, count: c, ...(h === '11:00' ? { stopMin: 45 } : {}) })); left -= c; }
  for (const d of s.state.decks) await s.ok(E.deckEvents(s.ctx(), { deck: d.id, status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }));
  const sc = scorecard(s.state, glovis);
  assert.equal(sc.actual, '17:00');
  assert.equal(sc.rows.length, 2);
  assert.match(sc.rows[0].label, /^First forecast, after 08:00/);
  assert.match(sc.rows[1].label, /^Last forecast, after /);
  for (const r of sc.rows) { assert.match(r.forecast, /^FORECAST \d\d:\d\d/); assert.match(r.result, /on the forecast|min (later|earlier) than forecast/); }
  assert.match(sc.note!, /Cars only/);
});

test('answer sheet: counts, status, finish, open items and the slowed-down line; H&H never added', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  await s.ok(E.slowedEvents(s.ctx(), 'Waited on vans at 14:00', SLOWED_QUESTION));
  const notes = allTicked;
  const done = answerSheet(s.state, glovis, { isTest: true, notes, closeout: coachList(s.state, notes) });
  assert.match(done, /^TEST · /);
  assert.match(done, /Autos counted in the field: 1,969 of 1,969/);
  assert.match(done, /Vessel remaining: 0/);
  assert.match(done, /Finish: 17:00 \(end of the last counted hour\)/);
  assert.match(done, /Open items: none/);
  assert.match(done, /What slowed you down today\? Waited on vans at 14:00/);
  assert.match(done, /H&H is counted separately/);
  assert.match(done, /Status: INTERIM: ready to close, not confirmed/);
  const partial = answerSheet(s.state, glovis, { isTest: true, notes: {}, closeout: coachList(s.state, {}) });
  assert.match(partial, /Open items: Load-back closed not confirmed/);
  await s.ok(E.slowedEvents(s.ctx(), '', SLOWED_QUESTION)); // cleared: removed with a reason, kept in the log
  assert.doesNotMatch(answerSheet(s.state, glovis, { isTest: true, notes: {}, closeout: coachList(s.state, {}) }), /What slowed you down/);
});

test('an unfinished vessel has no actual finish; remaining shows as counted, never as a finish', async (tc) => {
  const s = await setup(tc);
  const sheet = answerSheet(s.state, glovis, { isTest: true, notes: {}, closeout: coachList(s.state, {}) });
  assert.match(sheet, /Vessel remaining: 1,969/);
  assert.match(sheet, /Finish: unknown/);
  assert.doesNotMatch(sheet, /end of the last counted hour/);
});

test('the slowed-down answer is a Plan note in the log: a new answer replaces the old, the same answer writes nothing', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.slowedEvents(s.ctx(), 'Rain at 10:00', SLOWED_QUESTION));
  await s.ok(E.slowedEvents(s.ctx(), 'Rain at 10:00, then vans short', SLOWED_QUESTION));
  const live = s.state.notes.filter((x) => !x.removed && x.title === SLOWED_QUESTION);
  assert.equal(live.length, 1);
  assert.equal(live[0].text, 'Rain at 10:00, then vans short');
  assert.deepEqual(live[0].history.map((h) => h.text), ['Rain at 10:00', 'Rain at 10:00, then vans short']);
  assert.deepEqual(E.slowedEvents(s.ctx(), 'Rain at 10:00, then vans short', SLOWED_QUESTION), []);
  const clear = E.slowedEvents(s.ctx(), '   ', SLOWED_QUESTION);
  assert.ok(Array.isArray(clear) && clear.length === 1 && clear[0].event_type === 'note.removed'); // clearing removes it, with a reason
});
