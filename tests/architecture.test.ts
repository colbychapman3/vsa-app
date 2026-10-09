// The architecture rules in CLAUDE.md ("Architecture guardrails") as checks that fail. Same idea as
// rules.test.ts and native.test.ts: read the source, assert the boundary. Each rule is a pure check over
// a { path: source } map, run on the real repo and on small made-up violations that it must catch.
//   ENGINE-BOUNDARY      src/engine imports only its own files: no React, Expo, storage, app code or AI.
//   AI-BOUNDARY          only src/app/ai.ts touches the on-device language model package.
//   AI-WRITE-BOUNDARY    AI and proposal code never reaches storage and never appends events.
//   STORAGE-BOUNDARY     events and vessels are written only by src/storage/store.ts; events are appended only
//                        through store.append (App.tsx, backup import); only db.ts touches the SQLite package.
//   DOMAIN-BOUNDARY      screens take only formatting, parsing and lookup helpers from the engine, never protocol
//                        math; the allowlist below may only shrink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

type Files = Record<string, string>;
type Imp = { spec: string; typeOnly: boolean; names: string[] };

const root = fileURLToPath(new URL('../', import.meta.url));
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!['node_modules', 'dist', 'ios', 'android', '.expo'].includes(f)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const real: Files = {};
for (const dir of ['src', 'modules']) for (const p of walk(join(root, dir))) real[relative(root, p).replaceAll('\\', '/')] = readFileSync(p, 'utf8');
for (const f of ['App.tsx', 'index.ts']) real[f] = readFileSync(join(root, f), 'utf8');

// Comments can't import or write anything, so they are not scanned.
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

function importsOf(text: string): Imp[] {
  const t = code(text), out: Imp[] = [];
  for (const m of t.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[2].trim(), brace = /\{([^}]*)\}/.exec(clause);
    const inBraces = (brace ? brace[1].split(',') : []).map((n) => n.trim()).filter((n) => n && !n.startsWith('type ')).map((n) => n.split(/\s+as\s+/)[0].trim());
    const bare = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim(); // a default import, or "* as ns"
    const names = m[1] ? [] : [...inBraces, ...(bare ? [bare] : [])];
    out.push({ spec: m[3], typeOnly: names.length === 0, names });
  }
  for (const m of t.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[1], typeOnly: false, names: [] });
  for (const m of t.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], typeOnly: false, names: [] });
  return out;
}
const under = (files: Files, prefix: string) => Object.keys(files).filter((p) => p.startsWith(prefix));

export function engineBoundary(files: Files): string[] {
  return under(files, 'src/engine/').flatMap((p) => importsOf(files[p]).filter((i) => !/^\.\/[\w.-]+\.ts$/.test(i.spec)).map((i) => `${p} imports "${i.spec}"`));
}
export function aiBoundary(files: Files): string[] {
  return Object.keys(files).filter((p) => p !== 'src/app/ai.ts' && code(files[p]).includes('@react-native-ai')).map((p) => `${p} mentions the language-model package`);
}
const AI_FILES = ['src/app/ai.ts', 'src/app/assistant.ts', 'src/engine/proposal.ts'];
export function aiWriteBoundary(files: Files): string[] {
  return AI_FILES.filter((p) => p in files).flatMap((p) => [
    ...importsOf(files[p]).filter((i) => !i.typeOnly && /(^|\/)storage\//.test(i.spec)).map((i) => `${p} imports storage at runtime ("${i.spec}")`),
    ...(/\.append\(|\bopenStore\b|\.createVessel\(/.test(code(files[p])) ? [`${p} writes to the ledger`] : []),
  ]);
}
const APPEND_OK = ['App.tsx', 'src/app/session.ts', 'src/storage/store.ts', 'src/storage/backup.ts'];
const WRITE_SQL = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:events|vessels)\b/i;
export function storageBoundary(files: Files): string[] {
  const bad: string[] = [];
  for (const p of Object.keys(files)) {
    const c = code(files[p]);
    if (p !== 'src/storage/store.ts' && WRITE_SQL.test(c)) bad.push(`${p} writes the events or vessels table`);
    if (!APPEND_OK.includes(p) && /\.append\(/.test(c)) bad.push(`${p} calls .append(`);
    if (p !== 'src/storage/db.ts' && c.includes('expo-sqlite')) bad.push(`${p} touches the SQLite package`);
    if (p.startsWith('src/app/')) for (const i of importsOf(files[p])) if (!i.typeOnly && /(^|\/)storage\//.test(i.spec)) bad.push(`${p} imports storage at runtime ("${i.spec}")`);
  }
  return bad;
}
// Engine names a screen may use. Remove a name when the screen stops using it; add one only with a reason in the commit.
export const SCREEN_ENGINE_ALLOWED = ['EVIDENCE_REASONS', 'EVIDENCE_TYPES', 'GAS_LEVELS', 'MAX_VANS', 'TERMINAL', 'TYPE_LABEL', 'checkVin', 'evidencePath', 'formatHM', 'needsReason', 'operationDate', 'parseHM', 'parseVanSheet', 'suggestedStop', 'terminalInfo', 'vinCandidates'];
const screenEngineNames = (files: Files) => under(files, 'src/app/screens/').flatMap((p) => importsOf(files[p]).filter((i) => !i.typeOnly && /(^|\/)engine\//.test(i.spec)).flatMap((i) => i.names.map((n) => ({ p, n }))));
export function domainBoundary(files: Files): string[] {
  return screenEngineNames(files).filter(({ n }) => !SCREEN_ENGINE_ALLOWED.includes(n)).map(({ p, n }) => `${p} takes "${n}" from the engine`);
}

test('ENGINE-BOUNDARY: src/engine imports only its own files', () => {
  assert.ok(under(real, 'src/engine/').length > 10, 'engine files were found');
  assert.deepEqual(engineBoundary(real), []);
});
test('AI-BOUNDARY: only src/app/ai.ts touches the language-model package', () => {
  assert.ok(code(real['src/app/ai.ts']).includes('@react-native-ai'), 'ai.ts is where the model is loaded');
  assert.deepEqual(aiBoundary(real), []);
});
test('AI-WRITE-BOUNDARY: AI and proposal code never reach storage or append events', () => {
  for (const p of AI_FILES) assert.ok(p in real, `${p} exists`);
  assert.deepEqual(aiWriteBoundary(real), []);
});
test('STORAGE-BOUNDARY: events are written only by the store, appended only through store.append', () => {
  assert.ok('src/storage/store.ts' in real);
  assert.deepEqual(storageBoundary(real), []);
});
test('DOMAIN-BOUNDARY: screens take only formatting, parsing and lookup helpers from the engine', () => {
  assert.deepEqual(domainBoundary(real), []);
  const used = new Set(screenEngineNames(real).map((x) => x.n));
  assert.deepEqual(SCREEN_ENGINE_ALLOWED.filter((n) => !used.has(n)), [], 'allowlist entries no screen uses any more: remove them');
});

test('the guardrails catch violations (made-up files)', () => {
  const eng = (src: string): Files => ({ 'src/engine/x.ts': src });
  assert.equal(engineBoundary(eng("import { useState } from 'react';")).length, 1);
  assert.equal(engineBoundary(eng("import { z } from '../app/view.ts';")).length, 1);
  assert.equal(engineBoundary(eng("const m = require('expo-sqlite');")).length, 1);
  assert.equal(engineBoundary(eng("const m = await import('react-native');")).length, 1);
  assert.equal(engineBoundary(eng("export * from './time.ts';\nimport type { A } from './decks.ts';\n// import x from 'react'")).length, 0);

  assert.equal(aiBoundary({ 'src/app/view.ts': "const m = require('@react-native-ai/apple');" }).length, 1);
  assert.equal(aiBoundary({ 'src/app/view.ts': "// uses @react-native-ai only in ai.ts" }).length, 0);

  assert.equal(aiWriteBoundary({ 'src/app/assistant.ts': "import { openStore } from '../storage/store.ts';" }).length, 2);
  assert.equal(aiWriteBoundary({ 'src/app/ai.ts': 'await store.append(id, evs);' }).length, 1);
  assert.equal(aiWriteBoundary({ 'src/app/assistant.ts': "import type { State } from '../storage/store.ts';" }).length, 0);

  assert.equal(storageBoundary({ 'src/app/entries.ts': "await db.run('INSERT INTO events VALUES (1)');" }).length, 1);
  assert.equal(storageBoundary({ 'src/app/entries.ts': "await db.run('DELETE FROM vessels');" }).length, 1);
  assert.equal(storageBoundary({ 'src/app/screens/Plan.tsx': 'await store.append(id, evs);' }).length, 1);
  assert.equal(storageBoundary({ 'src/app/session.ts': 'await store.append(id, evs);' }).length, 0);
  assert.equal(storageBoundary({ 'src/app/assistant.ts': 'await store.append(id, evs);' }).length, 1);
  assert.equal(storageBoundary({ 'src/app/view.ts': "import * as SQLite from 'expo-sqlite';" }).length, 1);
  assert.equal(storageBoundary({ 'src/app/screens/Plan.tsx': "import { exportLog } from '../../storage/backup.ts';" }).length, 1);
  assert.equal(storageBoundary({ 'src/app/screens/Plan.tsx': "import type { State } from '../../storage/store.ts';", 'src/storage/store.ts': "await tx.run('INSERT INTO events VALUES (1)');", 'App.tsx': 'await store.current.append(id, evs);' }).length, 0);

  const screen = (src: string): Files => ({ 'src/app/screens/Snapshot.tsx': src });
  assert.equal(domainBoundary(screen("import { eta, type Baseline } from '../../engine/index.ts';")).length, 1);
  assert.equal(domainBoundary(screen("import { eta as e } from '../../engine/eta.ts';")).length, 1);
  assert.equal(domainBoundary(screen("import { parseHM, type Baseline, formatHM as f } from '../../engine/index.ts';")).length, 0);
  assert.equal(domainBoundary(screen("import type { Baseline } from '../../engine/index.ts';")).length, 0);
});
