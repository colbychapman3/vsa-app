import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, light, night, TEXT_PAIRS, type Token } from '../src/app/palette.ts';

test('Night has every token Light has, as #RRGGBB', () => {
  for (const k of Object.keys(light) as Token[]) {
    assert.match(light[k], /^#[0-9A-F]{6}$/i, `light ${k}`);
    assert.match(night[k], /^#[0-9A-F]{6}$/i, `night ${k}`);
  }
  assert.deepEqual(Object.keys(night).sort(), Object.keys(light).sort());
});

test('Night: every text/background pair is at least 7:1', () => {
  for (const [t, b] of TEXT_PAIRS) {
    const c = contrast(night[t], night[b]);
    assert.ok(c >= 7, `night ${t} on ${b} is ${c.toFixed(2)}:1`);
  }
});

test('Light: no pair is below 4.5:1, and the sun-readable primary text stays at 7:1', () => {
  for (const [t, b] of TEXT_PAIRS) assert.ok(contrast(light[t], light[b]) >= 4.5, `light ${t} on ${b}`);
  for (const [t, b] of [['ink', 'bg'], ['ink', 'card'], ['muted', 'bg'], ['muted', 'card'], ['oInk', 'oBg'], ['rInk', 'rBg'], ['gInk', 'gBg'], ['headInk', 'head']] as [Token, Token][]) {
    assert.ok(contrast(light[t], light[b]) >= 7, `light ${t} on ${b}`);
  }
});

test('Night keeps status meaning: red, orange and green stay distinct fills', () => {
  const fills = [night.red, night.orange, night.green, night.blue];
  assert.equal(new Set(fills).size, fills.length);
  assert.ok(contrast(night.red, night.green) > 1.2 || night.red !== night.green);
});

test('map data colors do not change between palettes', () => {
  for (const k of ['mapZone', 'mapSite', 'mapYard', 'mapOem', 'mapRail', 'mapMeasure'] as Token[]) assert.equal(night[k], light[k]);
});

test('Light values are the original theme (the sun-readable look is unchanged)', () => {
  assert.equal(light.bg, '#F4F1EA');
  assert.equal(light.ink, '#15171A');
  assert.equal(light.blue, '#1D4ED8');
  assert.equal(light.accent, '#FDBA74');
});
