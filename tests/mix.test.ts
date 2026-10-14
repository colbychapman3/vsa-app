// The brand mix (Colby, 2026-10-14): a brand's distance comes from its destination's Appendix D miles; an hour's split says what
// came off; the forecast scales each hour's pace to the mix still aboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandMiles, mixAdjust, mixMiles, mixReference } from '../src/engine/mix.ts';
import { terminalInfo } from '../src/engine/terminal.ts';
import type { Period } from '../src/engine/production.ts';

const mi = (name: string, berth: 1 | 2 | 3) => terminalInfo(name, berth)!.mi!;

test('the distance data tells the story: Southside destinations are about twice the BMW Field distance at every berth', () => {
  const ratios: number[] = [];
  for (const berth of [1, 2, 3] as const) {
    const bmw = mi('BMW Field', berth);
    for (const south of ['MBZ (Mercedes)', 'Zone 1 (MB Field)', 'Zone B']) {
      const ratio = mi(south, berth) / bmw;
      assert.ok(ratio > 1.3 && ratio < 4, `${south} at berth ${berth} is ${ratio.toFixed(2)}x BMW Field`); // always farther than BMW Field
      ratios.push(ratio);
    }
  }
  const mean = ratios.reduce((s, x) => s + x, 0) / ratios.length;
  assert.ok(mean > 1.8 && mean < 2.6, `on average ${mean.toFixed(2)}x: "about twice as long" (Colby)`);
});

test('brandMiles takes each brand\'s miles from its destination; a brand with no miles has none', () => {
  const m = brandMiles([{ brands: ['BMW'], mi: 1.2 }, { brands: ['MBZ', 'POV'], mi: 2.6 }, { brands: ['KIA'] }]);
  assert.equal(m.get('BMW'), 1.2);
  assert.equal(m.get('POV'), 2.6);
  assert.equal(m.has('KIA'), false);
  assert.deepEqual(mixReference(m), { brand: 'BMW', miles: 1.2 });
});

test('the example: 100 Mercedes + 200 BMW is the same work as 400 BMW when Mercedes takes twice as long', () => {
  const m = brandMiles([{ brands: ['BMW'], mi: 1 }, { brands: ['MBZ'], mi: 2 }]);
  assert.ok(Math.abs(mixMiles({ MBZ: 100, BMW: 200 }, m)! * 300 - 400) < 1e-9);
  assert.ok(Math.abs(mixMiles({ MBZ: 150, BMW: 100 }, m)! * 250 - 400) < 1e-9); // also 400, with only 250 cars
  assert.equal(mixMiles({ MBZ: 5, KIA: 5 }, m), null, 'a brand with no miles: unknown, never zero');
});

test('mixAdjust: an hour of far cars is read as faster for the cars left; unsplit hours keep their pace', () => {
  const m = brandMiles([{ brands: ['BMW'], mi: 1 }, { brands: ['MBZ'], mi: 2 }]);
  const hour = (count: number, brands: Record<string, number> | null, pace: number) => ({ day: 1, start: '08:00', count, brands, pace, min: 60 }) as unknown as Period;
  // 250 cars/hr of 150 MBZ + 100 BMW; what is left is all BMW (1 mile per car): that work is worth 400 BMW cars/hr.
  const r = mixAdjust([hour(250, { MBZ: 150, BMW: 100 }, 250), hour(300, null, 300)], { BMW: 500, MBZ: 0 }, m)!;
  assert.equal(r.avgLeft, 1);
  assert.equal(Math.round(r.periods[0].pace!), 400);
  assert.equal(r.periods[1].pace, 300, 'no split: not adjusted');
  assert.equal(r.used, 1);
  // what is left is all MBZ (2 miles per car): the same hour is worth 200 MBZ cars/hr.
  assert.equal(Math.round(mixAdjust([hour(250, { MBZ: 150, BMW: 100 }, 250)], { BMW: 0, MBZ: 500 }, m)!.periods[0].pace!), 200);
  // an uncounted brand left, or a split that does not add up: nothing is adjusted
  assert.equal(mixAdjust([hour(250, { MBZ: 150, BMW: 100 }, 250)], { BMW: null, MBZ: 500 }, m), null);
  assert.equal(mixAdjust([hour(250, { MBZ: 100, BMW: 100 }, 250)], { BMW: 500, MBZ: 0 }, m), null);
});

test('end to end: a vessel whose brands go to different distances has its forecast rate scaled to the mix left; one distance changes nothing', async () => {
  const { project } = await import('../src/engine/index.ts');
  const { glovis, SCENARIOS, toEvents, OP } = await import('./scenarios.ts');
  const sc = SCENARIOS.find((s) => s.name === 'lunch: ship ahead (warning)')!; // its last hours carry a brand split
  const base = project(glovis, toEvents(sc), OP) as any;
  assert.ok(base.ok);
  assert.equal(base.mix, undefined, 'one destination: no adjustment, output unchanged');
  const far = { ...glovis, destinations: [
    { name: 'Near', side: 'N' as const, clearBy: 15, mi: 1, brands: ['Hyundai'] },
    { name: 'Far', side: 'S' as const, clearBy: 30, mi: 2, brands: ['Kia'] },
  ] };
  const mixed = project(far, toEvents(sc), OP) as any;
  assert.ok(mixed.ok);
  assert.ok(mixed.mix && mixed.mix.hoursAdjusted > 0);
  // the rate is the plain recent pace times (miles per car in those hours ÷ miles per car still aboard)
  const last2 = mixed.periods.filter((p: any) => p.pace != null).slice(-2);
  const left = mixed.brands.reduce((a: number, b: any) => a + (b.remaining ?? 0), 0);
  const avgLeft = mixed.brands.reduce((a: number, b: any) => a + (b.remaining ?? 0) * (b.name === 'Kia' ? 2 : 1), 0) / left;
  const want = last2.reduce((t: number, p: any) => {
    if (!p.brands) return t + p.pace; // no split: keeps its own pace
    const avgHour = (Object.entries(p.brands) as [string, number][]).reduce((a, [n, v]) => a + v * (n === 'Kia' ? 2 : 1), 0) / p.count;
    return t + p.pace * (avgHour / avgLeft);
  }, 0) / last2.length;
  assert.ok(Math.abs(mixed.eta.rate - want) < 1e-6, `${mixed.eta.rate} vs ${want}`);
  assert.ok(Math.abs(mixed.eta.rate - base.eta.rate) > 1e-9, 'the mix moved the rate (a little: the hours and the cars left are close in mix)');
});

test('a brand that goes to several destinations is priced by the cars planned to each; a destination with no miles gets them from the directory', async () => {
  const { withTerminalMiles } = await import('../src/engine/mix.ts');
  // MBZ cars: 100 to Zone 1 (1.70 mi at berth 2) and 300 to the MBZ lot (2.60 mi): (170 + 780) / 400 = 2.375
  const w = brandMiles([{ brands: ['MBZ'], mi: 1.7, autos: 100 }, { brands: ['MBZ'], mi: 2.6, autos: 300 }]);
  assert.ok(Math.abs(w.get('MBZ')! - 2.375) < 1e-9);
  // one of them does not say how many: the plain mean
  assert.ok(Math.abs(brandMiles([{ brands: ['MBZ'], mi: 1.7, autos: 100 }, { brands: ['MBZ'], mi: 2.6 }]).get('MBZ')! - 2.15) < 1e-9);
  // a destination typed without miles: the vessel's berth and the directory fill it in; an unknown name stays unpriced
  const d = withTerminalMiles([{ name: 'BMW Field', mi: null as unknown as number }, { name: 'Zone 2', mi: 0.8 }, { name: 'Nowhere', mi: null as unknown as number }], 2);
  assert.deepEqual(d.map((x) => x.mi), [1.2, 0.8, null]);
});
