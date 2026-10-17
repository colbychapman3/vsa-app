// Render fixture: the boards' made-up ship (Hera Highway 13A, 1,352 autos, Berth 2, 10/12/2026), built through the real
// entry builders and store, then written as a .vsalog.json for the web harness to import. Never import it on a phone.
// isTest is false only because the boards show the LIVE badge; the id starts RENDER- so it can't pass for a real vessel.
// Run: node --experimental-strip-types tools/render/hera.ts  → tools/render/out/hera.vsalog.json
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Baseline, OpTime, VsaEvent, Reject } from '../../src/engine/index.ts';
import { openStore, type State } from '../../src/storage/store.ts';
import { exportLog } from '../../src/storage/backup.ts';
import { openNodeDb } from '../../tests/nodeDb.ts';
import * as E from '../../src/app/entries.ts';

export const OP = 'RENDER-HERA-13A';
const D = (id: string, hatches: [string, ...[string, number][]][], heights: [number, boolean][] = [[2.4, true]]) =>
  ({ id, label: id, heights: heights.map(([m, current]) => ({ m, current })), hatches: hatches.map(([h, ...items]) => ({ h, items: items.map(([brand, qty]) => ({ brand, qty })) })) });

// One brand per hatch, except two untouched ones, so Remaining by brand is known (BMW 210, MBZ 112, POV 15 of 820/480/52).
export const baseline: Baseline = {
  vessel: 'Hera Highway 13A', date: '10/12/2026', port: 'SSI', berth: 2, start: '07:00', breaks: ['12:00', '18:00'],
  labor: { autoDrivers: 70 },
  destinations: [
    { name: 'BMW Field', side: 'N', clearBy: 15, mi: 1.2, brands: ['BMW'], autos: 820 },
    { name: 'MBZ (Mercedes)', side: 'S', clearBy: 30, mi: 2.6, brands: ['MBZ'], autos: 480 },
    { name: 'Zone 1 (MB Field)', side: 'S', clearBy: 30, mi: 1.7, brands: ['POV'], autos: 52 },
  ],
  decks: [
    D('DK12', [['H4', ['BMW', 120]], ['H3', ['MBZ', 120]], ['H2', ['MBZ', 120]], ['H1', ['BMW', 73]]], [[2.1, true], [1.75, false]]),
    D('DK9', [['H4', ['BMW', 100]], ['H3', ['MBZ', 90]], ['H2', ['BMW', 70]]], [[2.0, true], [1.75, false]]),
    D('DK7', [['H4', ['BMW', 34], ['POV', 15]], ['H3', ['BMW', 91]]], [[2.2, true], [1.7, false]]),
    D('DK4', [['H3', ['BMW', 30]], ['H2', ['POV', 25]]], [[1.8, true]]),
    D('DK3', [['H4', ['BMW', 60]], ['H3', ['BMW', 60]], ['H2', ['MBZ', 50]], ['H1', ['BMW', 40]]]),
    D('DK2', [['H4', ['BMW', 50]], ['H3', ['MBZ', 50]], ['H2', ['MBZ', 38]], ['H1', ['POV', 12]]]),
    D('DK1', [['H4', ['BMW', 52]], ['H3', ['BMW', 40]], ['H2', ['MBZ', 12]]]),
  ],
};

const t = (hm: string): OpTime => ({ day: 1, hm });
const deck = (d: string, status: E.DeckForm['status'], hm: string, hatchRemaining: Record<string, number | null>): E.DeckForm =>
  ({ deck: d, status, skipped: false, hatchRemaining, deckRemaining: null, time: t(hm) });
const hour = (start: string, BMW: number, MBZ: number, POV: number, extra: Partial<E.HourForm> = {}): E.HourForm =>
  ({ day: 1, start, count: BMW + MBZ + POV, drivers: 70, brands: { BMW, MBZ, POV }, ...extra });

// The shift up to 13:58, in the order Colby would log it. `until` cuts the log for boards set earlier in the day.
export function steps(): [string, (c: E.Ctx) => VsaEvent[] | Reject][] {
  return [
    ['07:05', (c) => E.dayStartEvents(c, 1, '07:10', 'Safety meeting')],
    ['07:40', (c) => E.heightEvents(c, 'DK12', 2.1, t('07:40'))],
    ['08:00', (c) => E.hourEvents(c, hour('07:00', 92, 54, 4))],
    ['08:40', (c) => E.deckEvents(c, deck('DK1', 'complete', '08:40', { H4: 0, H3: 0, H2: 0 }))],
    ['09:00', (c) => E.hourEvents(c, hour('08:00', 112, 64, 6))],
    ['09:20', (c) => E.hhMarkerEvents(c, 'started', t('09:20'))],
    ['09:55', (c) => E.deckEvents(c, deck('DK2', 'complete', '09:55', { H4: 0, H3: 0, H2: 0, H1: 0 }))],
    ['10:00', (c) => E.hourEvents(c, hour('09:00', 107, 62, 6))],
    ['11:00', (c) => E.hourEvents(c, hour('10:00', 121, 62, 7))],
    ['11:10', (c) => E.hourEvents(c, hour('10:00', 121, 71, 7, { reason: 'Clerk recount' }))],
    ['11:42', (c) => E.deckEvents(c, deck('DK3', 'complete', '11:42', { H4: 0, H3: 0, H2: 0, H1: 0 }))],
    ['11:50', (c) => E.deckEvents(c, deck('DK7', 'paused', '11:44', { H4: 49, H3: 0 }))],
    ['11:51', (c) => E.deckEvents(c, deck('DK4', 'paused', '11:44', { H3: 30, H2: 0 }))],
    ['12:00', (c) => E.hourEvents(c, hour('11:00', 60, 57, 7, { stopMin: 45 }))],
    ['12:01', (c) => E.breakStartEvents(c, t('12:00'))],
    ['13:00', (c) => E.breakEndEvents(c, t('13:00'))],
    ['13:58', (c) => E.deckEvents(c, deck('DK9', 'active', '13:58', { H4: 55, H3: 36, H2: 7 }))],
    ['13:58', (c) => E.deckEvents(c, deck('DK12', 'active', '13:58', { H4: 61, H3: 46, H2: 30, H1: 23 }))],
    ['14:00', (c) => E.hourEvents(c, hour('13:00', 98, 48, 5))],
  ];
}

export async function build(until = '23:59'): Promise<{ text: string; state: State }> {
  const dir = new URL('./out/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`hera-${until.replace(':', '')}.db`, dir);
  rmSync(file, { force: true });
  const store = await openStore(openNodeDb(file.pathname.replace(/^\/(\w:)/, '$1')));
  const made = await store.createVessel({ operationId: OP, baseline, isTest: false });
  if (!made.ok) throw new Error(made.error);
  let state = ((await store.load(OP)) as { state: State }).state;
  for (const [at, step] of steps()) {
    if (at > until) break;
    const ctx: E.Ctx = { operationId: OP, opDate: '2026-10-12', offset: '-04:00', recordedAt: `2026-10-12T${at}:00-04:00`, state };
    const evs = step(ctx);
    if (!Array.isArray(evs)) throw new Error(`${at}: ${evs.error}`);
    const r = await store.append(OP, evs);
    if (!r.ok) throw new Error(`${at}: ${r.error}`);
    state = r.state;
  }
  const out = await exportLog(store, OP, `2026-10-12T${until === '23:59' ? '14:00' : until}:00-04:00`);
  if (!out.ok) throw new Error(out.error);
  return { text: out.text, state };
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const { text, state: s } = await build();
  writeFileSync(new URL('./out/hera.vsalog.json', import.meta.url), text);
  console.log(JSON.stringify({ remaining: s.vesselRemaining, progress: s.progress, field: s.field, variance: s.variance, brands: s.brands.map((b) => `${b.name} ${b.remaining}/${b.start}`) }));
}
