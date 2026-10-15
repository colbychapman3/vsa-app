// Phase 5, the no loop built in (Game Plan, 2026-10-12). Finished ships teach the next one: their rates, how far the forecast
// was off, and Colby's answer to "what slowed you down today?". Only rates and patterns carry forward: no cargo, counts or times
// of another ship ever enter this vessel's record, and TEST ships only ever teach TEST ships (vessel isolation).
import type { Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { completionStale } from './complete.ts';
import { scorecard, slowedNote } from './closeout.ts';

export type ShipResult = {
  id: string; name: string; date: string; isTest: boolean;
  prodCount: number; prodMin: number; field: number; countedHours: number; // the pace and H.A. inputs, pooled across ships
  pace: number | null; ha: number | null;
  forecastErrMin: number | null; // last forecast before the finish: actual − forecast (positive = finished later)
  slowed: string | null;
};

// A ship counts once Colby has marked it complete and the mark still holds. Remaining 0 alone is not finished.
export function shipResult(id: string, s: State, b: Baseline, isTest: boolean): ShipResult | null {
  if (!s.completed || completionStale(s)) return null;
  const sc = scorecard(s, b);
  const last = sc.rows.at(-1);
  return {
    id, name: s.vessel, date: b.date, isTest,
    prodCount: s.production.prodCount, prodMin: s.production.prodMin, field: s.production.field, countedHours: s.production.countedHours,
    pace: s.production.pace, ha: s.production.ha,
    forecastErrMin: last ? last.signedMin : null,
    slowed: slowedNote(s)?.text ?? null,
  };
}

// Themes are matched by plain keywords so the same answer always lands in the same place. Read the answers themselves too.
const THEMES: { name: string; words: string[] }[] = [
  { name: 'Shuttle vans', words: ['van', 'vans', 'shuttle', 'shuttles', 'tico'] },
  { name: 'Drivers and labor', words: ['driver', 'drivers', 'gang', 'gangs', 'labor', 'labour', 'crew', 'short handed', 'shorthanded', 'men'] },
  { name: 'Weather', words: ['rain', 'weather', 'lightning', 'storm', 'heat', 'wind', 'fog'] },
  { name: 'Ramp, decks and lashing', words: ['ramp', 'deck', 'decks', 'lashing', 'lashings', 'lash', 'stow', 'stowage', 'hatch'] },
  { name: 'Car problems', words: ['battery', 'batteries', 'jump', 'dead', 'flat', 'tire', 'tires', 'key', 'keys', 'fuel', 'gas'] },
  { name: 'Yard, gates and traffic', words: ['gate', 'gates', 'traffic', 'yard', 'lot', 'full', 'parking', 'road'] },
  { name: 'Counts and paperwork', words: ['count', 'counts', 'clerk', 'paperwork', 'tally', 'manifest'] },
  { name: 'Waiting and delays', words: ['wait', 'waiting', 'waited', 'delay', 'delayed', 'late', 'stop', 'stops', 'stopped', 'stoppage'] },
  { name: 'Damage and accidents', words: ['damage', 'damaged', 'accident', 'scratch', 'dent'] },
];
export function themesOf(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const hit = THEMES.filter((x) => x.words.some((w) => t.includes(` ${w} `))).map((x) => x.name);
  return hit.length ? hit : ['Other'];
}

export type Lessons = {
  ships: number; isTest: boolean;
  pace: number | null; paceShips: number;   // pooled: all productive autos ÷ all productive hours
  ha: number | null; haShips: number;       // pooled: all field autos ÷ all counted hours
  bias: number | null; biasShips: number;   // mean of (actual − last forecast), minutes
  themes: { name: string; ships: number }[]; // most common first
  answers: { name: string; date: string; text: string }[];
  results: ShipResult[];
};

export function lessons(all: ShipResult[], isTest: boolean): Lessons {
  const rs = all.filter((r) => r.isTest === isTest); // TEST never teaches LIVE, LIVE never teaches TEST
  const paced = rs.filter((r) => r.prodMin > 0);
  const counted = rs.filter((r) => r.countedHours > 0);
  const errs = rs.filter((r) => r.forecastErrMin != null);
  const tally = new Map<string, number>();
  for (const r of rs) if (r.slowed) for (const th of themesOf(r.slowed)) tally.set(th, (tally.get(th) ?? 0) + 1);
  return {
    ships: rs.length, isTest,
    pace: paced.length ? (paced.reduce((s, r) => s + r.prodCount, 0) / paced.reduce((s, r) => s + r.prodMin, 0)) * 60 : null, paceShips: paced.length,
    ha: counted.length ? counted.reduce((s, r) => s + r.field, 0) / counted.reduce((s, r) => s + r.countedHours, 0) : null, haShips: counted.length,
    bias: errs.length ? errs.reduce((s, r) => s + r.forecastErrMin!, 0) / errs.length : null, biasShips: errs.length,
    themes: [...tally].map(([name, ships]) => ({ name, ships })).sort((a, b) => b.ships - a.ships || a.name.localeCompare(b.name)),
    answers: rs.filter((r) => r.slowed).map((r) => ({ name: r.name, date: r.date, text: r.slowed! })),
    results: rs,
  };
}

const ships = (k: number) => `${k} finished ship${k === 1 ? '' : 's'}`;

// One line on how the forecast has run on past ships, to read beside this ship's FORECAST. It never changes the forecast.
export function biasLine(l: Lessons): string | null {
  if (l.bias == null) return null;
  const m = Math.round(l.bias);
  return `Past ${l.isTest ? 'TEST ' : ''}ships: ${m === 0 ? 'finished on their last forecast' : `finished on average ${Math.abs(m)} min ${m > 0 ? 'later' : 'earlier'} than their last forecast`} (${ships(l.biasShips)}).`;
}

// Before this ship has a pace of its own: how long these autos would take at past ships' pooled pace. History, not a forecast.
export function historyLine(l: Lessons, autos: number): string | null {
  if (l.pace == null || !(l.pace > 0) || !(autos > 0)) return null;
  const h = autos / l.pace;
  return `Past ${l.isTest ? 'TEST ' : ''}ships ran ${Math.round(l.pace)}/hr pace (${ships(l.paceShips)}). At that pace ${autos.toLocaleString('en-US')} autos take about ${h.toFixed(1)} productive hours. History, not this ship's forecast.`;
}
