// Colby, 2026-10-10: hours are clock hours (the chief clerk records 07-08, 08-09, ... 23-00), whatever time the day starts.
// Through the real store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Baseline, type VsaEvent, type Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { hourlyView, hourOptions } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-CLOCK-HOURS';

async function setup(tc: { after: (fn: () => Promise<void>) => void }, baseline: Baseline = glovis) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-clock-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline, isTest: true })).ok);
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
    assert.equal(state.log.events.length, before);
  };
  return { ctx, ok, refused, get state() { return state; } };
}

test('07:30 start: the 07-08 hour holds 30 minutes for pace; H.A. still counts it as one hour; the break stays at 12:00', async (tc) => {
  const s = await setup(tc, { ...glovis, start: '07:30' });
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '07:00', count: 100 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 240 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '11:00', count: 150, stopMin: 45 }));
  const [h7, h8, h11] = s.state.periods;
  assert.deepEqual([h7.start, h7.min, h7.pace, h7.reason], ['07:00', 30, 200, 'Day started 07:30']);
  assert.deepEqual([h8.min, h8.pace], [60, 240]);
  assert.deepEqual([h11.start, h11.short, h11.min], ['11:00', true, 45]); // the pre-break hour is 11-12, not 11:30-12:00
  assert.equal(s.state.production.countedHours, 3); // H.A. = 490 ÷ 3 nominal hours
  assert.equal(Math.round(s.state.production.ha!), 163);
  assert.equal(s.state.production.prodMin, 135); // pace = 490 ÷ 2.25 productive hours
  assert.equal(hourlyView(s.state, { ...glovis, start: '07:30' }).rows[0].minNote, '30 min worked (day started 07:30) · pace 200/hr');
});

test('an hour before the day starts has no productive time, so it cannot hold a count', async (tc) => {
  const s = await setup(tc); // 08:00 start
  await s.refused(E.hourEvents(s.ctx(), { day: 1, start: '07:00', count: 50 }), /work started at 08:00, so this hour has no productive time/);
  assert.equal(hourOptions(s.state, glovis).hours[0].start, '08:00');
});
