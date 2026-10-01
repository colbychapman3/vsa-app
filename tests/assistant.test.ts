// Assistant (Phase 6d): intents, answers equal the view model, actions only from typed text, reminders. TEST data (Glovis Condor 101).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project } from '../src/engine/index.ts';
import type { State } from '../src/storage/store.ts';
import type { KnowledgeIndex } from '../src/app/knowledge/search.ts';
import { alerts, answer, checkIntent, findZone, parseAction, reminderPlan, routeQuestion } from '../src/app/assistant.ts';
import { snapshot } from '../src/app/view.ts';
import { glovis, toEvents, SCENARIOS, OP } from './scenarios.ts';

const INDEX = JSON.parse(readFileSync(new URL('../assets/knowledge/index.json', import.meta.url), 'utf8')) as KnowledgeIndex;
const build = (name: string): State => {
  const sc = SCENARIOS.find((x) => x.name === name)!;
  const s = project(glovis, toEvents(sc, OP), OP);
  assert.ok(s.ok);
  return s as State;
};
const working = () => build('mixed deck progress, working');
const noCount = () => build('Active deck with no count');
const fresh = () => build('start of shift');
const ask = (q: string, s: State, now = 15 * 60) => answer(routeQuestion(q, s), s, glovis, now, INDEX);

test('keyword rules route each family', () => {
  const s = working();
  const k = (q: string) => routeQuestion(q, s).k;
  assert.equal(k('How many autos are remaining?'), 'remaining');
  assert.equal(k('what is the pace this hour'), 'pace');
  assert.equal(k('H.A. so far'), 'pace');
  assert.equal(k('when will we finish'), 'eta');
  assert.equal(k('ETA?'), 'eta');
  assert.equal(k('Which decks are left?'), 'decks');
  assert.equal(k('what alerts are open'), 'alerts');
  assert.equal(k('distance to Zone 3'), 'distance');
  assert.equal(k('how many miles to Site 4'), 'distance');
  assert.equal(k('clear-by for Zone T'), 'clearby');
  assert.equal(k('what is the rule for lashing chains'), 'knowledge');
  assert.deepEqual(routeQuestion('status of deck 9', s), { k: 'deck', deck: 'D9' });
});

test('a deck or zone that is not on the vessel / directory is said so, never guessed', () => {
  const s = working();
  assert.deepEqual(routeQuestion('how many on deck 99', s), { k: 'missing', what: 'deck 99 is not on this vessel.' });
  assert.equal(routeQuestion('distance to Zone 77', s).k, 'missing');
  assert.equal(ask('distance to Zone 77', s).lines[0], 'Zone 77 is not in the terminal directory.');
});

test('Zone 1 and MB Field are different lots; MB Field alone means MBZ', () => {
  assert.equal(findZone('zone 1'), 'Zone 1 (MB Field)');
  assert.equal(findZone('MB Field'), 'MBZ (Mercedes)');
  assert.equal(findZone('mbz'), 'MBZ (Mercedes)');
  assert.equal(findZone('zone 3'), 'Zone 3');
});

test('remaining equals the Snapshot hero', () => {
  const s = working(), h = snapshot(s, glovis, 15 * 60).hero;
  const a = ask('how many remaining', s);
  assert.equal(a.lines[0], `${h.value} ${h.of}`);
  assert.equal(a.title, 'Vessel remaining');
  assert.equal(a.where, 'snap');
});

test('unknown stays unknown: an active deck with no count gives field balance and the reason', () => {
  const s = noCount(), h = snapshot(s, glovis, 15 * 60).hero;
  const a = ask('how many remaining', s);
  assert.equal(a.title, 'Field balance');
  assert.ok(a.lines.includes(h.unknownNote!));
  assert.ok(!a.lines.some((l) => /^0\b/.test(l)));
});

test('pace answer shows H.A. and pace with denominators, tagged CALCULATED', () => {
  const s = working(), v = snapshot(s, glovis, 15 * 60).ha;
  const a = ask('pace', s);
  assert.deepEqual(a.tags, ['CALCULATED']);
  assert.ok(a.lines.some((l) => l.includes(`H.A. ${v.value}/hr`) && l.includes(v.notes[0])));
  assert.ok(a.lines.some((l) => /^Pace \d+\/hr/.test(l) && /productive hr/.test(l)));
  assert.match(a.lines[0], /^Last logged hour 14:00–15:00: 241 autos/);
});

test('pace with no hours is unknown, not zero', () => {
  const a = ask('pace', fresh());
  assert.equal(a.lines[0], 'No hour logged yet.');
  assert.match(a.lines[1], /^H\.A\.: unknown/);
  assert.match(a.lines[2], /^Pace: unknown/);
});

test('ETA is FORECAST and equals the Snapshot tile; unknown when there is no production', () => {
  const s = working(), e = snapshot(s, glovis, 15 * 60).eta;
  const a = ask('eta', s);
  assert.deepEqual(a.tags, ['FORECAST']);
  assert.equal(a.lines[0], e.value);
  assert.ok(a.lines.some((l) => /never marked automatically/.test(l)));
  const u = ask('eta', fresh());
  assert.deepEqual(u.tags, []);
  assert.equal(u.lines[0], 'ETA unknown · Needs production data');
});

test('decks left: lists unfinished decks; a deck with no count says so', () => {
  const a = ask('decks left', noCount());
  assert.ok(a.lines.some((l) => l.startsWith('D9') && l.includes('remaining count needed')));
  assert.ok(!a.lines.some((l) => l.includes('Complete')));
});

test('distance: measured miles, never a trip direction or a time', () => {
  const s = working();
  const a = ask('distance to Zone 3', s);
  assert.match(a.lines[0], /^Zone 3: \d\.\d\d mi from Berth \d \(measured; one-way or round trip not stated\)$/);
  assert.ok(!/min|hour|round trip\b(?! not)/.test(a.lines[0].replace('one-way or round trip not stated', '')));
  assert.equal(ask('distance to', s).lines[0], 'Which zone? Type for example “distance to Zone 3”.');
});

test('clear-by uses the side offset once', () => {
  const s = working();
  assert.match(ask('clear by for Zone T', s).lines[0], /^Zone T: Southside, clear 30 min before the break/);
  assert.match(ask('clear by for Zone 3', s).lines[0], /^Zone 3: Northside, clear 15 min before the break/);
});

test('anything else searches the knowledge pack: passages as written with citations, or not found', () => {
  const s = working();
  const hit = ask('lashing', s);
  assert.ok(hit.passages && hit.passages.length > 0 && hit.passages.length <= 3);
  for (const p of hit.passages!) assert.ok(p.cite.length > 0 && p.text.length > 0);
  const none = ask('zzqxv blorp', s);
  assert.deepEqual(none.lines, ['Not found in the loaded documents.']);
  assert.equal(none.passages!.length, 0);
});

test('model pick: only a listed kind, and a deck or zone it names must exist', () => {
  const s = working();
  assert.deepEqual(checkIntent('{"kind":"eta"}', s, 'q'), { k: 'eta' });
  assert.deepEqual(checkIntent({ kind: 'deck', deck: '9' }, s, 'q'), { k: 'deck', deck: 'D9' });
  assert.equal(checkIntent({ kind: 'deck', deck: '99' }, s, 'q'), null);
  assert.deepEqual(checkIntent({ kind: 'distance', zone: 'Zone 3' }, s, 'q'), { k: 'distance', zone: 'Zone 3' });
  assert.equal(checkIntent({ kind: 'distance', zone: 'Zone 77' }, s, 'q'), null);
  assert.equal(checkIntent({ kind: 'save_count', value: 5 }, s, 'q'), null);
  assert.equal(checkIntent('not json', s, 'q'), null);
});

test('actions: values come only from the typed text', () => {
  assert.deepEqual(parseAction('log 140 at 10:00'), { k: 'hourly', count: 140, start: '10:00' });
  assert.deepEqual(parseAction('Log 1,140 autos at 9'), { k: 'hourly', count: 1140, start: '09:00' });
  assert.deepEqual(parseAction('log 140'), { k: 'hourly', count: 140, start: null });
  assert.deepEqual(parseAction('log 140 at 25:00'), { k: 'hourly', count: 140, start: null });
  assert.deepEqual(parseAction('note: Zone 3 closes at 14:00'), { k: 'note', text: 'Zone 3 closes at 14:00' });
  assert.deepEqual(parseAction('start a new vessel'), { k: 'vessel' });
  assert.equal(parseAction('log'), null);
  assert.equal(parseAction('what is the pace'), null);
});

test('alerts and reminders list open alerts; none → nothing scheduled', () => {
  const s = working();
  const a = alerts(s, glovis);
  assert.ok(a.length > 0);
  const p = reminderPlan(s, glovis, 9 * 60, true)!;
  assert.match(p.text, new RegExp(`^TEST · ${a.length} Plan alerts? open: `));
  assert.equal(p.atMin[0], 25);
  assert.equal(reminderPlan(s, glovis, 9 * 60, false)!.text.startsWith('TEST'), false);
  const calm = { ...s, issues: [], decks: s.decks.map((d) => ({ ...d, height: { ...d.height, level: d.height.level === 'soft' ? 'ok' : d.height.level } })) } as unknown as State;
  assert.equal(alerts(calm, glovis).length, 0);
  assert.equal(reminderPlan(calm, glovis, 9 * 60, true), null);
});

test('reminders pause in the 12:00 and 18:00 breaks, stop on a break or at shift end', () => {
  const s = working();
  const p = reminderPlan(s, glovis, 11 * 60 + 20, false)!; // 11:45, then 12:10–12:55 skipped, resumes 13:00+
  const clock = p.atMin.map((m) => 11 * 60 + 20 + m);
  assert.ok(clock.includes(11 * 60 + 45));
  assert.ok(!clock.some((t) => t >= 12 * 60 && t < 13 * 60));
  assert.ok(clock.some((t) => t >= 13 * 60));
  assert.ok(!reminderPlan({ ...s, ops: { ...s.ops, onBreak: true } } as State, glovis, 12 * 60 + 10, false));
  assert.equal(reminderPlan({ ...s, ops: { ...s.ops, shiftEnded: true } } as State, glovis, 17 * 60, false), null);
  const ends = reminderPlan({ ...s, plan: { ...s.plan, shiftEnd: '15:00' } } as State, glovis, 14 * 60, false)!;
  assert.deepEqual(ends.atMin, [25, 50]); // 14:25, 14:50; 15:15 is after shift end
});
