// Vessel complete (spec 7k): Colby marks it, never automatic. Open items stop a clean close; an override keeps them with a reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VsaEvent, Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { buildReport } from '../src/app/report.ts';
import { completeBlockers, completeLine, completionDue, completionStale, reportStatus } from '../src/app/complete.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-VESSEL-COMPLETE';

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-complete-'));
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

test('prompt is due only at remaining 0 and before it is marked; unknown remaining is not 0', async (tc) => {
  const s = await setup(tc);
  assert.equal(completionDue(s.state), false); // nothing done yet
  await s.finish();
  assert.equal(s.state.vesselRemaining, 0);
  assert.equal(completionDue(s.state), true);
  assert.deepEqual(completeBlockers(s.state), []);
  await s.ok(E.completeVesselEvents(s.ctx(), null));
  assert.equal(completionDue(s.state), false);
});

test('a clean mark: no reason needed, report says COMPLETE; at 0 without the mark it says ready to close', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  assert.equal(completeLine(s.state).text, 'INTERIM: ready to close, not confirmed');
  await s.ok(E.completeVesselEvents(s.ctx(), null));
  assert.deepEqual(s.state.completed, { time: s.state.completed!.time, override: false, reason: null, blockers: [] });
  assert.equal(completeLine(s.state).text, 'COMPLETE');
  const r = buildReport('completion', s.state, glovis, { isTest: true, generatedAt: '2026-09-21 20:05' });
  assert.equal(r.meta.at(-1), 'COMPLETE');
  assert.equal(r.interim, false);
  await s.refused(E.completeVesselEvents(s.ctx(), null), /already marked complete/);
});

test('open items stop a normal mark; an override needs a reason and the report lists the open items', async (tc) => {
  const s = await setup(tc);
  const open = completeBlockers(s.state).map((b) => b.text);
  assert.ok(open.some((t) => /autos still remaining|unknown/.test(t)));
  await s.refused(E.completeVesselEvents(s.ctx(), null), /Pick a reason to mark the vessel complete anyway/);
  await s.refused(E.completeVesselEvents(s.ctx(), '   '), /Pick a reason/);
  await s.ok(E.completeVesselEvents(s.ctx(), 'Remaining cars not ours'));
  const c = s.state.completed!;
  assert.equal(c.override, true);
  assert.equal(c.reason, 'Remaining cars not ours');
  assert.ok(c.blockers.length > 0);
  const line = completeLine(s.state).text;
  assert.match(line, /^COMPLETE: closed with \d+ open items?\./);
  assert.match(line, /Reason: Remaining cars not ours/);
  assert.equal(completionStale(s.state), false); // an override with cars left is intended
});

test('open issue and a field/ship gap are named; the engine refuses an override mark without a reason', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  await s.ok(E.openDiscrepancyEvents(s.ctx(), 'Damage count to settle', null, 'Damage'));
  assert.deepEqual(completeBlockers(s.state).map((b) => b.text), ['1 open issue.']);
  await s.refused(E.completeVesselEvents(s.ctx(), null), /1 open issue/);
  // The engine itself refuses an override event with no reason, even if the app were bypassed.
  const bad = E.completeVesselEvents({ ...s.ctx(), state: { ...s.state, issues: [] } }, null) as VsaEvent[];
  bad[0] = { ...bad[0], payload: { ...bad[0].payload, blockers: ['x'], reason: null } };
  await s.refused(bad, /needs a reason/);
});

test('reopen needs a reason, clears the mark, and the next 0 asks again; history stays in the log', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  await s.ok(E.completeVesselEvents(s.ctx(), null));
  await s.refused(E.reopenVesselEvents(s.ctx(), null), /Pick a reason for reopening/);
  await s.ok(E.reopenVesselEvents(s.ctx(), 'Marked by mistake'));
  assert.equal(s.state.completed, undefined);
  assert.equal(completionDue(s.state), true);
  assert.equal(s.state.log.events.filter((e) => e.payload.metric === 'vessel_complete').length, 2);
  await s.refused(E.reopenVesselEvents(s.ctx(), 'again'), /not marked complete/);
});

test('a clean mark goes stale when remaining leaves 0 (a deck set Active again)', async (tc) => {
  const s = await setup(tc);
  await s.finish();
  await s.ok(E.completeVesselEvents(s.ctx(), null));
  const d = s.state.decks[0];
  await s.ok(E.deckEvents(s.ctx(), { deck: d.id, status: 'active', skipped: false, hatchRemaining: {}, deckRemaining: 5, time: null }));
  assert.equal(completionStale(s.state), true);
  assert.equal(completeLine(s.state).interim, true);
});

test('Reports status chip: INTERIM, ready to close, COMPLETE, and COMPLETE with open items', async (tc) => {
  const s = await setup(tc);
  assert.deepEqual(reportStatus(s.state), { text: 'INTERIM', tone: 'orange' });
  await s.finish();
  assert.deepEqual(reportStatus(s.state), { text: 'Ready to close', tone: 'blue' });
  await s.ok(E.completeVesselEvents(s.ctx(), null));
  assert.deepEqual(reportStatus(s.state), { text: 'COMPLETE', tone: 'green' });
  const o = await setup(tc);
  await o.ok(E.completeVesselEvents(o.ctx(), 'Remaining cars not ours'));
  assert.deepEqual(reportStatus(o.state), { text: 'COMPLETE · open items', tone: 'orange' });
});

// Phase 0: the Snapshot button shows only when closeout is near.
import { nearZeroLimit, showMarkComplete } from '../src/app/complete.ts';
const sc = (o: Partial<Parameters<typeof showMarkComplete>[0]> = {}) => ({ start: 1000, vesselRemaining: 500, completed: null, decks: [{ status: 'active' }, { status: 'complete' }], ...o });
test('mark-complete button: threshold is 5% of start, rounded up, at least 1', () => {
  assert.equal(nearZeroLimit(1000), 50);
  assert.equal(nearZeroLimit(1969), 99); // 98.45 rounds up
  assert.equal(nearZeroLimit(10), 1); // tiny ship
  assert.equal(nearZeroLimit(1), 1);
  assert.equal(nearZeroLimit(20000), 1000); // huge ship
});
test('mark-complete button: unknown remaining hides it; 0, at the limit show it; just above hides it', () => {
  assert.equal(showMarkComplete(sc({ vesselRemaining: null })), false);
  assert.equal(showMarkComplete(sc({ vesselRemaining: 500 })), false);
  assert.equal(showMarkComplete(sc({ vesselRemaining: 51 })), false);
  assert.equal(showMarkComplete(sc({ vesselRemaining: 50 })), true);
  assert.equal(showMarkComplete(sc({ vesselRemaining: 0 })), true);
  assert.equal(showMarkComplete(sc({ start: 10, vesselRemaining: 2 })), false);
  assert.equal(showMarkComplete(sc({ start: 10, vesselRemaining: 1 })), true);
  assert.equal(showMarkComplete(sc({ start: 20000, vesselRemaining: 1000 })), true);
  assert.equal(showMarkComplete(sc({ start: 20000, vesselRemaining: 1001 })), false);
  assert.equal(showMarkComplete(sc({ start: 0, vesselRemaining: 0 })), false);
});
test('mark-complete button: every deck complete shows it even with remaining not 0 or unknown', () => {
  const all = [{ status: 'complete' }, { status: 'complete' }];
  assert.equal(showMarkComplete(sc({ decks: all, vesselRemaining: 400 })), true);
  assert.equal(showMarkComplete(sc({ decks: all, vesselRemaining: null })), true);
  assert.equal(showMarkComplete(sc({ decks: [] })), false);
});
test('mark-complete button: a marked or reopened vessel keeps its state; day 2 early on stays hidden', () => {
  assert.equal(showMarkComplete(sc({ completed: { override: true } })), true); // done bar / review state
  assert.equal(showMarkComplete(sc({ completed: { override: false }, vesselRemaining: 300 })), true);
  assert.equal(showMarkComplete(sc({ vesselRemaining: 900 })), false); // two-day ship after day 1: still hidden
});
