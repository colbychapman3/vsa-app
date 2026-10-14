// Design B (Colby, 2026-10-11): the ship view and the Now line. Pure view models; every number is the engine's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/engine/index.ts';
import type { State } from '../src/storage/store.ts';
import { shipView } from '../src/app/ship.ts';
import { nowLine } from '../src/app/now.ts';
import { needsLook, snapshot } from '../src/app/view.ts';
import { driversFinish, levers, paceWatch, scenario } from '../src/app/whatif.ts';
import type { Baseline } from '../src/engine/index.ts';
import { glovis, SCENARIOS, toEvents } from './scenarios.ts';

type D = State['decks'][number];
const deck = (id: string, status: D['status'], hatches: [string, number | null, number | null][], rem: number | null, start = 100) =>
  ({ id, label: id, status, start, rem, hatches: hatches.map(([h, qty, r]) => ({ h, qty, rem: r, items: [] })) }) as unknown as D;
const ship = (decks: D[]) => shipView({ decks, vesselRemaining: null } as unknown as State);

const replay = () => {
  const events = toEvents(SCENARIOS.find((s) => s.name === 'mixed deck progress, working')!);
  return project(glovis, events, events[0].operation_id);
};

test('break-check scale: only at a break or shift end, ship against field, tone follows the gap', () => {
  const p = replay();
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(snapshot(p, glovis, 600).scale, null, 'nothing to weigh while working');
  const brk = { ...p, ops: { ...p.ops, phase: 'break', onBreak: true } } as State;
  const sc = snapshot(brk, glovis, 720).scale;
  if (p.progress == null || p.variance == null) { assert.equal(sc, null, 'ship progress unknown: no scale'); return; }
  assert.ok(sc);
  assert.equal(sc.ship, p.progress);
  assert.equal(sc.field, p.field);
  assert.equal(sc.tone, p.variance === 0 ? 'green' : p.variance > 0 ? 'orange' : 'red');
});

test('what if drivers: the finish moves earlier with more drivers and refuses without a per-driver rate', () => {
  const p = replay();
  assert.ok(p.ok);
  if (!p.ok || p.vesselRemaining == null || p.vesselRemaining === 0) return;
  const rated = p.periods.find((x) => x.driverRate.rate != null && typeof x.drivers === 'number');
  const a = driversFinish(p, glovis, 600, 20), b = driversFinish(p, glovis, 600, 40);
  if (!rated) { assert.equal(a.ok, false); return; }
  assert.ok(a.ok && b.ok);
  assert.ok(b.endAbs <= a.endAbs, 'more drivers never finish later');
  assert.equal(driversFinish({ ...p, periods: [] } as State, glovis, 600, 20).ok, false);
});

test('What if scenario: no factor moved is exactly the forecast; each factor moves the finish the way its basis says', () => {
  const p = replay();
  assert.ok(p.ok);
  if (!p.ok || p.vesselRemaining == null || p.vesselRemaining === 0 || p.eta.rate == null) return;
  const none = scenario(p, glovis, {});
  assert.ok(none.ok);
  if (!none.ok) return;
  assert.equal(none.deltaMin, 0);
  assert.ok(Number.isInteger(none.endAbs), 'a finish is a whole minute (the screen once showed 17:5.64)');
  assert.equal(Math.round(none.endAbs), Math.round(p.steady.etaAbs!), 'as now, the widget shows the finish the Snapshot shows');
  const lv = levers(p, glovis);
  if (lv.drivers) {
    const more = scenario(p, glovis, { drivers: lv.drivers.now + 10 }), fewer = scenario(p, glovis, { drivers: Math.max(1, lv.drivers.now - 10) });
    assert.ok(more.ok && fewer.ok);
    if (more.ok && fewer.ok) assert.ok(more.endAbs <= none.endAbs && fewer.endAbs >= none.endAbs, 'more drivers never finish later, fewer never earlier');
  }
  const lvP = lv.pace;
  assert.ok(lvP && lvP.now === p.eta.rate, 'the pace lever starts at the forecast\'s own pace');
  if (lvP) {
    const same = scenario(p, glovis, { pace: lvP.now }), faster = scenario(p, glovis, { pace: lvP.now + 40 }), slower = scenario(p, glovis, { pace: Math.max(1, lvP.now - 40) });
    assert.ok(same.ok && faster.ok && slower.ok);
    if (same.ok && faster.ok && slower.ok) {
      assert.equal(same.deltaMin, 0, 'the same pace is the forecast now');
      assert.ok(faster.endAbs <= none.endAbs && slower.endAbs >= none.endAbs, 'a faster pace never finishes later, a slower never earlier');
    }
    assert.equal(scenario(p, glovis, { pace: 0 }).ok, false, 'a pace of 0 is refused');
  }
  const s0 = scenario(p, glovis, { south: 0 }), s1 = scenario(p, glovis, { south: 1 }), sh = scenario(p, glovis, { south: 0.5 });
  assert.ok(s0.ok && s1.ok && sh.ok);
  if (s0.ok && s1.ok && sh.ok) {
    assert.ok(s0.endAbs <= sh.endAbs && sh.endAbs <= s1.endAbs, 'more Southside cars never finish earlier: 0% ≤ 50% ≤ 100%');
    assert.ok(none.endAbs <= s1.endAbs, 'the forecast now never runs later than every car stopping at the Southside time');
  }
  if (!lv.heavy) {
    const h = scenario(p, glovis, { heavy: 0.5 });
    assert.equal(h.ok, false, 'heavy cargo is refused without hours both with and without H/H');
    assert.ok(lv.heavyWhy);
  }
  assert.equal(scenario({ ...p, periods: [] } as State, glovis, { drivers: 20 }).ok, false);
});

test('pace watch uses the deck\'s own side stop: a mostly Southside deck is flagged against the Southside stop (Colby, 2026-10-14)', () => {
  const b = { start: '08:00', breaks: ['12:00'], destinations: [{ side: 'N', clearBy: 15, brands: ['BMW'] }, { side: 'S', clearBy: 30, brands: ['MBZ'] }] } as unknown as Baseline;
  const deck = (brandStart: Record<string, number>) => ({ id: 'D1', label: 'D1', status: 'active', rem: 150, brandStart }) as unknown as D;
  const st = (d: D, pace: number) => ({ production: { pace }, ops: { phase: 'working', day: 1 }, plan: { shiftEnd: null, nextStart: null }, decks: [d] }) as unknown as State;
  const at = 10 * 60;
  // 150 cars, 135 of them Southside: the Northside stop needs 86/hr (150 ÷ 1.75 h), the Southside stop needs 90/hr (135 ÷ 1.5 h).
  const w = paceWatch(st(deck({ BMW: 20, MBZ: 180 }), 88), b, at);
  assert.equal(w.length, 1);
  assert.match(w[0], /needed to clear before 11:30\.$/);
  // The same deck at 88/hr under the old Northside-only rule was fine; mostly Northside it still is.
  assert.deepEqual(paceWatch(st(deck({ BMW: 180, MBZ: 20 }), 88), b, at), []);
  // A brand no destination names counts as Northside: missing paperwork raises no new alarm.
  assert.deepEqual(paceWatch(st(deck({ XYZ: 200 }), 88), b, at), []);
  // Past the Northside stop there is nothing left to warn about.
  assert.deepEqual(paceWatch(st(deck({ MBZ: 200 }), 10), b, 11 * 60 + 50), []);
});

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
