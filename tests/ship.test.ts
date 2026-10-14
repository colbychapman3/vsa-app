// Design B (Colby, 2026-10-11): the ship view and the Now line. Pure view models; every number is the engine's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/engine/index.ts';
import type { State } from '../src/storage/store.ts';
import { shipView } from '../src/app/ship.ts';
import { nowLine } from '../src/app/now.ts';
import { needsLook } from '../src/app/view.ts';
import { glovis, SCENARIOS, toEvents } from './scenarios.ts';

type D = State['decks'][number];
const deck = (id: string, status: D['status'], hatches: [string, number | null, number | null][], rem: number | null, start = 100) =>
  ({ id, label: id, status, start, rem, hatches: hatches.map(([h, qty, r]) => ({ h, qty, rem: r, items: [] })) }) as unknown as D;
const ship = (decks: D[]) => shipView({ decks, vesselRemaining: null } as unknown as State);

test('Needs a look lists open discrepancies, low decks with cargo and unconfirmed heights; a clean vessel lists nothing', () => {
  const d = (id: string, level: string, status = 'active', cur = 1.7) => ({ id, label: id, status, height: { level, current: cur } }) as unknown as D;
  const st = (decks: D[], open: number) => ({ decks, issues: Array.from({ length: open }, () => ({ status: 'open' })).concat([{ status: 'resolved' }]) }) as unknown as State;
  assert.deepEqual(needsLook(st([d('D1', 'ok'), d('D2', 'hard', 'complete')], 0)), []);
  const rows = needsLook(st([d('D3', 'hard'), d('D4', 'soft'), d('D5', 'soft')], 2));
  assert.deepEqual(rows.map((r) => [r.tone, r.go]), [['orange', 'plan'], ['red', 'decks'], ['orange', 'plan']]);
  assert.equal(rows[0].text, '2 open discrepancies');
  assert.match(rows[1].text, /^D3 is a low deck \(1\.70 m\)/);
  assert.equal(rows[2].text, '2 deck heights unconfirmed: confirm on Plan');
});

test('a deck working hatches 3 and 2 lights those two sections; 4 and 1 show empty (Colby\'s comment)', () => {
  const r = ship([deck('D8', 'active', [['H4', 115, 0], ['H3', 120, 88], ['H2', 118, 105], ['H1', 117, 0]], 193)]).rows[0];
  assert.deepEqual(r.segs.map((g) => g && Math.round(g.fill! * 100)), [0, 73, 89, 0]);
  assert.equal(r.right, '193 left');
  assert.equal(r.a11y, 'D8: 193 left, in H3 and H2');
});

test('hatches sit in their H4 → H1 slot; a missing hatch leaves its slot blank, never shifted', () => {
  const r = ship([deck('D7', 'notStarted', [['H2', 132, 132], ['H1', 31, 31]], 163)]).rows[0];
  assert.deepEqual(r.segs.map((g) => g && g.h), [null, null, 'H2', 'H1']);
  assert.equal(r.tone, 'waiting');
  assert.equal(r.a11y, 'D7: 163 left, not started, in H2 and H1');
});

test('a complete deck is clear; a ramp or a deck counted as a whole is one band; unknown stays unknown', () => {
  const v = ship([
    deck('D12', 'complete', [['H4', 87, 0], ['H3', 155, 0]], 0),
    deck('D6', 'active', [['Ramp', 11, null]], 5, 11),
    deck('D3', 'active', [['H2', 50, null], ['H1', 50, null]], null),
  ]);
  assert.equal(v.rows[0].right, '✓ clear');
  assert.ok(v.rows[0].segs.every((g) => g == null || g.fill === 0));
  assert.equal(v.rows[1].segs.length, 1);
  assert.equal(Math.round(v.rows[1].segs[0]!.fill! * 100), 45);
  assert.equal(v.rows[2].segs.length, 1); // no hatch counts yet: one band for the deck
  assert.equal(v.rows[2].segs[0]!.fill, null); // unknown is not zero
  assert.equal(v.rows[2].right, 'count?');
  assert.equal(v.decksLeft, 2);
});

test('on the Glovis replay every hatch fill is the engine\'s remaining ÷ quantity, in paperwork order', () => {
  const day = SCENARIOS.find((s) => s.name === 'mixed deck progress, working')!;
  const events = toEvents(day);
  const p = project(glovis, events, events[0].operation_id);
  assert.ok(p.ok);
  if (!p.ok) return;
  const v = shipView(p);
  assert.deepEqual(v.rows.map((r) => r.id), p.decks.map((d) => d.id));
  for (const [i, d] of p.decks.entries()) {
    for (const g of v.rows[i].segs) {
      if (!g || v.rows[i].segs.length === 1) continue;
      const h = d.hatches.find((x) => x.h === g.h)!;
      if (d.status === 'complete') assert.equal(g.fill, 0);
      else if (h.rem != null && h.qty) assert.equal(g.fill, h.rem / h.qty);
    }
  }
});

test('Now line: a due count, then calm; nothing on a break', () => {
  const day = SCENARIOS.find((s) => s.name === 'mixed deck progress, working')!;
  const events = toEvents(day);
  const p = project(glovis, events, events[0].operation_id);
  assert.ok(p.ok);
  if (!p.ok) return;
  const last = p.periods.at(-1)!; // the last logged hour; the next one ends an hour later
  const endLast = Number(last.start.slice(0, 2)) * 60 + 60;
  const calm = nowLine(p, glovis, endLast + 10);
  assert.ok(calm && calm.tone !== 'due', JSON.stringify(calm)); // the hour that just ended is logged
  const due = nowLine(p, glovis, endLast + 70);
  assert.ok(due);
  if (due.tone === 'due') {
    assert.match(due.text, /^The \d{2}–\d{2} count is due\.$/);
    assert.deepEqual(due.action, { label: `Log ${due.text.slice(4, 9)}`, to: 'log' }); // the card carries the tap that answers it
  }
  assert.equal(calm.action, undefined); // calm has nothing to tap
  assert.equal(nowLine({ ...p, ops: { ...p.ops, phase: 'break' } } as State, glovis, endLast + 10), null);
});
