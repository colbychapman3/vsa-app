import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate, SCHEMA_VERSION } from '../src/storage/schema.ts';
import { openNodeDb } from './nodeDb.ts';

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
  await assert.rejects(db.run(`INSERT INTO events VALUES ('TEST-1', 2, 'E1', 'E9', '{}')`), /UNIQUE/);
  await assert.rejects(db.run(`INSERT INTO events VALUES ('TEST-1', 1, 'E2', 'E2', '{}')`), /UNIQUE/);
  assert.equal((await db.all('SELECT * FROM events')).length, 1);
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
