// Est. completion history (Colby, 2026-10-08): the ETA after each logged hour, as a line or as bars of how far it moved, with a
// plus/minus line per hour. Rebuilt from the log (src/app/etaHistory.ts); nothing here is stored or calculated by the screen.
import { useMemo, useState } from 'react';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { formatHM, type Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { etaHistory, type EtaPoint } from '../etaHistory.ts';
import { snapshot } from '../view.ts';
import { color } from '../theme.ts';
import { Body, Label, Note, Seg, Sheet, Tag } from './ui.tsx';

const clock = (abs: number) => formatHM(abs % 1440);
const W = 340, H = 190, PAD = 30;

export function EtaHistory({ state, baseline, nowMin, isTest, onClose }: { state: State; baseline: Baseline; nowMin: number; isTest: boolean; onClose: () => void }) {
  const [view, setView] = useState<'line' | 'bars'>('line');
  const pts = useMemo(() => etaHistory(baseline, state.log.events, state.operationId), [baseline, state.log.events, state.operationId]);
  const v = snapshot(state, baseline, nowMin);
  return (
    <Sheet title="Est. completion history" isTest={isTest} onClose={onClose}>
      <Tag kind="FORECAST" />
      <Label>HOW THIS IS WORKED OUT</Label>
      {v.eta.notes.map((n) => <Body key={n}>{n}</Body>)}
      <Note>A forecast, not a result: it follows the recent pace, skips the 12:00 and 18:00 breaks, and is never marked complete by itself.</Note>

      <Label>ETA AFTER EACH LOGGED HOUR</Label>
      {pts.length === 0
        ? <Note>No hours are logged yet, so there is no history.</Note>
        : <>
            <Seg<'line' | 'bars'> columns={2} value={view} onChange={setView} options={[{ value: 'line', label: 'Line' }, { value: 'bars', label: 'Bars' }]} />
            {view === 'line' ? <LineChart pts={pts} /> : <BarChart pts={pts} />}
            <Note>{view === 'line' ? 'Higher on the chart is a later finish.' : 'Orange bars: the ETA moved later at that hour. Green bars: earlier.'}</Note>
            <Label>PLUS / MINUS BY HOUR</Label>
            {[...pts].reverse().map((p) => <Body key={`${p.day}-${p.hour}`}>{p.text}</Body>)}
            <Note>These lines say what changed. They don’t say why: pace, drivers, breaks and the cargo left all move the ETA.</Note>
          </>}
    </Sheet>
  );
}

const xAt = (i: number, n: number) => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
const every = (n: number) => Math.max(1, Math.ceil(n / 7)); // hour labels thin out on a long day

function LineChart({ pts }: { pts: EtaPoint[] }) {
  const known = pts.filter((p) => p.etaAbs != null);
  if (!known.length) return <Note>No forecast could be made yet at any logged hour.</Note>;
  const lo = Math.min(...known.map((p) => p.etaAbs!)), hi = Math.max(...known.map((p) => p.etaAbs!)), span = hi - lo || 1;
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const dots = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.etaAbs != null);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel="Line chart of the estimated completion time after each logged hour">
      <Line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={color.line} strokeWidth={1} />
      <SvgText x={2} y={y(hi) + 4} fontSize={11} fill={color.muted}>{clock(hi)}</SvgText>
      {hi !== lo && <SvgText x={2} y={y(lo) + 4} fontSize={11} fill={color.muted}>{clock(lo)}</SvgText>}
      <Polyline points={dots.map(({ p, i }) => `${xAt(i, pts.length)},${y(p.etaAbs!)}`).join(' ')} fill="none" stroke={color.orange} strokeWidth={3} />
      {dots.map(({ p, i }) => <Circle key={`${p.day}-${p.hour}`} cx={xAt(i, pts.length)} cy={y(p.etaAbs!)} r={4.5} fill={color.orange} />)}
      {pts.map((p, i) => i % every(pts.length) === 0 && <SvgText key={`l${p.day}-${p.hour}`} x={xAt(i, pts.length)} y={H - 10} fontSize={11} fill={color.muted} textAnchor="middle">{p.hour}</SvgText>)}
    </Svg>
  );
}

function BarChart({ pts }: { pts: EtaPoint[] }) {
  const moves = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.deltaMin != null);
  if (!moves.length) return <Note>Bars need two hours with a forecast. Log another hour.</Note>;
  const max = Math.max(1, ...moves.map(({ p }) => Math.abs(p.deltaMin!)));
  const mid = (H - PAD) / 2 + 6, half = (H - PAD) / 2 - 18, bw = Math.min(28, (W - 2 * PAD) / pts.length - 6);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel="Bar chart of how many minutes the estimated completion moved at each logged hour">
      <Line x1={PAD} y1={mid} x2={W - PAD} y2={mid} stroke={color.line} strokeWidth={1} />
      {moves.map(({ p, i }) => {
        const d = p.deltaMin!, h = (Math.abs(d) / max) * half, x = xAt(i, pts.length) - bw / 2;
        return (
          <G key={`${p.day}-${p.hour}`}>
            <Rect x={x} y={d >= 0 ? mid - h : mid} width={bw} height={Math.max(h, d === 0 ? 0 : 1)} fill={d > 0 ? color.orange : color.green} />
            <SvgText x={x + bw / 2} y={d >= 0 ? mid - h - 4 : mid + h + 12} fontSize={11} fill={color.ink} textAnchor="middle">{d > 0 ? `+${d}` : String(d)}</SvgText>
          </G>
        );
      })}
      {pts.map((p, i) => i % every(pts.length) === 0 && <SvgText key={`l${p.day}-${p.hour}`} x={xAt(i, pts.length)} y={H - 10} fontSize={11} fill={color.muted} textAnchor="middle">{p.hour}</SvgText>)}
    </Svg>
  );
}
