// Replay timings at growing log sizes. Prints a table; never fails. CI guards the growth with
// tests/replayScaling.test.ts (work counts, not milliseconds). Desktop numbers say little about an iPhone.
// Run:  npm run bench:replay
import { readFileSync } from 'node:fs';
import { project, replay } from '../src/engine/index.ts';
import { synthLog, SYNTH_OP } from '../tests/synthLog.ts';

const baseline = JSON.parse(readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8'));
const median = (run) => { const t = []; for (let i = 0; i < 5; i++) { const s = performance.now(); run(); t.push(performance.now() - s); } return t.sort((a, b) => a - b)[2]; };

console.log('events | project() ms | replay() ms');
for (const n of [100, 300, 1000, 3000, 10000]) {
  const events = synthLog(n);
  const r = project(baseline, events, SYNTH_OP);
  if (!r.ok) { console.log(String(n).padStart(6), '| refused:', r.error); continue; }
  console.log(String(n).padStart(6), '|', median(() => project(baseline, events, SYNTH_OP)).toFixed(1).padStart(12), '|', median(() => replay(events, SYNTH_OP)).toFixed(1).padStart(11));
}
