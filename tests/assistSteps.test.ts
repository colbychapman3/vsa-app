// Assistant steps 1 to 4 (Colby, 2026-10-12): Send update, the clerk's text, driver advice, and "not useful" in the moment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VsaEvent, Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { updateMessage } from '../src/app/update.ts';
import { readClerkText } from '../src/app/clerkText.ts';
import { paceAdvice, paceWatch } from '../src/app/whatif.ts';
import { nowLine } from '../src/app/now.ts';
import { hourOptions } from '../src/app/view.ts';
import { feedbackKey, feedbackSummary, type Feedback } from '../src/app/feedback.ts';
import { addFeedback, listFeedback, setFeedbackReason } from '../src/storage/feedback.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-VESSEL-ASSIST';

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-assist-'));
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
  return { ctx, ok, refused, finish, store, get state() { return state; } };
}



const day = (starts: string[], logged: string[] = []) => starts.map((start) => ({ start, logged: logged.includes(start) }));
const HOURS = day(['07:00', '08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00', '21:00']);

test('clerk text: the common ways a count arrives are read; each hour is only a proposal', () => {
  const r = readClerkText('10-11 245\n245 for 9 to 10\n11-12: 180 cars\n1-2 = 200', HOURS, 14 * 60 + 5);
  assert.deepEqual(r.found.map((x) => [x.start, x.count, x.note]), [['10:00', 245, null], ['09:00', 245, null], ['11:00', 180, null], ['13:00', 200, 'read as 13-14']]);
  assert.deepEqual(r.notRead, []);
});

test('clerk text: never guessed; what is not clean is listed as not read with the reason', () => {
  const r = readClerkText('about 200 so far\n10-12 400\n12-1 90\n3-4 50\n5-6 40', day(['03:00', '15:00', '10:00', '17:00']), 16 * 60);
  assert.equal(r.found.length, 0);
  assert.deepEqual(r.notRead, ['about 200 so far', '10-12 400 (not a one-hour period)', '12-1 90 (not a working hour today)', '3-4 50 (could be 03-04 or 15-16)', '5-6 40 (that hour has not started yet)']);
});

test('clerk text: a dictated line with "to" and a trailing period, and several hours separated by commas', () => {
  const r = readClerkText('8 to 9 212, 9 to 10 230.', HOURS, 10 * 60 + 2); // in the morning the 20-21 and 21-22 hours have not started
  assert.deepEqual(r.found.map((x) => [x.start, x.count]), [['08:00', 212], ['09:00', 230]]);
  const evening = readClerkText('8-9 150', day(HOURS.map((h) => h.start), ['08:00']), 21 * 60 + 5); // 08-09 already logged: 20-21 is the one open
  assert.deepEqual(evening.found.map((x) => [x.start, x.note]), [['20:00', 'read as 20-21']]);
  assert.match(readClerkText('8-9 150', HOURS, 21 * 60 + 5).notRead[0], /could be 08-09 or 20-21/);
});

test('clerk text: the Log offers the real working hours, so the reader uses them', async (tc) => {
  const s = await setup(tc);
  const hours = hourOptions(s.state, glovis).hours;
  assert.ok(!hours.some((h) => h.start === '12:00'));
  assert.equal(readClerkText('12-13 100', hours, 15 * 60).found.length, 0);
});

test('send update: counts, remaining, a FORECAST finish once there is one, the break outlook by side, H&H left out', async (tc) => {
  const s = await setup(tc);
  const early = updateMessage(s.state, glovis, 9 * 60 + 5, true);
  assert.match(early, /^TEST · Glovis Condor 101 update, as of 09:05/);
  assert.match(early, /Autos counted in the field: 0 of 1,969/);
  assert.match(early, /Finish: not forecast yet/);
  assert.match(early, /Next break 12:00/);
  assert.match(early, /Autos only; H&H is counted separately\./);
  for (const h of ['08:00', '09:00']) await s.ok(E.hourEvents(s.ctx(), { day: 1, start: h, count: 200 }));
  const later = updateMessage(s.state, glovis, 10 * 60 + 5, false);
  assert.doesNotMatch(later, /^TEST/);
  assert.match(later, /Autos counted in the field: 400 of 1,969/);
  assert.match(later, /Finish: FORECAST \d\d:\d\d/);
});

test('send update at 0 says ready to close, not complete, until Colby marks it', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  assert.match(updateMessage(s.state, glovis, 17 * 60 + 5, true), /Discharge at 0: ready to close, not confirmed\./);
  await s.ok(E.completeVesselEvents(s.ctx(), null));
  assert.match(updateMessage(s.state, glovis, 17 * 60 + 10, true), /Vessel marked complete\./);
});

test('advice: only when the pace watch fires, as a FORECAST with the per-driver math; never without a driver rate', async (tc) => {
  const s = await setup(tc);
  const d = [...s.state.decks].sort((a, b) => b.start - a.start)[0];
  const R = d.start;
  await s.ok(E.deckEvents(s.ctx(), { deck: d.id, status: 'active', skipped: false, hatchRemaining: {}, deckRemaining: R, time: null }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  const at = 10 * 60 + 30; // R left, 75 min to the 11:45 cutoff, pace 100/hr
  assert.ok(paceWatch(s.state, glovis, at).length > 0);
  assert.match(paceAdvice(s.state, glovis, at)[0], /no per-driver rate yet/);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 100, drivers: 20 }));
  const adv = paceAdvice(s.state, glovis, at)[0];
  // 20 drivers made 100 in the hour: 5 per driver per hr. R by 11:45 needs R ÷ 1.25 per hr.
  const want = Math.ceil(R / 1.25 / 5);
  assert.ok(adv.startsWith(`FORECAST: about ${want - 20} more drivers (${want} at 5.00 per driver per hr, the 09:00 rate) would clear ${d.label}'s ${R.toLocaleString('en-US')} by 11:45`), adv);
  assert.match(adv, /Assumes the whole pace goes to this deck\./);
  const line = nowLine(s.state, glovis, at)!;
  assert.equal(line.tone, 'warn');
  assert.equal(line.advice, adv);
  assert.deepEqual(line.action, { label: 'See decks', to: 'decks' });
  assert.deepEqual(paceAdvice(s.state, glovis, 11 * 60 + 50), []); // past the cutoff: nothing to advise
});

test('not useful: one tap is kept with where and what; a reason can follow; TEST and LIVE are summed apart', (tc) => {
  void tc;
  const f = (o: Partial<Feedback>): Feedback => ({ key: feedbackKey('V', o.at ?? '2026-10-12T10:00:00-04:00'), at: '2026-10-12T10:00:00-04:00', vesselId: 'V', isTest: false, where: 'now', text: 'x', reason: null, ...o });
  const all = [f({ at: '2026-10-12T10:00:00-04:00', where: 'now' }), f({ at: '2026-10-12T11:00:00-04:00', where: 'now', reason: 'Already knew' }), f({ at: '2026-10-12T12:00:00-04:00', where: 'reminder' }), f({ at: '2026-10-12T13:00:00-04:00', isTest: true, where: 'answer' })];
  const live = feedbackSummary(all, false);
  assert.equal(live.total, 3);
  assert.deepEqual(live.byWhere, [{ where: 'now', count: 2 }, { where: 'reminder', count: 1 }]);
  assert.deepEqual(live.byReason, [{ reason: 'No reason given', count: 2 }, { reason: 'Already knew', count: 1 }]);
  assert.equal(live.recent[0].at, '2026-10-12T12:00:00-04:00');
  assert.equal(feedbackSummary(all, true).total, 1);
});

test('not useful is stored on the phone, outside the vessel log, and its reason can be added after', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { openNodeDb } = await import('./nodeDb.ts');
  const dir = mkdtempSync(join(tmpdir(), 'vsa-fb-'));
  const db = openNodeDb(join(dir, 'vsa.db'));
  const store = await openStore(db);
  try {
    const at = '2026-10-12T10:00:00-04:00';
    await addFeedback(db, { key: feedbackKey('TEST-A', at), at, vesselId: 'TEST-A', isTest: true, where: 'answer', text: 'Hour saved', reason: null });
    await setFeedbackReason(db, feedbackKey('TEST-A', at), 'Wrong time');
    const got = await listFeedback(db);
    assert.equal(got.length, 1);
    assert.equal(got[0].reason, 'Wrong time');
  } finally { await store.close(); rmSync(dir, { recursive: true, force: true }); }
});
