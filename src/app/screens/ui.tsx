// Shared building blocks, styled after the tracker's CSS (.card, .lbl, .big,
// .bar, .tag, .alert, .sec-h, .note). Layout only.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
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
  input: { minHeight: 52, borderWidth: 1.5, borderColor: color.line, borderRadius: 10, backgroundColor: color.card, paddingHorizontal: 14, color: color.ink },
  segBtn: { minHeight: 48, flexGrow: 1, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.card, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segOn: { backgroundColor: color.ink, borderColor: color.ink },
  goBtn: { minHeight: TAP, borderRadius: 12, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  ghostBtn: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  errBox: { backgroundColor: color.rBg, color: color.rInk, borderRadius: 10, padding: 12, fontSize: 14, overflow: 'hidden' },
});

// ---------- Form parts (tracker .seg, label.f, .go, .ghost, .err) ----------

export function Field({ label, value, onChange, placeholder, keyboard = 'number-pad', note, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  keyboard?: 'number-pad' | 'default' | 'numbers-and-punctuation'; note?: string; maxLength?: number;
}) {
  const f = useType();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }}>{label}{note ? <Text style={{ fontFamily: f.body, color: color.muted }}> {note}</Text> : null}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboard} maxLength={maxLength}
        style={[u.input, { fontFamily: f.bodyMedium, fontSize: keyboard === 'default' ? 17 : 20 }]} placeholderTextColor={color.muted} accessibilityLabel={label} />
    </View>
  );
}

// A time box that starts empty. "Now" fills the phone's time; Colby can still edit it.
export function TimeField({ label, value, onChange, onNow }: { label: string; value: string; onChange: (v: string) => void; onNow: () => void }) {
  const f = useType();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput value={value} onChangeText={onChange} placeholder="HH:MM" keyboardType="numbers-and-punctuation" maxLength={5}
          style={[u.input, { flex: 1, fontFamily: f.bodyMedium, fontSize: 20 }]} placeholderTextColor={color.muted} accessibilityLabel={label} />
        <Pressable onPress={onNow} style={[u.ghostBtn, { paddingHorizontal: 20 }]} accessibilityRole="button" accessibilityLabel={`${label}: now`}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 16, color: color.ink }}>Now</Text>
        </Pressable>
      </View>
      <Text style={{ fontFamily: f.body, fontSize: 12, color: color.muted }}>Leave empty if unknown: the save time is shown, labeled as processing time.</Text>
    </View>
  );
}

export function Seg<T extends string | number>({ options, value, onChange, columns = 3 }: {
  options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; columns?: number;
}) {
  const f = useType();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={[u.segBtn, { flexBasis: `${100 / columns - 2}%` }, on && u.segOn]}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: on ? color.bg : color.ink, textAlign: 'center' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Go({ label, onPress, ghost, disabled }: { label: string; onPress: () => void; ghost?: boolean; disabled?: boolean }) {
  const f = useType();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [ghost ? u.ghostBtn : u.goBtn, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={{ fontFamily: f.bodySemi, fontSize: ghost ? 15 : 17, color: ghost ? color.ink : color.onBlue }}>{label}</Text>
    </Pressable>
  );
}

export function ErrorBox({ text }: { text: string }) {
  const f = useType();
  return <Text style={[u.errBox, { fontFamily: f.bodyMedium }]} accessibilityRole="alert">{text}</Text>;
}

// Deck status pill (tracker .pill p-active / p-paused / p-not / p-done / p-unk).
const PILL: Record<string, { bg: string; ink: string; border: string; dashed?: boolean }> = {
  Active: { bg: color.blue, ink: color.onBlue, border: color.blue },
  Paused: { bg: color.oBg, ink: color.oInk, border: color.orange },
  Skipped: { bg: color.oBg, ink: color.oInk, border: color.orange },
  'Not started': { bg: 'transparent', ink: color.ink, border: color.ink },
  Complete: { bg: color.soft, ink: color.muted, border: color.soft },
  Unknown: { bg: 'transparent', ink: color.muted, border: color.muted, dashed: true },
};
export function Pill({ text }: { text: string }) {
  const f = useType();
  const p = PILL[text] ?? PILL.Unknown;
  return (
    <Text style={{ fontFamily: f.bodySemi, fontSize: 12, letterSpacing: 0.4, color: p.ink, backgroundColor: p.bg, borderColor: p.border, borderWidth: 1.5,
      borderStyle: p.dashed ? 'dashed' : 'solid', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' }}>
      {text === 'Complete' ? '✓ ' : ''}{text}
    </Text>
  );
}

// Small rounded chip (tracker .bchip); tone colors a height warning.
export function Chip({ text, tone = 'plain' }: { text: string; tone?: 'plain' | 'red' | 'orange' }) {
  const f = useType();
  const c = tone === 'red' ? { bg: color.rBg, ink: color.rInk, b: color.red } : tone === 'orange' ? { bg: color.oBg, ink: color.oInk, b: color.orange } : { bg: color.card, ink: color.ink, b: color.line };
  return <Text style={{ fontFamily: f.body, fontSize: 13, color: c.ink, backgroundColor: c.bg, borderColor: c.b, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' }}>{text}</Text>;
}
