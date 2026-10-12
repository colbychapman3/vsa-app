// Snapshot tab (reference: docs/reference/screens/01–03). Layout only; every
// value comes from view.snapshot().
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { snapshot, type Banner } from '../view.ts';
import { nowLine } from '../now.ts';
import type { Layout } from '../snapshotLayout.ts';
import { bcolor, color, useType } from '../theme.ts';
import { Icon } from './Chrome.tsx';
import type { Save } from './Plan.tsx';
import { Boxes } from './SnapshotBoxes.tsx';
import { BannerView, Body, u } from './ui.tsx';
import { NotUseful, type NotUsefulProps } from './NotUseful.tsx';

type Props = { state: State; baseline: Baseline; nowMin: number; onOpenTab: (t: 'hourly' | 'decks' | 'plan') => void; onTrack: (b: Banner) => void;
  isTest: boolean; save: Save; onNotice: (n: { ok: boolean; text: string }) => void;
  layout: Layout; onLayout: (l: Layout) => void; onHistory: () => void; notUseful?: (text: string) => NotUsefulProps };

export function Snapshot({ state, baseline, nowMin, onOpenTab, onTrack, isTest, save, onNotice, layout, onLayout, onHistory, notUseful }: Props) {
  const f = useType();
  const v = snapshot(state, baseline, nowMin);
  const line = nowLine(state, baseline, nowMin);
  // Only when something is due or wrong (Colby, 2026-10-12: "Nothing needs your attention" at the top wasn't useful).
  const now = line?.tone === 'calm' ? null : line;

  return (
    <View>
      {v.banners.map((b, i) => <BannerView key={i} banner={b} onTrack={onTrack} onGo={onOpenTab} />)}

      {v.openIssues > 0 && (
        <Pressable onPress={() => onOpenTab('plan')} style={({ pressed }) => [s.strip, s.issues, pressed && u.pressed]} accessibilityRole="button">
          <Text style={[s.issueDot, { fontFamily: f.bodySemi }]}>!</Text>
          <Body semi style={{ color: color.oInk }}>{v.openIssues} open discrepanc{v.openIssues === 1 ? 'y' : 'ies'}</Body>
          <Text style={[s.stripRight, { color: color.oInk, fontFamily: f.body }]}>View ›</Text>
        </Pressable>
      )}

      {now && (
        <View style={[s.now, now.tone === 'warn' ? s.nowWarn : now.tone === 'due' ? s.nowDue : s.nowCalm]} accessibilityRole="text" accessibilityLabel={`Now: ${now.text}`}>
          <Icon name="clock" color={now.tone === 'warn' ? color.onAction : now.tone === 'due' ? color.accent : color.green} />
          <Text style={[s.nowText, { fontFamily: f.bodySemi, color: now.tone === 'warn' ? color.onAction : now.tone === 'due' ? color.headInk : color.ink }]}>{now.text}</Text>
        </View>
      )}
      {now && (now.advice || (notUseful && now.tone !== 'calm')) && (
        <View style={s.nowMore}>
          {now.advice && <Body>{now.advice}</Body>}
          {notUseful && now.tone !== 'calm' && <NotUseful key={now.text} {...notUseful(now.advice ? `${now.text} ${now.advice}` : now.text)} />}
        </View>
      )}

      <Boxes tab="snap" layout={layout} onLayout={onLayout} state={state} baseline={baseline} nowMin={nowMin} isTest={isTest} save={save} onNotice={onNotice} onOpenTab={onOpenTab} onHistory={onHistory} />
    </View>
  );
}

const s = StyleSheet.create({
  strip: { backgroundColor: color.card, borderBottomWidth: 1, borderBottomColor: bcolor.line, paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  stripRight: { marginLeft: 'auto', fontSize: 15, color: color.muted, flexShrink: 1, textAlign: 'right' },
  issues: { backgroundColor: color.oBg },
  // The Now line: the one thing worth knowing right now (navy when a count is due, hi-vis orange for a warning).
  now: { marginHorizontal: 20, marginTop: 16, marginBottom: -4, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  nowWarn: { backgroundColor: color.action },
  nowDue: { backgroundColor: color.head },
  nowCalm: { backgroundColor: color.card, borderWidth: 1, borderColor: bcolor.line },
  nowText: { flex: 1, fontSize: 15, lineHeight: 20 },
  nowMore: { marginHorizontal: 20, marginTop: 10, gap: 4 },
  issueDot: { width: 18, height: 18, borderRadius: 8, backgroundColor: color.orange, color: color.onOrange, textAlign: 'center', fontSize: 13, lineHeight: 18, overflow: 'hidden' },
});
