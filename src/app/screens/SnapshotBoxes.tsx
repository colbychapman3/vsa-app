// The Snapshot's boxes, each shown where the layout (src/app/snapshotLayout.ts) puts it: on the Snapshot or at the top of
// Plan, Hourly or Decks. Layout only; every value comes from view.snapshot(). Long press a box for "Move to" and Hide.
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { snapshot } from '../view.ts';
import { shipView, HATCH_SLOTS, type Seg } from '../ship.ts';
import { BOX_TITLE, boxesFor, moveToTab, PINNED, setHidden, TABS, TAB_TITLE, type BoxId, type BoxTab, type Layout } from '../snapshotLayout.ts';
import { bcolor, color, HA_COLOR, TAP, useType } from '../theme.ts';
import { VesselCards, type Save } from './Plan.tsx';
import { FieldBox } from './FieldBox.tsx';
import { Bar, Big, Body, Card, FillNumber, FlipTile, InfoNote, Label, Note, SectionHead, Tag, u } from './ui.tsx';

export type BoxProps = {
  tab: BoxTab; layout: Layout; onLayout: (l: Layout) => void;
  state: State; baseline: Baseline; nowMin: number; isTest: boolean; save: Save;
  onNotice: (n: { ok: boolean; text: string }) => void;
  onOpenTab: (t: 'hourly' | 'decks' | 'plan') => void; onHistory: () => void;
};

export function Boxes(p: BoxProps) {
  const ids = boxesFor(p.layout, p.tab);
  if (!ids.length) return p.tab === 'snap' ? <Note style={{ padding: 20 }}>Every box is hidden or moved to another tab. Settings › Customize Snapshot brings them back.</Note> : null;
  const v = snapshot(p.state, p.baseline, p.nowMin);
  // The two tiles sit side by side when they are next to each other.
  const rows: BoxId[][] = [];
  for (const id of ids) { const last = rows.at(-1); if ((id === 'eta' || id === 'ha') && last && (last[0] === 'eta' || last[0] === 'ha') && last.length === 1 && last[0] !== id) last.push(id); else rows.push([id]); }
  return (
    <View style={p.tab === 'snap' ? s.main : s.moved}>
      {rows.map((r) => r.length === 2
        ? <View key={r.join()} style={s.grid2}>{r.map((id) => <Box key={id} id={id} v={v} p={p} half />)}</View>
        : <Box key={r[0]} id={r[0]} v={v} p={p} half={r[0] === 'eta' || r[0] === 'ha' ? false : undefined} />)}
    </View>
  );
}

type V = ReturnType<typeof snapshot>;

function Box({ id, v, p, half }: { id: BoxId; v: V; p: BoxProps; half?: boolean }) {
  const menu = () => Alert.alert(BOX_TITLE[id], 'Move to:', [
    ...TABS.filter((t) => t !== p.tab).map((t) => ({ text: TAB_TITLE[t], onPress: () => p.onLayout(moveToTab(p.layout, id, t)) })),
    ...(PINNED.includes(id) ? [] : [{ text: 'Hide this box', style: 'destructive' as const, onPress: () => p.onLayout(setHidden(p.layout, id, true)) }]),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
  const wrap = (kids: ReactNode) => <Pressable onLongPress={menu} delayLongPress={450} accessibilityHint="Long press to move or hide this box" style={half ? { flex: 1 } : undefined}>{kids}</Pressable>;
  const f = useType();
  switch (id) {
    case 'hero': return wrap(<HeroBox v={v} />);
    case 'ship': return wrap(<ShipBox state={p.state} onOpen={() => p.onOpenTab('decks')} />);
    case 'field': return wrap(<FieldBox v={v} />);
    case 'eta': return (
      <Pressable onPress={p.onHistory} onLongPress={menu} delayLongPress={450} style={half ? { flex: 1 } : undefined} accessibilityRole="button"
        accessibilityLabel="Finish, forecast. Tap for its history" accessibilityHint="Long press to move or hide this box">
        <View style={[u.card, s.tile, s.tileFc, v.eta.dashed && s.dashed]}>
          <Tag kind="FORECAST" />
          <Label>Finish</Label>
          {v.eta.day && <Body semi style={{ fontSize: 22 }}>{v.eta.day}</Body>}
          <Big size={40}>{v.eta.value}</Big>
          {/* The break line that sat above the tiles (Colby, 2026-10-12: the top strip wasn't useful there). */}
          {v.strip?.breakAt && <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: v.strip.finish?.ok ? color.gInk : color.muted }}>Break {v.strip.breakAt}{v.strip.finish ? ` · ${v.strip.finish.text}` : ''}</Text>}
          <Text style={[s.link, { fontFamily: f.bodySemi }]}>History ›</Text>
        </View>
      </Pressable>);
    case 'ha': return (
      <FlipTile style={half ? { flex: 1 } : undefined} cardStyle={s.tile} onLongPress={menu} label="Average hourly. Tap for how it is worked out"
        front={<>
          <Tag kind="CALCULATED" />
          <Label>Avg hourly (H.A.)</Label>
          <View style={s.haRow}>
            <Big size={40} style={{ flexShrink: 1, color: HA_COLOR, lineHeight: 48 }}>{v.ha.value}</Big>
            {v.ha.perHr && <Body style={{ fontSize: 17, marginBottom: 8 }}>/hr</Body>}
          </View>
          <Text style={[s.link, { fontFamily: f.bodySemi }]}>Details ›</Text>
        </>}
        back={<>
          <Tag kind="CALCULATED" />
          <Label>How this is worked out</Label>
          {v.ha.notes.map((n) => <Body key={n}>{n}</Body>)}
          <InfoNote><Note>H.A. counts every logged hour as a full hour. Pace counts only the minutes worked, so the short hour before a break is not held against it. They match when no hour was cut short. The forecast uses Pace.</Note></InfoNote>
          <Pressable onPress={() => p.onOpenTab('hourly')} accessibilityRole="button" style={({ pressed }) => [{ minHeight: TAP, justifyContent: 'center' }, pressed && u.pressed]}>
            <Text style={[s.link, { fontFamily: f.bodySemi }]}>Hourly breakdown ›</Text>
          </Pressable>
          <Text style={[s.link, { fontFamily: f.bodySemi }]}>Tap the box to flip back</Text>
        </>} />);
    case 'brands': return wrap(
      <View style={s.sec}>
        <SectionHead title="Remaining by brand" right={`${v.brands.total} autos`} />
        <View style={s.banner}>
          <Big size={36} style={{ color: color.headInk }}>{String(v.brands.left)}</Big>
          <View style={{ flexShrink: 1 }}>
            <Body semi style={{ color: color.headInk }}>brands remaining</Body>
            <Note style={{ color: color.headMuted }}>of {v.brands.count} on this vessel · {v.brands.finished} finished</Note>
          </View>
        </View>
        <Card>
          {v.brands.rows.map((r, i) => (
            <View key={r.name} style={[s.row, i > 0 && s.rowLine]}>
              <View style={u.secH}>
                <Body semi style={{ fontSize: 17 }}>{r.name}</Body>
                <Text numberOfLines={1}>
                  <Text style={{ fontFamily: f.display, fontSize: 28, color: color.ink }}>{r.remaining}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 15, color: color.muted }}> of {r.start}</Text>
                </Text>
              </View>
              {r.pct != null ? <Bar small pct={r.pct} /> : <Note>Remaining unknown</Note>}
            </View>
          ))}
        </Card>
      </View>);
    case 'side': return wrap(
      <View style={s.sec}>
        <SectionHead title="Side split" />
        <Card style={[u.pad, { gap: 12 }]}>
          {v.side.northPct == null
            ? <Note>{v.side.unknown}</Note>
            : <View style={s.split}>
                {v.side.northPct > 0 && <View style={{ flex: v.side.northPct, backgroundColor: color.blue }} />}
                {v.side.northPct < 100 && <View style={{ flex: 100 - v.side.northPct, backgroundColor: color.ink }} />}
              </View>}
          <View style={s.grid2}>
            {([['Northside', v.side.north, color.blue], ['Southside', v.side.south, color.ink]] as const).map(([label, col, c]) => (
              <View key={label} style={{ flex: 1, gap: 2 }}>
                <Label style={{ color: c }}>{label}</Label>
                <Big size={32}>{col.pct}</Big>
                <Note>{col.note}</Note>
              </View>
            ))}
          </View>
        </Card>
      </View>);
    case 'vessel': return wrap(<VesselCards state={p.state} baseline={p.baseline} isTest={p.isTest} save={p.save} onNotice={p.onNotice} />);
  }
}

function HeroBox({ v }: { v: V }) {
  const f = useType();
  const h = v.hero;
  const heroColor = h.clerkBadge ? (h.clerkBadge.ok ? color.green : color.red) : color.ink;
  return (
    <Card style={[u.pad, { gap: 10 }]}>
      <View style={u.secH}>
        <Label style={{ flexShrink: 1 }}>{h.label}</Label>
        {h.clerkBadge && (
          <Text style={[s.clerk, h.clerkBadge.ok ? s.clerkOk : s.clerkBad, { fontFamily: f.bodySemi }]}>
            {h.clerkBadge.ok ? '✓ ' : '! '}{h.clerkBadge.text}
          </Text>
        )}
      </View>
      <View style={s.heroRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {h.value === '—' ? <Big size={96} style={{ color: heroColor }}>{h.value}</Big> : <FillNumber size={96} pct={h.pct} fill={heroColor}>{h.value}</FillNumber>}
        </View>
        {/* Design B: the finish sits beside the number, so "how many and when" is one glance. */}
        <View style={s.finish} accessible accessibilityLabel={`Finish, forecast: ${v.eta.value}${v.eta.day ? `, ${v.eta.day}` : ''}`}>
          <Text style={[s.mono, { fontFamily: f.mono }]} numberOfLines={1} adjustsFontSizeToFit>Finish (est.)</Text>
          <Big size={36}>{v.eta.value}</Big>
          {v.eta.day && <Text style={[s.mono, { fontFamily: f.mono }]}>{v.eta.day}</Text>}
        </View>
      </View>
      <Body style={{ fontSize: 17 }}>{h.of}</Body>
      {h.estimate && (
        <View style={{ gap: 4 }}>
          <View style={[u.secH, { justifyContent: 'flex-start', gap: 8 }]}>
            {h.estimate.forecast && <Tag kind="FORECAST" />}
            <Text style={{ flexShrink: 1, fontFamily: f.bodySemi, fontSize: 17, color: h.estimate.tone === 'orange' ? color.oInk : color.ink }}>{h.estimate.text}</Text>
          </View>
          {h.estimate.sub && <Note>{h.estimate.sub}</Note>}
        </View>
      )}
      <Bar pct={h.pct} />
      <View style={u.secH}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.ink }}>{h.barLeft}</Text>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.ink }}>{h.barRight}</Text>
      </View>
      {h.clerkLine && (
        <Text style={[{ fontFamily: f.body, fontSize: 15 }, h.clerkLine.tone === 'red' ? s.err : h.clerkLine.tone === 'green' ? { color: color.gInk } : { color: color.muted }]}>
          {h.clerkLine.text}
        </Text>
      )}
      <View style={s.hr}>
        {h.heroRows.map((r) => (
          <View key={r.k} style={u.kv}>
            <Body style={{ color: color.muted, maxWidth: '45%' }}>{r.k}</Body>
            <Text style={{ flex: 1, textAlign: 'right' }}>
              <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{r.v}</Text>
            </Text>
          </View>
        ))}
        {h.gapNote && <Note style={{ color: color.muted }}>{h.gapNote}</Note>}
        {h.unknownNote && <Note>{h.unknownNote}</Note>}
      </View>
    </Card>
  );
}

// Design B: the ship. One band per deck (top deck first), split into hatches H4 → H1; a hatch fills by how much is still
// aboard. The whole box is one tap target (to Decks), so it stays glove-sized while the bands stay slim.
export function ShipBox({ state, onOpen }: { state: State; onOpen: () => void }) {
  const f = useType();
  const v = shipView(state);
  const seg = (g: Seg | null, k: string) => g == null
    ? <View key={k} style={{ flex: 1 }} />
    : <View key={k} style={[s.seg, { backgroundColor: g.fill === 0 ? color.deckClear : color.deckTrack }, g.fill == null && s.segUnknown]}>
        {g.fill != null && g.fill > 0 && <View style={[s.segFill, { width: `${Math.max(6, Math.round(g.fill * 100))}%` }]} />}
      </View>;
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [s.hull, pressed && { opacity: 0.8 }]} accessibilityRole="button"
      accessibilityLabel={`The ship: ${v.decksLeft} of ${v.decks} decks still have cars. ${v.rows.map((r) => r.a11y).join('. ')}. Opens Decks.`}>
      <View style={s.shipHead}>
        <Text style={[s.shipTitle, { fontFamily: f.bodySemi }]}>{v.decksLeft} of {v.decks} decks still have cars</Text>
        <Text style={[s.shipLink, { fontFamily: f.bodySemi }]}>Decks ›</Text>
      </View>
      <View style={s.deckRow} importantForAccessibility="no-hide-descendants">
        <View style={s.deckLabelBox} />
        <View style={s.segs}>{HATCH_SLOTS.map((h) => <Text key={h} style={[s.hatchHead, { fontFamily: f.mono }]}>{h}</Text>)}</View>
        <View style={s.deckRightBox} />
      </View>
      {v.rows.map((r) => (
        <View key={r.id} style={s.deckRow} importantForAccessibility="no-hide-descendants">
          <View style={s.deckLabelBox}><Text style={[s.deckLabel, { fontFamily: f.mono, color: r.tone === 'clear' ? color.deckMuted : color.deckInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.label}</Text></View>
          <View style={s.segs}>{r.segs.length === 1 ? seg(r.segs[0], 'all') : r.segs.map((g, i) => seg(g, String(i)))}</View>
          <View style={s.deckRightBox}><Text style={[s.deckRight, { fontFamily: f.bodySemi, color: r.tone === 'clear' ? color.deckMuted : color.deckInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.right}</Text></View>
        </View>
      ))}
    </Pressable>
  );
}

const s = StyleSheet.create({
  main: { padding: 20, gap: 16 },
  moved: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  clerk: { fontSize: 13, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, overflow: 'hidden' },
  clerkOk: { backgroundColor: color.gBg, color: color.gInk, borderColor: bcolor.green },
  clerkBad: { backgroundColor: color.rBg, color: color.rInk, borderColor: bcolor.red },
  err: { backgroundColor: color.rBg, color: color.rInk, borderRadius: 12, padding: 10 },
  hr: { borderTopWidth: 1, borderTopColor: bcolor.soft, marginTop: 6, paddingTop: 12, gap: 8 },
  grid2: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, padding: 16, gap: 6 },
  tileFc: { borderWidth: 2, borderColor: bcolor.orange },
  dashed: { borderStyle: 'dashed' },
  haRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: 4 },
  link: { fontSize: 13, color: color.blue, marginTop: 2 },
  sec: { gap: 10 },
  banner: { backgroundColor: color.head, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: bcolor.row },
  split: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', gap: 3 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  finish: { alignItems: 'flex-end', maxWidth: '42%', paddingBottom: 6 },
  mono: { fontSize: 13, color: color.muted },
  hull: { backgroundColor: color.hull, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 26, gap: 4, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 70, borderBottomRightRadius: 18, minHeight: TAP },
  shipHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  shipTitle: { flexShrink: 1, fontSize: 15, color: color.deckInk },
  shipLink: { fontSize: 15, color: color.deckMuted },
  deckRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  deckLabelBox: { width: 46 },
  deckLabel: { fontSize: 13 },
  segs: { flex: 1, flexDirection: 'row', gap: 3, alignSelf: 'stretch' },
  seg: { flex: 1, borderRadius: 8, overflow: 'hidden', minHeight: 22 },
  segUnknown: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: bcolor.deckMuted, backgroundColor: 'transparent' },
  segFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.deckFill },
  hatchHead: { flex: 1, textAlign: 'center', fontSize: 13, color: color.deckMuted },
  deckRightBox: { width: 70, alignItems: 'flex-end' },
  deckRight: { fontSize: 13 },
});
