// Terminal directory: protocol v1.1 Appendix C (side and pre-break cutoff) and Appendix D
// (measured berth-to-destination miles, Berths 1-3). Rail Yard is intentionally excluded.
// Sides and cutoffs are the same facts destination() and CLEAR_BY_MIN hold; tests keep them in step.
import { CLEAR_BY_MIN } from './time.ts';

type Row = [name: string, side: 'N' | 'S', miles: [number, number, number]];
const ROWS: Row[] = [
  ['Zone 1 (MB Field)', 'S', [2.10, 1.70, 1.75]], ['Zone 2', 'N', [0.80, 0.80, 1.15]], ['Zone 3', 'N', [1.50, 1.00, 1.70]],
  ['Zone 4', 'N', [0.50, 0.50, 0.65]], ['Zone 5', 'N', [0.70, 0.90, 1.00]], ['Zone 6', 'N', [1.30, 1.25, 1.50]],
  ['Zone 7', 'N', [1.50, 1.40, 1.20]], ['Zone 8', 'N', [1.50, 1.50, 1.50]], ['Zone 9', 'N', [1.50, 1.50, 1.70]],
  ['Zone T', 'S', [2.10, 1.90, 1.80]], ['Zone V', 'S', [2.50, 2.40, 2.25]], ['Zone X', 'S', [2.80, 2.50, 2.70]],
  ['Zone B', 'S', [3.00, 3.00, 3.00]], ['BMW Field', 'N', [0.80, 1.20, 1.30]], ['MBZ (Mercedes)', 'S', [2.30, 2.60, 2.40]],
  ['Site 2', 'N', [0.70, 0.60, 0.60]], ['Site 3', 'N', [0.80, 0.50, 0.63]], ['Site 4', 'N', [0.60, 0.30, 0.32]],
  ['Site 5', 'S', [2.80, 2.50, 2.70]], ['Site 6', 'S', [2.80, 2.50, 2.70]],
  ['Yard 1', 'N', [0.30, 0.30, 0.50]], ['Yard 2', 'N', [0.30, 0.20, 0.30]], ['Yard 3', 'N', [0.50, 0.20, 0.07]],
  ['AVP Yard', 'N', [0.36, 0.44, 0.66]], ['Gate 1', 'N', [1.20, 1.20, 1.50]], ['Gate 2', 'S', [1.60, 1.30, 1.40]],
];

export const TERMINAL = ROWS.map(([name, side, miles]) => ({ name, side, clearBy: CLEAR_BY_MIN[side === 'S' ? 'Southside' : 'Northside'], miles }));

// Everything the terminal knows about a destination at a berth (1-3); miles is null for an unknown berth.
export function terminalInfo(name: string, berth: string | number) {
  const d = TERMINAL.find((x) => x.name === name);
  if (!d) return null;
  const b = Number(berth);
  return { name: d.name, side: d.side, clearBy: d.clearBy, mi: b === 1 || b === 2 || b === 3 ? d.miles[b - 1] : null };
}
