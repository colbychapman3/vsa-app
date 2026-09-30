import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/engine/index.ts';
import { buildReport, reportHtml } from '../src/app/report.ts';
import { glovis, toEvents, SCENARIOS, OP } from './scenarios.ts';

const state = (name: string) => {
  const sc = SCENARIOS.find((x) => x.name === name)!;
  const r = project(glovis, toEvents(sc, OP), OP);
  assert.ok(r.ok);
  return r;
};
const flat = (r: ReturnType<typeof buildReport>) => JSON.stringify(r);
const opts = { isTest: true, generatedAt: '12:05' };

test('break report at lunch (ship = field): reconciliation matches, INTERIM, phone time, FORECAST label', () => {
  const r = buildReport('break', state('lunch: ship = field (green)'), glovis, opts);
  assert.equal(r.interim, true);
  assert.deepEqual(r.meta.slice(1), ['TEST DATA', 'Break report', 'Generated 12:05 (phone time)', 'INTERIM: the vessel is not complete']);
  const rec = r.sections.find((x) => x.title === 'Ship vs field reconciliation')!;
  assert.match(rec.lines![0], /ship and field match/);
  assert.ok(rec.table!.rows.every((row) => row[3] === 'Match'));
  assert.match(flat(r), /FORECAST/);
});

test('ship ahead and field ahead are worded from the engine', () => {
  const a = buildReport('break', state('lunch: ship ahead (warning)'), glovis, opts);
  assert.match(a.sections.find((x) => x.title === 'Ship vs field reconciliation')!.lines![0], /ship is 10 ahead of field/);
  const f = buildReport('break', state('end of shift: field ahead (alarm)'), glovis, opts);
  assert.equal(f.title, 'End-of-shift report');
  assert.match(f.sections.find((x) => x.title === 'Ship vs field reconciliation')!.lines![0], /field exceeds ship by 2/);
});

test('an active deck with no count prints unknown, never 0', () => {
  const r = buildReport('break', state('Active deck with no count'), glovis, opts);
  const rem = r.sections.find((x) => x.title === 'Remaining cargo')!;
  assert.match(rem.lines![0], /^Vessel remaining: unknown of 1,969 \(unknown: needs a remaining count on D9/);
  assert.ok(rem.table!.rows.every((row) => row[1] !== '0'));
});

test('completion report: sections in order, analysis sections say Not recorded or carry Colby\'s note', () => {
  const s = state('lunch: ship = field (green)');
  const r = buildReport('completion', s, glovis, { ...opts, notes: { Bottlenecks: '  Ramp 2 blocked 10 min  ' } });
  assert.deepEqual(r.sections.map((x) => x.title.replace(/^\d+\. /, '')).slice(0, 4), ['Executive summary', 'Operation overview', 'Starting cargo', 'Discharge results']);
  const by = (t: string) => r.sections.find((x) => x.title.endsWith(t))!;
  assert.deepEqual(by('Bottlenecks').lines, ['Ramp 2 blocked 10 min']);
  assert.deepEqual(by('Lessons learned').lines, ['Not recorded.']);
  assert.match(by('Load-back').note!, /not tracked/);
  assert.equal(r.interim, true);
  // Protocol 9.3: all 15 sections, in order.
  assert.deepEqual(r.sections.slice(0, 15).map((x) => x.title.replace(/^\d+\. /, '')), ['Executive summary', 'Operation overview', 'Starting cargo', 'Discharge results', 'Hourly productivity', 'Deck progression', 'Reconciliation', 'Load-back', 'Timeline', 'Efficiency and trends', 'Destination and route effects', 'Bottlenecks', 'Corrections and discrepancies', 'Lessons learned', 'Recommendations']);
});

test('html escapes text and marks INTERIM', () => {
  const r = buildReport('break', state('lunch: ship = field (green)'), { ...glovis, vessel: 'A<b>&Co' }, opts);
  const html = reportHtml(r);
  assert.match(html, /A&lt;b&gt;&amp;Co/);
  assert.match(html, /class="meta interim">INTERIM/);
});
