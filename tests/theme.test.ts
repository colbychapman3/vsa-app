import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, light, night, sunLight, TEXT_PAIRS, type Token } from '../src/app/palette.ts';

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

test('Light is Design B, Ship Plan (Colby, 2026-10-11): navy ink on steel grey; the action is peach (Colby, 2026-10-14)', () => {
  assert.equal(light.bg, '#EEF1F4');
  assert.equal(light.ink, '#0E1A2B');
  assert.equal(light.action, '#FFD6A5');
  assert.equal(night.action, '#FFD6A5');
  assert.ok(contrast(light.onAction, light.action) >= 7, 'the Log and Save buttons read at 7:1 in sun');
});

test('Extra visible: every text pair is at least 7:1, ink is black, and white cards stand off the page', () => {
  for (const [t, b] of TEXT_PAIRS) {
    const c = contrast(sunLight[t], sunLight[b]);
    assert.ok(c >= 7, `sun ${t} on ${b} is ${c.toFixed(2)}:1`);
  }
  assert.equal(sunLight.ink, '#000000');
  assert.ok(contrast(sunLight.card, sunLight.bg) > contrast(light.card, light.bg), 'cards separate from the page more than in Light');
  assert.deepEqual(Object.keys(sunLight).sort(), Object.keys(light).sort());
  for (const k of Object.keys(light) as Token[]) assert.match(sunLight[k], /^#[0-9A-F]{6}$/i, `sun ${k}`);
});
