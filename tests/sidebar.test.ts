import test from 'node:test';
import assert from 'node:assert/strict';
import { openFirst, sidebarVessels, startOrder } from '../src/app/view.ts';

const row = (operationId: string, date: string, over: Record<string, unknown> = {}) =>
  ({ operationId, name: operationId, isTest: false, date, archived: false, remaining: null as number | null, ...over });

test('open vessel leads, the rest newest date first (both date formats)', () => {
  const rows = [row('A', '9/18/2026'), row('B', '2026-10-01'), row('C', '9/27/2026'), row('D', '10/2/2026')];
  assert.deepEqual(sidebarVessels(rows, 'A').live.map((r) => r.operationId), ['A', 'D', 'B', 'C']);
});

test('TEST vessels are listed apart and never among LIVE', () => {
  const rows = [row('L', '9/27/2026'), row('T', '10/1/2026', { isTest: true })];
  const s = sidebarVessels(rows, 'L');
  assert.deepEqual(s.live.map((r) => r.operationId), ['L']);
  assert.deepEqual(s.test.map((r) => r.operationId), ['T']);
});

test('archived are hidden unless shown, or open', () => {
  const rows = [row('A', '9/1/2026', { archived: true }), row('B', '9/2/2026'), row('C', '9/3/2026', { archived: true })];
  assert.deepEqual(sidebarVessels(rows, 'B').live.map((r) => r.operationId), ['B']);
  assert.deepEqual(sidebarVessels(rows, 'A').live.map((r) => r.operationId), ['A', 'B']);
  assert.deepEqual(sidebarVessels(rows, 'B', true).live.map((r) => r.operationId), ['B', 'C', 'A']);
});

test('unknown remaining stays listed as null; an unreadable date sorts last', () => {
  const rows = [row('X', ''), row('Y', '9/9/2026')];
  const s = sidebarVessels(rows, 'Q').live;
  assert.deepEqual(s.map((r) => r.operationId), ['Y', 'X']);
  assert.equal(s[1].remaining, null);
});

test('startup tries the last vessel first, then the rest in order; unknown last id is ignored', () => {
  assert.deepEqual(startOrder(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  assert.deepEqual(startOrder(['a', 'b', 'c'], 'zz'), ['a', 'b', 'c']);
  assert.deepEqual(startOrder(['a', 'b'], null), ['a', 'b']);
  assert.deepEqual(startOrder([], 'a'), []);
});

test('a vessel that cannot open is skipped and the next one opens, with the failure reported', async () => {
  const tried: string[] = [];
  const r = await openFirst(['a', 'b', 'c'], 'b', async (id) => { tried.push(id); if (id === 'b') throw new Error('Stored log refused by the engine'); });
  assert.deepEqual(tried, ['b', 'a']);
  assert.equal(r.opened, 'a');
  assert.deepEqual(r.failed, [{ id: 'b', error: 'Stored log refused by the engine' }]);
});

test('when no vessel can open, nothing opens and every failure is listed', async () => {
  const r = await openFirst(['a', 'b'], null, async (id) => { throw new Error(`bad ${id}`); });
  assert.equal(r.opened, null);
  assert.equal(r.failed.length, 2);
});
