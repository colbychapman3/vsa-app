// Siri hand-off: a spoken count opens the Log filled in; it never saves by itself and never lands on a stale hour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { siriPrefill, SIRI_FRESH_MS } from '../src/app/siri.ts';

const now = Date.UTC(2026, 8, 21, 20, 2);

test('a fresh spoken count fills the Log on the hour that is due', () => {
  assert.deepEqual(siriPrefill({ count: 252, atMs: now - 30_000 }, now), { count: 252, start: null });
});

test('nothing pending, a stale count, a count from the future or a bad number: nothing opens', () => {
  assert.equal(siriPrefill(null, now), null);
  assert.equal(siriPrefill({ count: 252, atMs: now - SIRI_FRESH_MS - 1 }, now), null);
  assert.equal(siriPrefill({ count: 252, atMs: now + 60_000 }, now), null);
  assert.equal(siriPrefill({ count: -1, atMs: now }, now), null);
  assert.equal(siriPrefill({ count: 25.5, atMs: now }, now), null);
});

test('the Siri command is wired into the app target and never saves on its own', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
  assert.ok(app.plugins.includes('./plugins/withLogIntent.js'), 'app.json lists the Siri plugin');
  const swift = readFileSync(new URL('../plugins/ios/VsaLogCountIntent.swift', import.meta.url), 'utf8');
  assert.match(swift, /openAppWhenRun: Bool = true/); // it opens the app; the Save happens there
  assert.doesNotMatch(swift, /sqlite|SQLite|append/); // it only hands the number over
  const appTsx = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(appTsx, /siriPrefill\(takeSiriPending\(\), Date\.now\(\)\)/);
});
