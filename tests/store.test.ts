import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate, SCHEMA_VERSION } from '../src/storage/schema.ts';
import { openStore } from '../src/storage/store.ts';
import type { Db } from '../src/storage/db.ts';
import { project, replay, activeEvents, type VsaEvent } from '../src/engine/index.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis, plain, toEvents, SCENARIOS, MORNING } from './scenarios.ts';

// A fresh database file per test, removed afterwards.
function tempFile(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'vsa.db');
}

test('schema: created once on a new file, left alone on reopen', async (t) => {
  const file = tempFile(t);
  let db = openNodeDb(file);
  await migrate(db);
  await db.run(`INSERT INTO vessels VALUES ('TEST-1', 'Test', 1, '{}', '2026-09-25T08:00:00-04:00')`);
  await db.close();

  db = openNodeDb(file);
  await migrate(db); // must not recreate or wipe anything
  const [{ user_version }] = await db.all<{ user_version: number }>('PRAGMA user_version');
  assert.equal(user_version, SCHEMA_VERSION);
  assert.deepEqual(await db.all('SELECT operation_id FROM vessels'), [{ operation_id: 'TEST-1' }]);
  const [{ journal_mode }] = await db.all<{ journal_mode: string }>('PRAGMA journal_mode');
  assert.equal(journal_mode, 'wal');
  await db.close();
});

test('schema: a database newer than the app is refused, not touched', async (t) => {
  const db = openNodeDb(tempFile(t));
  await db.exec('PRAGMA user_version = 99');
  await assert.rejects(migrate(db), /schema v99, newer than this app/);
  await db.close();
});

test('storage test 4: the database itself refuses to edit or delete history', async (t) => {
  const db = openNodeDb(tempFile(t));
  await migrate(db);
  await db.run(`INSERT INTO vessels VALUES ('TEST-1', 'Test', 1, '{"a":1}', '2026-09-25T08:00:00-04:00')`);
  await db.run(`INSERT INTO events VALUES ('TEST-1', 1, 'E1', 'E1', '{}')`);

  await assert.rejects(db.run(`UPDATE events SET event_json = '{"x":1}'`), /append-only/);
  await assert.rejects(db.run('DELETE FROM events'), /append-only/);
  await assert.rejects(db.run('UPDATE vessels SET is_test = 0'), /TEST\/LIVE mark and baseline cannot be changed/);
  await assert.rejects(db.run(`UPDATE vessels SET baseline_json = '{}'`), /cannot be changed/);
  await assert.rejects(db.run('DELETE FROM vessels'), /cannot be deleted/);
  await db.run(`UPDATE vessels SET name = 'Renamed'`); // a display name may change

  // Events must belong to a stored vessel, and ids and keys are unique per vessel.
  await assert.rejects(db.run(`INSERT INTO events VALUES ('NOPE', 1, 'E1', 'E1', '{}')`), /FOREIGN KEY/);
  await assert.rejects(db.run(`INSERT INTO events VALUES ('TEST-1', 2, 'E1', 'E9', '{}')`), /append-only/);
  await assert.rejects(db.run(`INSERT INTO events VALUES ('TEST-1', 1, 'E2', 'E2', '{}')`), /append-only/);
  assert.equal((await db.all('SELECT * FROM events')).length, 1);
  await db.close();
});

test('storage v2: INSERT OR REPLACE cannot overwrite an event or a vessel', async (t) => {
  const db = openNodeDb(tempFile(t));
  await migrate(db);
  await db.run(`INSERT INTO vessels VALUES ('TEST-1', 'Test', 1, '{"a":1}', '2026-09-25T08:00:00-04:00')`);
  await db.run(`INSERT INTO events VALUES ('TEST-1', 1, 'E1', 'E1', '{"v":1}')`);
  await assert.rejects(db.run(`INSERT OR REPLACE INTO events VALUES ('TEST-1', 1, 'E1', 'E1', '{"v":2}')`), /append-only/);
  await assert.rejects(db.run(`INSERT OR REPLACE INTO events VALUES ('TEST-1', 2, 'E1', 'E1', '{"v":2}')`), /append-only/); // would delete E1 via its unique key
  await assert.rejects(db.run(`INSERT OR REPLACE INTO vessels VALUES ('TEST-1', 'Other', 0, '{}', 'x')`), /cannot be changed/);
  assert.deepEqual(await db.all('SELECT event_json FROM events'), [{ event_json: '{"v":1}' }]);
  assert.deepEqual(await db.all('SELECT is_test, baseline_json FROM vessels'), [{ is_test: 1, baseline_json: '{"a":1}' }]);
  await db.run(`INSERT INTO events VALUES ('TEST-1', 2, 'E2', 'E2', '{}')`); // a genuinely new event still saves
  await db.close();
});

test('migrate is stepwise: a v1 phone database gets only v2 and keeps its data', async (t) => {
  const db = openNodeDb(tempFile(t));
  await migrate(db);
  await db.run(`INSERT INTO vessels VALUES ('TEST-1', 'Test', 1, '{}', 'x')`);
  await db.exec('DROP TRIGGER events_no_replace; DROP TRIGGER vessels_no_replace; PRAGMA user_version = 1');
  await migrate(db); // re-running V1 here would throw "table vessels already exists"
  assert.equal((await db.all<{ n: number }>("SELECT count(*) n FROM sqlite_master WHERE name LIKE '%_no_replace'"))[0].n, 2);
  assert.equal((await db.all<{ user_version: number }>('PRAGMA user_version'))[0].user_version, SCHEMA_VERSION);
  assert.equal((await db.all('SELECT * FROM vessels')).length, 1);
  await db.close();
});

test('transaction: a failure inside rolls everything back (storage test 7)', async (t) => {
  const db = openNodeDb(tempFile(t));
  await migrate(db);
  await db.run(`INSERT INTO vessels VALUES ('TEST-1', 'Test', 1, '{}', '2026-09-25T08:00:00-04:00')`);
  await assert.rejects(db.transaction(async (tx) => {
    await tx.run(`INSERT INTO events VALUES ('TEST-1', 1, 'E1', 'E1', '{}')`);
    throw new Error('simulated crash mid-write');
  }), /simulated crash/);
  assert.equal((await db.all('SELECT * FROM events')).length, 0);
  await db.close();
});

// ---- Store API (T3). Glovis Condor 101 is TEST data only. ----

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.ok(r.ok, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const count = async (db: Db) => (await db.all('SELECT * FROM events')).length;
const hours = (id: string, hourly = MORNING) => toEvents({ name: 'x', hourly }, id);

test('storage test 1: create, append, close, reopen, load → identical state', async (t) => {
  const file = tempFile(t);
  let store = await openStore(openNodeDb(file));
  ok(await store.createVessel({ operationId: 'TEST-GLOVIS', baseline: glovis, isTest: true }));
  const saved = ok(await store.append('TEST-GLOVIS', toEvents(SCENARIOS[1], 'TEST-GLOVIS')));
  await store.close();

  store = await openStore(openNodeDb(file));
  const loaded = ok(await store.load('TEST-GLOVIS'));
  assert.deepEqual(loaded.state, saved.state);
  assert.equal(loaded.events.length, saved.saved);
  assert.deepEqual(loaded.baseline, glovis);
  assert.deepEqual((await store.listVessels()).map((v) => [v.operationId, v.name, v.isTest]), [['TEST-GLOVIS', 'Glovis Condor 101', true]]);
  await store.close();
});

test('storage test 2: every parity shift and a correction replay the same from storage', async (t) => {
  const file = tempFile(t);
  let store = await openStore(openNodeDb(file));
  const ids = SCENARIOS.map((_, i) => `TEST-GLOVIS-PARITY-${i}`);
  for (const [i, sc] of SCENARIOS.entries()) {
    ok(await store.createVessel({ operationId: ids[i], baseline: glovis, isTest: true }));
    ok(await store.append(ids[i], toEvents(sc, ids[i])));
  }
  const evs = hours('TEST-FIX', [{ day: 1, start: '08:00', count: 250 }]);
  ok(await store.createVessel({ operationId: 'TEST-FIX', baseline: glovis, isTest: true }));
  ok(await store.append('TEST-FIX', evs));
  ok(await store.append('TEST-FIX', [{ ...plain(evs[0]), event_id: 'C1', idempotency_key: 'C1', sequence: 2, event_type: 'correction',
    supersedes_event_id: 'P1', payload: { ...evs[0].payload, value: 275, reason: 'Checker recount' } }]));
  await store.close();

  store = await openStore(openNodeDb(file));
  for (const [i, sc] of SCENARIOS.entries()) {
    const loaded = ok(await store.load(ids[i]));
    assert.deepEqual(loaded.state, project(glovis, toEvents(sc, ids[i]), ids[i]), sc.name);
  }
  const fix = ok(await store.load('TEST-FIX'));
  assert.ok(fix.state.ok);
  if (!fix.state.ok) return;
  assert.equal(fix.state.field, 275);
  assert.deepEqual(fix.state.corrections, [{ event_id: 'C1', metric: 'field_units', history: [250, 275], reason: 'Checker recount' }]);
  assert.equal(fix.events.length, 2); // the 250 is kept, not overwritten
  await store.close();
});

test('storage test 2: kit 1,969 log replays from storage; load never hides what the engine refuses', async (t) => {
  // The kit log has a 9-hour interval, which project() refuses (field counts are hourly),
  // so append refuses it. Written directly here to prove the stored log round-trips.
  const kit: VsaEvent[] = readFileSync(new URL('./fixtures/events.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const file = tempFile(t);
  const db = openNodeDb(file);
  let store = await openStore(db);
  ok(await store.createVessel({ operationId: 'TEST-CORRECTION', baseline: { ...glovis, date: '2026-09-23' }, isTest: true }));
  const refused = await store.append('TEST-CORRECTION', kit);
  assert.ok(!refused.ok && /field counts are hourly/.test(refused.error));
  assert.equal(await count(db), 0);
  for (const e of kit) await db.run('INSERT INTO events VALUES (?, ?, ?, ?, ?)', [e.operation_id, e.sequence, e.event_id, e.idempotency_key, JSON.stringify(e)]);
  await store.close();

  store = await openStore(openNodeDb(file));
  const loaded = ok(await store.load('TEST-CORRECTION'));
  assert.deepEqual(loaded.events, kit);
  const log = replay(loaded.events, 'TEST-CORRECTION');
  assert.ok(!('error' in log));
  if ('error' in log) return;
  assert.equal(activeEvents(log).reduce((s, e) => s + (e.payload.value as number), 0), 1969);
  assert.ok(!loaded.state.ok && /field counts are hourly/.test(loaded.state.error));
  await store.close();
});

test('storage test 3: a batch whose last event is rejected writes nothing', async (t) => {
  const db = openNodeDb(tempFile(t));
  const store = await openStore(db);
  ok(await store.createVessel({ operationId: 'TEST-GLOVIS', baseline: glovis, isTest: true }));
  ok(await store.append('TEST-GLOVIS', hours('TEST-GLOVIS', MORNING.slice(0, 2))));
  const before = await count(db);

  const bad = toEvents({ name: 'x', decks: { UPP: { status: 'active', hatchRemaining: { H3: 110 } } } }, 'TEST-GLOVIS')
    .map((e, i) => ({ ...e, event_id: `B${i}`, idempotency_key: `B${i}`, sequence: 100 + i }));
  assert.deepEqual(await store.append('TEST-GLOVIS', bad), { ok: false, error: 'H3 exceeds its 106 autos by 4. Check the count.', event_id: 'B1' });
  assert.equal(await count(db), before);
  await store.close();
});

test('storage test 5: re-delivery stores once; a reused id with new content is refused', async (t) => {
  const db = openNodeDb(tempFile(t));
  const store = await openStore(db);
  ok(await store.createVessel({ operationId: 'TEST-GLOVIS', baseline: glovis, isTest: true }));
  const evs = hours('TEST-GLOVIS');
  assert.equal(ok(await store.append('TEST-GLOVIS', evs)).saved, evs.length);
  assert.equal(ok(await store.append('TEST-GLOVIS', plain(evs))).saved, 0);
  assert.equal(await count(db), evs.length);

  const changed = { ...plain(evs[0]), payload: { ...evs[0].payload, value: 999 } };
  const r = await store.append('TEST-GLOVIS', [changed]);
  assert.ok(!r.ok && /P1 was already used with different content/.test(r.error));
  assert.equal(await count(db), evs.length);
  await store.close();
});

test('storage test 6: one vessel = one record; TEST never mixes into LIVE; Glovis only as TEST', async (t) => {
  const db = openNodeDb(tempFile(t));
  const store = await openStore(db);
  ok(await store.createVessel({ operationId: 'TEST-GLOVIS', baseline: glovis, isTest: true }));
  const live = { ...glovis, vessel: 'Live Vessel 1' };
  ok(await store.createVessel({ operationId: 'LIVE-1', baseline: live, isTest: false }));

  assert.deepEqual(await store.append('LIVE-1', hours('TEST-GLOVIS')),
    { ok: false, error: 'Event P1 belongs to operation TEST-GLOVIS, not LIVE-1. Nothing was saved.' });
  assert.equal(await count(db), 0);

  assert.deepEqual(await store.createVessel({ operationId: 'LIVE-GLOVIS', baseline: glovis, isTest: false }),
    { ok: false, error: 'Glovis Condor 101 is reference data and can only be loaded as TEST.' });
  assert.match((await store.createVessel({ operationId: 'TEST-2', baseline: live, isTest: false }) as { error: string }).error, /LIVE vessel id cannot start with "TEST-"/);
  assert.match((await store.createVessel({ operationId: 'DEMO', baseline: glovis, isTest: true }) as { error: string }).error, /TEST vessel ids start with "TEST-"/);
  assert.match((await store.createVessel({ operationId: 'TEST-GLOVIS', baseline: glovis, isTest: true }) as { error: string }).error, /already exists/);
  assert.deepEqual(await store.createVessel({ operationId: 'TEST-BAD', baseline: { ...glovis, date: 'soon' }, isTest: true }),
    { ok: false, error: 'Baseline date "soon" is not a date.' });
  assert.match((await store.append('TEST-NONE', []) as { error: string }).error, /No vessel TEST-NONE/);
  assert.deepEqual((await store.listVessels()).map((v) => [v.operationId, v.isTest]), [['TEST-GLOVIS', true], ['LIVE-1', false]]);
  await store.close();
});

test('storage test 7: a crash partway through an append leaves the log as it was', async (t) => {
  const db = openNodeDb(tempFile(t));
  let inserts = 0;
  const flaky: Db = {
    ...db,
    transaction: (fn) => db.transaction((tx) => fn({ ...tx, run: async (sql, p) => {
      if (sql.startsWith('INSERT INTO events') && ++inserts === 3) throw new Error('disk full (simulated)');
      return tx.run(sql, p);
    } })),
  };
  const store = await openStore(flaky);
  ok(await store.createVessel({ operationId: 'TEST-GLOVIS', baseline: glovis, isTest: true }));
  assert.deepEqual(await store.append('TEST-GLOVIS', hours('TEST-GLOVIS')),
    { ok: false, error: 'Nothing was saved (database error: disk full (simulated)).' });
  assert.equal(await count(db), 0);
  await store.close();
});

test('reference baseline guard ignores case, spacing and punctuation in the name', async (t) => {
  const store = await openStore(openNodeDb(tempFile(t)));
  for (const name of ['GLOVIS CONDOR 101', 'Glovis  Condor-101', 'glovis_condor 101 (copy)']) {
    const r = await store.createVessel({ operationId: 'LIVE-1', baseline: { ...glovis, vessel: name }, isTest: false });
    assert.ok(!r.ok && /can only be loaded as TEST/.test(r.error), name);
  }
  await store.close();
});

test('append judges the JSON that will be stored: Infinity becomes null and is refused, the vessel stays usable', async (t) => {
  const db = openNodeDb(tempFile(t));
  const store = await openStore(db);
  ok(await store.createVessel({ operationId: 'TEST-GLOVIS', baseline: glovis, isTest: true }));
  const h1 = hours('TEST-GLOVIS', MORNING.slice(0, 1)), h2 = hours('TEST-GLOVIS', MORNING.slice(0, 2)).slice(h1.length);
  ok(await store.append('TEST-GLOVIS', h1));
  const inf = { ...plain(h2[0]), payload: { ...h2[0].payload, value: Infinity } };
  const r = await store.append('TEST-GLOVIS', [inf, ...h2.slice(1)]);
  assert.ok(!r.ok, JSON.stringify(r));
  assert.equal(await count(db), h1.length);
  assert.ok(ok(await store.load('TEST-GLOVIS')).state.ok); // still loads
  assert.equal(ok(await store.append('TEST-GLOVIS', h2)).saved, h2.length); // and still takes entries
  await store.close();
});

test('a new event must come after the last saved sequence', async (t) => {
  const db = openNodeDb(tempFile(t));
  const store = await openStore(db);
  ok(await store.createVessel({ operationId: 'TEST-GLOVIS', baseline: glovis, isTest: true }));
  const h1 = hours('TEST-GLOVIS', MORNING.slice(0, 1)), h2 = hours('TEST-GLOVIS', MORNING.slice(0, 2)).slice(h1.length);
  ok(await store.append('TEST-GLOVIS', h1.map((e, i) => ({ ...plain(e), sequence: i === h1.length - 1 ? 50 : e.sequence }))));
  const r = await store.append('TEST-GLOVIS', [{ ...plain(h2[0]), sequence: h1.length + 1 }]); // fills a gap behind the stored max (50)
  assert.ok(!r.ok && /not after the last saved event \(50\)/.test(r.error), JSON.stringify(r));
  assert.equal(await count(db), h1.length);
  await store.close();
});
