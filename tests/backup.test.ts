import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/storage/store.ts';
import { exportLog, importLog, markExported, backupStatus } from '../src/storage/backup.ts';
import { sha256Hex } from '../src/storage/sha256.ts';
import { project, type VsaEvent } from '../src/engine/index.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis, OP, toEvents, SCENARIOS } from './scenarios.ts';

const NOW = '2026-09-29T10:00:00-04:00';
async function fresh(t: { after: (fn: () => any) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-bk-'));
  const db = openNodeDb(join(dir, 'vsa.db'));
  t.after(async () => { await db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { db, store: await openStore(db) };
}
async function seeded(t: any, events: VsaEvent[], op = OP) {
  const x = await fresh(t);
  assert.ok((await x.store.createVessel({ operationId: op, baseline: glovis, isTest: true })).ok);
  const a = await x.store.append(op, events);
  assert.ok(a.ok, a.ok ? '' : a.error);
  return x;
}
const exp = async (store: any, op = OP) => { const r = await exportLog(store, op, NOW); assert.ok(r.ok); return r.text; };

test('sha256 matches node:crypto, including multi-byte text and block edges', () => {
  for (const s of ['', 'abc', 'é€😀 vessel', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)])
    assert.equal(sha256Hex(s), createHash('sha256').update(s).digest('hex'));
});

for (const sc of SCENARIOS) {
  test(`backup round trip: ${sc.name}`, async (t) => {
    const a = await seeded(t, toEvents(sc));
    const b = await fresh(t);
    const r = await importLog(b.store, await exp(a.store));
    assert.ok(r.ok && r.kind === 'created', JSON.stringify(r));
    const [la, lb] = [await a.store.load(OP), await b.store.load(OP)];
    assert.ok(la.ok && lb.ok);
    assert.deepEqual(lb.events, la.events);
    assert.deepEqual(project(lb.baseline, lb.events, OP), project(la.baseline, la.events, OP));
  });
}

test('backup round trip: a correction keeps its history', async (t) => {
  const evs = toEvents(SCENARIOS.find((s) => s.plan)!);
  const target = evs.find((e) => e.payload.metric === 'plan_shift_end')!;
  const corr = { ...structuredClone(target), event_id: 'C1', idempotency_key: 'C1', sequence: evs.length + 1, event_type: 'correction' as const,
    supersedes_event_id: target.event_id, payload: { ...target.payload, value: '16:00', reason: 'typo' } };
  const a = await seeded(t, [...evs, corr]);
  const b = await fresh(t);
  assert.ok((await importLog(b.store, await exp(a.store))).ok);
  const [la, lb] = [await a.store.load(OP), await b.store.load(OP)];
  assert.ok(la.ok && lb.ok);
  assert.deepEqual(lb.events, la.events);
  assert.equal(lb.events.at(-1)!.supersedes_event_id, target.event_id);
});

test('backup: tampered checksum, count, format and version are refused', async (t) => {
  const a = await seeded(t, toEvents(SCENARIOS[1]));
  const f = JSON.parse(await exp(a.store));
  const b = await fresh(t);
  const tweak = (fn: (x: any) => void) => { const c = structuredClone(f); fn(c); return JSON.stringify(c); };
  const cases: [string, RegExp][] = [
    [tweak((c) => { c.events[0].payload.value = 999; }), /checksum does not match/],
    [tweak((c) => { c.events.pop(); }), /says \d+ events but holds/],
    [tweak((c) => { c.format = 'other'; }), /not a VSA log file/],
    [tweak((c) => { c.version = 2; }), /version 2/],
    [tweak((c) => { c.app_schema_version = 99; }), /newer app/],
    ['not json', /not valid JSON/],
  ];
  for (const [text, re] of cases) { const r = await importLog(b.store, text); assert.ok(!r.ok && re.test(r.error), JSON.stringify(r)); }
  assert.deepEqual(await b.store.listVessels(), []);
});

test('backup: TEST file cannot land as a LIVE vessel', async (t) => {
  const a = await seeded(t, toEvents(SCENARIOS[1]));
  const f = JSON.parse(await exp(a.store));
  f.vessel.is_test = false; // claim LIVE while the id says TEST-
  const b = await fresh(t);
  const r = await importLog(b.store, JSON.stringify(f));
  assert.ok(!r.ok && /LIVE vessel id|TEST/.test(r.error), JSON.stringify(r));
  assert.deepEqual(await b.store.listVessels(), []);
});

test('backup: same vessel with different history is refused and nothing changes', async (t) => {
  const evs = toEvents(SCENARIOS[1]);
  const a = await seeded(t, evs);
  const b = await seeded(t, evs.map((e, i) => (i === 1 ? { ...e, recorded_at: '2026-09-21T21:00:00-04:00' } : e)).slice(0, 2));
  const before = await b.store.load(OP);
  const r = await importLog(b.store, await exp(a.store));
  assert.ok(!r.ok && /already has different history: event \d+/.test(r.error), JSON.stringify(r));
  assert.deepEqual(await b.store.load(OP), before);
});

test('backup: strict prefix appends only the missing events; re-import is up to date', async (t) => {
  const evs = toEvents(SCENARIOS[1]);
  const full = await seeded(t, evs);
  const part = await seeded(t, evs.slice(0, 5));
  const text = await exp(full.store);
  const r = await importLog(part.store, text);
  assert.ok(r.ok && r.kind === 'appended' && r.added === evs.length - 5, JSON.stringify(r));
  const [lf, lp] = [await full.store.load(OP), await part.store.load(OP)];
  assert.ok(lf.ok && lp.ok);
  assert.deepEqual(lp.events, lf.events);
  const again = await importLog(part.store, text);
  assert.ok(again.ok && again.kind === 'current' && again.added === 0);
  // an older file into a longer phone log is also "already up to date"
  const old = await exp(await seeded(t, evs.slice(0, 3)).then((x) => x.store));
  const r2 = await importLog(full.store, old);
  assert.ok(r2.ok && r2.kind === 'current');
});

test('backup: different baseline for the same vessel is refused', async (t) => {
  const a = await seeded(t, toEvents(SCENARIOS[0]));
  const f = JSON.parse(await exp(a.store));
  f.vessel.baseline = { ...f.vessel.baseline, vessel: 'Changed' };
  const r = await importLog(a.store, JSON.stringify(f));
  assert.ok(!r.ok && /different baseline/.test(r.error), JSON.stringify(r));
});

test('backup: last-export marker and unsaved count', async (t) => {
  const { db, store } = await seeded(t, toEvents(SCENARIOS[1]));
  const n = (await store.load(OP) as any).events.length;
  assert.deepEqual(await backupStatus(db, OP, n), { lastAt: null, unsaved: n });
  await markExported(db, OP, NOW, n);
  assert.deepEqual(await backupStatus(db, OP, n), { lastAt: NOW, unsaved: 0 });
  assert.deepEqual(await backupStatus(db, OP, n + 2), { lastAt: NOW, unsaved: 2 });
  await markExported(db, OP, NOW, n + 2); // replaces, never grows
  assert.equal((await db.all('SELECT 1 FROM settings')).length, 1);
});
