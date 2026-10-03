import test from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDb } from './nodeDb.ts';
import { openStore } from '../src/storage/store.ts';
import { getPref, setPref } from '../src/storage/prefs.ts';

test('prefs: unset is null, set and overwrite work, and they live apart from vessel keys', async () => {
  const db = openNodeDb(':memory:');
  await openStore(db); // creates the settings table
  assert.equal(await getPref(db, 'appearance'), null);
  await setPref(db, 'appearance', 'night');
  assert.equal(await getPref(db, 'appearance'), 'night');
  await setPref(db, 'appearance', 'auto');
  assert.equal(await getPref(db, 'appearance'), 'auto');
  assert.equal((await db.all<{ key: string }>("SELECT key FROM settings WHERE key = 'appearance'")).length, 0);
});

test('prefs on a brand-new database fail until the store has migrated (so the app reads them after openStore)', async () => {
  const db = openNodeDb(':memory:');
  await assert.rejects(() => getPref(db, 'appearance'));
  await openStore(db);
  assert.equal(await getPref(db, 'appearance'), null);
});
