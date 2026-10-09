import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readDischargeSummary, brandFor, NOT_A_SUMMARY } from '../src/app/dischargeSummary.ts';
import type { Page } from '../src/app/layout.ts';

const load = (n: string): Page => JSON.parse(fs.readFileSync(`tests/fixtures/gameplan/${n}.json`, 'utf8').replace(/^﻿/, ''));

test('Hector Highway totals block: MB 920, BMW 566, MAS 58, LR 24, POV 10, H/H 47, page total 1,625', () => {
  const r = readDischargeSummary([load('6-discharge-summary-totals')]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.totals, [{ label: 'MB', count: 920 }, { label: 'BMW', count: 566 }, { label: 'MAS', count: 58 }, { label: 'LR', count: 24 }, { label: 'POV', count: 10 }]);
  assert.equal(r.hh, 47);
  assert.equal(r.pageTotal, 1625);
});

test('the table page has no totals block: refused with the reason, nothing guessed', () => {
  const r = readDischargeSummary([load('5-discharge-summary-table')]);
  assert.deepEqual(r, { ok: false, error: NOT_A_SUMMARY });
});

test('a dropped figure leaves the page total unmatched and says so', () => {
  const p = load('6-discharge-summary-totals');
  const i = p.words.findIndex((w) => w.t === '566');
  p.words.splice(i, 3); // drop "566 - BMW"
  const r = readDischargeSummary([p]);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.pageTotal, null); assert.match(r.note, /no matching page total/); }
});

test('conflicting figures for one brand are refused', () => {
  const w = (t: string, x: number) => ({ t, x, y: 10, w: 30, h: 15 });
  const q: Page = { width: 100, height: 100, words: [w('920', 0), w('-', 40), w('MB', 60), w('921', 120), w('-', 160), w('MB', 180)] };
  assert.equal(readDischargeSummary([q]).ok, false);
});

test('labels map to the vessel’s own brand names only when exactly one fits', () => {
  assert.equal(brandFor('MB', ['BMW', 'Mercedes-Benz']), 'Mercedes-Benz');
  assert.equal(brandFor('LR', ['BMW', 'Mercedes-Benz']), null);
  assert.equal(brandFor('MB', ['Mercedes', 'Mercedes Vans']), null);
});
