// Van list: create slots, assign, change number/driver with history and an optional note, gassing signal, refusals,
// removal, and that old logs still replay. Through the real store replayed by project(). TEST data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backNotMarked, gassingAlert, parseVanSheet, project, vanTally, type Reject, type VsaEvent } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-VANS';

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-vans-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (at = '20:00'): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: `2026-09-21T${at}:00-04:00`, state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(OP, evs);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  const err = (evs: VsaEvent[] | Reject) => { assert.ok(!Array.isArray(evs), 'expected a refusal'); return (evs as Reject).error; };
  return { store, ctx, ok, err, get state() { return state; }, id: (n: number) => state.vans[n - 1].id };
}

test('How many vans?: one save creates that many empty slots; the list holds up to 30', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 14));
  assert.equal(s.state.vans.length, 14);
  assert.ok(s.state.vans.every((v, i) => v.slot === i + 1 && v.status === 'unassigned' && v.number === null && !v.lasher && v.gassed === null));
  assert.deepEqual(vanTally(s.state.vans), { total: 14, assigned: 0, out: 0, back: 0, notOut: 0, lashers: 0, gassed: 0, notGassed: 0, notRecorded: 0 });
  assert.equal(s.err(E.addVanSlotsEvents(s.ctx(), 17)), 'The list holds up to 30 vans. It has 14, so you can add 16 more.');
  assert.equal(s.err(E.addVanSlotsEvents(s.ctx(), 0)), 'Choose how many vans, 1 to 30.');
  await s.ok(E.addVanSlotsEvents(s.ctx(), 16)); // raising the count adds slots at the end
  assert.equal(s.state.vans.length, 30);
  assert.equal(s.state.vans[29].slot, 30);
});

test('first number into an empty slot is an assignment (no history line); a later swap is a change with the optional note', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 3));
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '211', driver: 'Sonja Hill' }, null));
  assert.equal(s.state.vans[0].number, '211');
  assert.deepEqual(s.state.vans[0].changes.filter((c) => !c.assignment), [], 'assignment is not a change');
  assert.equal(s.state.vans[0].status, 'notout');
  await s.ok(E.editVanEvents(s.ctx('10:42'), s.id(1), { number: '216' }, '211 would not start'));
  await s.ok(E.editVanEvents(s.ctx('11:05'), s.id(1), { driver: 'Reggie Tyson' }, null));
  const ch = s.state.vans[0].changes.filter((c) => !c.assignment);
  assert.deepEqual(ch.map((c) => c.text), ['Van 211 → 216', 'Driver Sonja Hill → Reggie Tyson']);
  assert.deepEqual(ch.map((c) => c.note), ['211 would not start', null], 'the note is optional');
  assert.match(ch[0].at, /10:42/, 'logged time is the processing time, labeled');
});

test('a van number sits on one row; a swapped-out number is free again; refusal names the row', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 3));
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '211' }, null));
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(2), { number: '211' }, null)), 'Van 211 is already on Van slot 1. A van number can be on one row only; change that row first.');
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(2), { number: ' 211 ' }, null)).includes('Van slot 1'), true);
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '216' }, null));
  await s.ok(E.editVanEvents(s.ctx(), s.id(2), { number: '211' }, null)); // freed by the swap; history keeps it
  assert.equal(s.state.vans[1].number, '211');
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(3), { number: 'bad number!' }, null)), 'A van number is 1 to 12 letters, digits or dashes.');
});

test('times: check-in before check-out is refused with both times; times need a van number; blank stays "not recorded"', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 2));
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(1), { out: { day: 1, hm: '09:00' } }, null)), 'Enter the van number before check-out, check-in, gas or gassing.');
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '109', out: { day: 1, hm: '09:00' } }, null));
  assert.equal(s.state.vans[0].status, 'out');
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(1), { in: { day: 1, hm: '08:30' } }, null)), 'Checked in Day 1 08:30 is before checked out Day 1 09:00.');
  assert.match(s.err(E.editVanEvents(s.ctx(), s.id(1), { in: { day: 1, hm: '25:99' } }, null)), /Checked in must be a day and a time/);
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { in: { day: 1, hm: '12:10' }, gas: '½' }, null));
  assert.equal(s.state.vans[0].status, 'back');
  assert.equal(s.state.vans[1].out, null, 'a blank time stays null, never filled');
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(1), { gas: 'Plenty' as never }, null)), 'Gas must be Full, ¾, ½, ¼ or Empty.');
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(1), { gas: '½' }, null)), 'Nothing to save: the van row is unchanged.');
});

test('lasher label, driver and number histories are separate and every field change is kept', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 2));
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '176', driver: 'Reggie Tyson', lasher: true }, null));
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { lasher: false, remarks: 'rear door sticks' }, 'moved to autos'));
  const v = s.state.vans[0];
  assert.equal(v.lasher, false);
  assert.deepEqual(v.changes.filter((c) => c.field === 'lasher').map((c) => c.text), ['Lasher van no → yes', 'Lasher van yes → no']);
  assert.deepEqual(vanTally(s.state.vans).lashers, 0);
  assert.equal(v.changes.find((c) => c.field === 'remarks')!.note, 'moved to autos');
});

test('gassing: three states, tally excludes unassigned slots, time only with Gassed, the shortcut marks only Back vans', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 5));
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '109', out: { day: 1, hm: '08:00' }, in: { day: 1, hm: '12:00' } }, null)); // Back
  await s.ok(E.editVanEvents(s.ctx(), s.id(2), { number: '120', out: { day: 1, hm: '08:00' } }, null)); // Out
  await s.ok(E.editVanEvents(s.ctx(), s.id(3), { number: '129', out: { day: 1, hm: '08:00' }, in: { day: 1, hm: '12:30' } }, null)); // Back
  await s.ok(E.editVanEvents(s.ctx(), s.id(4), { number: '130' }, null)); // Not out yet
  // slot 5 stays unassigned
  assert.deepEqual(vanTally(s.state.vans), { total: 5, assigned: 4, out: 1, back: 2, notOut: 1, lashers: 0, gassed: 0, notGassed: 0, notRecorded: 4 });
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(1), { gassedAt: { day: 1, hm: '17:00' } }, null)), 'A gassed time only goes with the status Gassed.');
  await s.ok(E.editVanEvents(s.ctx(), s.id(4), { gassed: 'not_gassed', gassedNote: 'out of service' }, 'never left the lot'));
  assert.deepEqual(backNotMarked(s.state.vans).map((v) => v.number), ['109', '129']);
  assert.equal(s.err(E.markGassedEvents(s.ctx(), [s.id(2)], null)), 'Only vans that are checked in and not yet marked can be marked gassed this way.');
  assert.equal(s.err(E.markGassedEvents(s.ctx(), [s.id(5)], null)), 'Only vans that are checked in and not yet marked can be marked gassed this way.');
  await s.ok(E.markGassedEvents(s.ctx(), backNotMarked(s.state.vans).map((v) => v.id), { day: 1, hm: '18:20' }));
  const t = vanTally(s.state.vans);
  assert.deepEqual([t.gassed, t.notGassed, t.notRecorded], [2, 1, 1]);
  assert.deepEqual(s.state.vans[0].gassedAt, { day: 1, hm: '18:20' });
  assert.equal(s.err(E.markGassedEvents(s.ctx(), [], null)), 'No vans to mark: none are checked in and unmarked.');
  // Moving a van from Gassed back to not recorded keeps the history.
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { gassed: null }, 'tapped by mistake'));
  assert.equal(s.state.vans[0].gassed, null);
  assert.equal(s.state.vans[0].gassedAt, null);
  assert.ok(s.state.vans[0].changes.some((c) => c.text === 'Gassed at end of vessel Gassed → not recorded' && c.note === 'tapped by mistake'));
});

test('gassing alert: only once vessel remaining is confirmed 0, counts vans not marked either way', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 3));
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '109' }, null));
  await s.ok(E.editVanEvents(s.ctx(), s.id(2), { number: '120', gassed: 'gassed' }, null));
  await s.ok(E.editVanEvents(s.ctx(), s.id(3), { number: '129' }, null));
  assert.equal(gassingAlert(s.state.vans, 512), null, 'vessel still working: no alert');
  assert.equal(gassingAlert(s.state.vans, null), null, 'unknown remaining is not finished');
  assert.equal(gassingAlert(s.state.vans, 0), '2 vans not marked gassed');
  await s.ok(E.editVanEvents(s.ctx(), s.id(3), { gassed: 'not_gassed' }, null));
  assert.equal(gassingAlert(s.state.vans, 0), '1 van not marked gassed');
});

test('removal needs a reason, stays in the log greyed, and a removed row cannot be edited', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 2));
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '109' }, null));
  assert.equal(s.err(E.removeVanEvents(s.ctx(), s.id(1), '  ')), 'Say why this van row is removed. It stays in the log, marked removed.');
  await s.ok(E.removeVanEvents(s.ctx(), s.id(1), 'van returned to TICO'));
  const v = s.state.vans[0];
  assert.ok(v.removed && v.removedReason === 'van returned to TICO' && v.number === '109', 'details kept, flagged removed');
  assert.equal(vanTally(s.state.vans).total, 1);
  assert.equal(s.err(E.editVanEvents(s.ctx(), s.id(1), { driver: 'X Y' }, null)), 'That van row was removed. Add a new slot instead.');
  await s.ok(E.editVanEvents(s.ctx(), s.id(2), { number: '109' }, null)); // a removed row's number is free
  assert.ok(s.state.log.events.some((e) => e.event_type === 'van.removed'), 'nothing deleted');
});

test('the engine itself refuses a van removal without a reason and keeps the reason rule for other corrections', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 1));
  const rm = E.removeVanEvents(s.ctx(), s.id(1), 'gone') as VsaEvent[];
  const bare = rm.map((e) => ({ ...e, payload: { ...e.payload, reason: null } }));
  const r = await s.store.append(OP, bare);
  assert.ok(!r.ok && /needs a reason/.test(r.error), JSON.stringify(r));
});

test('project() alone rebuilds the same vans from the stored events; vessel without vans is unchanged', async (tc) => {
  const s = await setup(tc);
  assert.deepEqual(s.state.vans, []);
  await s.ok(E.addVanSlotsEvents(s.ctx(), 2));
  await s.ok(E.editVanEvents(s.ctx(), s.id(1), { number: '109', driver: 'April Dennis', lasher: true }, null));
  const p = project(glovis, s.state.log.events, OP);
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(p.vans, s.state.vans);
  const back = await s.store.load(OP) as { state: State };
  assert.deepEqual(back.state.vans, s.state.vans, 'survives a reload from storage');
});

test('van sheet text: numbers and same-line names are proposed; row numbers, dates and gas marks are skipped; nothing is guessed', () => {
  const text = ['TICO SHUTTLE VAN / WAGONS CHECK IN/OUT SHEET', 'VESSEL: Glovis Challenge', 'DATE: 10-1-2026', '1 109', '2 120', '3 129 R Dunn', '4 130', 'TWM', '5 170', '6 172 Brandon Pace', '15', '16', '109', '14 202 Mary Brown'].join('\n');
  assert.deepEqual(parseVanSheet(text), [
    { number: '109', driver: null }, { number: '120', driver: null }, { number: '129', driver: 'R Dunn' }, { number: '130', driver: null },
    { number: '170', driver: null }, { number: '172', driver: 'Brandon Pace' }, { number: '202', driver: 'Mary Brown' },
  ]);
  assert.deepEqual(parseVanSheet(''), []);
});
