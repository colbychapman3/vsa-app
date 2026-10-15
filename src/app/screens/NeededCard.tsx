// Needed rate gauge (HANDOFF_SPEC 9.4, boards 1.4, 1.4b, 1.4c): what the rest of Day 1 must average to make last cars, against the
// current Pace, on one scale. A calculation, never a FORECAST, and never peach: a warning is an orange outline, not an action.
// Layout only: every number and sentence comes from view.neededRate.
import { StyleSheet, View } from 'react-native';
import { Text } from './text.tsx';
import type { Needed } from '../view.ts';
import { bcolor, color, MAX_BIG_SCALE, PACE_COLOR, useType } from '../theme.ts';
import { Big, Card, Label, Note, Tag, u } from './ui.tsx';

export function NeededCard({ n }: { n: Needed }) {
  const f = useType();
  if (!n.ok) return <Card style={[u.pad, { gap: 4 }]}><View style={u.secH}><Label>Needed rate</Label><Tag kind="CALCULATED" /></View><Note>{n.reason}</Note></Card>;
  const pct = (x: number) => `${Math.min(100, (x / n.scaleMax) * 100)}%` as const;
  const ink = n.warn ? color.orange : color.ink;
  return (
    <Card style={[u.pad, { gap: 8 }, n.warn && { borderWidth: 2, borderColor: bcolor.orange }]}>
      <View style={u.secH}><Label>Needed rate</Label><Tag kind="CALCULATED" /></View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <Big size={40} style={{ color: ink }}>{String(n.rate)}</Big>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.muted }} maxFontSizeMultiplier={MAX_BIG_SCALE}>/hr to make last cars {n.target}</Text>
      </View>
      {n.pace != null && (
        <View accessible accessibilityLabel={`Needed ${n.rate} per hour, pace ${n.pace} per hour`} style={{ gap: 4 }}>
          <View style={s.track}>
            <View style={[s.fill, { width: pct(n.pace), backgroundColor: PACE_COLOR }]} />
            <View style={[s.tick, { left: pct(n.rate), backgroundColor: ink }]} />
          </View>
          <View style={u.secH}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: ink }}>Needed {n.rate}</Text>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: PACE_COLOR }}>Pace {n.pace}</Text>
          </View>
        </View>
      )}
      <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: n.warn ? color.oInk : color.ink }}>{n.line}</Text>
      <Note>{n.detail}</Note>
    </Card>
  );
}

const s = StyleSheet.create({
  track: { height: 14, borderRadius: 7, backgroundColor: bcolor.soft, overflow: 'visible', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 7 },
  tick: { position: 'absolute', width: 4, top: -5, bottom: -5, marginLeft: -2, borderRadius: 2 },
});
