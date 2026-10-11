// The view model must print exactly what the tracker printed in the reference
// captures (docs/reference/screens/). TEST data only (Glovis Condor 101).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, type VsaEvent, type HourEntry } from '../src/engine/index.ts';
import type { State } from '../src/storage/store.ts';
import { badges, subtitles, snapshot, decksView, deckSheet, hourlyView, planView, hourOptions, offerCopy, unsavedNote } from '../src/app/view.ts';
import { glovis, toEvents, DEMO_DECKS, LUNCH_DECKS, MORNING, SCENARIOS } from './scenarios.ts';

const OP = 'TEST-VIEW';
const at = (hm: string) => `2026-09-21T${hm}:00-04:00`;

// Append extra events after a toEvents() batch, continuing the sequence.
function extend(evs: VsaEvent[], more: [VsaEvent['event_type'], string, VsaEvent['payload']['value'], { deck?: string; at?: string; reason?: string; supersedes?: string; target?: string; period?: [string, string] }][]) {
  for (const [type, metric, value, o] of more) {
    const n = evs.length + 1;
    evs.push({
      schema_version: '1.0', event_id: `X${n}`, operation_id: OP, sequence: n, idempotency_key: `X${n}`, event_type: type,
      scope: { workstream: ['break', 'shift', 'discrepancy', 'clerk_remaining'].includes(metric) ? 'operation' : 'auto_discharge', deck: o.deck ?? null, hatch: null, commodity: null, destination: null },
      occurred_at: o.at ? at(o.at) : null, recorded_at: at('20:00'), actor: 'view_test', source_ids: ['TEST'], provenance: 'user_report',
      supersedes_event_id: o.supersedes ?? null,
      payload: { metric, value, unit: null, count_kind: metric === 'field_units' ? 'interval' : metric === 'clerk_remaining' ? 'remaining' : 'not_applicable',
        period_start: o.period?.[0] ?? null, period_end: o.period?.[1] ?? null, reason: o.reason ?? null, input_event_ids: o.target ? [o.target] : [] },
    });
  }
  return evs;
}
function state(evs: VsaEvent[]): State {
  const s = project(glovis, evs, OP);
  assert.ok(s.ok, JSON.stringify(s));
  return s as State;
}

// Tracker demoData(): the 14:00 mid-shift behind screens 01, 04–08.
const DEMO_HOURS: HourEntry[] = [
  { day: 1, start: '08:00', count: 253, brands: { Hyundai: 200, Kia: 53 }, drivers: 70 },
  { day: 1, start: '09:00', count: 266, brands: { Hyundai: 216, Kia: 50 }, drivers: 70 },
  { day: 1, start: '10:00', count: 225, brands: { Hyundai: 171, Kia: 54 }, drivers: 68 },
  { day: 1, start: '11:00', count: 186, brands: { Hyundai: 120, Kia: 66 }, drivers: 68, stopMin: 45 },
  { day: 1, start: '13:00', count: 248, drivers: 68 },
  { day: 1, start: '14:00', count: 235, drivers: 70 },
];
function demo(): State {
  const evs = toEvents({ name: 'demo', hourly: DEMO_HOURS }, OP);
  const h14 = evs.find((e) => e.payload.metric === 'field_units' && e.payload.value === 235)!;
  const deckTimes: Record<string, string> = { UPP: '13:40', D12: '10:40', D8: '09:15', D6: '08:30', D5: '09:50', D4: '14:20' };
  for (const [id, st] of Object.entries(DEMO_DECKS)) {
    extend(evs, [['status_change', 'deck_status', st.status, { deck: id, at: deckTimes[id] }]]);
    if (st.skipped) extend(evs, [['status_change', 'deck_skipped', true, { deck: id }]]);
    for (const [h, v] of Object.entries(st.hatchRemaining ?? {})) {
      extend(evs, [['observation', 'vessel_remaining', v, { deck: id }]]);
      evs.at(-1)!.scope.hatch = h; evs.at(-1)!.payload.count_kind = 'remaining';
    }
  }
  extend(evs, [
    ['observation', 'deck_height_m', 1.7, { deck: 'D7', at: '08:05' }],
    ['discrepancy_opened', 'discrepancy', null, { at: '10:20', reason: 'Deck 12 H2 count disagreed with checker' }],
  ]);
  return state(extend(evs, [
    ['discrepancy_resolved', 'discrepancy', null, { at: '10:45', target: evs.at(-1)!.event_id }],
    ['pause', 'break', null, { at: '12:00' }],
    ['observation', 'clerk_remaining', 1039, { at: '12:05' }],
    ['discrepancy_opened', 'discrepancy', null, { at: '12:10', reason: 'Field Hyundai +8 vs Hyundai cleared at lunch reconciliation' }],
    ['resume', 'break', null, { at: '13:00' }],
    ['correction', 'field_units', 241, { supersedes: h14.event_id, reason: 'Recount', period: [h14.payload.period_start!, h14.payload.period_end!] }],
  ]));
}

test('screen 01: Snapshot mid-shift (tracker demo)', () => {
  const s = demo();
  const v = snapshot(s, glovis, 11 * 60); // the capture's clock was before noon
  assert.equal(subtitles(s, glovis).snap, '9/21/2026 · Field counts through 15:00');
  assert.deepEqual(v.banners, []);
  assert.deepEqual(v.strip, { breakAt: '12:00', clearBy: [{ side: 'North', at: '11:45' }] });
  assert.equal(v.openIssues, 1);
  assert.equal(v.hero.label, 'VESSEL REMAINING');
  assert.equal(v.hero.value, '512');
  assert.equal(v.hero.of, 'of 1,969 autos · 74.0% complete');
  assert.deepEqual(v.hero.rows, [{ k: 'Ship progress', v: '1,457' }, { k: 'Field record', v: '1,419' }, { k: 'Gap (in transit)', v: '38', sub: 'of 70 drivers' }]);
  assert.deepEqual(v.eta, { value: '17:06', day: null, notes: ['512 ÷ 245/hr pace (last 2 hr)'], dashed: false });
  assert.deepEqual(v.ha, { value: '237', perHr: true, notes: ['1,419 ÷ 6 counted hr', 'Pace 247/hr over 5.75 productive hr'] });
  assert.deepEqual([v.brands.left, v.brands.count, v.brands.finished, v.brands.total], [2, 2, 0, '512']);
  assert.deepEqual(v.brands.rows.map((r) => [r.name, r.remaining, r.start]), [['Kia', '30', '829'], ['Hyundai', '482', '1,140']]);
  assert.equal(v.side.north.pct, '100.0%');
  assert.equal(v.side.north.note, '1,969 autos · 512 left');
  assert.deepEqual([v.side.south.pct, v.side.south.note, v.side.clearByNote], ['0.0%', 'None to this side', 'Clear-by −15 N']);
  assert.deepEqual(badges(s), { decks: 1, plan: 1 });
});

test('screen 02: Snapshot before production', () => {
  const s = state([]);
  const v = snapshot(s, glovis, 7 * 60);
  assert.equal(subtitles(s, glovis).snap, '9/21/2026');
  assert.equal(v.hero.value, '1,969');
  assert.equal(v.hero.of, 'of 1,969 autos · 0.0% complete');
  assert.deepEqual(v.hero.rows, [{ k: 'Ship progress', v: '0' }, { k: 'Field record', v: '0' }, { k: 'Gap (in transit)', v: '0', sub: 'of 70 drivers' }]);
  assert.deepEqual(v.eta, { value: '—', day: null, notes: ['Needs production data'], dashed: true });
  assert.deepEqual(v.ha, { value: '—', perHr: false, notes: ['No counted hours yet'] });
  assert.deepEqual(v.brands.rows.map((r) => [r.name, r.remaining, r.start]), [['Kia', '829', '829'], ['Hyundai', '1,140', '1,140']]);
  assert.deepEqual(badges(s), { decks: 0, plan: 5 });
});

test('screen 03: Snapshot at lunch — ship = field, matches clerk', () => {
  const evs = toEvents({ name: 'lunch', decks: LUNCH_DECKS, hourly: MORNING }, OP);
  const s = state(extend(evs, [
    ['observation', 'deck_height_m', 1.7, { deck: 'D7', at: '08:05' }],
    ['pause', 'break', null, { at: '12:00' }],
    ['observation', 'clerk_remaining', 1039, { at: '12:05' }],
  ]));
  const v = snapshot(s, glovis, 12 * 60 + 10);
  assert.equal(subtitles(s, glovis).snap, '9/21/2026 · Field counts through 12:00');
  assert.deepEqual(v.banners.map((b) => [b.tone, b.title, b.sub]), [
    ['break', 'ON BREAK', 'From 12:00'],
    ['green', 'Break reconciliation: ship and field match', 'Both at 930'],
  ]);
  assert.equal(v.strip, null);
  assert.equal(v.hero.value, '1,039');
  assert.equal(v.hero.of, 'of 1,969 autos · 47.2% complete');
  assert.deepEqual(v.hero.clerkBadge, { ok: true, text: 'Matches clerk' });
  assert.deepEqual(v.hero.clerkLine, { tone: 'green', text: 'Chief clerk at 12:05: 1,039' });
  assert.deepEqual(v.hero.rows, [{ k: 'Ship progress', v: '930' }, { k: 'Field record', v: '930' }]);
  assert.deepEqual(v.eta, { value: '17:24', day: null, notes: ['1,039 ÷ 237/hr pace (last 2 hr)'], dashed: false });
  assert.deepEqual(v.ha.notes, ['930 ÷ 4 counted hr', 'Pace 248/hr over 3.75 productive hr']);
  assert.equal(v.ha.value, '233');
  assert.deepEqual(v.brands.rows.map((r) => r.remaining), ['478', '561']);
  assert.deepEqual(badges(s), { decks: 1, plan: 3 });
});

test('snapshot: reconciliation banners by brand, tracked flag, clerk off, forecast passed', () => {
  // Lunch with Hyundai short in the field by 10: ship ahead overall (orange) and for Hyundai.
  const hours = [...MORNING.slice(0, 3), { ...MORNING[3], count: 176, brands: { Hyundai: 89, Kia: 87 } }];
  const evs = extend(toEvents({ name: 'x', decks: LUNCH_DECKS, hourly: hours }, OP), [
    ['pause', 'break', null, { at: '12:00' }],
    ['observation', 'clerk_remaining', 1045, { at: '12:05' }],
    ['discrepancy_opened', 'discrepancy', 'Break reconciliation: ship is 10 ahead of field', { at: '12:06', reason: 'Break reconciliation: ship is 10 ahead of field. Ship progress 930 · Field 920' }],
  ]);
  const v = snapshot(state(evs), glovis, 12 * 60 + 10);
  assert.deepEqual(v.banners.slice(1).map((b) => [b.tone, b.title, b.tracked]), [
    ['orange', 'Break reconciliation: ship is 10 ahead of field', true],
    ['orange', 'Break reconciliation: Hyundai field is short of cleared by 10', false],
  ]);
  assert.deepEqual(v.hero.clerkBadge, { ok: false, text: 'Off by 6' });
  assert.equal(v.hero.clerkLine?.text, 'Discrepancy: 6 autos · Chief clerk 12:05: 1,045 · Yours: 1,039');

  const late = snapshot(demo(), glovis, 17 * 60 + 30);
  assert.deepEqual(late.banners.map((b) => b.title), ['Forecast passed · completion not reported']);
});

test('snapshot: unknown vessel remaining shows field balance, never a number for vessel', () => {
  const s = state(toEvents({ name: 'x', decks: { ...DEMO_DECKS, D9: { status: 'active' } }, hourly: DEMO_HOURS }, OP));
  const v = snapshot(s, glovis, 11 * 60);
  assert.equal(v.hero.label, 'FIELD BALANCE');
  assert.equal(v.hero.value, '556'); // 1,969 − 1,413 field (no correction in this scenario)
  assert.equal(v.hero.unknownNote, 'Vessel remaining unknown · needs a remaining count on D9');
  assert.ok(v.eta.notes.includes('Based on field balance'));
  assert.equal(v.brands.total, '—');
});

test('screen 04–05: Decks and deck sheet (tracker demo)', () => {
  const s = demo();
  const v = decksView(s);
  assert.deepEqual(v.low, [{ id: 'D7', title: 'D7 is a low deck: 1.70 m · shuttle vans can’t drive on', sub: 'Confirmed 08:05 · 163 autos remaining' }]);
  assert.equal(v.unconfirmed, 1);
  const row = (id: string) => v.rows.find((r) => r.id === id)!;
  assert.deepEqual([row('UPP').pill, row('UPP').remaining, row('UPP').start, row('UPP').cleared], ['Complete', '0', '199', 'Cleared 199 Kia · at 13:40']);
  assert.equal(row('D12').cleared, 'Cleared 307 Hyundai + 150 Kia · at 10:40');
  assert.equal(row('D2').cleared, 'Cleared 126 Kia · Logged at 20:00 UTC-04:00 (processing time, not event time)');
  assert.deepEqual([row('D9').pill, row('D9').remaining, row('D9').height], ['Active', '319', { tone: 'orange', text: '2.00 m · unconfirmed' }]);
  assert.deepEqual([row('D7').pill, row('D7').low, row('D7').height], ['Skipped', true, { tone: 'red', text: '1.70 m · low deck, no vans' }]);
  assert.deepEqual(row('UPP').height, { tone: 'plain', text: 'Height 1.85 m' });
  assert.deepEqual(row('D12').hatches.map((h) => `${h.h} ${h.text}`), ['H4 Hyundai 87', 'H3 Hyundai 155', 'H2 Hyundai 65 + Kia 78', 'H1 Kia 72']);
  assert.deepEqual(v.rows.map((r) => r.id), glovis.decks.map((d: { id: string }) => d.id)); // baseline order

  const sh = deckSheet(s.decks.find((d) => d.id === 'D9')!, glovis);
  assert.equal(sh.title, 'D9 · 398 autos');
  assert.equal(sh.remaining, '319');
  assert.equal(sh.possible, 'Possible: 2.00 / 1.70 m');
  assert.deepEqual(sh.hatches.map((h) => [h.h, h.rem, h.qty]), [['H4', 24, 103], ['H3', 123, 123], ['H2', 103, 103], ['H1', 69, 69]]);
});

test('screens 06–07: Hourly list and graph (tracker demo)', () => {
  const v = hourlyView(demo());
  assert.deepEqual(v.stats, { ha: '237', haNote: '1,419 ÷ 6 hr', pace: '247', paceNote: 'per productive hr', total: '1,419' });
  assert.equal(v.paceLine, 'Pace = 1,419 ÷ 5.75 productive hr. Pre-break hours count only the minutes worked before stoppage.');
  assert.deepEqual(v.brandTable.map((b) => [b.name, b.field, b.cleared, b.diff.text]), [['Kia', '≥ 223', '799', '—'], ['Hyundai', '≥ 707', '658', '—']]);
  assert.equal(v.unsplitNote, '489 autos were logged without a brand split, so brand field totals are minimums.');
  const r = (range: string) => v.rows.find((x) => x.range === range)!;
  assert.equal(r('08:00–09:00').drivers, '70 drivers · 3.61 per driver per productive hr');
  assert.equal(r('08:00–09:00').delta, null);
  assert.equal(r('09:00–10:00').delta, '+13 (+5.1%) vs prior hour');
  assert.equal(r('10:00–11:00').delta, '−41 (−15.4%) vs prior hour');
  assert.equal(r('11:00–12:00').short, 'Stopped 11:45 · 45 min worked · pace 248/hr');
  assert.equal(r('11:00–12:00').delta, '+23/hr pace (+10.2%) vs prior hour');
  assert.equal(r('13:00–14:00').delta, '+0/hr pace (+0.0%) vs prior hour');
  assert.equal(r('14:00–15:00').count, '241');
  assert.equal(r('14:00–15:00').corrected, 'Was 235 · original kept');
  assert.equal(r('14:00–15:00').delta, '−7 (−2.8%) vs prior hour');
  assert.equal(r('14:00–15:00').drivers, '70 drivers · 3.44 per driver per productive hr');

  const g = v.graph!;
  assert.deepEqual(g.grid.map((x) => x.label), ['200', '220', '240', '260', '280']);
  assert.deepEqual(g.points.map((p) => [p.count, p.xLabel, p.short]), [['253', '08', false], ['266', '09', false], ['225', '10', false], ['186', '11', true], ['248', '13', false], ['241', '14', false]]);
  assert.ok(g.avgY != null && g.hasShort);
  assert.equal(g.note, 'Numbers are each hour’s count; the line is its pace per full hour. Dashed line = average pace (247/hr).');
});

test('screen 08: Plan (tracker demo)', () => {
  const v = planView(demo(), glovis);
  assert.deepEqual(v.heights.pending.map((d) => [d.label, d.stow, d.options.map((o) => o.label)]), [['D9', 'Stow plan: 2.00 m', ['Set at 2.00 m', 'Set at 1.70 m']]]);
  assert.deepEqual(v.heights.confirmed, [{ id: 'D7', text: 'D7 1.70 m ✓ · change', low: true }]);
  assert.deepEqual(v.issues.open.map((i) => [i.text, i.opened]), [['Field Hyundai +8 vs Hyundai cleared at lunch reconciliation', 'Opened 12:10']]);
  assert.equal(v.issues.resolved, 'Recently resolved: Deck 12 H2 count disagreed with checker (10:45)');
  assert.deepEqual([v.baseline.start, v.baseline.brands, v.baseline.hh, v.baseline.verified, v.baseline.discrepancies, v.baseline.missing], ['1,969', '829 Kia + 1,140 Hyundai', '0', true, '0 discrepancies', 'Nothing missing']);
  assert.equal(v.baseline.sources, 'Sources: Game plan 9/21/2026; Labor order 9/21/26; Stow plan (SSI blocks, deck heights)');
  assert.deepEqual(v.labor, { start: '08:00', autoDrivers: '70 · 35 + 35', vanDrivers: '10', heavyGang: '0' });
  assert.deepEqual(v.forecast, { breaks: '12:00 and 18:00 · 1 hour each', dayEnd: 'Works until finished', nextStart: '08:00' });
  assert.deepEqual(v.destinations.rows, [{ name: 'Zone 3 · Northside', autos: '1,969', note: 'Hyundai + Kia · 1.00 mi · ref ~8 min (Berth 2) · clear-by −15 min' }]);
  assert.equal(v.destinations.title, 'Destinations from Berth 2');
  assert.deepEqual(v.breakLog, [{ label: 'Break', value: '12:00–13:00' }]);

  // "change" on a confirmed deck puts it back in the pending list.
  assert.deepEqual(planView(demo(), glovis, new Set(['D7'])).heights.confirmed, []);
});

// ---- Checkpoint A review findings (2026-09-26) ----

test('review 6: missing destination autos or miles show as unknown, never 0 or NaN', () => {
  const b = { ...glovis, hh: undefined, destinations: [glovis.destinations[0], { name: 'MBZ', side: 'S', clearBy: 30, brands: ['Kia'] }] };
  const s = state([]);
  const side = snapshot(s, b, 7 * 60).side;
  assert.equal(side.unknown, 'Auto counts missing for MBZ; side split unknown.');
  assert.deepEqual([side.north.pct, side.south.pct], ['—', '—']);
  const p = planView(s, b);
  assert.equal(p.destinations.rows[1].autos, '—');
  assert.equal(p.destinations.rows[1].note, 'Kia · — mi · no reference time · clear-by −30 min');
  assert.equal(p.baseline.hh, '—'); // no H&H on the baseline = unknown, not 0
});

test('review (optional): an open break shows "in progress", never an invented end', () => {
  const s = state(extend(toEvents({ name: 'x', hourly: MORNING.slice(0, 1) }, OP), [['pause', 'break', null, { at: '12:00' }]]));
  assert.deepEqual(planView(s, glovis).breakLog, [{ label: 'Break', value: '12:00 · in progress' }]);
});

test('review 5: clerk check and per-driver rate come from the engine', () => {
  const s = demo();
  const p = s.periods[0];
  assert.ok(p.driverRate.rate != null);
  assert.equal(hourlyView(s).rows[0].drivers, `70 drivers · ${p.driverRate.rate!.toFixed(2)} per driver per productive hr`);
  // Unknown driver rate (short hour without stop can't be saved, so use no drivers): no drivers line.
  const s2 = state(toEvents({ name: 'x', hourly: [{ day: 1, start: '08:00', count: 200 }] }, OP));
  assert.equal(hourlyView(s2).rows[0].drivers, null);
});

test('review (optional): Day 2 shows on the ETA tile and the graph', () => {
  const evs = extend(toEvents({ name: 'x', hourly: [...MORNING, { day: 1, start: '13:00', count: 240, drivers: 68 }], plan: { shiftEnd: '15:00', nextStart: '07:00' } }, OP), [
    ['status_change', 'shift', 'ended', { at: '15:00' }],
    ['status_change', 'shift', 'started', { at: '07:00' }],
  ]);
  evs.at(-1)!.occurred_at = '2026-09-22T07:00:00-04:00';
  const s = state(extend(evs, [['observation', 'field_units', 230, { period: ['2026-09-22T07:00:00-04:00', '2026-09-22T08:00:00-04:00'] }]]));
  const v = snapshot(s, glovis, 8 * 60);
  assert.equal(v.eta.day, 'Day 2');
  assert.equal(hourlyView(s).graph!.points.at(-1)!.xLabel, 'D2 07');
  assert.equal(hourlyView(s).rows.at(-1)!.dayHeader, 'Day 2');
});

test('deck sheet opens pre-filled with the current counts (Colby chose A)', () => {
  const s = demo();
  const sh = deckSheet(s.decks.find((d) => d.id === 'D9')!, glovis);
  assert.deepEqual(sh.prefill, { hatches: { H4: 24, H3: 123, H2: 103, H1: 69 }, deck: null });
  const done = deckSheet(s.decks.find((d) => d.id === 'UPP')!, glovis);
  assert.deepEqual(done.prefill, { hatches: {}, deck: null }); // not Active/Paused: boxes start blank
});

test('hour picker: clock hours from the hour the day starts in, no break hours, defaults after the last logged hour', () => {
  const s = demo(); // hours logged 08:00–11:00 and 13:00–14:00 on Day 1
  const h = hourOptions(s, glovis);
  assert.equal(h.hours[0].start, '08:00');
  assert.deepEqual(h.hours.find((x) => x.start === '11:00'), { start: '11:00', end: '12:00', short: true, logged: true });
  assert.equal(h.defaultStart, '15:00');
  // Colby, 2026-10-10: the break hours (12-13, 18-19) are not offered; the clerk's hours run to 23-00.
  assert.deepEqual(h.hours.map((x) => x.start), ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00', '21:00', '22:00', '23:00']);
  assert.equal(h.hours.at(-1)!.end, '00:00');
  const empty = hourOptions(state([]), glovis);
  assert.equal(empty.defaultStart, '08:00');
  // 07:30 start: hours stay on the clock (07-08 first, 11-12 the pre-break hour); never 07:30–08:30 or 11:30–12:00.
  const half = hourOptions(state([]), { ...glovis, start: '07:30' });
  assert.deepEqual(half.hours.map((x) => x.start).slice(0, 6), ['07:00', '08:00', '09:00', '10:00', '11:00', '13:00']);
  assert.deepEqual(half.hours.find((x) => x.start === '11:00'), { start: '11:00', end: '12:00', short: true, logged: false });
  assert.equal(half.defaultStart, '07:00');
  // After 11:00 is logged, the default skips the 12:00 break hour.
  const morning = state(toEvents({ name: 'x', hourly: MORNING }, OP));
  assert.equal(hourOptions(morning, glovis).defaultStart, '13:00');
});

test('hourly: no percent when the prior hour was 0; field-over is red only at reconciliation', () => {
  const s = demo();
  const zeroPrior = { ...s, periods: s.periods.map((p, i) => (i === 1 ? { ...p, delta: 5, deltaPct: null } : p)) } as State;
  assert.equal(hourlyView(zeroPrior).rows[1].delta, '+5 vs prior hour');

  const over = (phase: State['ops']['phase']) => hourlyView({ ...s, ops: { ...s.ops, phase }, brands: s.brands.map((b) => ({ ...b, variance: -5 })) } as State).brandTable[0].diff;
  assert.deepEqual(over('working'), { tone: 'plain', text: '+5 field over' });
  assert.equal(over('break').tone, 'red');
  assert.equal(over('shift_end').tone, 'red');
});

test('side split clear-by note comes from the clear-by table, no trailing separator', () => {
  const v = snapshot(demo(), glovis, 11 * 60);
  assert.equal(v.side.clearByNote, 'Clear-by −15 N');
  assert.ok(!/[\/\s]$/.test(v.side.clearByNote));
});

test('clear-by note with only Southside destinations has no trailing separator', () => {
  const south = { ...glovis, destinations: glovis.destinations.map((d: object) => ({ ...d, side: 'S' })) };
  assert.equal(snapshot(demo(), south as typeof glovis, 11 * 60).side.clearByNote, 'Clear-by −30 S');
});

test('late start: a break-cut hour is labeled to the break, not +60 min', () => {
  const late = { ...glovis, start: '07:30' };
  const build = (stopMin: number) => {
    const evs = toEvents({ name: 'late', hourly: [{ day: 1, start: '11:30', count: 100, drivers: 70, stopMin }] }, OP);
    for (const e of evs) if (e.payload.period_end) e.payload.period_end = at('12:00'); // the cut hour ends at the break
    const s = project(late, evs, OP);
    assert.ok(s.ok, JSON.stringify(s));
    return s as State;
  };
  const set = build(15);
  assert.equal(subtitles(set, late).snap, '9/21/2026 · Field counts through 12:00');
  assert.equal(hourlyView(set).rows[0].range, '11:30–12:00');
  // The projection refuses an unset stop, so feed the view an unset list directly.
  const unset = { ...set, production: { ...set.production, unsetShort: ['11:30'] } } as State;
  assert.equal(hourlyView(unset).unsetShort, 'Stoppage time not set for 11:30–12:00');
});

test("short pre-break hour names each side's clear-by cutoff from the destinations", () => {
  const sc = SCENARIOS.find((x) => x.name === 'short hour stopped at :30')!;
  const r = project(glovis, toEvents(sc, 'TEST-GLOVIS-PARITY'), 'TEST-GLOVIS-PARITY');
  assert.ok(r.ok);
  const b = { ...glovis, destinations: [{ name: 'Zone 3', side: 'N', clearBy: 15 }, { name: 'Zone T', side: 'S', clearBy: 30 }] };
  const row = hourlyView(r, b).rows.find((x) => x.short)!;
  assert.equal(row.cutoff, 'Clear-by before the 12:00 break: Southside −30 min (stop 11:30) · Northside −15 min (stop 11:45)');
  assert.ok(hourlyView(r).rows.every((x) => x.cutoff === null));
});

test('hero: no "field-counted" wording; bar labels say how many are done and how many to go; warnings name the tab that fixes them', () => {
  const unknown = snapshot(state(toEvents(SCENARIOS.find((x) => x.name === 'Active deck with no count')!, OP)), glovis, 14 * 60);
  assert.ok(!/field-counted/.test(unknown.hero.of), unknown.hero.of);
  assert.equal(unknown.hero.barLeft, `${unknown.hero.rows.find((r) => r.k === 'Field record')!.v} counted`);
  assert.equal(unknown.hero.barRight, `${unknown.hero.value} to go`);
  const known = snapshot(demo(), glovis, 14 * 60);
  assert.ok(/complete$/.test(known.hero.of));
  assert.equal(known.hero.barRight, `${known.hero.value} to go`);
  assert.equal(known.hero.barLeft, `${known.hero.rows.find((r) => r.k === 'Ship progress')!.v} done`);
  const sc = (name: string) => snapshot(state(toEvents(SCENARIOS.find((x) => x.name === name)!, OP)), glovis, 12 * 60 + 5).banners;
  assert.equal(sc('lunch: ship ahead (warning)').find((x) => /ahead of field/.test(x.title))!.go, 'decks');
  assert.equal(sc('end of shift: field ahead (alarm)').find((x) => /field exceeds ship/.test(x.title))!.go, 'decks');
  assert.equal(sc('lunch: ship = field (green)').find((x) => /match/.test(x.title))!.go, undefined, 'a matching banner has nothing to fix');
});

test('backup nudge: offered only for LIVE vessels with entries not in a saved copy; the note says how stale the copy is', () => {
  assert.equal(offerCopy(0, false), false);
  assert.equal(offerCopy(3, false), true);
  assert.equal(offerCopy(3, true), false);
  assert.equal(unsavedNote(0, null), null);
  assert.equal(unsavedNote(1, null), '1 entry not backed up. No copy saved yet.');
  assert.equal(unsavedNote(1234, '2026-09-21T14:42:10-04:00'), '1,234 entries not backed up. Last copy Sep 21, 14:42.');
});
