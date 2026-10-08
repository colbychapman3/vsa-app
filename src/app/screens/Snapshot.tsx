// Snapshot tab (reference: docs/reference/screens/01–03). Layout only; every
// value comes from view.snapshot().
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { snapshot, type Banner } from '../view.ts';
import type { Layout } from '../snapshotLayout.ts';
import { color, useType } from '../theme.ts';
import { Icon } from './Chrome.tsx';
import type { Save } from './Plan.tsx';
import { Boxes } from './SnapshotBoxes.tsx';
import { BannerView, Body, u } from './ui.tsx';

type Props = { state: State; baseline: Baseline; nowMin: number; onOpenTab: (t: 'hourly' | 'decks' | 'plan') => void; onTrack: (b: Banner) => void;
  isTest: boolean; save: Save; onNotice: (n: { ok: boolean; text: string }) => void;
  layout: Layout; onLayout: (l: Layout) => void; onHistory: () => void };

export function Snapshot({ state, baseline, nowMin, onOpenTab, onTrack, isTest, save, onNotice, layout, onLayout, onHistory }: Props) {
  const f = useType();
  const v = snapshot(state, baseline, nowMin);

  return (
    <View>
      {v.banners.map((b, i) => <BannerView key={i} banner={b} onTrack={onTrack} onGo={onOpenTab} />)}

      {v.strip && (
        <View style={s.strip}>
          <Icon name="clock" />
          {v.strip.breakAt
            ? <>
                <Body semi>Break {v.strip.breakAt}</Body>
                <Text style={[s.stripRight, { fontFamily: f.body }]}>
                  Clear-by {v.strip.clearBy.map((c, i) => <Text key={c.side}>{i ? ' · ' : ''}{c.side} <Text style={{ fontFamily: f.bodySemi, color: color.ink }}>{c.at}</Text></Text>)}
                </Text>
              </>
            : <Body semi>No more scheduled breaks today</Body>}
        </View>
      )}

      {v.openIssues > 0 && (
        <Pressable onPress={() => onOpenTab('plan')} style={({ pressed }) => [s.strip, s.issues, pressed && u.pressed]} accessibilityRole="button">
          <Text style={[s.issueDot, { fontFamily: f.bodySemi }]}>!</Text>
          <Body semi style={{ color: color.oInk }}>{v.openIssues} open discrepanc{v.openIssues === 1 ? 'y' : 'ies'}</Body>
          <Text style={[s.stripRight, { color: color.oInk, fontFamily: f.body }]}>View ›</Text>
        </Pressable>
      )}

      <Boxes tab="snap" layout={layout} onLayout={onLayout} state={state} baseline={baseline} nowMin={nowMin} isTest={isTest} save={save} onNotice={onNotice} onOpenTab={onOpenTab} onHistory={onHistory} />
    </View>
  );
}

const s = StyleSheet.create({
  strip: { backgroundColor: color.card, borderBottomWidth: 1, borderBottomColor: color.line, paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  stripRight: { marginLeft: 'auto', fontSize: 14, color: color.muted, flexShrink: 1, textAlign: 'right' },
  issues: { backgroundColor: color.oBg },
  issueDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.orange, color: color.onOrange, textAlign: 'center', fontSize: 12, lineHeight: 18, overflow: 'hidden' },
});
