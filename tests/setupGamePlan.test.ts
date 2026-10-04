// Game plan → Setup drafts → checked baseline (spec phase-6e), on Colby's real Hector Highway 10A cover page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readGamePlan, type GamePlan } from '../src/app/gamePlan.ts';
import { buildBaseline, deckFromDraft, groupAllocations, loadListCheck, mergeGamePlan, verificationFor, type GameDrafts, type SetupForm } from '../src/app/setup.ts';
import { complete, form } from './gamePlanFixture.ts';

const plan = (p = complete()): GamePlan => { const r = readGamePlan(p); if (!r.ok) throw new Error(r.error); return r.plan; };
const empty = (): GameDrafts => ({ v: { vessel: '', date: '', port: '', drivers: '' }, allocs: [{ brand: '', autos: '', destination: '' }], decks: [] });

function build(d: GameDrafts, extra: Partial<SetupForm> = {}) {
  const errs: string[] = [];
  const decks = d.decks.map((x) => { const r = deckFromDraft(x); errs.push(...r.errors); return r.deck; });
  const g = groupAllocations(d.allocs);
  errs.push(...g.errors);
  const b = buildBaseline({ vessel: d.v.vessel, date: d.v.date, port: d.v.port, berth: '2', isTest: true, start: '07:00', drivers: null, sources: ['Game plan photo (APS cover page)'], destinations: g.destinations, decks, ...extra });
  return { errs, b };
}

test('the cover page fills vessel, date, port, every deck (split + hatches) and the brand/destination lines', () => {
  const m = mergeGamePlan(empty(), plan());
  assert.deepEqual(m.filled, ['vessel', 'date', 'port', 'destinations', 'decks']);
  assert.deepEqual(m.problems, []);
  assert.deepEqual(m.drafts.v, { vessel: 'HECTOR HIGHWAY IOA', date: '9/27/2026', port: 'SSI', drivers: '' });
  assert.deepEqual(m.drafts.decks.map((d) => [d.label, d.total, d.hatches.map((h) => h.h).join('')]),
    [['D10', '556', 'H4H3H2H1'], ['D11', '94', 'H2H1'], ['D12', '538', 'H4H3H2H1'], ['D4', '84', 'H3H2'], ['D3', '48', 'H3H2'], ['D2', '130', 'H3H2H1'], ['D1', '128', 'H3H2H1']]);
  assert.deepEqual(m.drafts.decks[0].split, [{ brand: 'BMW', qty: '475' }, { brand: 'LR', qty: '24' }, { brand: 'MB', qty: '53' }, { brand: 'POV', qty: '4' }]);
  assert.deepEqual(m.drafts.allocs, [
    { brand: 'BMW', autos: '566', destination: 'BMW Field' },
    { brand: 'LR', autos: '24', destination: 'Zone 1 (MB Field)' },
    { brand: 'MB', autos: '920', destination: 'MBZ (Mercedes)' },
    { brand: 'POV', autos: '10', destination: 'AVP Yard' },
    { brand: 'MAS', autos: '58', destination: 'Site 3' },
  ]);
  assert.deepEqual(m.hh, [{ deck: '5', qty: 33, cargo: "24 BUSES/ 5 STATIC/ CB/ 2 MAFI'S/ IMISC", yard: 'AVP' }, { deck: '3', qty: 14, cargo: '5 DT 1 CHASSIS/ 4 BUSES MAFI CAT 2 HYDREMA', yard: 'AVP' }]);
});

test('…and it saves as a checked baseline: 1,578 autos by brand, H/H kept apart, hatch counts unknown', () => {
  const m = mergeGamePlan(empty(), plan());
  const { errs, b } = build(m.drafts, { hh: m.hh });
  assert.deepEqual(errs, []);
  assert.ok(b.ok, b.ok ? '' : b.errors.join('\n'));
  if (!b.ok) return;
  assert.equal(b.total, 1578);
  assert.deepEqual(b.brandStart, { BMW: 566, LR: 24, MB: 920, POV: 10, MAS: 58 });
  assert.deepEqual(b.discrepancies, []);
  const d10 = b.baseline.decks.find((d) => d.label === 'D10')!;
  assert.deepEqual(d10.cargo, [{ brand: 'BMW', qty: 475 }, { brand: 'LR', qty: 24 }, { brand: 'MB', qty: 53 }, { brand: 'POV', qty: 4 }]);
  assert.ok(d10.hatches.every((h) => h.items.length === 0));
  assert.equal((b.baseline.hh as { qty: number }[]).reduce((s, x) => s + x.qty, 0), 47); // separate ledger, not in 1,578
});

test('the real read as it came back: what was read fills; the rest stays empty with the reason, and Review refuses until typed', () => {
  const m = mergeGamePlan(empty(), plan(form()));
  const d2 = m.drafts.decks.find((d) => d.label === 'D2')!;
  assert.deepEqual([d2.total, d2.split], ['', [{ brand: '', qty: '' }]]);
  assert.equal(m.drafts.decks.find((d) => d.label === 'D10')!.hatches.length, 0);
  const { errs } = build(m.drafts);
  assert.ok(errs.includes('D10: choose its hatches (H4 → H1).'));
  assert.ok(errs.some((e) => /^D2: /.test(e)));
});

test('fills only empty fields: typed values are never overwritten', () => {
  const d = empty();
  d.v.vessel = 'Hector Highway 10A';
  d.allocs = [{ brand: 'BMW', autos: '1', destination: 'BMW Field' }];
  d.decks = [{ label: 'D99', total: '', current: '', split: null, hatches: [] }];
  const m = mergeGamePlan(d, plan());
  assert.equal(m.drafts.v.vessel, 'Hector Highway 10A');
  assert.deepEqual(m.drafts.allocs, d.allocs);
  assert.deepEqual(m.drafts.decks, d.decks);
  assert.deepEqual(m.filled, ['date', 'port']);
});

test('deck split draft: total must equal the split; a split line needs brand and whole number', () => {
  const base = { label: 'D4', total: '84', current: '', hatches: [{ h: 'H3', items: [] }, { h: 'H2', items: [] }] };
  assert.deepEqual(deckFromDraft({ ...base, split: [{ brand: 'MB', qty: '80' }] }).errors, ['D4: deck total 84 but the brand split adds to 80.']);
  assert.deepEqual(deckFromDraft({ ...base, split: [{ brand: '', qty: '84' }] }).errors, ['D4: a quantity in the brand split needs a brand.']);
  assert.deepEqual(deckFromDraft({ ...base, split: [{ brand: 'MB', qty: '8.5' }] }).errors, ['D4: MB must be a whole number (got 8.5).', 'D4: deck total 84 but the brand split adds to 8.5.']);
  const ok = deckFromDraft({ ...base, split: [{ brand: 'MB', qty: '84' }] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.deck.cargo, [{ brand: 'MB', qty: 84 }]);
});

test('load list: match passes; a mismatch is listed per brand with the exact difference; override is recorded', () => {
  const brands = { BMW: 566, LR: 24, MB: 920, POV: 10, MAS: 58 };
  const match = loadListCheck({ BMW: '566', LR: '24', MB: '920', POV: '10', MAS: '58' }, brands, '47', 47);
  assert.equal(match.mismatch, false);
  assert.deepEqual(verificationFor(match, false).status, 'Load list matches the decks');
  const off = loadListCheck({ BMW: '566', LR: '24', MB: '910', POV: '10', MAS: '58' }, brands, '48', 47);
  assert.equal(off.mismatch, true);
  assert.deepEqual(off.discrepancies, ['MB: load list 910, decks 920 (difference 10).', 'H/H: load list 48, game plan 47 (difference 1).']);
  assert.equal(verificationFor(off, true).status, 'Game plan controls (Colby override)');
  assert.deepEqual(verificationFor(off, true).discrepancies, off.discrepancies);
  const none = loadListCheck({}, brands, '', 47);
  assert.equal(none.entered, false);
  assert.equal(verificationFor(none, false).status, 'Load list not checked');
  assert.deepEqual(loadListCheck({ MB: '9x' }, brands, '', null).errors, ['MB: type a whole number (got 9x).']);
});

test('a vessel built from the game plan runs in the engine: starts at 1,578; a deck count is taken; an overage is refused', async () => {
  const { project } = await import('../src/engine/index.ts');
  const { toEvents } = await import('./scenarios.ts');
  const m = mergeGamePlan(empty(), plan());
  const { b } = build(m.drafts, { hh: m.hh });
  assert.ok(b.ok);
  if (!b.ok) return;
  const op = 'TEST-HECTOR';
  const idle = project(b.baseline, [], op);
  assert.ok(idle.ok, idle.ok ? '' : idle.error);
  assert.equal(idle.ok && idle.start, 1578);
  const work = project(b.baseline, toEvents({ decks: { D10: { status: 'active', hatchRemaining: { H4: 100, H3: 100, H2: 100, H1: 100 } } } } as never, op), op);
  assert.ok(work.ok, work.ok ? '' : work.error);
  const d10 = work.ok ? work.decks.find((d: { id: string }) => d.id === 'D10') : null;
  assert.equal(d10?.rem, 400);
  assert.equal(d10?.brandRem.BMW, null); // multi-brand deck mid-work: brand remaining unknown, never split by guess
  const over = project(b.baseline, toEvents({ decks: { D4: { status: 'active', hatchRemaining: { H3: 90 } } } } as never, op), op);
  assert.equal(over.ok, false);
  assert.match(over.ok ? '' : over.error, /H3 exceeds D4’s 84 autos by 6/);
});

test('review: the typed H/H load list figure is always recorded, matched or not, game plan known or not', () => {
  const brands = { MB: 10 };
  const same = verificationFor(loadListCheck({ MB: '10' }, brands, '47', 47), false);
  assert.ok(same.checks.includes('H/H: load list 47 = game plan 47'));
  const unknown = verificationFor(loadListCheck({}, brands, '47', null), false);
  assert.equal(unknown.status, 'Load list partly checked'); // MB was not typed
  assert.ok(unknown.checks.includes('H/H: load list 47 (game plan count not read)'));
});

test('review 2: a pasted baseline with a bad brand split is refused, never crashes and never saves a brand "undefined"', async () => {
  const { importBaseline } = await import('../src/app/setup.ts');
  const { glovis } = await import('./scenarios.ts');
  for (const cargo of [5, [null], {}, [{ qty: 3 }], [{ brand: 'MB', qty: 2.5 }]]) {
    const b = JSON.parse(JSON.stringify(glovis));
    b.decks[0].cargo = cargo;
    const r = importBaseline(JSON.stringify(b), true);
    assert.equal(r.ok, false, JSON.stringify(cargo));
    assert.match(r.ok ? '' : r.errors.join(' '), /brand split \(cargo\) must be a list/);
  }
});

test('review 2: with some brands not typed, the status says partly checked (never "matches")', () => {
  const v = verificationFor(loadListCheck({ MB: '920' }, { MB: 920, BMW: 566 }, '', null), false);
  assert.equal(v.status, 'Load list partly checked');
  assert.deepEqual(v.missing, ['BMW not entered from the load list.']);
});

test('review 2: a row whose deck was not read adds nothing to the destination lines', () => {
  const p = complete();
  p.words = p.words.filter((w) => !(w.t === '11' && w.x === 949));
  const m = mergeGamePlan(empty(), plan(p));
  assert.ok(!m.drafts.allocs.some((a) => a.brand === 'MAS'));
  assert.equal(m.drafts.allocs.find((a) => a.brand === 'BMW')!.autos, '531');
});

test('review 4: H/H rows with no deck are not kept; the printed H/H TOTAL is stored; no row sum stands in for it', () => {
  const p = complete();
  p.words = p.words.filter((w) => !(w.t === 'TOTAL' && w.y > 1300)); // "47" is then read as a row with no deck
  const g = plan(p);
  const m = mergeGamePlan(empty(), g);
  assert.deepEqual(m.hh.map((h) => [h.deck, h.qty]), [['5', 33], ['3', 14]]);
  assert.ok(m.problems.some((x) => x.startsWith('An H/H row with no deck')), m.problems.join('\n'));
  assert.equal(m.hhTotal, null);
  assert.equal(mergeGamePlan(empty(), plan()).hhTotal, 47);
});

test('review 4: Plan shows the H/H count only when the rows match the printed TOTAL', async () => {
  const { hhText } = await import('../src/app/view.ts');
  assert.equal(hhText({ hh: [{ qty: 33 }, { qty: 14 }], hhTotal: 47 }), '47');
  assert.equal(hhText({ hh: [{ qty: 33 }], hhTotal: 47 }), '—');
  assert.equal(hhText({ hh: [{ qty: 33 }, { qty: 14 }], hhTotal: null }), '—');
  assert.equal(hhText({ hh: [{ qty: 33 }, { qty: null }] }), '—');
  assert.equal(hhText({ hh: [] }), '0'); // reference baselines (no hhTotal): as before
  assert.equal(hhText({}), '—');
});

test('review 4: load list typed but the H/H box left empty while there is H/H: listed as missing', () => {
  const c = loadListCheck({ MB: '10' }, { MB: 10 }, '', 47);
  assert.ok(c.missing.includes('H/H total not entered from the load list.'));
  assert.equal(verificationFor(c, false).status, 'Load list partly checked');
});

test('review 4: a pasted baseline with an empty brand split is refused', async () => {
  const { importBaseline } = await import('../src/app/setup.ts');
  const { glovis } = await import('./scenarios.ts');
  const b = JSON.parse(JSON.stringify(glovis));
  b.decks[0].cargo = [];
  assert.equal(importBaseline(JSON.stringify(b), true).ok, false);
});

test('review 5: H/H rows read but its TOTAL not: an empty H/H box is still listed as missing', () => {
  const c = loadListCheck({ MB: '10' }, { MB: 10 }, '', null, true);
  assert.ok(c.missing.includes('H/H total not entered from the load list.'));
  assert.equal(verificationFor(c, false).status, 'Load list partly checked');
});
