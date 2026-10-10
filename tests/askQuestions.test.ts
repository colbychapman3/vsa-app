// Ask question set (7d step 4): hand-written questions, each routed to the right intent or declined with a reason.
// Rule: an answer is correct or declines; it never shows NaN, undefined or an invented value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project } from '../src/engine/index.ts';
import type { State } from '../src/storage/store.ts';
import type { KnowledgeIndex } from '../src/app/knowledge/search.ts';
import { answer, routeQuestion } from '../src/app/assistant.ts';
import { glovis, toEvents, SCENARIOS, OP } from './scenarios.ts';

const INDEX = JSON.parse(readFileSync(new URL('../assets/knowledge/index.json', import.meta.url), 'utf8')) as KnowledgeIndex;
const build = (name: string): State => {
  const sc = SCENARIOS.find((x) => x.name === name)!;
  const s = project(glovis, toEvents(sc, OP), OP);
  assert.ok(s.ok);
  return s as State;
};
const states = [build('mixed deck progress, working'), build('start of shift'), build('Active deck with no count')];
const deckNo = (s: State) => s.decks[0].label.replace(/^Deck\s*/i, '');

const Q: [string, string][] = [
  ['how many autos are remaining', 'remaining'], ['how many cars are left', 'remaining'], ['what is left on the vessel', 'remaining'],
  ['vessel remaining', 'remaining'], ['how many left', 'remaining'], ['remaining autos', 'remaining'],
  ['what is the pace this hour', 'pace'], ['what is our H.A.', 'pace'], ['hourly average please', 'pace'],
  ['what rate are we running', 'pace'], ['pace per hour', 'pace'],
  ['what is the ETA', 'eta'], ['when will we finish', 'eta'], ['when do we finish', 'eta'], ['what time are we done by', 'eta'],
  ['which decks are left', 'decks'], ['decks remaining', 'decks'], ['what decks', 'decks'],
  ['what alerts are open', 'alerts'], ['any open issues', 'alerts'],
  ['when did H/H finish', 'hh'], ['H/H status', 'hh'],
  ['distance to Zone 1', 'distance'], ['how far is Site 5', 'distance'], ['miles to MBZ', 'distance'], ['distance to zone q', 'missing'],
  ['what is the clear-by for MBZ', 'clearby'], ['clear by time', 'clearby'], ['cutoff for Gate 2', 'clearby'],
  ['how is the pace worked out', 'why'], ['how is H.A. worked out', 'why'], ['why is in transit that number', 'why'],
  ['how is the gap worked out', 'why'], ['how is clear-by worked out', 'why'], ['how is the eta worked out', 'why'],
  ['what if we run at 90 autos per hour', 'whatif'], ['what if we run at 120 per hour', 'whatif'], ['finish time with 60 drivers', 'whatif'],
  ['what if we stop at 16:30', 'whatif'], ['what if the 12:00 break moves to 13:00', 'whatif'],
  ['can deck 99 clear before the break', 'missing'], ['what if we stop at 25:00', 'missing'],
  ['what is the rule for shuttle vans', 'knowledge'], ['who approves a fit check', 'knowledge'],
];

test('the question set routes to the right intent', () => {
  assert.ok(Q.length >= 40);
  const s = states[0];
  for (const [q, kind] of Q) assert.equal(routeQuestion(q, s).k, kind, q);
  assert.equal(routeQuestion(`can deck ${deckNo(s)} clear before the break`, s).k, 'whatif');
  assert.equal(routeQuestion(`how is deck ${deckNo(s)} doing`, s).k, 'deck');
});

test('every answer, on every kind of vessel state, is plain words with no invented value', () => {
  for (const s of states) {
    for (const [q] of Q) {
      const a = answer(routeQuestion(q, s), s, glovis, 15 * 60, INDEX);
      const text = [a.title, ...a.lines].join(' ');
      assert.ok(a.lines.length > 0 || (a.passages?.length ?? 0) > 0, `${q}: empty answer`);
      assert.ok(!/NaN|undefined|Infinity|null/.test(text), `${q}: ${text}`);
    }
  }
});

test('what-ifs are tagged FORECAST when answered and untagged when declined', () => {
  for (const s of states) {
    for (const q of ['what if we run at 90 autos per hour', 'finish time with 60 drivers', 'what if we stop at 16:30', 'what if the 12:00 break moves to 13:00']) {
      const a = answer(routeQuestion(q, s), s, glovis, 9 * 60, INDEX);
      if (a.title === 'Cannot work that out') assert.equal(a.tags.length, 0, q); else assert.deepEqual(a.tags, ['FORECAST'], q);
    }
  }
});
