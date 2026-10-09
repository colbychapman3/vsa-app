// Smarter Ask (7d): the brief equals the screens, what-ifs are forecasts with reasons for refusal, the router pulls numbers only from typed words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project } from '../src/engine/index.ts';
import type { State } from '../src/storage/store.ts';
import type { KnowledgeIndex } from '../src/app/knowledge/search.ts';
import { alerts, answer, handoffPrompt, routeQuestion } from '../src/app/assistant.ts';
import { vesselBrief } from '../src/app/brief.ts';
import { canClear, driversChange, finishAtPace, paceWatch, workUntil } from '../src/app/whatif.ts';
import { decksView, hourlyView, snapshot } from '../src/app/view.ts';
import { glovis, toEvents, SCENARIOS, OP } from './scenarios.ts';

const INDEX = JSON.parse(readFileSync(new URL('../assets/knowledge/index.json', import.meta.url), 'utf8')) as KnowledgeIndex;
const build = (name: string): State => {
  const sc = SCENARIOS.find((x) => x.name === name)!;
  const s = project(glovis, toEvents(sc, OP), OP);
  assert.ok(s.ok);
  return s as State;
};
const working = () => build('mixed deck progress, working');

test('brief totals equal the screens on every scenario', () => {
  for (const sc of SCENARIOS) {
    const s = project(glovis, toEvents(sc, OP), OP);
    if (!s.ok) continue;
    const text = vesselBrief(s as State, glovis, 15 * 60).join('\n');
    const h = snapshot(s as State, glovis, 15 * 60).hero;
    assert.ok(text.includes(`${h.value} ${h.of}`), `${sc.name}: hero`);
    for (const r of decksView(s as State).rows) assert.ok(text.includes(`${r.label}: ${r.pill}`), `${sc.name}: ${r.label}`);
    for (const r of hourlyView(s as State, glovis).rows) assert.ok(text.includes(`${r.range}: ${r.count}`), `${sc.name}: ${r.range}`);
    assert.ok(!/H&H[^\n]*(add|plus)/i.test(text) || text.includes('never part of the auto counts'));
  }
});

test('the hand-off message carries the brief and no VIN-like or id text', () => {
  const s = working();
  const msg = handoffPrompt('why is the pace low', s, glovis, 15 * 60, INDEX, true, false, 'closest');
  assert.ok(msg.includes('Hourly field counts'));
  assert.ok(!msg.includes(glovis.vessel));
  assert.ok(!/\b[A-HJ-NPR-Z0-9]{17}\b/.test(msg.split('DOCUMENT PASSAGES')[0]));
});

test('workUntil skips a scheduled break', () => {
  assert.equal(workUntil(11 * 60, 2, [12 * 60]), 14 * 60); // 11:00 + 2 h of work across the 12:00 break
  assert.equal(workUntil(8 * 60, 2, [12 * 60]), 10 * 60);
});

test('finish at pace: a forecast with its assumptions; refused when unknown or impossible', () => {
  const s = working();
  const r = finishAtPace(s, glovis, 15 * 60, 100);
  if (s.vesselRemaining == null) assert.equal(r.ok, false);
  else if (s.vesselRemaining > 0) { assert.ok(r.ok); if (r.ok) assert.ok(r.lines.join(' ').includes('Assumes')); }
  assert.deepEqual(finishAtPace(s, glovis, 15 * 60, 0), { ok: false, error: 'Pace must be more than 0 autos per hour.' });
  const unk = build('Active deck with no count');
  const u = finishAtPace(unk, glovis, 15 * 60, 100);
  assert.equal(u.ok, false);
});

test('drivers and deck-clear what-ifs refuse without inputs and never invent a rate', () => {
  const fresh = build('start of shift');
  assert.equal(driversChange(fresh, glovis, 9 * 60, 60).ok, false);
  assert.equal(driversChange(fresh, glovis, 9 * 60, 0).ok, false);
  assert.equal(canClear(fresh, glovis, 9 * 60, 'nope').ok, false);
});

test('the router takes numbers only from the typed words', () => {
  const s = working();
  assert.deepEqual(routeQuestion('what if we run at 120 per hour', s), { k: 'whatif', w: 'pace', pace: 120 });
  assert.deepEqual(routeQuestion('finish time with 60 drivers', s), { k: 'whatif', w: 'drivers', drivers: 60 });
  const deck = s.decks[0];
  const i = routeQuestion(`can deck ${deck.label.replace(/^Deck\s*/i, '')} clear before the break`, s);
  assert.equal(i.k, 'whatif');
  assert.equal(routeQuestion('can deck 99 clear before the break', s).k, 'missing');
  assert.equal(routeQuestion('how many autos are remaining', s).k, 'remaining'); // old routes unchanged
  const a = answer({ k: 'whatif', w: 'pace', pace: -5 }, s, glovis, 15 * 60, INDEX);
  assert.equal(a.tags.length, 0);
});

test('pace watch never fires without a pace, a next break or an active deck count', () => {
  assert.deepEqual(paceWatch(build('start of shift'), glovis, 9 * 60), []);
  const s = working();
  assert.ok(Array.isArray(alerts(s, glovis, 15 * 60)));
});

import { traces } from '../src/app/brief.ts';
test('why traces use the state’s own numbers and route from plain questions', () => {
  const s = working();
  const t = Object.fromEntries(traces(s, glovis).map((x) => [x.key, x.lines.join(' ')]));
  assert.ok(t.remaining.includes(s.start.toLocaleString('en-US')));
  assert.ok(t.ha.includes(String(s.production.countedHours)));
  assert.deepEqual(routeQuestion('how is the pace worked out', s), { k: 'why', key: 'pace' });
  assert.deepEqual(routeQuestion('why is in transit that number', s), { k: 'why', key: 'transit' });
  assert.equal(answer({ k: 'why', key: 'clearby' }, s, glovis, 15 * 60, INDEX).tags[0], 'CALCULATED');
  assert.equal(routeQuestion('how many autos are remaining', s).k, 'remaining');
});

import { fitWatch, moveBreak, stopAt } from '../src/app/whatif.ts';
test('stop-time and move-break what-ifs: forecasts with assumptions, refused with reasons', () => {
  const s = working();
  const st = stopAt(s, glovis, 13 * 60, 16 * 60 + 30);
  if (s.production.pace == null) assert.equal(st.ok, false);
  else { assert.ok(st.ok); if (st.ok) assert.ok(st.lines.join(' ').includes('clear-by is not applied')); }
  assert.equal(stopAt(s, glovis, 13 * 60, 12 * 60).ok, false); // not after now
  assert.equal(moveBreak(s, glovis, 9 * 60, 11 * 60, 13 * 60).ok, false); // no break at 11:00
  const mv = moveBreak(s, glovis, 9 * 60, 12 * 60, 13 * 60);
  if (!mv.ok) assert.ok(mv.error.length > 0); else assert.ok(mv.lines.join(' ').includes('nothing is saved'));
});

test('router: stop at, move a break, and the ETA trace', () => {
  const s = working();
  assert.deepEqual(routeQuestion('what if we stop at 16:30', s), { k: 'whatif', w: 'stop', at: 16 * 60 + 30 });
  assert.deepEqual(routeQuestion('what if the 12:00 break moves to 13:00', s), { k: 'whatif', w: 'break', from: 720, to: 780 });
  assert.equal(routeQuestion('what if we stop at 25:00', s).k, 'missing');
  assert.deepEqual(routeQuestion('how is the eta worked out', s), { k: 'why', key: 'eta' });
  assert.equal(answer({ k: 'why', key: 'eta' }, s, glovis, 15 * 60, INDEX).tags[0], 'FORECAST');
  assert.equal(routeQuestion('how many autos are remaining', s).k, 'remaining');
});

test('ETA trace is a forecast, unknown when there is no pace, and uses the engine’s own rate', () => {
  const s = working();
  const t = traces(s, glovis).find((x) => x.key === 'eta')!;
  assert.ok(t.title.includes('FORECAST'));
  assert.ok(t.lines.join(' ').includes('never marked complete'));
  const fresh = traces(build('start of shift'), glovis).find((x) => x.key === 'eta')!;
  assert.ok(fresh.lines[0].startsWith('Unknown') || fresh.lines[0].startsWith('Nothing'));
});

test('fit watch lists an active low deck only', () => {
  const s = working();
  assert.deepEqual(fitWatch({ ...s, decks: s.decks.map((d) => ({ ...d, status: 'notStarted' as const })) } as State), []);
  const low = { ...s, decks: s.decks.map((d, i) => (i === 0 ? { ...d, status: 'active' as const, height: { ...d.height, level: 'hard' as const, current: 1.7 } } : { ...d, status: 'notStarted' as const })) } as State;
  const w = fitWatch(low);
  assert.equal(w.length, 1);
  assert.ok(w[0].includes('low deck'));
});
