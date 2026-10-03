// Light and Night color values, plain data (no React Native), so contrast can be tested in Node.
// Light is the VSA Live tracker's hi-vis theme and never changes here; Night mirrors each token so every
// text/background pair keeps working when the pair flips (a token used as a fill and as text is lighter in Night).
export const light = {
  bg: '#F4F1EA', card: '#FFFFFF', ink: '#15171A', muted: '#4A4F57', line: '#D9D3C7', soft: '#E6E0D4', row: '#EFEAE0',
  blue: '#1D4ED8', onBlue: '#FFFFFF', orange: '#B45309', onOrange: '#FFFFFF', onRed: '#FFFFFF',
  oBg: '#FFF7ED', oInk: '#7C2D12', red: '#B91C1C', rBg: '#FEE2E2', rInk: '#7F1D1D',
  green: '#15803D', gBg: '#DCFCE7', gInk: '#14532D',
  head: '#15171A', headInk: '#F4F1EA', headMuted: '#D6D1C6', accent: '#FDBA74', onAccent: '#15171A', done: '#5A5F66',
  // Terminal map data colors: only for shapes, never for text, same in both palettes.
  mapZone: '#2F8BFF', mapSite: '#22C47F', mapYard: '#FFB020', mapOem: '#A45CF2', mapRail: '#27C95A', mapMeasure: '#FF4FA3',
};
export type Token = keyof typeof light;

export const night: Record<Token, string> = {
  bg: '#101214', card: '#1B1E22', ink: '#F3F0E9', muted: '#B4BAC3', line: '#3A4048', soft: '#2C3137', row: '#23272C',
  blue: '#8CB2FF', onBlue: '#0A1226', orange: '#F5A524', onOrange: '#1C1100', onRed: '#2B0707',
  oBg: '#35210F', oInk: '#FFC999', red: '#FF8585', rBg: '#3A1414', rInk: '#FFC4C4',
  green: '#5EE08A', gBg: '#12301D', gInk: '#B8F2CB',
  head: '#0A0B0D', headInk: '#F4F1EA', headMuted: '#D6D1C6', accent: '#FDBA74', onAccent: '#15171A', done: '#A3A9B1',
  mapZone: light.mapZone, mapSite: light.mapSite, mapYard: light.mapYard, mapOem: light.mapOem, mapRail: light.mapRail, mapMeasure: light.mapMeasure,
};

// [text token, background token]: the pairs the screens actually draw.
export const TEXT_PAIRS: [Token, Token][] = [
  ['ink', 'bg'], ['ink', 'card'], ['onAccent', 'accent'], ['muted', 'bg'], ['muted', 'card'], ['done', 'card'], ['done', 'bg'],
  ['onBlue', 'blue'], ['onOrange', 'orange'], ['onRed', 'red'], ['card', 'green'],
  ['blue', 'card'], ['blue', 'bg'], ['red', 'card'], ['green', 'card'], ['orange', 'card'],
  ['oInk', 'oBg'], ['oInk', 'card'], ['oInk', 'bg'], ['rInk', 'rBg'], ['gInk', 'gBg'],
  ['headInk', 'head'], ['headMuted', 'head'], ['accent', 'head'],
];

const channel = (h: string, i: number) => {
  const v = parseInt(h.slice(i, i + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (h: string) => 0.2126 * channel(h, 1) + 0.7152 * channel(h, 3) + 0.0722 * channel(h, 5);
// WCAG contrast ratio of two #RRGGBB colors.
export function contrast(a: string, b: string): number {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
