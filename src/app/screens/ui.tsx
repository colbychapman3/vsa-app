// Shared building blocks, styled after the tracker's CSS (.card, .lbl, .big,
// .bar, .tag, .alert, .sec-h, .note). Layout only.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ColorValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { Banner } from '../view.ts';
import { color, TAP, useType } from '../theme.ts';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[u.card, style]}>{children}</View>;
}

// Short caps labels stay on one line and shrink to fit, so a word never splits at
// large text sizes ("COMPLETIO/N"). Sentence-length labels pass `wrap`: they wrap
// between words in a full-width row.
export function Label({ children, style, wrap }: { children: ReactNode; style?: StyleProp<TextStyle>; wrap?: boolean }) {
  const f = useType();
  return wrap
    ? <Text style={[u.lbl, { fontFamily: f.bodySemi }, style]}>{children}</Text>
    : <Text style={[u.lbl, { fontFamily: f.bodySemi }, style]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{children}</Text>;
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

// `fit`: one line, shrinks to fit (table cells), so a word never splits.
export function Body({ children, style, semi, fit }: { children: ReactNode; style?: StyleProp<TextStyle>; semi?: boolean; fit?: boolean }) {
  const f = useType();
  return <Text style={[u.body, { fontFamily: semi ? f.bodySemi : f.body }, style]} {...(fit ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6 } : {})}>{children}</Text>;
}

export function Note({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const f = useType();
  return <Text style={[u.note, { fontFamily: f.body }, style]}>{children}</Text>;
}

// A box that flips to its explanation when tapped and back when tapped again (a quarter turn out, swap, a quarter turn in).
// The front stays short; the back carries the wording. Respects Reduce Motion by swapping at once.
export function FlipTile({ front, back, style, cardStyle, label }: { front: ReactNode; back: ReactNode; style?: StyleProp<ViewStyle>; cardStyle?: StyleProp<ViewStyle>; label: string }) {
  const [showBack, setShowBack] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;
  const reduce = useRef(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduce.current = r; }).catch(() => {}); }, []);
  const turning = useRef(false); // a second tap during a flip is ignored, so a fast double tap cannot flip twice and cancel itself
  const flip = () => {
    if (reduce.current) return setShowBack((b) => !b);
    if (turning.current) return;
    turning.current = true;
    Animated.timing(turn, { toValue: 1, duration: 140, useNativeDriver: true }).start(() => {
      setShowBack((b) => !b);
      turn.setValue(-1);
      Animated.timing(turn, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => { turning.current = false; });
    });
  };
  const rotate = turn.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-90deg', '0deg', '90deg'] });
  return (
    <Pressable onPress={flip} style={style} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={showBack ? 'Shows the figure again' : 'Shows how it is worked out'}>
      <Animated.View style={[u.card, cardStyle, { transform: [{ perspective: 900 }, { rotateY: rotate }] }]}>{showBack ? back : front}</Animated.View>
    </Pressable>
  );
}

// The wording behind a tap: a short "About this" row that shows or hides its notes. Keeps main screens short; nothing that
// warns or blocks goes in here, only explanations.
export function InfoNote({ children, label = 'About this' }: { children: ReactNode; label?: string }) {
  const f = useType();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={open ? 'Hide details' : label}
        style={({ pressed }) => [{ minHeight: TAP, justifyContent: 'center' }, pressed && u.pressed]}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.blue }}>{open ? 'Hide details ▴' : `${label} ▾`}</Text>
      </Pressable>
      {open && children}
    </View>
  );
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
  return <Text style={[u.tag, kind === 'FORECAST' ? u.tagFc : u.tagCalc, { fontFamily: f.bodySemi }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{kind}</Text>;
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
  break: { bg: color.accent, border: color.accent, ink: color.onAccent },
  orange: { bg: color.oBg, border: color.orange, ink: color.oInk },
  red: { bg: color.rBg, border: color.red, ink: color.rInk },
  green: { bg: color.gBg, border: color.green, ink: color.gInk },
};

// Full-width status banner (tracker .alert). Red/orange alerts can be tracked as a discrepancy.
export function BannerView({ banner, onTrack, onGo }: { banner: Banner; onTrack?: (b: Banner) => void; onGo?: (tab: 'hourly' | 'decks') => void }) {
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
      {banner.go && onGo ? (
        <Pressable onPress={() => onGo(banner.go!)} accessibilityRole="button" accessibilityLabel={`${banner.title}. ${banner.sub}. Open ${banner.go === 'decks' ? 'Decks' : 'Hourly'} to fix it`}
          style={({ pressed }) => [{ minHeight: TAP, justifyContent: 'center', gap: 2 }, pressed && u.pressed]}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: t.ink }}>{banner.title}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 14, color: t.ink }}>{banner.sub}</Text>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: t.ink, textDecorationLine: 'underline' }}>Open {banner.go === 'decks' ? 'Decks' : 'Hourly'} to fix ›</Text>
        </Pressable>
      ) : (
        <>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: t.ink }}>{banner.title}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 14, color: t.ink }}>{banner.sub}</Text>
        </>
      )}
      {banner.trackable && onTrack ? (
        banner.tracked
          ? <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: t.ink, marginTop: 6 }}>On the open discrepancy list</Text>
          : <Pressable onPress={() => onTrack(banner)} style={({ pressed }) => [u.track, { borderColor: t.ink }, pressed && u.pressed]} accessibilityRole="button">
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
  tag: { alignSelf: 'flex-start', maxWidth: '100%', fontSize: 11, letterSpacing: 0.9, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, overflow: 'hidden' },
  tagFc: { backgroundColor: color.orange, color: color.onOrange },
  tagCalc: { backgroundColor: color.soft, color: color.ink },
  secH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  h2: { fontSize: 24, color: color.ink },
  secRight: { fontSize: 14, color: color.muted },
  alert: { paddingVertical: 12, paddingHorizontal: 20, gap: 2, borderBottomWidth: 3 },
  alertBreak: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakTitle: { fontSize: 22, letterSpacing: 0.9 },
  track: { alignSelf: 'flex-start', marginTop: 8, minHeight: TAP, paddingHorizontal: 12, borderWidth: 1.5, borderRadius: 8, justifyContent: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  tap: { minHeight: TAP },
  pressed: { opacity: 0.6 },
  input: { minHeight: TAP, borderWidth: 1.5, borderColor: color.line, borderRadius: 10, backgroundColor: color.card, paddingHorizontal: 14, color: color.ink },
  segBtn: { minHeight: TAP, flexGrow: 1, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.card, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segOn: { backgroundColor: color.ink, borderColor: color.ink },
  goBtn: { minHeight: TAP, borderRadius: 12, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  ghostBtn: { minHeight: TAP, borderRadius: 12, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  x: { minWidth: TAP, minHeight: TAP, borderRadius: 999, backgroundColor: color.soft, alignItems: 'center', justifyContent: 'center' },
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
      <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{label}{note ? <Text style={{ fontFamily: f.body, color: color.muted }}> {note}</Text> : null}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboard} maxLength={maxLength}
        style={[u.input, { fontFamily: f.bodyMedium, fontSize: keyboard === 'default' ? 17 : 20 }]} placeholderTextColor={color.muted} accessibilityLabel={label} />
    </View>
  );
}

// A time box that starts empty. "Now" fills the phone's time; Colby can still edit it.
export function TimeField({ label, value, onChange, onNow, required, hint }: { label: string; value: string; onChange: (v: string) => void; onNow: () => void; required?: boolean; hint?: string }) {
  const f = useType();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput value={value} onChangeText={onChange} placeholder="HH:MM" keyboardType="numbers-and-punctuation" maxLength={5}
          style={[u.input, { flex: 1, fontFamily: f.bodyMedium, fontSize: 20 }]} placeholderTextColor={color.muted} accessibilityLabel={label} />
        <Pressable onPress={onNow} style={[u.ghostBtn, { paddingHorizontal: 20 }]} accessibilityRole="button" accessibilityLabel={`${label}: now`}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 16, color: color.ink }}>Now</Text>
        </Pressable>
      </View>
      <Text style={{ fontFamily: f.body, fontSize: 12, color: required ? color.ink : color.muted }}>
        {required ? 'Required: type the time or tap Now.' : 'Leave empty if unknown: the save time is shown, labeled as processing time.'}{hint ? ` ${hint}` : ''}
      </Text>
    </View>
  );
}

export function Seg<T extends string | number>({ options, value, onChange, columns = 3 }: {
  options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; columns?: number;
}) {
  const f = useType();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={({ pressed }) => [u.segBtn, { flexBasis: `${100 / columns - 2}%` }, on && u.segOn, pressed && u.pressed]}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: on ? color.bg : color.ink, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{o.label}</Text>
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
  useEffect(() => { AccessibilityInfo.announceForAccessibility(text); }, [text]); // a role alone doesn't announce on iOS
  return <Text style={[u.errBox, { fontFamily: f.bodyMedium }]} accessibilityRole="alert">{text}</Text>;
}

// Deck status pill (tracker .pill p-active / p-paused / p-not / p-done / p-unk).
const PILL: Record<string, { bg: ColorValue; ink: ColorValue; border: ColorValue; dashed?: boolean }> = {
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
export function Chip({ text, tone = 'plain', tall }: { text: string; tone?: 'plain' | 'red' | 'orange'; tall?: boolean }) {
  const f = useType();
  const c = tone === 'red' ? { bg: color.rBg, ink: color.rInk, b: color.red } : tone === 'orange' ? { bg: color.oBg, ink: color.oInk, b: color.orange } : { bg: color.card, ink: color.ink, b: color.line };
  const label = <Text style={{ fontFamily: f.body, fontSize: 13, color: c.ink }}>{text}</Text>;
  const box = { backgroundColor: c.bg, borderColor: c.b, borderWidth: 1, borderRadius: 999, paddingHorizontal: tall ? 16 : 10, paddingVertical: tall ? 0 : 3 };
  return tall ? <View style={[box, { minHeight: TAP, justifyContent: 'center' }]}>{label}</View> : <Text style={[box, { fontFamily: f.body, fontSize: 13, color: c.ink, overflow: 'hidden' }]}>{text}</Text>;
}

// One sheet frame for every form: title, TEST chip (sheets cover the header), close.
// Only one Modal is ever open: the deck sheet opens inside the Log sheet, not on top of it.
export function Sheet({ title, isTest, onClose, children, scrollKey, scrollTopOn }: { title: string; isTest: boolean; onClose: () => void; children: ReactNode; scrollKey?: string; scrollTopOn?: string }) {
  const f = useType();
  const ref = useRef<ScrollView>(null);
  // scrollTopOn: go back to the top without remounting the children (a form keeps its typed values).
  useEffect(() => { ref.current?.scrollTo({ y: 0, animated: false }); }, [scrollTopOn]);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView ref={ref} key={scrollKey} style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 14 }}
        keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
          <View style={u.secH}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              {isTest && <Text style={{ fontFamily: f.bodySemi, fontSize: 12, backgroundColor: color.accent, color: color.onAccent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, overflow: 'hidden' }}>TEST</Text>}
              <Text style={{ fontFamily: f.display, fontSize: 28, color: color.ink, flexShrink: 1 }}>{title}</Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [u.x, pressed && u.pressed]} accessibilityRole="button" accessibilityLabel="Close"><Text style={{ fontSize: 18, color: color.ink }}>✕</Text></Pressable>
          </View>
          {children}
      </ScrollView>
    </Modal>
  );
}
