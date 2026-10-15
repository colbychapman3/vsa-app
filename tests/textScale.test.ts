// TEXT-SCALE (Colby's phone check at the largest iOS text size, 2026-10-15): every screen takes Text and TextInput from
// src/app/screens/text.tsx, which holds the Dynamic Type ceiling; the react-native ones would grow to 3.1x and split words
// ("Closeo/ut"). ESLint says it while editing; this fails the build the same way. Pure check over { path: source }, run on the real
// repo and on made-up violations it must catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

type Files = Record<string, string>;
const root = fileURLToPath(new URL('../', import.meta.url));
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(f)) out.push(p); }
  return out;
}
const real: Files = { 'App.tsx': readFileSync(join(root, 'App.tsx'), 'utf8') };
for (const p of walk(join(root, 'src', 'app'))) real[relative(root, p).replaceAll('\\', '/')] = readFileSync(p, 'utf8');

const WRAPPER = 'src/app/screens/text.tsx';
export function textScaleBoundary(files: Files): string[] {
  const bad: string[] = [];
  for (const [p, src] of Object.entries(files)) {
    if (p === WRAPPER || !(p === 'App.tsx' || p.startsWith('src/app/'))) continue;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/g)) {
      const names = m[1].split(',').map((n) => n.trim().replace(/^type\s+.*/, '').split(/\s+as\s+/)[0]).filter(Boolean);
      for (const n of names) if (n === 'Text' || n === 'TextInput') bad.push(`${p} takes ${n} from react-native (use screens/text.tsx)`);
    }
  }
  return bad;
}

test('TEXT-SCALE: no screen takes Text or TextInput straight from react-native', () => {
  assert.ok(WRAPPER in real || 'src/app/screens/text.tsx' in real, 'the wrapper exists');
  assert.ok(Object.keys(real).length > 30, 'the screens were found');
  assert.deepEqual(textScaleBoundary(real), []);
});

test('TEXT-SCALE: the ceiling is set, big numbers hold less than body text, and the wrapper applies it', () => {
  const theme = readFileSync(join(root, 'src/app/theme.ts'), 'utf8');
  const text = Number(/export const MAX_TEXT_SCALE = ([\d.]+);/.exec(theme)?.[1]);
  const big = Number(/export const MAX_BIG_SCALE = ([\d.]+);/.exec(theme)?.[1]);
  assert.ok(text >= 1.3 && text <= 2, `MAX_TEXT_SCALE ${text} keeps text readable and the layouts intact`);
  assert.ok(big >= 1 && big <= text, `MAX_BIG_SCALE ${big} is at most the body ceiling`);
  const wrapper = readFileSync(join(root, WRAPPER), 'utf8');
  assert.match(wrapper, /maxFontSizeMultiplier=\{MAX_TEXT_SCALE\}\s*\{\.\.\.p\}/g, 'a component may still pass its own lower cap after the default');
  assert.equal((wrapper.match(/maxFontSizeMultiplier=\{MAX_TEXT_SCALE\}/g) ?? []).length, 2, 'Text and TextInput both');
});

test('the guard catches violations (made-up files)', () => {
  assert.equal(textScaleBoundary({ 'src/app/screens/A.tsx': "import { Text, View } from 'react-native';" }).length, 1);
  assert.equal(textScaleBoundary({ 'src/app/screens/A.tsx': "import {\n  Pressable,\n  TextInput,\n} from 'react-native';" }).length, 1);
  assert.equal(textScaleBoundary({ 'App.tsx': "import { Text as T } from 'react-native';" }).length, 1);
  assert.equal(textScaleBoundary({ 'src/app/screens/A.tsx': "import { View, Pressable } from 'react-native';\nimport { Text } from './text.tsx';" }).length, 0);
  assert.equal(textScaleBoundary({ 'src/app/screens/A.tsx': "// import { Text } from 'react-native';" }).length, 0);
  assert.equal(textScaleBoundary({ 'src/app/screens/text.tsx': "import { Text as RNText } from 'react-native';" }).length, 0);
});
