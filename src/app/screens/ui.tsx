// Shared building blocks, styled after the tracker's CSS (.card, .lbl, .big,
// .bar, .tag, .alert, .sec-h, .note). Layout only.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { Banner } from '../view.ts';
import { color, TAP, useType } from '../theme.ts';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[u.card, style]}>{children}</View>;
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const f = useType();
  return <Text style={[u.lbl, { fontFamily: f.bodySemi }, style]}>{children}</Text>;
}

// Big numbers stay on one line and shrink to fit instead of wrapping mid-digit.
export function Big({ children, size, style }: { children: ReactNode; size: number; style?: StyleProp<TextStyle> }) {
  const f = useType();
  return (
    <Text style={[{ fontSize: size, lineHeight: size * 0.95, color: color.ink, fontFamily: f.display, fontWeight: f.display ? undefined : '700', fontVariant: ['tabular-nums'] }, style]}
      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
      {children}
    </Text>
  );
}

export function Body({ children, style, semi }: { children: ReactNode; style?: StyleProp<TextStyle>; semi?: boolean }) {
  const f = useType();
  return <Text style={[u.body, { fontFamily: semi ? f.bodySemi : f.body }, style]}>{children}</Text>;
}

export function Note({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const f = useType();
  return <Text style={[u.note, { fontFamily: f.body }, style]}>{children}</Text>;
}

export function Bar({ pct, small }: { pct: number; small?: boolean }) {
  return (
    <View style={[u.bar, small && u.barSm]}>
      <View style={[u.barFill, small && u.barFillSm, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );
}

export function Tag({ kind }: { kind: 'FORECAST' | 'CALCULATED' }) {
  const f = useType();
  return <Text style={[u.tag, kind === 'FORECAST' ? u.tagFc : u.tagCalc, { fontFamily: f.bodySemi }]}>{kind}</Text>;
}

export function SectionHead({ title, right }: { title: string; right?: string }) {
  const f = useType();
  return (
    <View style={u.secH}>
      <Text style={[u.h2, { fontFamily: f.display }]}>{title}</Text>
      {right ? <Text style={[u.secRight, { fontFamily: f.body }]}>{right}</Text> : null}
    </View>
  );
}

const TONES = {
  break: { bg: color.accent, border: color.accent, ink: color.ink },
  orange: { bg: color.oBg, border: color.orange, ink: color.oInk },
  red: { bg: color.rBg, border: color.red, ink: color.rInk },
  green: { bg: color.gBg, border: color.green, ink: color.gInk },
};

// Full-width status banner (tracker .alert). Red/orange alerts can be tracked as a discrepancy.
export function BannerView({ banner, onTrack }: { banner: Banner; onTrack?: (b: Banner) => void }) {
  const f = useType();
  const t = TONES[banner.tone];
  if (banner.tone === 'break') {
    return (
      <View style={[u.alert, u.alertBreak, { backgroundColor: t.bg, borderBottomColor: t.border }]}>
        <Text style={[u.breakTitle, { fontFamily: f.display, color: t.ink }]}>{banner.title}</Text>
        <Text style={{ fontFamily: f.body, fontSize: 14, color: t.ink }}>{banner.sub}</Text>
      </View>
    );
  }
  return (
    <View style={[u.alert, { backgroundColor: t.bg, borderBottomColor: t.border }]} accessibilityRole="alert">
      <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: t.ink }}>{banner.title}</Text>
      <Text style={{ fontFamily: f.body, fontSize: 14, color: t.ink }}>{banner.sub}</Text>
      {banner.trackable && onTrack ? (
        banner.tracked
          ? <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: t.ink, marginTop: 6 }}>On the open discrepancy list</Text>
          : <Pressable onPress={() => onTrack(banner)} style={[u.track, { borderColor: t.ink }]} accessibilityRole="button">
              <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: t.ink }}>Track as open discrepancy</Text>
            </Pressable>
      ) : null}
    </View>
  );
}

export const u = StyleSheet.create({
  card: { backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 16 },
  pad: { paddingVertical: 18, paddingHorizontal: 20 },
  lbl: { fontSize: 13, letterSpacing: 0.8, color: color.muted },
  body: { fontSize: 15, color: color.ink },
  note: { fontSize: 13, lineHeight: 18, color: color.muted },
  bar: { height: 14, backgroundColor: color.soft, borderRadius: 7, overflow: 'hidden' },
  barSm: { height: 8, borderRadius: 4 },
  barFill: { height: '100%', backgroundColor: color.ink, borderRadius: 7 },
  barFillSm: { backgroundColor: color.blue, borderRadius: 4 },
  tag: { alignSelf: 'flex-start', fontSize: 11, letterSpacing: 0.9, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, overflow: 'hidden' },
  tagFc: { backgroundColor: color.orange, color: color.onOrange },
  tagCalc: { backgroundColor: color.soft, color: color.ink },
  secH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  h2: { fontSize: 24, color: color.ink },
  secRight: { fontSize: 14, color: color.muted },
  alert: { paddingVertical: 12, paddingHorizontal: 20, gap: 2, borderBottomWidth: 3 },
  alertBreak: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakTitle: { fontSize: 22, letterSpacing: 0.9 },
  track: { alignSelf: 'flex-start', marginTop: 8, minHeight: 44, paddingHorizontal: 12, borderWidth: 1.5, borderRadius: 8, justifyContent: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  tap: { minHeight: TAP },
});
