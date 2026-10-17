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
import { Body, Card, Chip, Go, Note, Pill, Seg, u } from './ui.tsx';

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
            <Go ghost label={warn.action.label} onPress={() => onOpenDeck(warn.action!.deck!)} />
          )}
          {notUseful && <NotUseful key={warn.text} {...notUseful(warn.advice ? `${warn.text} ${warn.advice}` : warn.text)} />}
        </View>
      )}
      <WhatIfCard state={state} baseline={baseline} />
      <View style={{ gap: 10 }}>
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
            <View style={s.stripLine}>
              <Text style={{ flexShrink: 1, fontFamily: f.body, fontSize: 15, color: color.muted }} numberOfLines={1}>{v.unconfirmedLabels.join(' · ')}</Text>
              <Text style={{ marginLeft: 'auto', flexShrink: 0, fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>Confirm on Plan ›</Text>
            </View>
          </Pressable>
        )}
      </View>

      <Seg<'all' | 'remaining'> columns={2} value={show} onChange={setShow}
        options={[{ value: 'all', label: `All decks (${v.rows.length})` }, { value: 'remaining', label: `Decks remaining (${left.length})` }]} />
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
              <View style={{ flexShrink: 0 }}><Pill text={r.pill} /></View>
              <Text style={s.rn} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={MAX_BIG_SCALE}>
                <Text style={{ fontFamily: f.display, fontSize: 22, color: r.status === 'complete' ? color.green : color.ink }}>{r.remaining}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 15, color: color.muted }}> of {r.start}</Text>
              </Text>
              <Icon name="chev" color={color.muted} />
            </View>
            {r.clearedShort && <Note style={s.indent}>Cleared {r.clearedShort}</Note>}
            {!r.cleared && r.split && <Note style={s.indent}>Deck split: {r.split} · counts per hatch not on paperwork</Note>}
            {r.heightTag && <View style={[s.chips, s.indent]}><Chip text={r.heightTag.text} tone={r.heightTag.tone} /></View>}
            {r.hatchesLeft.length > 0 && <View style={[s.chips, s.indent]}>{r.hatchesLeft.map((t) => <Chip key={t} text={t} tone="soft" />)}</View>}
            {r.lowerable && <Note style={s.indent}>Can be lowered. Confirm the height before vans go in.</Note>}
          </Pressable>
        ))}
      </Card>
      <View style={s.foot}><Note>Heights come from the stow plan until confirmed on Plan. Red: low deck. Orange: height not confirmed.</Note></View>
    </View>
  );
}

const s = StyleSheet.create({
  main: { padding: 20, gap: 16 },
  warn: { backgroundColor: color.oBg, borderWidth: 1.5, borderColor: bcolor.orange, borderRadius: 12, padding: 14, gap: 8 },
  lowAlert: { backgroundColor: color.rBg, borderBottomWidth: 3, borderBottomColor: bcolor.red, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  strip: { gap: 2, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' },
  stripLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  foot: { borderLeftWidth: 3, borderLeftColor: color.line, paddingLeft: 10 },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 8, minHeight: 56 },
  rowLine: { borderTopWidth: 1, borderTopColor: bcolor.row },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dnBox: { width: 84, flexShrink: 0 }, // fixed, so every row's status pill starts in one column (board 1.3)
  dn: { fontSize: 22, color: color.ink },
  hm: { fontSize: 17 },
  accBadge: { backgroundColor: color.rBg, color: color.rInk, borderWidth: 1, borderColor: bcolor.red },
  badge: { alignSelf: 'flex-start', marginTop: 4, fontSize: 13, color: color.onBlue, backgroundColor: color.red, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  rn: { marginLeft: 'auto', textAlign: 'right', flexShrink: 1 },
  indent: { paddingLeft: 96 }, // under the pill column: name column 84 + gap 12
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
