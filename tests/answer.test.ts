// The answer after Save (Act II, Colby 2026-10-11): what changed with this entry, and only what needs action now.
// Through the real store, so before/after are the states the app actually holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Baseline, type VsaEvent, type Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { answerAfterSave } from '../src/app/answer.ts';
import { snapshot } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-ANSWER';

async function setup(tc: { after: (fn: () => Promise<void>) => void }, baseline: Baseline = glovis) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-answer-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(OP, evs as VsaEvent[]);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  return { ctx, ok, get state() { return state; } };
}

test('the first count answers with remaining, H.A. and ETA, labeled; a field count leaves vessel remaining alone (separate ledgers)', async (tc) => {
  const s = await setup(tc);
  const before = s.state;
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 200 }));
  const a = answerAfterSave(before, s.state, glovis, 9 * 60 + 5, 'Saved 08:00–09:00: 200 autos.');
  assert.equal(a.head, 'Saved 08:00–09:00: 200 autos.');
  assert.deepEqual(a.figs.map((f) => [f.k, f.tag]), [['Remaining', null], ['H.A.', 'CALCULATED'], ['ETA', 'FORECAST']]);
  const snap = snapshot(s.state, glovis, 9 * 60 + 5);
  assert.equal(a.figs[0].v, snap.hero.value); // the card never disagrees with the Snapshot
  assert.equal(a.figs[0].d, null); // vessel remaining moves with deck counts, never with field counts
  assert.equal(a.figs[1].v, '200');
  assert.equal(a.figs[1].d, null); // no H.A. before the first count: nothing to compare
});

test('a better hour says so: H.A. up and the forecast sooner; a worse hour says that too', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 200 }));
  let before = s.state;
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 260 }));
  let a = answerAfterSave(before, s.state, glovis, 10 * 60 + 5, 'x');
  assert.deepEqual(a.figs[1].d, { text: 'up 30', good: true }); // 200 → 230
  assert.equal(a.figs[2].d?.good, true);
  assert.match(a.figs[2].d!.text, /sooner$/);
  before = s.state;
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '10:00', count: 140 }));
  a = answerAfterSave(before, s.state, glovis, 11 * 60 - 20, 'x');
  assert.deepEqual(a.figs[1].d, { text: 'down 30', good: false }); // 230 → 200
  assert.equal(a.figs[2].d?.good, false);
  assert.match(a.figs[2].d!.text, /later$/);
});

test('quiet when nothing needs the user; the clear-by time shows once a break is within 90 minutes', async (tc) => {
  const s = await setup(tc);
  const before = s.state;
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 200 }));
  const early = answerAfterSave(before, s.state, glovis, 9 * 60 + 5, 'x');
  assert.ok(!early.watch.some((w) => /clears by/.test(w)));
  const late = answerAfterSave(before, s.state, glovis, 10 * 60 + 45, 'x'); // 75 min before 12:00
  assert.ok(late.watch.includes('12:00 break: Northside clears by 11:45.'), JSON.stringify(late.watch));
  assert.equal(late.quiet, null);
});

test('only new open items are raised: a standing one the user already knows about stays off the card', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 200 }));
  const before = s.state;
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 200 }));
  const a = answerAfterSave(before, s.state, glovis, 10 * 60 + 5, 'x');
  for (const w of a.watch) assert.ok(!/height not confirmed/.test(w), `standing item repeated: ${w}`);
  if (!a.watch.length) assert.equal(a.quiet, 'Nothing needs your attention right now.');
});

test('a deck update moves vessel remaining, and the card says by how much', async (tc) => {
  const s = await setup(tc);
  const before = s.state;
  await s.ok(E.deckEvents(s.ctx(), { deck: 'UPP', status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }));
  const a = answerAfterSave(before, s.state, glovis, 10 * 60, 'x');
  const cleared = before.vesselRemaining! - s.state.vesselRemaining!;
  assert.ok(cleared > 0);
  assert.deepEqual(a.figs[0].d, { text: `${cleared.toLocaleString('en-US')} fewer`, good: null });
});

test('logging a break raises the reconciliation warning on the card, never "nothing needs you" over it', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.deckEvents(s.ctx(), { deck: 'UPP', status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 10 })); // far fewer in the field than cleared from the ship
  const before = s.state;
  await s.ok(E.breakStartEvents(s.ctx(), { day: 1, hm: '12:00' }));
  const a = answerAfterSave(before, s.state, glovis, 12 * 60 + 1, 'Break started 12:00.');
  assert.ok(a.changed);
  assert.equal(a.quiet, null);
  assert.ok(a.watch.some((w) => /^Break reconciliation/.test(w)), JSON.stringify(a.watch));
});

test('a save that moves nothing (a note, a photo) is not dressed up as an answer', async (tc) => {
  const s = await setup(tc);
  const before = s.state;
  const a = answerAfterSave(before, before, glovis, 10 * 60, 'Photo saved.');
  assert.equal(a.changed, false);
});
