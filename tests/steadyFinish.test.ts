// Steady finish (Colby, 2026-10-11, option A): logging an hourly count with no deck update must not push the finish an hour later.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carriedRemaining, productiveMinutes, type Schedule, type VsaEvent, type Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
const steady = (st: State, _b: unknown) => st.steady; // the engine's finish (project() builds it)
import { snapshot } from '../src/app/view.ts';
import { answerAfterSave } from '../src/app/answer.ts';
import { etaHistory } from '../src/app/etaHistory.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const S: Schedule = { dayStart: '08:00', breaks: ['12:00', '18:00'], clearByMin: 15 };
const at = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const t = (hm: string) => ({ day: 1, hm });

test('carry = pace × working minutes between the deck count and the last logged hour', () => {
  const r = carriedRemaining({ remaining: 400, rate: 240, deckAsOfAbs: at('09:00'), fromAbs: at('10:00'), schedule: S });
  assert.deepEqual(r, { remaining: 160, cars: 240, sinceMin: 60 });
});

test('the break and its clear-by are not working time in the carry', () => {
  const r = carriedRemaining({ remaining: 900, rate: 240, deckAsOfAbs: at('11:00'), fromAbs: at('13:00'), schedule: S });
  assert.equal(r?.sinceMin, 45); // 11:00–11:45; 12:00 break to 13:00
  assert.equal(r?.cars, 180);
});

test('nothing to carry when the deck count is as new as the anchor, or when it cannot be done safely', () => {
  const base = { remaining: 400, rate: 240, deckAsOfAbs: at('10:00'), fromAbs: at('10:00'), schedule: S };
  assert.equal(carriedRemaining(base), null);
  assert.equal(carriedRemaining({ ...base, deckAsOfAbs: at('11:00') }), null); // deck newer than the anchor
  assert.equal(carriedRemaining({ ...base, deckAsOfAbs: null, fromAbs: at('11:00') }), null); // unknown age
  assert.equal(carriedRemaining({ ...base, deckAsOfAbs: at('08:00'), rate: null, fromAbs: at('11:00') }), null);
  assert.equal(carriedRemaining({ ...base, remaining: null, deckAsOfAbs: at('08:00'), fromAbs: at('11:00') }), null);
  assert.equal(carriedRemaining({ ...base, remaining: 100, deckAsOfAbs: at('08:00'), fromAbs: at('11:00') }), null); // would reach zero
});

const OP = 'TEST-STEADY';
async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-steady-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  let clock = '20:00'; // the phone clock at save (processing time)
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: `2026-09-21T${clock}:00-04:00`, state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(OP, evs as VsaEvent[]);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  return { ctx, ok, get state() { return state; }, set clock(v: string) { clock = v; } };
}

// Every deck complete except D9, whose count is entered at 08:30 (so the ship's remaining is known).
async function shipAt0830(s: Awaited<ReturnType<typeof setup>>) {
  for (const d of glovis.decks) if (d.id !== 'D9') await s.ok(E.deckEvents(s.ctx(), { deck: d.id, status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: t('08:30') }));
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D9', status: 'active', skipped: false, hatchRemaining: { H4: 24, H3: 123, H2: 103, H1: 69 }, deckRemaining: null, time: t('08:30') }));
}

test('logging an hourly count with no deck update keeps the finish steady, and vessel remaining does not move', async (tc) => {
  const s = await setup(tc);
  await shipAt0830(s);
  assert.equal(s.state.vesselRemaining, 319);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  const before = s.state;
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 100 }));
  const after = s.state;
  assert.equal(after.vesselRemaining, 319); // the counted number is untouched
  const raw = after.eta.etaAbs! - before.eta.etaAbs!;
  assert.ok(raw >= 55, `without the carry the raw forecast jumps about an hour (${raw} min)`);
  const stB = steady(before, glovis), stA = steady(after, glovis);
  assert.ok(stA.carry && stA.carry.cars > 0);
  assert.ok(Math.abs(stA.etaAbs! - stB.etaAbs!) <= 10, `steady finish moved ${stA.etaAbs! - stB.etaAbs!} min`);
  assert.equal(snapshot(after, glovis, at('10:05')).eta.notes.some((n) => /since the last deck update \(est\.\)/.test(n)), true);
  const a = answerAfterSave(before, after, glovis, at('10:05'), 'x');
  const fin = a.figs.find((f) => f.k === 'Finish')!;
  assert.ok(fin.d === null || !/hr/.test(fin.d.text), `the card should not report an hour-sized move: ${fin.d?.text}`);
});

test('a deck update newer than the last hour needs no carry', async (tc) => {
  const s = await setup(tc);
  await shipAt0830(s);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 100 }));
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D9', status: 'active', skipped: false, hatchRemaining: { H4: 24, H3: 100, H2: 90, H1: 60 }, deckRemaining: null, time: t('10:05') }));
  const st = steady(s.state, glovis);
  assert.equal(st.carry, null);
  assert.equal(st.etaAbs, s.state.eta.etaAbs);
});

async function noTimeDecks(s: Awaited<ReturnType<typeof setup>>) {
  for (const d of glovis.decks) if (d.id !== 'D9') await s.ok(E.deckEvents(s.ctx(), { deck: d.id, status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: null }));
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D9', status: 'active', skipped: false, hatchRemaining: { H4: 24, H3: 123, H2: 103, H1: 69 }, deckRemaining: null, time: null }));
}

test('a deck saved with no event time: its save time bounds its age, so the carry can only be smaller', async (tc) => {
  const s = await setup(tc);
  s.clock = '08:40';
  await noTimeDecks(s);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 100 }));
  const st = steady(s.state, glovis);
  assert.equal(st.carry?.sinceMin, 80); // 08:40 to the end of the 09-10 hour
  assert.equal(s.state.vesselRemaining, 319);
});

test('a save time after the last logged hour means nothing to carry: the forecast is left as it is', async (tc) => {
  const s = await setup(tc);
  s.clock = '20:00';
  await noTimeDecks(s);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 100 }));
  const st = steady(s.state, glovis);
  assert.equal(st.carry, null);
  assert.equal(st.etaAbs, s.state.eta.etaAbs);
});

test('working minutes never count a day twice: Day 1 windows stop at midnight', () => {
  // No shift end set: Day 1 runs 17:00–17:45 and 19:00–24:00, then Day 2 08:00–09:00 (Day 2 starts at the Day 1 start).
  assert.equal(productiveMinutes(S, at('17:00'), 1440 + at('09:00')), 45 + 300 + 60);
});

test('across the night the carry needs Day 1\'s end; with the logged end of shift it stops there', async (tc) => {
  const s = await setup(tc);
  s.clock = '15:10';
  for (const d of glovis.decks) if (d.id !== 'D9') await s.ok(E.deckEvents(s.ctx(), { deck: d.id, status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null, time: t('15:00') }));
  await s.ok(E.deckEvents(s.ctx(), { deck: 'D9', status: 'active', skipped: false, hatchRemaining: { H4: 24, H3: 123, H2: 103, H1: 69 }, deckRemaining: null, time: t('15:00') }));
  for (const h of ['13:00', '14:00']) await s.ok(E.hourEvents(s.ctx(), { day: 1, start: h, count: 40 }));
  await s.ok(E.endShiftEvents(s.ctx(), t('16:00'), 'N'));
  await s.ok(E.nextDayEvents(s.ctx(), { day: 2, hm: '08:00' }));
  await s.ok(E.hourEvents(s.ctx(), { day: 2, start: '08:00', count: 40 }));
  const st = steady(s.state, glovis);
  // 15:00 to the logged 16:00 end less the longer 30-min stop = 30 min on Day 1, plus Day 2 08:00–09:00: never the night.
  assert.equal(st.carry?.sinceMin, 90);
});

test('finish history plots the same finish the tile shows', async (tc) => {
  const s = await setup(tc);
  await shipAt0830(s);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 100 }));
  const pts = etaHistory(glovis, s.state.log.events, s.state.operationId);
  assert.equal(pts.at(-1)!.etaAbs, steady(s.state, glovis).etaAbs);
});

test('the answer card does not blame the missing deck update when the carry already cancelled it', async (tc) => {
  const s = await setup(tc);
  await shipAt0830(s);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  const before = s.state;
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 60 }));
  const a = answerAfterSave(before, s.state, glovis, at('10:05'), 'x');
  assert.ok(!/no deck update/.test(a.why ?? ''), a.why ?? '');
});
