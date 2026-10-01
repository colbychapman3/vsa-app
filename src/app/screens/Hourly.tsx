// Hourly tab (reference: docs/reference/screens/06–07). Layout only; values and graph
// geometry come from view.hourlyView() (the tracker's viewHourly/hourGraph).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { hourlyView } from '../view.ts';
import { color, useType } from '../theme.ts';
import { Bar, Big, Body, Card, Chip, FlipTile, Label, Note, SectionHead, Seg, u } from './ui.tsx';

export function Hourly({ state, baseline }: { state: State; baseline: Baseline }) {
  const f = useType();
  const v = hourlyView(state, baseline);
  const [view, setView] = useState<'list' | 'graph'>('list');

  return (
    <View style={s.main}>
      <FlipTile cardStyle={[u.pad, s.stats]} label="Hourly average, pace and total. Tap for how they are worked out"
        front={<>
          {([['H.A.', v.stats.ha], ['Pace', v.stats.pace], ['Total', v.stats.total]] as const).map(([l, n]) => (
            <View key={l} style={{ flex: 1, gap: 2 }}>
              <Label>{l}</Label>
              <Big size={40}>{n}</Big>
            </View>
          ))}
        </>}
        back={<View style={{ flex: 1, gap: 6 }}>
          <Label>HOW THESE ARE WORKED OUT</Label>
          <Body>H.A.: {v.stats.haNote}. Every logged hour counts as a full hour.</Body>
          <Body>Pace: {v.stats.paceNote}. Only the minutes worked count, so the short hour before a break is not held against it.</Body>
          <Body>Total: field count.</Body>
          {v.paceLine && <Note>{v.paceLine}</Note>}
          <Note>They match when no hour was cut short. The forecast uses Pace. Tap to flip back.</Note>
        </View>} />
      {v.unsetShort && (
        <View style={s.warn}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.oInk }}>{v.unsetShort}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 14, color: color.oInk }}>That hour is left out of pace and ETA until you pick when production stopped.</Text>
        </View>
      )}

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Field vs cleared by brand" />
        <View style={s.tr}>
          {['Brand', 'Field', 'Cleared', 'Difference'].map((h, i) => <Text key={h} style={[s.th, COL[i], i > 0 && s.num, { fontFamily: f.bodySemi }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{h}</Text>)}
        </View>
        {v.brandTable.map((b) => (
          <View key={b.name} style={[s.tr, s.tdLine]}>
            <Body fit semi style={[s.td, COL[0]]}>{b.name}</Body>
            <Body fit style={[s.td, COL[1], s.num]}>{b.field}</Body>
            <Body fit style={[s.td, COL[2], s.num]}>{b.cleared}</Body>
            <Body fit semi={b.diff.tone === 'red'} style={[s.td, COL[3], s.num, b.diff.tone === 'red' && { color: color.red }]}>{b.diff.text}</Body>
          </View>
        ))}
        {v.unsplitNote && <Note>{v.unsplitNote}</Note>}
        <Note>Cleared = starting minus remaining on vessel for that brand. Unknown until every deck holding that brand has a count.</Note>
      </Card>

      {v.rows.length === 0
        ? <Card style={u.pad}><Note style={{ textAlign: 'center' }}>No hourly counts yet. Use Log to add the first hour.</Note></Card>
        : <Seg columns={2} value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'graph', label: 'Graph' }]} />}

      {v.rows.length > 0 && view === 'list' && (
        <Card>
          {v.rows.map((r, i) => (
            <View key={`${r.dayHeader ?? ''}${r.range}${i}`}>
              {r.dayHeader && <Text style={[s.dayHead, { fontFamily: f.bodySemi }]}>{r.dayHeader}</Text>}
              <View style={[s.row, i > 0 && !r.dayHeader && s.rowLine]}>
                <View style={u.secH}>
                  <Body semi>{r.range}</Body>
                  <Big size={28}>{r.count}</Big>
                </View>
                <Bar small pct={r.barPct} />
                {r.short && (
                  <View style={s.tagRow}>
                    <Text style={[s.tag, { borderColor: color.orange, color: color.oInk, fontFamily: f.bodySemi }]}>SHORT HOUR</Text>
                    <Note style={r.shortUnset ? { color: color.oInk, fontWeight: '600' } : undefined}>{r.short}</Note>
                    {r.cutoff && <Note>{r.cutoff}</Note>}
                  </View>
                )}
                {r.corrected && (
                  <View style={s.tagRow}>
                    <Text style={[s.tag, { borderColor: color.blue, color: color.blue, fontFamily: f.bodySemi }]}>CORRECTED</Text>
                    <Note>{r.corrected}</Note>
                  </View>
                )}
                {r.delta && <Note>{r.delta}</Note>}
                {r.brands.length > 0 && <View style={s.tagRow}>{r.brands.map((b) => <Chip key={b.b} text={`${b.b} ${b.v}`} />)}</View>}
                {r.drivers && <Note>{r.drivers}</Note>}
                {r.photos.map((p) => <Note key={p} style={{ color: color.ink }}>Photo: {p}</Note>)}
              </View>
            </View>
          ))}
        </Card>
      )}

      {v.graph && view === 'graph' && (
        <Card style={[u.pad, { gap: 10 }]}>
          <SectionHead title="Hourly pace" right="autos per hour" />
          <Svg width="100%" height={undefined} viewBox={`0 0 ${v.graph.W} ${v.graph.H}`} style={{ aspectRatio: v.graph.W / v.graph.H }}
            accessibilityLabel="Hourly pace line graph">
            {v.graph.grid.map((g) => (
              <SvgGridLine key={g.label} y={g.y} label={g.label} L={v.graph!.L} right={v.graph!.W - v.graph!.R} />
            ))}
            {v.graph.avgY != null && <Line x1={v.graph.L} x2={v.graph.W - v.graph.R} y1={v.graph.avgY} y2={v.graph.avgY} stroke={color.muted} strokeWidth={1.5} strokeDasharray="5 4" />}
            <Polyline fill="none" stroke={color.blue} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" points={v.graph.points.map((p) => `${p.x},${p.y}`).join(' ')} />
            {v.graph.points.map((p, i) => (
              <SvgPoint key={i} x={p.x} y={p.y} count={p.count} short={p.short} xLabel={p.xLabel} baseY={v.graph!.H - v.graph!.Bm + 16} />
            ))}
          </Svg>
          <Note>{v.graph.note}{v.graph.hasShort ? ' Orange = pre-break hour, pace adjusted for the stoppage.' : ''}</Note>
        </Card>
      )}
    </View>
  );
}

function SvgGridLine({ y, label, L, right }: { y: number; label: string; L: number; right: number }) {
  return (
    <>
      <Line x1={L} x2={right} y1={y} y2={y} stroke={color.row} strokeWidth={1} />
      <SvgText x={L - 6} y={y + 4} textAnchor="end" fontSize={11} fill={color.muted}>{label}</SvgText>
    </>
  );
}

function SvgPoint({ x, y, count, short, xLabel, baseY }: { x: number; y: number; count: string; short: boolean; xLabel: string; baseY: number }) {
  return (
    <>
      <Circle cx={x} cy={y} r={5} fill={short ? color.orange : color.blue} stroke={color.card} strokeWidth={2} />
      <SvgText x={x} y={y - 10} textAnchor="middle" fontSize={12} fontWeight="600" fill={color.ink}>{count}</SvgText>
      <SvgText x={x} y={baseY} textAnchor="middle" fontSize={11} fill={color.muted}>{xLabel}</SvgText>
    </>
  );
}

// Brand table column widths: wide first and last columns so names and "field over" text fit.
const COL = [{ flex: 1.3 }, { flex: 1 }, { flex: 1 }, { flex: 1.8 }];

const s = StyleSheet.create({
  main: { padding: 20, gap: 16 },
  stats: { flexDirection: 'row', gap: 12 },
  warn: { backgroundColor: color.oBg, borderBottomWidth: 3, borderBottomColor: color.orange, borderRadius: 12, padding: 12, gap: 2 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tdLine: { borderTopWidth: 1, borderTopColor: color.row, paddingTop: 8 },
  th: { flex: 1, fontSize: 12, letterSpacing: 0.7, color: color.muted },
  td: { flex: 1 },
  num: { textAlign: 'right' },
  dayHead: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: color.soft, fontSize: 13, color: color.ink },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.row },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tag: { fontSize: 11, letterSpacing: 0.9, borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
});
