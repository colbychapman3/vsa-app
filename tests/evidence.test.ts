// Photo evidence (Phase 6b): VIN checks, add / correct / remove through the real store replayed by project(),
// hour notes, deck counts, vessel isolation. TEST data only; no camera or files (the path is just text here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkVin, checkVins, evidencePath, project, type Reject, type VsaEvent } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { deckPhotos, decksView, hourlyView, photoHourNotes } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-EVID';
const OP2 = 'TEST-EVID-B';
const VIN = '1M8GDM9AXKP042788'; // a published valid example
const VIN2 = '1HGCM82633A004352';
const badDigit = VIN.slice(0, 8) + '1' + VIN.slice(9);

async function setup(tc: { after: (fn: () => Promise<void>) => void }, op = OP) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-evid-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: op, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(op) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: op, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(op, evs);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  // A form with every required field; the photo path is what the screen would compute.
  const form = (o: Partial<E.EvidenceForm> = {}): E.EvidenceForm => ({
    type: 'poor-stowage', deck: 'D9', hatch: 'H3', vins: [], notes: null, time: { day: 1, hm: '08:30' },
    photo: evidencePath(op, E.nextEventId(state)), reason: o.type === 'accident' || o.type === 'pre-stow-damage' ? 'Slippery deck' : '', ...o,
  });
  return { store, ctx, ok, form, get state() { return state; } };
}

test('VIN: a valid 17-character VIN passes; lowercase is only capitalized, never corrected', () => {
  assert.deepEqual(checkVin(VIN), { ok: true, vin: VIN, warning: null });
  assert.deepEqual(checkVin(` ${VIN.toLowerCase()} `), { ok: true, vin: VIN, warning: null });
});

test('VIN: wrong length, I/O/Q and symbols are refused with the reason', () => {
  assert.match((checkVin(VIN.slice(0, 16)) as Reject).error, /has 16 characters; a VIN has exactly 17/);
  assert.match((checkVin(`${VIN}0`) as Reject).error, /has 18 characters/);
  for (const c of ['I', 'O', 'Q']) assert.match((checkVin(VIN.slice(0, 10) + c + VIN.slice(11)) as Reject).error, new RegExp(`contains ${c}\\. VINs never use I, O or Q`));
  assert.match((checkVin(`${VIN.slice(0, 16)}-`) as Reject).error, /only contain letters and digits/);
  assert.equal(checkVin('').ok, false);
});

test('VIN: a bad check digit warns, never refuses', () => {
  const r = checkVin(badDigit);
  assert.ok(r.ok);
  assert.match((r as { warning: string }).warning, /does not pass the check digit; confirm it\./);
  assert.equal((r as { vin: string }).vin, badDigit); // kept exactly as entered
  assert.equal((checkVin(VIN2) as { warning: string | null }).warning, null);
});

test('VIN list: duplicates on one photo are refused; warnings are returned', () => {
  assert.deepEqual(checkVins([VIN, VIN2]), { ok: true, vins: [VIN, VIN2], warnings: [] });
  assert.match((checkVins([VIN, VIN.toLowerCase()]) as Reject).error, /listed twice on this photo/);
  const w = checkVins([badDigit]);
  assert.ok(w.ok && w.warnings.length === 1);
});

test('all four photo types save, keep the path, and survive a reload; VINs optional except accident', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'pre-stow-damage', reason: 'Latch/lashing contact' })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'poor-stowage', vins: [VIN2], notes: ' tight to the wall ' })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'accident', vins: [VIN, VIN2], reason: 'Driving too fast', hatch: 'H4' })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'pre-stow' })));
  const items = s.state.evidence;
  assert.deepEqual(items.map((x) => x.type), ['pre-stow-damage', 'poor-stowage', 'accident', 'pre-stow']);
  assert.deepEqual(items.map((x) => x.photo), items.map((x) => `evidence/${OP}/${x.id}.jpg`));
  assert.deepEqual([items[1].vins, items[1].notes, items[2].vins, items[2].hatch], [[VIN2], 'tight to the wall', [VIN, VIN2], 'H4']);
  assert.deepEqual(items.map((x) => x.at), items.map(() => ({ day: 1, hm: '08:30' })));
  const back = await s.store.load(OP) as { state: State };
  assert.deepEqual(back.state.evidence, s.state.evidence);
});

test('an accident without a VIN is refused; the message names it', async (tc) => {
  const s = await setup(tc);
  assert.deepEqual(E.addEvidenceEvents(s.ctx(), s.form({ type: 'accident', vins: [] })), { ok: false, error: 'An accident photo needs at least one VIN.' });
  assert.deepEqual(E.addEvidenceEvents(s.ctx(), s.form({ type: 'accident', vins: ['  '] })), { ok: false, error: 'An accident photo needs at least one VIN.' });
  assert.equal(s.state.evidence.length, 0);
});

test('every missing required field is named; nothing is saved', async (tc) => {
  const s = await setup(tc);
  const refused = (o: Partial<E.EvidenceForm>) => (E.addEvidenceEvents(s.ctx(), s.form(o)) as Reject).error;
  assert.equal(refused({ type: null }), 'Pick the photo type.');
  assert.equal(refused({ photo: null }), 'Take the photo first.');
  assert.equal(refused({ deck: '' }), 'Pick the deck.');
  assert.equal(refused({ hatch: '' }), 'Pick the hatch.');
  assert.equal(refused({ time: null }), 'Enter the time, or tap Now.');
  assert.equal(refused({ type: 'accident', vins: [VIN], reason: '  ' }), 'Pick a reason.');
  assert.equal(refused({ type: 'poor-stowage', reason: 'Slippery deck' }), 'Poor stowage and pre-stow photos take no reason: the photo type is the reason.');
  assert.equal(refused({ type: 'pre-stow-damage', reason: '' }), 'Pick a reason.');
  assert.match(refused({ time: { day: 1, hm: '25:99' } }), /isn.t valid\. Enter the day and a time as HH:MM/);
  assert.equal(s.state.evidence.length, 0);
});

test('a photo stored under the earlier rule (poor stowage with a reason) still replays; the vessel opens', async (tc) => {
  // Field bug 2026-10-01: TEST-RAIN-20260930-5 was saved by the first 6b build, before 63d9f05 made these types reasonless.
  const s = await setup(tc);
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'pre-stow-damage', reason: 'Slippery deck' })));
  const old = s.state.log.events.map((e) => (e.payload.evidence ? { ...e, payload: { ...e.payload, evidence: { ...e.payload.evidence, type: 'poor-stowage' as const } } } : e));
  const p = project(glovis, old, OP);
  assert.ok(!('error' in p), JSON.stringify(p));
  assert.equal(p.evidence[0].reason, 'Slippery deck', 'history is shown as recorded, never rewritten');
});

test('a deck or hatch that is not on the baseline is refused, by the form and by the engine', async (tc) => {
  const s = await setup(tc);
  assert.equal((E.addEvidenceEvents(s.ctx(), s.form({ deck: 'D99' })) as Reject).error, 'Deck D99 is not on this vessel.');
  assert.equal((E.addEvidenceEvents(s.ctx(), s.form({ deck: 'D8', hatch: 'H1' })) as Reject).error, 'Hatch H1 is not on deck D8.');
  // Past the form: the store still refuses.
  const ev = (E.addEvidenceEvents(s.ctx(), s.form()) as VsaEvent[])[0];
  const bad = { ...ev, payload: { ...ev.payload, evidence: { ...ev.payload.evidence!, deck: 'D99' } } };
  const r = await s.store.append(OP, [bad]);
  assert.ok(!r.ok && r.error === `Event ${ev.event_id}: Deck D99 is not on this vessel.`, JSON.stringify(r));
  const noVin = { ...ev, payload: { ...ev.payload, evidence: { ...ev.payload.evidence!, type: 'accident' as const, reason: 'Slippery deck' } } };
  const r2 = await s.store.append(OP, [noVin]);
  assert.ok(!r2.ok && /needs at least one VIN/.test(r2.error), JSON.stringify(r2));
  const dup = { ...ev, payload: { ...ev.payload, evidence: { ...ev.payload.evidence!, vins: [VIN, VIN] } } };
  assert.equal((await s.store.append(OP, [dup])).ok, false);
  assert.equal(s.state.evidence.length, 0);
});

test('the photo file must be this vessel folder and this event name', async (tc) => {
  const s = await setup(tc);
  const ev = (E.addEvidenceEvents(s.ctx(), s.form()) as VsaEvent[])[0];
  for (const photo of [`evidence/${OP2}/${ev.event_id}.jpg`, `evidence/${OP}/other.jpg`]) {
    const r = await s.store.append(OP, [{ ...ev, payload: { ...ev.payload, evidence: { ...ev.payload.evidence!, photo } } }]);
    assert.ok(!r.ok && r.error.includes(`the photo file must be evidence/${OP}/${ev.event_id}.jpg`), JSON.stringify(r));
  }
});

test('edit supersedes and keeps history; reason required; unchanged refused; the photo file is kept', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'accident', vins: [VIN], reason: 'Slippery deck' })));
  const x0 = s.state.evidence[0];
  assert.deepEqual(E.editEvidenceEvents(s.ctx(), x0.id, s.form({ type: 'accident', vins: [VIN], reason: 'Slippery deck' }), 'Typo'), { ok: false, error: 'Nothing to save: the photo record is unchanged.' });
  const change = s.form({ type: 'accident', vins: [VIN, VIN2], reason: 'Driving too fast', hatch: 'H2', time: { day: 1, hm: '09:05' } });
  assert.deepEqual(E.editEvidenceEvents(s.ctx(), x0.id, change, null), { ok: false, error: 'Pick a reason for changing this photo record. The old values are kept.' });
  await s.ok(E.editEvidenceEvents(s.ctx(), x0.id, change, 'Wrong time'));
  assert.equal(s.state.evidence.length, 1); // replaced, not added
  const x = s.state.evidence[0];
  assert.deepEqual([x.id, x.photo, x.vins, x.hatch, x.reason, x.at, x.edited], [x0.id, x0.photo, [VIN, VIN2], 'H2', 'Driving too fast', { day: 1, hm: '09:05' }, true]);
  assert.deepEqual(x.history.map((h) => [h.reason, h.vins.length, h.changeReason]), [['Slippery deck', 1, null], ['Driving too fast', 2, 'Wrong time']]);
  assert.ok(s.state.log.events.some((e) => e.event_id === x0.id && e.payload.evidence?.reason === 'Slippery deck')); // the original is still in the log
  // An edit that takes the last VIN off an accident is refused.
  assert.deepEqual(E.editEvidenceEvents(s.ctx(), x0.id, s.form({ type: 'accident', vins: [] }), 'Typo'), { ok: false, error: 'An accident photo needs at least one VIN.' });
});

test('remove appends an entry with its reason; the record stays; a removed photo cannot be edited', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form()));
  const id = s.state.evidence[0].id;
  assert.deepEqual(E.removeEvidenceEvents(s.ctx(), id, ' '), { ok: false, error: 'Pick a reason for removing this photo. It stays in the log, marked removed.' });
  const before = s.state.log.events.length;
  await s.ok(E.removeEvidenceEvents(s.ctx(), id, 'Taken by mistake'));
  assert.equal(s.state.log.events.length, before + 1);
  const x = s.state.evidence[0];
  assert.deepEqual([x.removed, x.removedReason, x.type, x.photo, x.history.length], [true, 'Taken by mistake', 'poor-stowage', `evidence/${OP}/${id}.jpg`, 1]);
  assert.deepEqual(E.editEvidenceEvents(s.ctx(), id, s.form(), 'Typo'), { ok: false, error: 'That photo was removed. Add a new photo instead.' });
  assert.deepEqual(E.removeEvidenceEvents(s.ctx(), id, 'Typo'), { ok: false, error: 'That photo was removed. Add a new photo instead.' });
  assert.deepEqual(E.removeEvidenceEvents(s.ctx(), 'nope', 'Typo'), { ok: false, error: 'That photo is not on this vessel.' });
});

test('project() alone rebuilds the same evidence from the stored events', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ vins: [VIN] })));
  await s.ok(E.editEvidenceEvents(s.ctx(), s.state.evidence[0].id, s.form({ vins: [VIN], notes: 'v2' }), 'Typo'));
  const p = project(glovis, s.state.log.events, OP);
  assert.ok(p.ok);
  assert.deepEqual(p.ok && p.evidence, s.state.evidence);
});

test('a photo never changes counts, ledgers, the forecast or any rate', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 253, drivers: 70 }));
  const snap = () => { const x = s.state; return JSON.stringify([x.field, x.fieldBalance, x.vesselRemaining, x.progress, x.variance, x.production, x.eta, x.periods, x.decks, x.brands]); };
  const before = snap();
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'accident', vins: [VIN] })));
  assert.equal(snap(), before);
});

test('Hourly: a photo inside an hour adds a note to that row; no time is listed as not provided; counts unchanged', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 253, drivers: 70 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 240, drivers: 70 }));
  const rowsBefore = hourlyView(s.state, glovis).rows.map((r) => [r.range, r.count, r.delta, r.drivers]);
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'accident', vins: [VIN], time: { day: 1, hm: '08:59' } })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'accident', vins: [VIN2], time: { day: 1, hm: '08:10' } })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'pre-stow', time: { day: 1, hm: '09:00' } })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'poor-stowage', time: { day: 1, hm: '12:10' } }))); // the break hour: no logged hour holds it
  const noTime = (E.addEvidenceEvents(s.ctx(), s.form()) as VsaEvent[]).map((e) => ({ ...e, occurred_at: null })); // the engine allows "time not provided"
  await s.ok(noTime);
  const v = hourlyView(s.state, glovis);
  assert.deepEqual(v.rows.map((r) => r.photos), [['Accident, D9 H3, 2 photos'], ['Pre-stow, D9 H3, 1 photo']]);
  assert.deepEqual(v.photosNoTime, ['Poor stowage, D9 H3, 1 photo']);
  assert.deepEqual(v.photosOutside, ['Poor stowage, D9 H3, 12:10, 1 photo']);
  assert.deepEqual(v.rows.map((r) => [r.range, r.count, r.delta, r.drivers]), rowsBefore);
  assert.equal(photoHourNotes(s.state).noTime.length, 1);
});

test('Decks: deck rows and hatches show photo counts; the sheet lists them; removed ones are not counted', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ deck: 'D9', hatch: 'H3', vins: [badDigit] })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ deck: 'D9', hatch: 'H3' })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ deck: 'D9', hatch: 'H1' })));
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ deck: 'D5', hatch: 'H2' })));
  let v = decksView(s.state);
  const row = (id: string) => v.rows.find((r) => r.id === id)!;
  assert.deepEqual([row('D9').photos, row('D5').photos, row('D1').photos], [3, 1, 0]);
  assert.deepEqual(row('D9').hatches.map((h) => [h.h, h.photos]), [['H4', 0], ['H3', 2], ['H2', 0], ['H1', 1]]);
  const list = deckPhotos(s.state, 'D9');
  assert.equal(list.current.length, 3);
  assert.equal(list.current[0].title, 'Poor stowage · H3');
  assert.equal(list.current[0].meta, '08:30');
  assert.equal(list.current[0].warn.length, 1); // the check digit warning is shown, not hidden
  await s.ok(E.removeEvidenceEvents(s.ctx(), s.state.evidence[1].id, 'Duplicate'));
  v = decksView(s.state);
  assert.equal(row('D9').photos, 2);
  const after = deckPhotos(s.state, 'D9');
  assert.deepEqual([after.current.length, after.removed.length], [2, 1]);
  assert.match(after.removed[0].meta, /Duplicate$/);
});

test('vessel isolation: a photo record appears only on its own vessel; another vessel refuses it', async (tc) => {
  const a = await setup(tc, OP);
  await a.ok(E.addEvidenceEvents(a.ctx(), a.form()));
  const dir = mkdtempSync(join(tmpdir(), 'vsa-evid2-'));
  const store2 = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store2.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store2.createVessel({ operationId: OP2, baseline: glovis, isTest: true })).ok);
  assert.equal(((await store2.load(OP2)) as { state: State }).state.evidence.length, 0);
  const r = await store2.append(OP2, a.state.log.events.filter((e) => e.payload.metric === 'evidence'));
  assert.equal(r.ok, false);
});

test('extra photos can be added to a saved record: replayed, reason required, kept in history, own-folder files only', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addEvidenceEvents(s.ctx(), s.form({ type: 'pre-stow-damage', reason: 'Slippery deck' })));
  const x0 = s.state.evidence[0];
  const more = [evidencePath(OP, `${E.nextEventId(s.state)}-m0`), evidencePath(OP, `${E.nextEventId(s.state)}-m1`)];
  const withMore = s.form({ type: 'pre-stow-damage', reason: 'Slippery deck', photo: x0.photo, more });
  assert.deepEqual(E.editEvidenceEvents(s.ctx(), x0.id, withMore, null), { ok: false, error: 'Pick a reason for changing this photo record. The old values are kept.' });
  await s.ok(E.editEvidenceEvents(s.ctx(), x0.id, withMore, 'New information'));
  const x = s.state.evidence[0];
  assert.deepEqual([x.photo, x.more, x.edited], [x0.photo, more, true]);
  assert.equal(deckPhotos(s.state, 'D9').current[0].more.length, 2);
  // The same photo twice, or a file from another vessel's folder, is refused.
  assert.match((E.editEvidenceEvents(s.ctx(), x0.id, { ...withMore, more: [...more, more[0]] }, 'Typo') as Reject).error, /different files/);
  const stray = s.store.append(OP, E.editEvidenceEvents(s.ctx(), x0.id, { ...withMore, more: [...more, evidencePath(OP2, 'x')] }, 'Typo') as VsaEvent[]);
  assert.equal((await stray).ok, false);
});
