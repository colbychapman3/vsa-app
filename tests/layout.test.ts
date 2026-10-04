import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deskew, pageText, rowsOf, type Page, type Word } from '../src/app/layout.ts';

const load = (name: string): Page => JSON.parse(readFileSync(new URL(`./fixtures/gameplan/${name}.json`, import.meta.url), 'utf8').replace(/^﻿/, ''));
const w = (t: string, x: number, y: number, width = 40, h = 20): Word => ({ t, x, y, w: width, h });

test('words on a row join into cells; far-apart words are separate cells', () => {
  const rows = rowsOf({ width: 1000, height: 400, words: [w('475', 100, 100), w('BMW/', 150, 100), w('SSI', 500, 102), w('10', 700, 99)] });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].cells.map((c) => c.text), ['475 BMW/', 'SSI', '10']);
});

test('rows come out top to bottom regardless of input order', () => {
  const rows = rowsOf({ width: 1000, height: 400, words: [w('B', 100, 200), w('A', 100, 100), w('C', 100, 300)] });
  assert.deepEqual(rows.map((r) => r.cells[0].text), ['A', 'B', 'C']);
});

test('a tilted page is levelled: rows stay separate and keep their words', () => {
  const words: Word[] = [];
  const tan = Math.tan((2 * Math.PI) / 180); // 2 degrees clockwise
  for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) { const x = 100 + c * 250; words.push(w(`r${r}c${c}`, x, 100 + r * 60 + x * tan)); }
  const { tiltDeg } = deskew(words);
  assert.ok(Math.abs(tiltDeg - 2) < 0.6, `tilt ${tiltDeg}`);
  const rows = rowsOf({ width: 2000, height: 800, words });
  assert.equal(rows.length, 8);
  assert.ok(rows.every((r) => r.cells.length === 6));
  assert.deepEqual(rows[3].cells.map((c) => c.text), ['r3c0', 'r3c1', 'r3c2', 'r3c3', 'r3c4', 'r3c5']);
});

test('the real game plan photo: table rows are rebuilt (amount, port, cargo, deck, hatch, yard on one row)', () => {
  const text = pageText(load('7-working-plan-game-plan-form'));
  const row = text.split('\n').find((l) => l.includes('475'));
  assert.ok(row, text);
  assert.match(row!, /556/);
  assert.match(row!, /SSI/);
  assert.match(row!, /475 BMW\/ 24 LR\/ 53 MB\/ 4 pov/i);
  assert.match(row!, /\b10\b/);
  assert.match(row!, /ZONE 1\/ MBZ\/ AVP/);
  assert.ok(text.split('\n').some((l) => /1578/.test(l) && /TOTAL/.test(l)));
});

test('review 5: a 6° photo of the real cover page still reads every row and column', async () => {
  const { readGamePlan } = await import('../src/app/gamePlan.ts');
  const { complete } = await import('./gamePlanFixture.ts');
  const p = complete();
  const a = (6 * Math.PI) / 180, cx = p.width / 2, cy = p.height / 2;
  p.words = p.words.map((q) => {
    const x = q.x + q.w / 2 - cx, y = q.y + q.h / 2 - cy;
    return { ...q, x: Math.round(cx + x * Math.cos(a) - y * Math.sin(a) - q.w / 2), y: Math.round(cy + x * Math.sin(a) + y * Math.cos(a) - q.h / 2) };
  });
  const r = readGamePlan(p);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.plan.autos.map((x) => x.amount), [556, 94, 538, 84, 48, 130, 128]);
  assert.deepEqual(r.plan.problems, []);
});
