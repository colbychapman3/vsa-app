// Small drawn graphics from the Every Screen mockups (Colby, 2026-10-14). Layout only; the numbers come from view.snapshot().
import { View, type ColorValue } from 'react-native';
import { Text } from './text.tsx';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { snapshot } from '../view.ts';
import { bcolor, color, useType } from '../theme.ts';
import { Label, u } from './ui.tsx';

type Scale = NonNullable<ReturnType<typeof snapshot>['scale']>;
const fmt = (n: number) => n.toLocaleString('en-US');

// The break check as a balance: ship on the left, field on the right; the heavier side hangs lower. Level = match.
export function BreakScale({ scale }: { scale: Scale }) {
  const f = useType();
  const big = Math.max(scale.ship, scale.field, 1);
  const a = Math.max(-1, Math.min(1, (scale.diff / big) * 40)) * 0.2; // up to about 11 degrees; a tilt is never drawn for a match
  const L = 110, cx = 160, cy = 34;
  const lx = cx - L * Math.cos(a), ly = cy + L * Math.sin(a), rx = cx + L * Math.cos(a), ry = cy - L * Math.sin(a);
  const pan = (x: number, y: number, fill: ColorValue) => (
    <>
      <Line x1={x} y1={y} x2={x - 40} y2={y + 56} stroke={color.muted} strokeWidth={2} />
      <Line x1={x} y1={y} x2={x + 40} y2={y + 56} stroke={color.muted} strokeWidth={2} />
      <Path d={`M ${x - 46} ${y + 56} Q ${x} ${y + 92} ${x + 46} ${y + 56} Z`} fill={fill} />
    </>
  );
  const ink = scale.tone === 'red' ? color.rInk : scale.tone === 'orange' ? color.oInk : color.gInk;
  return (
    <View style={[u.card, { marginHorizontal: 20, marginTop: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 6, alignItems: 'center' }]}
      accessible accessibilityLabel={`${scale.title}: ship ${fmt(scale.ship)}, field ${fmt(scale.field)}. ${scale.text}.`}>
      <View style={{ alignSelf: 'stretch' }}><Label>{scale.title}</Label></View>
      <Svg width="100%" height={150} viewBox="0 0 320 150">
        <Line x1={cx} y1={cy} x2={cx} y2={132} stroke={color.muted} strokeWidth={8} strokeLinecap="round" />
        <Line x1={120} y1={136} x2={200} y2={136} stroke={color.muted} strokeWidth={8} strokeLinecap="round" />
        <Line x1={lx} y1={ly} x2={rx} y2={ry} stroke={color.ink} strokeWidth={8} strokeLinecap="round" />
        {pan(lx, ly, color.head)}
        {pan(rx, ry, color.done)}
        <Circle cx={cx} cy={cy} r={8} fill={color.action} stroke={color.ink} strokeWidth={2} />
      </Svg>
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', paddingHorizontal: 12 }}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.ink }}>Ship {fmt(scale.ship)}</Text>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.muted }}>Field {fmt(scale.field)}</Text>
      </View>
      <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: ink, borderWidth: 1.5, borderColor: scale.tone === 'red' ? bcolor.red : scale.tone === 'orange' ? bcolor.orange : bcolor.green, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4, overflow: 'hidden' }}>{scale.text}</Text>
    </View>
  );
}
