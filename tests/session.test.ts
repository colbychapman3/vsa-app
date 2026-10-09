// App-shell orchestration (8d): the save guard and the export-and-mark flow, with a fake store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveBatch, shareAndMark, type Appender } from '../src/app/session.ts';
import type { Ctx } from '../src/app/entries.ts';
import type { State } from '../src/storage/store.ts';

const ctx = (id = 'V1') => ({ operationId: id }) as unknown as Ctx;
const st = { log: { events: [] } } as unknown as State;
const evs = [{ event_id: 'a' }] as never;
const okStore = (calls: string[]): Appender => ({ append: async (id) => { calls.push(id); return { ok: true, state: st }; } });

test('a save writes through the store and then runs after()', async () => {
  const calls: string[] = []; let afterRan = false;
  const r = await saveBatch({ ctx: ctx(), store: okStore(calls), guard: { current: false }, build: () => evs, openId: () => 'V1', after: async () => { afterRan = true; } });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, ['V1']);
  assert.ok(afterRan);
});

test('double tap: the second save is refused while the first runs, and the guard clears afterwards', async () => {
  const guard = { current: false };
  let release!: () => void;
  const slow: Appender = { append: () => new Promise((res) => { release = () => res({ ok: true, state: st }); }) };
  const first = saveBatch({ ctx: ctx(), store: slow, guard, build: () => evs, openId: () => 'V1', after: async () => {} });
  const second = await saveBatch({ ctx: ctx(), store: slow, guard, build: () => evs, openId: () => 'V1', after: async () => {} });
  assert.deepEqual(second, { ok: false, error: 'Still saving the last entry. Try again.' });
  release(); await first;
  assert.equal(guard.current, false);
});

test('a rejected build or batch leaves state alone and frees the guard', async () => {
  const guard = { current: false }; let afterRan = false;
  const after = async () => { afterRan = true; };
  const a = await saveBatch({ ctx: ctx(), store: okStore([]), guard, build: () => ({ ok: false, error: 'no' }), openId: () => 'V1', after });
  assert.deepEqual(a, { ok: false, error: 'no' });
  const refusing: Appender = { append: async () => ({ ok: false, error: 'engine says no' }) };
  const b = await saveBatch({ ctx: ctx(), store: refusing, guard, build: () => evs, openId: () => 'V1', after });
  assert.deepEqual(b, { ok: false, error: 'engine says no' });
  const throwing: Appender = { append: async () => { throw new Error('disk'); } };
  const c = await saveBatch({ ctx: ctx(), store: throwing, guard, build: () => evs, openId: () => 'V1', after });
  assert.deepEqual(c, { ok: false, error: 'Could not write to the phone: disk' });
  assert.equal(afterRan, false);
  assert.equal(guard.current, false);
});

test('vessel switched while saving: written to the right vessel, the open vessel state is not touched', async () => {
  const calls: string[] = []; let afterRan = false;
  const r = await saveBatch({ ctx: ctx('V1'), store: okStore(calls), guard: { current: false }, build: () => evs, openId: () => 'V2', after: async () => { afterRan = true; } });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, ['V1']);
  assert.equal(afterRan, false);
});

test('no vessel loaded: refused with the reason', async () => {
  const r = await saveBatch({ ctx: null, store: okStore([]), guard: { current: false }, build: () => evs, openId: () => null, after: async () => {} });
  assert.deepEqual(r, { ok: false, error: 'The vessel is still loading.' });
});

test('a dismissed share sheet is not marked as backed up', async () => {
  let marked = 0;
  const exported = { ok: true as const, text: '{}', fileName: 'f.json', count: 5 };
  const dismissed = await shareAndMark({ exported, share: async () => 'dismissed', mark: async () => { marked++; } });
  assert.equal(dismissed.ok, true);
  assert.match(dismissed.text, /Nothing marked as backed up/);
  assert.equal(marked, 0);
  const used = await shareAndMark({ exported, share: async () => 'shared', mark: async (n) => { marked = n; } });
  assert.deepEqual(used, { ok: true, text: 'Shared 5 entries.' });
  assert.equal(marked, 5);
  const failed = await shareAndMark({ exported, share: async () => { throw new Error('boom'); }, mark: async () => { marked = -1; } });
  assert.deepEqual(failed, { ok: false, text: 'Not exported: boom' });
  assert.equal(marked, 5);
  const bad = await shareAndMark({ exported: { ok: false, error: 'nope' }, share: async () => 'shared', mark: async () => { marked = -1; } });
  assert.deepEqual(bad, { ok: false, text: 'Not exported: nope' });
});
