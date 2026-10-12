import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importFileProblem, MAX_IMPORT_BYTES } from '../src/app/importLimit.ts';

test('a normal file passes', () => assert.equal(importFileProblem('a.vsalog.json', 5000), null));
test('unknown size passes (the read decides)', () => assert.equal(importFileProblem('a.vsalog.json', undefined), null));
test('an empty file is refused by name', () => assert.match(importFileProblem('a.vsalog.json', 0)!, /a\.vsalog\.json is empty/));
test('a file over the limit is refused with its size', () => {
  assert.equal(importFileProblem('x.json', MAX_IMPORT_BYTES), null);
  assert.match(importFileProblem('x.json', MAX_IMPORT_BYTES + 1)!, /too large/);
});
