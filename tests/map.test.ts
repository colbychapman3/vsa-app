// Terminal map: every directory destination is on the map with the directory's side and cutoff,
// chips match the artifact's highlights, and measure is always a labeled estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/app/map/data.ts';
import { CHIPS, FEATURES, card, cutoffDisagreements, highlighted, inDirectoryNotOnMap, featureAt, pointInPoly, measure, MEASURE_LABEL, onMapNotInDirectory, type ChipId } from '../src/app/map/model.ts';
import { TERMINAL, terminalInfo } from '../src/engine/terminal.ts';
import { destination } from '../src/engine/time.ts';

test('map vs directory reconciliation is reported, not hidden', () => {
  console.log('map features not in the directory:', onMapNotInDirectory());
  console.log('directory destinations not on the map:', inDirectoryNotOnMap());
  console.log('map cutoff differs from directory:', cutoffDisagreements().map((f) => `${f.name} map ${f.mapCut} vs directory ${f.cutoff}`));
});

test('every directory destination appears on the map', () => {
  assert.deepEqual(inDirectoryNotOnMap(), []);
});

test('every map feature has a directory entry', () => assert.deepEqual(onMapNotInDirectory(), []));

test('each directory card shows the directory side, cutoff and berth miles, matching the engine', () => {
  for (const d of TERMINAL) {
    const f = FEATURES.find((x) => x.dir === d.name)!;
    assert.ok(f, d.name);
    assert.equal(f.side, d.side === 'S' ? 'Southside' : 'Northside', d.name);
    assert.equal(f.cutoff, d.clearBy, d.name);
    assert.equal(destination(d.name)?.side, f.side, `${d.name} matches time.ts destination()`);
    const c = card(f);
    assert.equal(c.rows.find((r) => r.k === 'Side')!.v, f.side);
    assert.equal(c.rows.find((r) => r.k === 'Pre-break cutoff')!.v, `${d.clearBy} min`);
    for (const b of [1, 2, 3]) assert.equal(c.rows.find((r) => r.k === `Berth ${b}`)!.v, `${terminalInfo(d.name, b)!.mi!.toFixed(2)} mi`);
  }
});

test('the map file agrees with the directory on every cutoff', () => assert.deepEqual(cutoffDisagreements().map((f) => f.name), []));

test('a feature with no directory entry is listed with unknown side and cutoff, never dropped', () => {
  const c = card({ ...FEATURES[0], dir: null, side: null, cutoff: null });
  assert.equal(c.rows[0].v, 'Unknown');
  assert.equal(c.rows[1].v, 'Unknown');
  assert.match(c.flags[0], /Not in the terminal directory/);
});

test('saved artifact edits are applied (yard-1, yard-2, mbz)', () => {
  assert.deepEqual([...MAP.editsApplied].sort(), ['mbz', 'yard-1', 'yard-2']);
  assert.deepEqual(MAP.items.find((i) => i.id === 'mbz')!.lab, [698, 1024]);
  assert.equal(MAP.items.find((i) => i.id === 'yard-2')!.poly[0][0], 630.8);
});

test('chips return the expected sets', () => {
  const names = (c: ChipId[]) => highlighted(c).map((f) => f.name);
  assert.equal(highlighted([]).length, FEATURES.length);
  assert.deepEqual(names(['oem']).sort(), ['BMW', 'MBZ']);
  assert.equal(names(['zone']).length, 13);
  assert.equal(names(['site']).length, 5);
  assert.equal(names(['yard']).length, 3);
  const n = highlighted(['n15']), s = highlighted(['s30']);
  assert.ok(n.every((f) => f.side === 'Northside') && s.every((f) => f.side === 'Southside'));
  assert.equal(n.length + s.length, FEATURES.length);
  assert.deepEqual(names(['oem', 'n15']), ['BMW']); // groups AND
  assert.deepEqual(names(['oem', 'zone']).sort(), [...names(['zone']), 'BMW', 'MBZ'].sort()); // types OR
  assert.equal(CHIPS.length, 6);
});

test('measure: known pairs convert map units to feet with the map scale, always labeled an estimate', () => {
  assert.equal(measure([[0, 0]]), null);
  const m = measure([[0, 0], [30, 40]])!; // 50 units
  assert.ok(Math.abs(m.feet - 50 * MAP.ftPerUnit) < 1e-9);
  assert.ok(Math.abs(m.metres - 50 * MAP.ftPerUnit * 0.3048) < 1e-9);
  assert.equal(m.label, MEASURE_LABEL);
  assert.equal(MEASURE_LABEL, 'map estimate, not a route distance');
  const two = measure([[0, 0], [30, 40], [30, 140]])!; // 50 + 100 units
  assert.ok(Math.abs(two.feet - 150 * MAP.ftPerUnit) < 1e-9);
  assert.match(m.text, /^≈ \d/);
});

test('tapping inside every lot finds a lot that contains the point; a point landmark wins within its radius; empty space finds nothing', () => {
  for (const f of FEATURES.filter((x) => x.poly)) {
    const xs = f.poly!.map((q) => q[0]), ys = f.poly!.map((q) => q[1]);
    let p: [number, number] | null = null;
    for (let x = Math.min(...xs); x <= Math.max(...xs) && !p; x += 5) for (let y = Math.min(...ys); y <= Math.max(...ys) && !p; y += 5) if (pointInPoly([x, y], f.poly!)) p = [x, y];
    assert.ok(p, `no interior point for ${f.name}`);
    const hit = featureAt(p, 0);
    assert.ok(hit && hit.poly && pointInPoly(p, hit.poly), f.name);
  }
  const g = FEATURES.find((f) => f.name === 'Gate 1')!;
  assert.equal(featureAt([g.at[0] + 5, g.at[1] - 5], 20)!.name, 'Gate 1');
  assert.equal(featureAt([5, 5], 20), null);
});
