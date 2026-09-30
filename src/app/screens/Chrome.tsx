// The frame around every tab: header, bottom tab bar with badges, floating Log
// button, and the tracker's icons. Layout only.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, TAP, useType } from '../theme.ts';

export type Tab = 'snap' | 'decks' | 'hourly' | 'plan';

// Paths from the tracker's ico() (24×24, stroked).
const ICONS = {
  snap: <><Path d="M4 15a8 8 0 1 1 16 0" /><Path d="M12 15l4-5" /></>,
  decks: <><Path d="M12 4l8 4-8 4-8-4z" /><Path d="M4 12l8 4 8-4" /><Path d="M4 16l8 4 8-4" /></>,
  hourly: <><Path d="M5 20V12" /><Path d="M10 20V6" /><Path d="M15 20V10" /><Path d="M20 20V4" /></>,
  plan: <><Path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" /><Circle cx="12" cy="11" r="2" /></>,
  clock: <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3 2" /></>,
  plus: <Path d="M12 5v14M5 12h14" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  chev: <Path d="M9 5l7 7-7 7" />,
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, color: c = color.ink, size = 20 }: { name: IconName; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </Svg>
  );
}

export function Header({ isTest, berth, vessel, sub, onVessels, onMap, onSearch }: { isTest: boolean; berth: string; vessel: string; sub: string; onVessels: () => void; onMap: () => void; onSearch: () => void }) {
  const f = useType();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 12 }]}>
      <View style={s.headRow}>
        <Text style={[s.chip, isTest ? s.chipTest : s.chipLive, { fontFamily: f.bodySemi }]}>{isTest ? 'TEST' : 'LIVE'}</Text>
        {berth !== '' && <Text style={[s.sub, { fontFamily: f.bodySemi }]} numberOfLines={1}>Berth {berth}</Text>}
      </View>
      <View style={s.vesselRow}>
        <Pressable onPress={onVessels} style={({ pressed }) => [s.vesselBtn, { flex: 1 }, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${vessel}. Switch or start a vessel`}>
          <Text style={[s.h1, { fontFamily: f.display, flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit>{vessel}</Text>
        </Pressable>
      </View>
      <View style={s.vesselRow}>
        <Text style={[s.sub, { fontFamily: f.body, flex: 1 }]}>{sub}</Text>
        <Pressable onPress={onSearch} style={({ pressed }) => [s.mapBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Search the SOPs and protocol">
          <Text style={[s.mapText, { fontFamily: f.bodySemi }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Search</Text>
        </Pressable>
        <Pressable onPress={onMap} style={({ pressed }) => [s.mapBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Terminal map">
          <Text style={[s.mapText, { fontFamily: f.bodySemi }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Map</Text>
        </Pressable>
      </View>
    </View>
  );
}

const TABS: [Tab, string][] = [['snap', 'Snapshot'], ['decks', 'Decks'], ['hourly', 'Hourly'], ['plan', 'Plan']];

export function TabBar({ tab, onTab, badges }: { tab: Tab; onTab: (t: Tab) => void; badges: Partial<Record<Tab, number>> }) {
  const f = useType();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.tabs, { paddingBottom: insets.bottom + 8 }]}>
      {TABS.map(([id, label]) => {
        const on = tab === id, n = badges[id] ?? 0;
        return (
          <Pressable key={id} onPress={() => onTab(id)} style={({ pressed }) => [s.tab, on && s.tabOn, pressed && { opacity: 0.6 }]} accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={n ? `${label}, ${n} to check` : label}>
            <Icon name={id} color={on ? color.accent : color.headMuted} />
            <View style={s.tabLabelRow}>
              <Text style={[s.tabLabel, { color: on ? color.accent : color.headMuted, fontFamily: f.bodySemi }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{label}</Text>
              {n > 0 && <Text style={[s.badge, { fontFamily: f.bodySemi }]}>{n}</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LogButton({ onPress }: { onPress: () => void }) {
  const f = useType();
  const insets = useSafeAreaInsets();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.fab, { bottom: insets.bottom + 84 }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Log an entry">
      <Icon name="plus" color={color.onBlue} />
      <Text style={[s.fabText, { fontFamily: f.bodySemi }]}>Log</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: color.head, paddingHorizontal: 20, paddingBottom: 16, gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, overflow: 'hidden' },
  chipTest: { backgroundColor: color.accent, color: color.ink },
  chipLive: { backgroundColor: color.green, color: color.card },
  sub: { fontSize: 14, color: color.headMuted, flexShrink: 1 },
  vesselBtn: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  vesselRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mapBtn: { minHeight: 44, minWidth: 52, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1.5, borderColor: color.headMuted, alignItems: 'center', justifyContent: 'center' },
  mapText: { fontSize: 14, color: color.headInk },
  h1: { fontSize: 32, color: color.headInk },
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.head, flexDirection: 'row', paddingHorizontal: 8 },
  tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 4, borderTopWidth: 3, borderTopColor: 'transparent' },
  tabOn: { borderTopColor: color.accent },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  tabLabel: { fontSize: 12, flexShrink: 1 },
  badge: { backgroundColor: color.red, color: color.onRed, borderRadius: 999, paddingHorizontal: 6, fontSize: 11, overflow: 'hidden' },
  fab: { position: 'absolute', right: 16, minHeight: TAP, paddingHorizontal: 22, borderRadius: 999, backgroundColor: color.blue, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fabText: { color: color.onBlue, fontSize: 16 },
});
