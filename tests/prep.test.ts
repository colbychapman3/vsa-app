// Phase 4: the ship card, the doubts and the watch list, on Colby's real Hector Highway 10A cover page (rule 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readGamePlan } from '../src/app/gamePlan.ts';
import { buildBaseline, deckFromDraft, groupAllocations, mergeGamePlan, type GameDrafts, type Built } from '../src/app/setup.ts';
import { doubts, shipCard, watchList } from '../src/app/prep.ts';
import { complete, form } from './gamePlanFixture.ts';

const empty = (): GameDrafts => ({ v: { vessel: '', date: '', port: '', drivers: '' }, allocs: [{ brand: '', autos: '', destination: '' }], decks: [] });
function read(page = complete(), berth = '2') {
  const r = readGamePlan(page); if (!r.ok) throw new Error(r.error);
  const m = mergeGamePlan(empty(), r.plan);
  const errs: string[] = [];
  const decks = m.drafts.decks.map((x) => { const d = deckFromDraft(x); errs.push(...d.errors); return d.deck; });
  const g = groupAllocations(m.drafts.allocs); errs.push(...g.errors);
  const b = buildBaseline({ vessel: m.drafts.v.vessel, date: m.drafts.v.date, port: m.drafts.v.port, berth, isTest: true, start: '07:00', drivers: null, sources: ['Game plan photo (APS cover page)'], destinations: g.destinations, decks, hh: m.hh, hhTotal: m.hhTotal });
  const built: Built = errs.length || !b.ok ? { ok: false, errors: [...errs, ...(b.ok ? [] : b.errors)] } : b;
  return { m, built, plan: r.plan };
}

test('the ship in one card: 1,578 autos, 7 decks, five destinations, Southside share by autos, H/H apart', () => {
  const { built, plan } = read();
  assert.ok(built.ok);
  if (!built.ok) return;
  const c = shipCard(built, plan.hhTotal);
  assert.equal(c.total, 1578);
  assert.equal(c.decks, 7);
  assert.deepEqual(c.destinations.map((d) => [d.name, d.side, d.autos]), [['BMW Field', 'N', 566], ['Zone 1 (MB Field)', 'S', 24], ['MBZ (Mercedes)', 'S', 920], ['AVP Yard', 'N', 10], ['Site 3', 'N', 58]]);
  assert.equal(c.southAutos, 944); // Zone 1 + MBZ
  assert.equal(c.southPct, Math.round((944 / 1578) * 100));
  assert.equal(c.hh, plan.hhTotal); // the printed total only
});

test('a destination with no count makes the Southside share unknown, never zero', () => {
  const { built } = read();
  if (!built.ok) return assert.fail('build');
  built.baseline.destinations[0] = { ...built.baseline.destinations[0], autos: undefined };
  const c = shipCard(built, null);
  assert.equal(c.southAutos, null);
  assert.equal(c.southPct, null);
});

test('a clean read asks only for the berth and the heights the paperwork never has', () => {
  const { m, built, plan } = read(complete(), '');
  const d = doubts({ built, gamePlanAutos: plan.autosTotal, problems: m.problems, berth: '', decks: m.drafts.decks });
  assert.deepEqual(d.map((x) => x.id), ['berth', ...m.drafts.decks.map((_, k) => `h${k}`)]);
  assert.equal(d[0].blocks, true);
  assert.ok(d.slice(1).every((x) => !x.blocks && x.kind === 'missing'));
  const withBerth = doubts({ built, gamePlanAutos: plan.autosTotal, problems: m.problems, berth: '2', decks: m.drafts.decks });
  assert.ok(!withBerth.some((x) => x.id === 'berth'));
  const typed = m.drafts.decks.map((x) => ({ ...x, current: '2.00' }));
  assert.deepEqual(doubts({ built, gamePlanAutos: plan.autosTotal, problems: m.problems, berth: '2', decks: typed }), []);
});

test('a total that differs from the game plan is a mismatch with the exact overage, and does not block', () => {
  const { m, built } = read();
  const d = doubts({ built, gamePlanAutos: 1600, problems: [], berth: '2', decks: m.drafts.decks.map((x) => ({ ...x, current: '2.00' })) });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, 'mismatch');
  assert.equal(d[0].text, 'Game plan total 1,600, decks add to 1,578 (difference 22).');
  assert.equal(d[0].blocks, false);
});

test('the real read as it came back: unreadable decks are named and block, each with its own message', () => {
  const { m, built, plan } = read(form());
  assert.equal(built.ok, false);
  const d = doubts({ built, gamePlanAutos: plan.autosTotal, problems: m.problems, berth: '2', decks: [] });
  assert.ok(d.length > 0 && d.every((x) => x.kind === 'unreadable' && x.blocks));
  assert.ok(d.some((x) => /D10: choose its hatches/.test(x.text)));
});

test('watch list: both sides named, unknown heights keep fit checks off, low decks are called out, H/H stays apart', () => {
  const { built } = read();
  if (!built.ok) return assert.fail('build');
  const w = watchList(built, { hhExists: true });
  assert.match(w[0], /Northside 15 min, Southside 30 min \(Zone 1 \(MB Field\), MBZ \(Mercedes\)\)/);
  assert.ok(w.some((l) => /Fit checks stay off for 7 decks with no height/.test(l)));
  assert.ok(w.some((l) => /FORECAST/.test(l) && /:05/.test(l)));
  assert.ok(w.some((l) => /never added to your autos/.test(l)));
  assert.ok(!w.some((l) => /Low deck/.test(l)));
  built.baseline.decks[0].heights = [{ m: 1.8, current: true }];
  assert.ok(watchList(built, { hhExists: false }).some((l) => /Low deck for shuttle vans \(under 1.85 m\): D10 1.80 m/.test(l)));
  assert.ok(!watchList(built, { hhExists: false }).some((l) => /High & Heavy/.test(l)));
});

test('an imported baseline (Glovis Condor 101, TEST) gets the same ship summary and watch list', async () => {
  const { readFileSync } = await import('node:fs');
  const { importBaseline } = await import('../src/app/setup.ts');
  const text = readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8');
  const b = importBaseline(text, true);
  assert.ok(b.ok, b.ok ? '' : b.errors.join('\n'));
  if (!b.ok) return;
  const c = shipCard(b, null);
  assert.equal(c.total, 1969);
  assert.ok(c.decks > 0);
  const w = watchList(b, { hhExists: false });
  assert.match(w[0], /^Clear-by/);
  assert.ok(w.some((l) => /Planned start/.test(l)));
});
