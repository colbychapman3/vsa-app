// Colby's real Hector Highway 10A cover page as word positions (Windows text reader on
// docs/reference/game-plan-example-hector-highway-10a/7-working-plan-game-plan-form.jpg), and a "complete" copy
// that adds only the cells that reader missed, exactly as printed on the paper.
import { readFileSync } from 'node:fs';
import { deskew, type Page, type Word } from '../src/app/layout.ts';

export const load = (name: string): Page => JSON.parse(readFileSync(new URL(`./fixtures/gameplan/${name}.json`, import.meta.url), 'utf8').replace(/^﻿/, ''));
export const form = () => load('7-working-plan-game-plan-form');
const clone = (p: Page): Page => JSON.parse(JSON.stringify(p));

// Add a printed cell on the same row as a reference word (following the page tilt).
function addOnRow(p: Page, ref: (w: Word) => boolean, x: number, t: string) {
  const r = p.words.find(ref)!;
  const tan = Math.tan((deskew(p.words).tiltDeg * Math.PI) / 180);
  p.words.push({ t, x, y: Math.round(r.y + (x - r.x) * tan), w: t.length * 14, h: r.h });
}
const deckWord = (d: string, x: number) => (w: Word) => w.t === d && Math.abs(w.x - x) < 15;
export function complete(): Page {
  const p = clone(form());
  addOnRow(p, deckWord('10', 949), 1093, '1*2*3*4');
  addOnRow(p, deckWord('11', 949), 1110, '1*2');
  addOnRow(p, deckWord('12', 949), 1093, '1*2*3*4');
  addOnRow(p, deckWord('4', 954), 1107, '2*3');
  addOnRow(p, deckWord('2', 955), 155, '130');
  addOnRow(p, deckWord('2', 955), 636, 'MB');
  addOnRow(p, deckWord('1', 956), 152, '128');
  return p;
}
