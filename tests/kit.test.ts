// Every case in docs/11_validation_tests.json is either tested in this suite
// (its id appears in a test title) or deferred here with the phase that owns it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const kit = JSON.parse(readFileSync(new URL('../docs/11_validation_tests.json', import.meta.url), 'utf8'));
const dir = new URL('./', import.meta.url);
const titles = readdirSync(dir).filter((f) => f.endsWith('.test.ts')).map((f) => readFileSync(new URL(f, dir), 'utf8'))
  .flatMap((src) => [...src.matchAll(/test\(\s*['`]([^'`]+)['`]/g)].map((m) => m[1]));

// Not rules-engine behavior. Each is owned by a later phase.
const DEFERRED: Record<string, string> = {
  T1: 'Phase 5 (new-vessel setup): conflicting paperwork keeps the baseline unresolved.',
  B12: 'Phase 3 (Plan & routes screen): planning estimate vs reference travel time.',
  B23: 'Phase 6 (on-device AI): document text is evidence, never instructions.',
  B25: 'Phase 6 (on-device AI): no causal claims in generated text.',
  B26: 'Phase 6 (on-device AI) / Phase 3: quoting the SOP citation. The engine returns it (see fit tests).',
  B27: 'Phase 5 (new-vessel setup): initialization route context.',
};
// Partly engine behavior: the engine part is tested; the rest is owned by a later phase.
const PARTIAL: Record<string, string> = {
  T7: 'Engine rejects cross-operation events (tested). Refusing old-vessel data during setup is Phase 5.',
};

test('every kit case is tested here or deferred with an owning phase', () => {
  const untested: string[] = [];
  for (const c of kit.tests as { id: string }[]) {
    if (DEFERRED[c.id]) continue;
    const re = new RegExp(`\\b${c.id}\\b`);
    if (!titles.some((t) => re.test(t))) untested.push(c.id);
  }
  assert.deepEqual(untested, [], `kit cases with no test and no deferral: ${untested.join(', ')}`);
  for (const id of Object.keys(PARTIAL)) assert.ok(titles.some((t) => new RegExp(`\\b${id}\\b`).test(t)), `${id} engine part is untested`);
  assert.equal(kit.tests.length, 28);
});
