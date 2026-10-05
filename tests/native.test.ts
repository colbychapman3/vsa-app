// Native source must be in git. EAS uploads skip anything .gitignore excludes, and CI checks out from git,
// so a missing file here means a store build ships without that native module (build #7 lost the text
// reader this way on 2026-10-05). Only the generated root /ios and /android folders may be ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const modules = readdirSync(new URL('modules/', root));

test('every local Expo module ships its native source', () => {
  for (const m of modules) {
    const cfg = JSON.parse(readFileSync(new URL(`modules/${m}/expo-module.config.json`, root), 'utf8'));
    for (const name of cfg.apple?.modules ?? []) {
      assert.ok(existsSync(new URL(`modules/${m}/ios/${name}.swift`, root)), `modules/${m}/ios/${name}.swift is missing`);
    }
    if (cfg.apple) {
      const specs = readdirSync(new URL(`modules/${m}/ios/`, root)).filter((f) => f.endsWith('.podspec'));
      assert.ok(specs.length > 0, `modules/${m}/ios has no .podspec`);
    }
  }
});

test('.gitignore ignores only the root native folders', () => {
  const lines = readFileSync(new URL('.gitignore', root), 'utf8').split(/\r?\n/).map((l) => l.trim());
  for (const bare of ['ios', 'ios/', 'android', 'android/']) assert.ok(!lines.includes(bare), `"${bare}" also hides modules/*/${bare.replace('/', '')}; use "/${bare.replace('/', '')}/"`);
});
