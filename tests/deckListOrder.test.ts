// Deck lists show the deck being worked first: Active, Paused, Not started (Unknown with it), Complete last.
// View model only: engine state (state.decks) keeps its own order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/engine/index.ts';
import type { State } from '../src/storage/store.ts';
import { decksView, deckListRank, orderForList } from '../src/app/view.ts';
import { DEMO_DECKS, glovis, toEvents } from './scenarios.ts';

const r = (id: string, status: string) => ({ id, status });
const ids = (rows: { id: string }[]) => rows.map((x) => x.id);

test('all statuses: Active, Paused, Not started, Unknown, Complete', () => {
  const rows = [r('c', 'complete'), r('n', 'notStarted'), r('p', 'paused'), r('u', 'unknown'), r('a', 'active')];
  assert.deepEqual(ids(orderForList(rows)), ['a', 'p', 'n', 'u', 'c']);
});

test('ties keep their existing order inside each group; unknown sorts with Not started in place', () => {
  const rows = [r('n1', 'notStarted'), r('c1', 'complete'), r('a1', 'active'), r('u1', 'unknown'), r('a2', 'active'), r('n2', 'notStarted'), r('p1', 'paused'), r('c2', 'complete'), r('p2', 'paused')];
  assert.deepEqual(ids(orderForList(rows)), ['a1', 'a2', 'p1', 'p2', 'n1', 'u1', 'n2', 'c1', 'c2']);
});

test('an empty list stays empty; the input is not changed', () => {
  assert.deepEqual(orderForList([]), []);
  const rows = [r('c', 'complete'), r('a', 'active')];
  orderForList(rows);
  assert.deepEqual(ids(rows), ['c', 'a']);
});

test('an unrecognised status sorts with Not started', () => {
  assert.equal(deckListRank('something-new'), deckListRank('notStarted'));
});

test('decksView lists by status but leaves state.decks in engine order, with every deck present once', () => {
  const s = project(glovis, toEvents({ name: 'x', decks: { ...DEMO_DECKS, D9: { status: 'active' } } }), 'TEST-GLOVIS-PARITY') as unknown as State;
  const before = ids(s.decks);
  const rows = decksView(s).rows;
  assert.deepEqual(ids(s.decks), before);
  assert.deepEqual(ids(rows).sort(), [...before].sort());
  const rank = rows.map((x) => deckListRank(x.status));
  assert.deepEqual(rank, [...rank].sort((a, b) => a - b));
  const statuses = rows.map((x) => x.status);
  assert.equal(statuses[0], 'active'); // the deck being worked leads
  assert.equal(statuses.at(-1), 'complete'); // finished decks last
  assert.ok(statuses.includes('complete') && statuses.includes('notStarted'));
});
