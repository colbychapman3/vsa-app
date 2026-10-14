// Snapshot tab (reference: docs/reference/screens/01–03). Layout only; every
// value comes from view.snapshot().
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { needsLook, snapshot, type Banner } from '../view.ts';
import { nowLine } from '../now.ts';
import type { Layout } from '../snapshotLayout.ts';
import { bcolor, color, useType } from '../theme.ts';
import { Icon } from './Chrome.tsx';
import { BreakScale } from './Graphics.tsx';
import type { Save } from './Plan.tsx';
import { Boxes } from './SnapshotBoxes.tsx';
import { BannerView, Body, Label, u } from './ui.tsx';
import { NotUseful, type NotUsefulProps } from './NotUseful.tsx';

type Props = { state: State; baseline: Baseline; nowMin: number; onOpenTab: (t: 'hourly' | 'decks' | 'plan') => void; onTrack: (b: Banner) => void;
  isTest: boolean; save: Save; onNotice: (n: { ok: boolean; text: string }) => void;
  layout: Layout; onLayout: (l: Layout) => void; onHistory: () => void; onLog: () => void; notUseful?: (text: string) => NotUsefulProps };

export function Snapshot({ state, baseline, nowMin, onOpenTab, onTrack, isTest, save, onNotice, layout, onLayout, onHistory, onLog, notUseful }: Props) {
  const f = useType();
  const v = snapshot(state, baseline, nowMin);
  const line = nowLine(state, baseline, nowMin);
  const look = needsLook(state);
  // Only when something is due or wrong (Colby, 2026-10-12: "Nothing needs your attention" at the top wasn't useful).
  const now = line?.tone === 'calm' ? null : line;

  return (
    <View>
      {v.scale && <BreakScale scale={v.scale} />}
      {v.banners.map((b, i) => <BannerView key={i} banner={b} onTrack={onTrack} onGo={onOpenTab} />)}

      {now && (
        <View style={[s.now, now.tone === 'warn' ? s.nowWarn : now.tone === 'due' ? s.nowDue : s.nowCalm]} accessibilityRole="text" accessibilityLabel={`Now: ${now.text}`}>
          <Icon name="clock" color={now.tone === 'warn' ? color.onOrange : now.tone === 'due' ? color.accent : color.green} />
          <Text style={[s.nowText, { fontFamily: f.bodySemi, color: now.tone === 'warn' ? color.onOrange : now.tone === 'due' ? color.headInk : color.ink }]}>{now.text}</Text>
        </View>
      )}
      {now?.action && (
        <Pressable onPress={() => (now.action!.to === 'log' ? onLog() : onOpenTab('decks'))} accessibilityRole="button" accessibilityLabel={now.action.label}
          style={({ pressed }) => [s.nowBtn, now.tone === 'warn' ? s.nowBtnWarn : s.nowBtnDue, pressed && u.pressed]}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[s.nowBtnText, { fontFamily: f.bodySemi, color: now.tone === 'warn' ? color.headInk : color.onAction }]}>{now.action.label}</Text>
        </Pressable>
      )}
      {now && (now.advice || (notUseful && now.tone !== 'calm')) && (
        <View style={s.nowMore}>
          {now.advice && <Body>{now.advice}</Body>}
          {notUseful && now.tone !== 'calm' && <NotUseful key={now.text} {...notUseful(now.advice ? `${now.text} ${now.advice}` : now.text)} />}
        </View>
      )}

      <Boxes tab="snap" layout={layout} onLayout={onLayout} state={state} baseline={baseline} nowMin={nowMin} isTest={isTest} save={save} onNotice={onNotice} onOpenTab={onOpenTab} onHistory={onHistory} />

      {look.length > 0 && (
        <View style={s.look}>
          <Label>Needs a look</Label>
          {look.map((r) => (
            <Pressable key={r.text} onPress={() => onOpenTab(r.go)} accessibilityRole="button" accessibilityLabel={`${r.text}. Opens ${r.go === 'plan' ? 'Plan' : 'Decks'}.`}
              style={({ pressed }) => [s.lookRow, r.tone === 'red' ? s.lookRed : s.lookOrange, pressed && u.pressed]}>
              <Body semi style={{ flex: 1, color: r.tone === 'red' ? color.rInk : color.oInk }}>{r.text}</Body>
              <Text style={[s.stripRight, { color: r.tone === 'red' ? color.rInk : color.oInk, fontFamily: f.body }]}>View ›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  stripRight: { marginLeft: 'auto', fontSize: 15, color: color.muted, flexShrink: 1, textAlign: 'right' },
  look: { marginHorizontal: 20, marginBottom: 24, gap: 8 },
  lookRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5 },
  lookRed: { backgroundColor: color.rBg, borderColor: bcolor.red },
  lookOrange: { backgroundColor: color.oBg, borderColor: bcolor.orange },
  // The Now line: the one thing worth knowing right now (navy when a count is due, hi-vis orange for a warning).
  now: { marginHorizontal: 20, marginTop: 16, marginBottom: -4, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  nowWarn: { backgroundColor: color.orange },
  nowDue: { backgroundColor: color.head },
  nowCalm: { backgroundColor: color.card, borderWidth: 1, borderColor: bcolor.line },
  nowText: { flex: 1, fontSize: 15, lineHeight: 20 },
  nowBtn: { marginHorizontal: 20, marginTop: 10, minHeight: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  nowBtnDue: { backgroundColor: color.action, borderWidth: 2, borderColor: bcolor.ink },
  nowBtnWarn: { backgroundColor: color.head },
  nowBtnText: { fontSize: 17 },
  nowMore: { marginHorizontal: 20, marginTop: 10, gap: 4 },
});
