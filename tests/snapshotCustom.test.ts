// Phase 7i: the Snapshot layout rules, the field record box, and the ETA history rebuilt from the log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/engine/index.ts';
import { snapshot } from '../src/app/view.ts';
import { etaHistory } from '../src/app/etaHistory.ts';
import { BOXES, boxesFor, defaultLayout, hiddenBoxes, layoutText, moveBox, moveToTab, parseLayout, reorder, setHidden } from '../src/app/snapshotLayout.ts';
import { AFTERNOON, glovis, MORNING, SCENARIOS, toEvents } from './scenarios.ts';

const day = SCENARIOS.find((s) => s.name === 'mixed deck progress, working')!;
const events = toEvents(day);
const OPID = events[0].operation_id;

test('layout: the default shows every box on the Snapshot, the field record right under the vessel remaining', () => {
  const l = defaultLayout();
  assert.deepEqual(boxesFor(l, 'snap'), [...BOXES]);
  assert.deepEqual(boxesFor(l, 'snap').slice(0, 2), ['hero', 'field']);
});

test('layout: hide, show, reorder and move to a tab; the vessel balance can move but never hides', () => {
  let l = defaultLayout();
  l = setHidden(l, 'side', true);
  assert.ok(!boxesFor(l, 'snap').includes('side'));
  assert.deepEqual(hiddenBoxes(l), ['side']);
  assert.equal(setHidden(l, 'hero', true), l, 'hero is pinned');
  l = setHidden(l, 'side', false);
  assert.ok(boxesFor(l, 'snap').includes('side'));
  l = moveBox(l, 'ha', -1);
  assert.deepEqual(boxesFor(l, 'snap').slice(0, 4), ['hero', 'field', 'ha', 'eta']);
  assert.equal(moveBox(l, 'hero', -1), l, 'the first box cannot move up');
  l = reorder(l, 'brands', 'field'); // dragged onto the field record
  assert.deepEqual(boxesFor(l, 'snap').slice(0, 3), ['hero', 'brands', 'field']);
  l = moveToTab(l, 'side', 'hourly');
  assert.deepEqual(boxesFor(l, 'hourly'), ['side']);
  assert.ok(!boxesFor(l, 'snap').includes('side'));
  l = setHidden(l, 'side', true); // hidden on its new tab
  assert.deepEqual(boxesFor(l, 'hourly'), []);
  assert.deepEqual(boxesFor(moveToTab(l, 'side', 'plan'), 'plan'), ['side'], 'moving a hidden box shows it again');
});

test('layout: saved text round-trips; missing, corrupt or older layouts fall back safely', () => {
  let l = moveToTab(setHidden(defaultLayout(), 'ha', true), 'brands', 'decks');
  l = reorder(l, 'vessel', 'eta');
  assert.deepEqual(parseLayout(layoutText(l)), l);
  assert.deepEqual(parseLayout(null), defaultLayout());
  assert.deepEqual(parseLayout('not json'), defaultLayout());
  assert.deepEqual(parseLayout('{"order":["field","nope"],"hidden":["hero","side"],"tab":{"eta":"plan","ha":"mars"}}'), {
    order: ['field', ...BOXES.filter((b) => b !== 'field')], hidden: ['side'], tab: { ...defaultLayout().tab, eta: 'plan' },
  });
});

test('field record box: the official counts, apart from the vessel balance; the full hero rows are unchanged', () => {
  const p = project(glovis, events, OPID);
  assert.ok(p.ok);
  if (!p.ok) return;
  const v = snapshot(p, glovis, 15 * 60);
  const f = Object.fromEntries(v.fieldRecord.rows.map((r) => [r.k, r.v]));
  assert.equal(f['Field count'], v.hero.rows.find((r) => r.k === 'Field record')!.v);
  assert.equal(f['Counted hours'], String(p.production.countedHours));
  assert.match(f['Last hour logged'], /^14:00 · 241$/);
  assert.deepEqual(v.hero.heroRows.map((r) => r.k), ['Ship progress']);
  assert.match(v.fieldRecord.note, /H\/H is never added/);
});

test('ETA history: one point per logged hour, each equal to a direct projection of the log up to that hour', () => {
  const h = etaHistory(glovis, events, OPID);
  assert.equal(h.length, MORNING.length + AFTERNOON.length);
  const cuts = events.map((e, i) => ({ e, i })).filter(({ e }) => e.payload.metric === 'field_units' && e.scope.commodity == null && e.event_type === 'observation');
  h.forEach((pt, k) => {
    let end = cuts[k].i;
    while (end + 1 < events.length && events[end + 1].payload.period_start === cuts[k].e.payload.period_start) end++;
    const p = project(glovis, events.slice(0, end + 1), OPID);
    assert.ok(p.ok);
    if (p.ok) assert.equal(pt.etaAbs, p.vesselRemaining === 0 ? null : p.eta.etaAbs);
  });
  assert.equal(h[0].deltaMin === null || typeof h[0].deltaMin === 'number', true);
  assert.deepEqual(h.map((x) => x.hour), ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00']);
});

test('ETA history: the plus/minus line states the move and what the hour counted, and never a cause', () => {
  const h = etaHistory(glovis, events, OPID);
  const moved = h.filter((x) => x.deltaMin != null);
  assert.ok(moved.length > 0);
  for (const x of moved) {
    assert.match(x.text, /min (later|earlier) than after \d\d:\d\d\.|unchanged/);
    assert.match(x.text, /That hour counted [\d,]+/);
  }
  for (const x of h) assert.doesNotMatch(x.text, /because|caused|due to/i);
});

test('ETA history: a long log keeps only the latest points and an empty log gives none', () => {
  assert.deepEqual(etaHistory(glovis, [], OPID), []);
  assert.equal(etaHistory(glovis, events, OPID, 3).length, 3);
});
