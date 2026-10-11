// Light and Night color values, plain data (no React Native), so contrast can be tested in Node.
// Design B "Ship Plan" (Colby picked it, 2026-10-11): steel-grey page, navy ink and hull, hi-vis orange for the one
// action that matters, a blue fill for cars still aboard. Night mirrors each token so every text/background pair keeps
// working when the pair flips (a token used as a fill and as text is lighter in Night).
export const light = {
  bg: '#EEF1F4', card: '#FFFFFF', ink: '#0E1A2B', muted: '#3A4B60', line: '#CBD3DC', soft: '#DCE3EC', row: '#F4F6F8',
  blue: '#1D4ED8', onBlue: '#FFFFFF', orange: '#B45309', onOrange: '#FFFFFF', onRed: '#FFFFFF',
  oBg: '#FFF4EB', oInk: '#7C2D12', red: '#B91C1C', rBg: '#FEE2E2', rInk: '#7F1D1D',
  green: '#15803D', gBg: '#DCFCE7', gInk: '#14532D',
  head: '#14243B', headInk: '#FFFFFF', headMuted: '#C9D6EA', accent: '#FF8A3D', onAccent: '#0E1A2B', done: '#5A6B80',
  // The one primary action (Log, Save): hi-vis orange with navy text, readable in sun at 7:1.
  action: '#FF8A3D', onAction: '#0E1A2B',
  // The ship: hull, deck tracks (a hatch with cars / a cleared one), the fill for cars still aboard, text on the hull.
  hull: '#14243B', deckTrack: '#24375A', deckClear: '#1B2C47', deckFill: '#3D7BFF', deckWarn: '#FF8A3D', deckInk: '#FFFFFF', deckMuted: '#A9BAD1',
  // Terminal map data colors: only for shapes, never for text, same in both palettes.
  mapZone: '#2F8BFF', mapSite: '#22C47F', mapYard: '#FFB020', mapOem: '#A45CF2', mapRail: '#27C95A', mapMeasure: '#FF4FA3',
};
export type Token = keyof typeof light;

export const night: Record<Token, string> = {
  bg: '#0A121D', card: '#13202F', ink: '#E8EEF5', muted: '#B5C4D8', line: '#2A3B55', soft: '#1E2F48', row: '#15233A',
  blue: '#8CB2FF', onBlue: '#0A1226', orange: '#F5A524', onOrange: '#1C1100', onRed: '#2B0707',
  oBg: '#35210F', oInk: '#FFC999', red: '#FF8585', rBg: '#3A1414', rInk: '#FFC4C4',
  green: '#5EE08A', gBg: '#12301D', gInk: '#B8F2CB',
  head: '#060D17', headInk: '#E8EEF5', headMuted: '#B5C4D8', accent: '#FF8A3D', onAccent: '#0A121D', done: '#A3B1C2',
  action: '#FF8A3D', onAction: '#0A121D',
  hull: '#050A12', deckTrack: '#1E3354', deckClear: '#101C2E', deckFill: '#4C8DFF', deckWarn: '#FF8A3D', deckInk: '#FFFFFF', deckMuted: '#A9BAD1',
  mapZone: light.mapZone, mapSite: light.mapSite, mapYard: light.mapYard, mapOem: light.mapOem, mapRail: light.mapRail, mapMeasure: light.mapMeasure,
};

// [text token, background token]: the pairs the screens actually draw.
export const TEXT_PAIRS: [Token, Token][] = [
  ['ink', 'bg'], ['ink', 'card'], ['onAccent', 'accent'], ['muted', 'bg'], ['muted', 'card'], ['done', 'card'], ['done', 'bg'],
  ['onBlue', 'blue'], ['onOrange', 'orange'], ['onRed', 'red'], ['card', 'green'],
  ['blue', 'card'], ['blue', 'bg'], ['red', 'card'], ['green', 'card'], ['orange', 'card'],
  ['oInk', 'oBg'], ['oInk', 'card'], ['oInk', 'bg'], ['rInk', 'rBg'], ['gInk', 'gBg'],
  ['headInk', 'head'], ['headMuted', 'head'], ['accent', 'head'],
  ['onAction', 'action'], ['deckInk', 'hull'], ['deckMuted', 'hull'], ['deckInk', 'deckTrack'],
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
