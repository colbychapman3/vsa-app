// Left-side menu: New vessel, the vessel list, Settings. An overlay inside the main screen, not a Modal,
// so it can never stack on a sheet; New vessel and Settings close it first and then open their own sheet.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VesselRow } from '../../storage/vessels.ts';
import { color, SCRIM, TAP, useType } from '../theme.ts';
import { sidebarVessels } from '../view.ts';
import { Chip, Go } from './ui.tsx';

const n = (x: number | null) => (x == null ? 'unknown' : x.toLocaleString('en-US'));

export function Sidebar({ rows, currentId, onClose, onOpen, onNew, onSettings }: {
  rows: VesselRow[]; currentId: string; onClose: () => void; onOpen: (id: string) => void; onNew: () => void; onSettings: () => void;
}) {
  const f = useType();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const w = Math.min(Math.round(width * 0.85), 340);
  const x = useRef(new Animated.Value(-w)).current;
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live) return;
      if (reduce) x.setValue(0); else Animated.timing(x, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }).catch(() => { if (live) x.setValue(0); }); // setting unreadable: show the menu without the slide
    return () => { live = false; };
  }, [x]);
  const { live, test } = sidebarVessels(rows, currentId);

  const list = (title: string, items: VesselRow[]) => items.length > 0 && (
    <View style={{ gap: 8 }}>
      <Text style={[s.sec, { fontFamily: f.bodySemi }]} numberOfLines={1}>{title}</Text>
      {items.map((r) => (
        <Pressable key={r.operationId} onPress={() => onOpen(r.operationId)} style={({ pressed }) => [s.row, r.operationId === currentId && s.rowOn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button" accessibilityLabel={`${r.operationId === currentId ? 'Open now: ' : 'Open '}${r.name}`}>
          <View style={s.chips}>
            <Chip text={r.isTest ? 'TEST' : 'LIVE'} tone={r.isTest ? 'orange' : 'plain'} />
            {r.operationId === currentId && <Chip text="Open now" />}
          </View>
          <Text style={{ fontFamily: f.display, fontSize: 22, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.name}</Text>
          <Text style={{ fontFamily: f.body, fontSize: 13, color: r.problem ? color.rInk : color.muted }}>
            {r.problem ? `Problem: ${r.problem}` : `${r.date || 'date unknown'} · Remaining ${n(r.remaining)} of ${n(r.start)} · Field ${n(r.field)}`}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      <Animated.View style={[s.panel, { width: w, paddingTop: 0, paddingBottom: insets.bottom + 12, transform: [{ translateX: x }] }]}>
        <View style={{ height: insets.top, backgroundColor: color.head, marginHorizontal: -16 }} />{/* dark strip under the status bar, as in the header */}
        <View style={s.top}>
          <Text style={{ fontFamily: f.display, fontSize: 28, color: color.ink, flex: 1 }} numberOfLines={1}>Vessels</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [s.x, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Close menu">
            <Text style={{ fontSize: 18, color: color.ink }}>✕</Text>
          </Pressable>
        </View>
        <Go label="New vessel" onPress={onNew} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 18, paddingVertical: 8 }}>
          {list('Live vessels', live)}
          {list('Test vessels', test)}
          {live.length + test.length === 0 && <Text style={{ fontFamily: f.body, fontSize: 14, color: color.muted }}>No vessels yet. Tap New vessel.</Text>}
        </ScrollView>
        <Go ghost label="Settings" onPress={onSettings} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.bg, borderRightWidth: 1, borderRightColor: color.line, paddingHorizontal: 16, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  x: { minWidth: TAP, minHeight: TAP, borderRadius: 999, backgroundColor: color.soft, alignItems: 'center', justifyContent: 'center' },
  sec: { fontSize: 13, letterSpacing: 0.8, color: color.muted },
  row: { minHeight: TAP, borderRadius: 14, borderWidth: 1, borderColor: color.line, backgroundColor: color.card, paddingVertical: 10, paddingHorizontal: 14, gap: 4, justifyContent: 'center' },
  rowOn: { borderColor: color.ink, borderWidth: 2 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
