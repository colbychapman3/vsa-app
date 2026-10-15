// Decks tab (reference: docs/reference/screens/04). Layout only; values from view.decksView().
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './text.tsx';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { WhatIfCard } from './WhatIfCard.tsx';
import { NotUseful, type NotUsefulProps } from './NotUseful.tsx';
import { nowLine } from '../now.ts';
import { decksRemaining, decksView } from '../view.ts';
import { bcolor, color, MAX_BIG_SCALE, useType } from '../theme.ts';
import { Icon } from './Chrome.tsx';
import { ShipBox } from './SnapshotBoxes.tsx';
import { Body, Card, Chip, InfoNote, Note, Pill, SectionHead, Seg, u } from './ui.tsx';

const acc = (r: { photoTypes: { type: string; photos: number }[] }) => r.photoTypes.find((t) => t.type === 'accident')?.photos ?? 0;

export function Decks({ state, baseline, nowMin, onOpenDeck, onOpenPlan, showShip, notUseful }: { state: State; baseline: Baseline; nowMin: number; showShip: boolean; onOpenDeck: (id: string) => void; onOpenPlan: () => void; notUseful?: (text: string) => NotUsefulProps }) {
  const f = useType();
  const line = nowLine(state, baseline, nowMin);
  const warn = line?.tone === 'warn' ? line : null; // a deck that won't clear before the break: said here, where the decks are
  const v = decksView(state);
  const [show, setShow] = useState<'all' | 'remaining'>('all');
  const left = decksRemaining(v.rows);
  const rows = show === 'all' ? v.rows : left;
  return (
    <View style={s.main}>
      {/* The ship sits here too (Colby, 2026-10-12: on Snapshot and on Decks); a tap opens the first deck that still has cars. */}
      {showShip && <ShipBox state={state} onOpen={() => left[0] && onOpenDeck(left[0].id)} onOpenDeck={onOpenDeck} />}
      {warn && (
        <View style={s.warn} accessibilityRole="alert">
          <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.oInk }}>{warn.text}</Text>
          {warn.advice && <Body>{warn.advice}</Body>}
          {warn.action?.deck && (
            <Pressable onPress={() => onOpenDeck(warn.action!.deck!)} accessibilityRole="button" style={({ pressed }) => [u.ghostBtn, pressed && u.pressed]}>
              <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{warn.action.label}</Text>
            </Pressable>
          )}
          {notUseful && <NotUseful key={warn.text} {...notUseful(warn.advice ? `${warn.text} ${warn.advice}` : warn.text)} />}
        </View>
      )}
      <WhatIfCard state={state} baseline={baseline} />
      <View style={{ gap: 10 }}>
        <SectionHead title="Deck heights" />
        <InfoNote><Note>Shuttle vans need a deck height of 1.85 m or more. A deck below that gets a low-deck warning.</Note></InfoNote>
        {v.low.length === 0 && <Card style={u.pad}><Note>No low decks with cargo remaining.</Note></Card>}
        {v.low.map((d) => (
          <View key={d.id} style={s.lowAlert} accessibilityRole="alert">
            <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.rInk }}>{d.title}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 15, color: color.rInk }}>{d.sub}</Text>
          </View>
        ))}
        {v.unconfirmed > 0 && (
          <Pressable onPress={onOpenPlan} style={({ pressed }) => [u.card, s.strip, pressed && u.pressed]} accessibilityRole="button">
            <Body semi>{v.unconfirmed} deck height{v.unconfirmed === 1 ? '' : 's'} unconfirmed</Body>
            <Text style={{ marginLeft: 'auto', fontFamily: f.body, fontSize: 15, color: color.muted }}>Confirm on Plan ›</Text>
          </Pressable>
        )}
      </View>

      <Seg<'all' | 'remaining'> columns={2} value={show} onChange={setShow}
        options={[{ value: 'all', label: `All (${v.rows.length})` }, { value: 'remaining', label: `Remaining (${left.length})` }]} />
      {rows.length === 0 && <Card style={u.pad}><Note>Every deck is complete.</Note></Card>}
      <Card>
        {rows.map((r, i) => (
          <Pressable key={r.id} onPress={() => onOpenDeck(r.id)} accessibilityRole="button" accessibilityLabel={`${r.label}, ${r.pill}, ${r.remaining} of ${r.start} remaining`}
            style={({ pressed }) => [s.row, i > 0 && s.rowLine, r.low && { backgroundColor: color.rBg }, pressed && u.pressed]}>
            <View style={s.line}>
              <View style={s.dnBox}>
                <Text style={[s.dn, { fontFamily: f.display }]} numberOfLines={1} adjustsFontSizeToFit>{r.label}</Text>
                <Text style={[s.hm, { fontFamily: f.display, color: r.height.tone === 'red' ? color.rInk : r.height.tone === 'orange' ? color.oInk : color.muted }]} numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={r.height.text}>{r.heightShort}</Text>
                {r.photos > 0 && <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[s.badge, { fontFamily: f.bodySemi }]} accessibilityLabel={`${r.photos} photo${r.photos === 1 ? '' : 's'} on this deck`}>📷 {r.photos}</Text>}
                {acc(r) > 0 && <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[s.badge, s.accBadge, { fontFamily: f.bodySemi }]} accessibilityLabel={`${acc(r)} accident photo${acc(r) === 1 ? '' : 's'} on this deck`}>🚨 {acc(r)}</Text>}
              </View>
              <Text style={s.rn} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={MAX_BIG_SCALE}>
                <Text style={{ fontFamily: f.display, fontSize: 22, color: r.status === 'complete' ? color.done : color.ink }}>{r.remaining}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 15, color: color.muted }}> of {r.start}</Text>
              </Text>
              <Icon name="chev" color={color.muted} />
            </View>
            {r.clearedShort && <Note style={s.indent}>Cleared: {r.clearedShort}</Note>}
            {!r.cleared && r.split && <Note style={s.indent}>Deck split: {r.split} · counts per hatch not on paperwork</Note>}
            <View style={[s.chips, s.indent]}>
              <Pill text={r.pill} />
              {r.height.tone !== 'plain' && <Chip text={r.height.text} tone={r.height.tone} />}
              {r.hatches.map((h) => <Chip key={h.h} text={h.chip} tone={h.left?.tone} />)}
            </View>
          </Pressable>
        ))}
      </Card>
      <InfoNote><Note>Heights come from the stow plan until confirmed on the Plan tab. Red rows are low decks.</Note></InfoNote>
    </View>
  );
}

const s = StyleSheet.create({
  main: { padding: 20, gap: 16 },
  warn: { backgroundColor: color.oBg, borderWidth: 1.5, borderColor: bcolor.orange, borderRadius: 12, padding: 14, gap: 8 },
  lowAlert: { backgroundColor: color.rBg, borderBottomWidth: 3, borderBottomColor: bcolor.red, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16 },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 8, minHeight: 56 },
  rowLine: { borderTopWidth: 1, borderTopColor: bcolor.row },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dnBox: { minWidth: 56, flexShrink: 0 },
  dn: { fontSize: 22, color: color.ink },
  hm: { fontSize: 17 },
  accBadge: { backgroundColor: color.rBg, color: color.rInk, borderWidth: 1, borderColor: bcolor.red },
  badge: { alignSelf: 'flex-start', marginTop: 4, fontSize: 13, color: color.onBlue, backgroundColor: color.red, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  rn: { marginLeft: 'auto', textAlign: 'right', flexShrink: 1 },
  indent: { paddingLeft: 68 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
