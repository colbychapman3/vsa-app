// The Snapshot's boxes, each shown where the layout (src/app/snapshotLayout.ts) puts it: on the Snapshot or at the top of
// Plan, Hourly or Decks. Layout only; every value comes from view.snapshot(). Long press a box for "Move to" and Hide.
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './text.tsx';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { snapshot } from '../view.ts';
import { shipView, HATCH_SLOTS, type Seg } from '../ship.ts';
import { BOX_TITLE, boxesFor, moveToTab, PINNED, setHidden, TABS, TAB_TITLE, type BoxId, type BoxTab, type Layout } from '../snapshotLayout.ts';
import { bcolor, color, HA_COLOR, MAX_BIG_SCALE, PACE_COLOR, TAP, useType } from '../theme.ts';
import { VesselCards, type Save } from './Plan.tsx';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { FieldTile } from './FieldBox.tsx';
import { Bar, Big, Body, Card, Label, Note, SectionHead, Tag, u } from './ui.tsx';

export type BoxProps = {
  tab: BoxTab; layout: Layout; onLayout: (l: Layout) => void;
  state: State; baseline: Baseline; nowMin: number; isTest: boolean; save: Save;
  onNotice: (n: { ok: boolean; text: string }) => void;
  onOpenTab: (t: 'hourly' | 'decks' | 'plan') => void; onHistory: () => void;
  onOpenDeck?: (id: string) => void; // a deck row on the ship opens that deck's sheet
};

const TILES: BoxId[] = ['field', 'eta', 'done', 'ha'];

export function Boxes(p: BoxProps) {
  const v = snapshot(p.state, p.baseline, p.nowMin);
  // One brand repeats the vessel number, so its box stays out of the way (the hero names the brand instead).
  const ids = boxesFor(p.layout, p.tab).filter((id) => id !== 'brands' || v.brands.count > 1);
  if (!ids.length) return p.tab === 'snap' ? <Note style={{ padding: 20 }}>Every box is hidden or moved to another tab. Settings › Customize Snapshot brings them back.</Note> : null;
  // Tiles sit two to a row when they are next to each other (field + finish, ship done + pace).
  const rows: BoxId[][] = [];
  for (const id of ids) { const last = rows.at(-1); if (TILES.includes(id) && last && last.length === 1 && TILES.includes(last[0])) last.push(id); else rows.push([id]); }
  return (
    <View style={p.tab === 'snap' ? s.main : s.moved}>
      {rows.map((r) => r.length === 2
        ? <View key={r.join()} style={s.grid2}>{r.map((id) => <Box key={id} id={id} v={v} p={p} half />)}</View>
        : <Box key={r[0]} id={r[0]} v={v} p={p} half={TILES.includes(r[0]) ? false : undefined} />)}
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
    case 'ship': return wrap(<ShipBox state={p.state} onOpen={() => p.onOpenTab('decks')} onOpenDeck={p.onOpenDeck} />);
    case 'field': return <FieldTile v={v} half={half} onPress={() => p.onOpenTab('hourly')} onLongPress={menu} />;
    case 'done': return <DoneTile v={v} p={p} half={half} />;
    case 'eta': return <EtaTile v={v} p={p} half={half} menu={menu} />;
    case 'ha': return <PaceTile v={v} p={p} half={half} />;
    case 'brands': return wrap(
      <View style={s.sec}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.muted }}>Remaining by brand</Text>
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

// FORECAST finish (Every Screen 1.1): a filled FORECAST chip, the time, and how it sits against the stop before the break.
// The page stays clean: how it is worked out lives in Ask, and a tap opens the finish history.
function EtaTile({ v, p, half, menu }: { v: V; p: BoxProps; half?: boolean; menu: () => void }) {
  const f = useType();
  return (
    <Pressable onPress={p.onHistory} onLongPress={menu} delayLongPress={450} style={half ? { flex: 1 } : undefined} accessibilityRole="button"
      accessibilityLabel={`Finish, forecast ${v.eta.value}. Tap for its history`} accessibilityHint="Long press to move or hide this box">
      <View style={[u.card, s.tile, v.eta.dashed && s.dashed]}>
        <Text style={[s.fcChip, { fontFamily: f.bodySemi }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={MAX_BIG_SCALE}>FORECAST</Text>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.muted }}>Finish</Text>
        {v.eta.day && <Body semi>{v.eta.day}</Body>}
        <Big size={44}>{v.eta.value}</Big>
        {v.strip?.finish && <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: v.strip.finish.ok ? color.gInk : color.oInk }}>{v.strip.finish.text}</Text>}
      </View>
    </Pressable>
  );
}

// Pace (Every Screen 1.1): purple number, its last hours as a sparkline with the current pace dashed, then H.A. with its denominator.
// Every line is one line that shrinks to fit: nothing wraps or is cut off at a large text size.
// A tap opens the Hourly tab, where those hours are listed.
function PaceTile({ v, p, half }: { v: V; p: BoxProps; half?: boolean }) {
  const f = useType();
  const series = v.paceSeries, cur = Number(v.ha.pace);
  const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
  const y = (n: number) => 8 + ((hi - n) / span) * 30;
  const pts = series.map((n, i) => `${(4 + (i * 142) / (series.length - 1)).toFixed(1)},${y(n).toFixed(1)}`);
  const refY = Number.isFinite(cur) ? Math.min(42, Math.max(4, y(cur))) : null;
  const last = pts.at(-1)?.split(',');
  return (
    <Pressable onPress={() => p.onOpenTab('hourly')} style={half ? { flex: 1 } : undefined} accessibilityRole="button" accessibilityLabel={`Pace ${v.ha.pace} per hour, H.A. ${v.ha.value}. Opens Hourly`}>
        <View style={[u.card, s.tile, { flex: 1 }]}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: PACE_COLOR }}>Pace</Text>
          <View style={s.haRow}>
            <Big size={44} style={{ flexShrink: 1, color: PACE_COLOR, lineHeight: 50 }}>{v.ha.pace}</Big>
            {v.ha.pace !== '—' && <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: PACE_COLOR, marginBottom: 8 }}>/hr</Text>}
          </View>
          {series.length > 1 && (
            <Svg width="100%" height={46} viewBox="0 0 150 46" accessibilityLabel={`Pace by hour: ${series.map((n) => Math.round(n)).join(', ')}`}>
              {refY != null && <Line x1={4} x2={146} y1={refY} y2={refY} stroke={color.muted} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />}
              <Polyline points={pts.join(' ')} fill="none" stroke={PACE_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {last && <Circle cx={Number(last[0])} cy={Number(last[1])} r={4.5} fill={PACE_COLOR} />}
            </Svg>
          )}
          <View style={s.haLine}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: HA_COLOR }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>H.A. {v.ha.value}{v.ha.perHr ? ' /hr' : ''}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, color: color.muted }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3}>{v.ha.haLine}</Text>
          </View>
        </View>
    </Pressable>
  );
}

// Ship done (Colby, 2026-10-14: the ring was hard to read): the share of the vessel the decks have cleared as a big percent over
// a plain bar. Unknown stays a dash. A tap opens Decks.
function DoneTile({ v, p, half }: { v: V; p: BoxProps; half?: boolean }) {
  const f = useType();
  const d = v.done;
  const pct = d.pct == null ? null : Math.min(100, Math.max(0, d.pct));
  return (
    <Pressable onPress={() => (d.deck && p.onOpenDeck ? p.onOpenDeck(d.deck) : p.onOpenTab('decks'))} style={half ? { flex: 1 } : undefined} accessibilityRole="button"
      accessibilityLabel={`Ship done: ${pct == null ? 'unknown' : `${Math.round(pct)} percent`}. ${d.text}. ${d.deck ? 'Opens that deck' : 'Opens Decks'}`}>
    <View style={[u.card, s.tile, { flex: 1 }]}>
      <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.muted }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>Ship done</Text>
      <Big size={56}>{pct == null ? '—' : `${Math.round(pct)}%`}</Big>
      <View style={s.doneTrack}>{pct != null && <View style={[s.doneFill, { width: `${pct}%` }]} />}</View>
      <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.muted }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>{d.text}</Text>
    </View>
    </Pressable>
  );
}

// Vessel remaining (Every Screen 1.1): just the number and "autos left of N", the ship progress, and the gap sentence. The
// percent lives in the Ship done tile, so no bar here; how each number is worked out is in Ask, not on this page.
function HeroBox({ v }: { v: V }) {
  const f = useType();
  const h = v.hero;
  const heroColor = h.clerkBadge ? (h.clerkBadge.ok ? color.green : color.red) : color.ink;
  return (
    <Card style={[u.pad, { gap: 10 }]}>
      <View style={u.secH}>
        <Text style={{ flex: 1, fontFamily: f.bodySemi, fontSize: 17, color: color.muted }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{h.label}</Text>
        {h.clerkBadge && (
          <Text style={[s.clerk, h.clerkBadge.ok ? s.clerkOk : s.clerkBad, { fontFamily: f.bodySemi }]}>
            {h.clerkBadge.ok ? '✓ ' : '! '}{h.clerkBadge.text}
          </Text>
        )}
      </View>
      <View style={{ gap: 6 }}>
        <Big size={96} style={{ color: heroColor }}>{h.value}</Big>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.muted }}>{h.ofShort}</Text>
      </View>
      {h.estimate && (
        <View style={{ gap: 4 }}>
          <View style={[u.secH, { justifyContent: 'flex-start', gap: 8 }]}>
            {h.estimate.forecast && <Tag kind="FORECAST" />}
            <Text style={{ flexShrink: 1, fontFamily: f.bodySemi, fontSize: 17, color: h.estimate.tone === 'orange' ? color.oInk : color.ink }}>{h.estimate.text}</Text>
          </View>
          {h.estimate.sub && <Note>{h.estimate.sub}</Note>}
        </View>
      )}
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
        {h.gapNote && <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.ink }}>{h.gapNote}</Text>}
        {h.unknownNote && <Note>{h.unknownNote}</Note>}
      </View>
    </Card>
  );
}

// Design B: the ship. One band per deck (top deck first), split into hatches H4 → H1; a hatch fills by how much is still
// aboard. The whole box is one tap target (to Decks), so it stays glove-sized while the bands stay slim.
export function ShipBox({ state, onOpen, onOpenDeck }: { state: State; onOpen: () => void; onOpenDeck?: (id: string) => void }) {
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
      {/* The ship drawn (Every Screen mockup): a hatch is lit when any deck still has cars in it. */}
      <View style={[s.deckRow, { alignItems: 'flex-end' }]} importantForAccessibility="no-hide-descendants">
        <View style={s.deckLabelBox}><View style={s.bridge} /></View>
        <View style={s.segs}>{HATCH_SLOTS.map((h, i) => <View key={h} style={[s.hatchBox, v.rows.some((r) => r.segs.length > 1 && (r.segs[i]?.fill ?? 0) > 0) && s.hatchOn]} />)}</View>
        <View style={s.deckRightBox} />
      </View>
      <View style={s.keel} importantForAccessibility="no-hide-descendants" />
      {v.rows.map((r) => (
        // A deck row opens that deck; a low deck (no vans) is outlined, the same flag the Decks tab and Needs a look use.
        <Pressable key={r.id} onPress={() => (onOpenDeck ? onOpenDeck(r.id) : onOpen())} accessibilityRole="button" accessibilityLabel={`${r.a11y}. Opens the deck.`}
          style={({ pressed }) => [s.deckRow, r.low && s.deckLow, pressed && { opacity: 0.7 }]}>
          <View style={s.deckLabelBox}><Text style={[s.deckLabel, { fontFamily: f.mono, color: r.tone === 'clear' ? color.deckMuted : color.deckInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.label}</Text></View>
          <View style={s.segs}>{r.segs.length === 1 ? seg(r.segs[0], 'all') : r.segs.map((g, i) => seg(g, String(i)))}</View>
          <View style={s.deckRightBox}><Text style={[s.deckRight, { fontFamily: f.bodySemi, color: r.tone === 'clear' ? color.deckMuted : color.deckInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.right}</Text></View>
        </Pressable>
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
  doneTrack: { height: 14, borderRadius: 7, backgroundColor: color.soft, overflow: 'hidden', marginVertical: 4 },
  doneFill: { height: '100%', borderRadius: 7, backgroundColor: color.blue },
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
  // The ship card corners from the boards: 10 / 10 / 12 / 24 (top left, top right, bottom right, bottom left).
  hull: { backgroundColor: color.hull, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 20, gap: 4, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomRightRadius: 12, borderBottomLeftRadius: 24, minHeight: TAP },
  dotHit: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: bcolor.line, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  why: { backgroundColor: color.row, borderLeftWidth: 3, borderLeftColor: color.blue, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  fcChip: { alignSelf: 'flex-start', fontSize: 13, letterSpacing: 0.6, color: color.onOrange, backgroundColor: color.orange, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  haLine: { borderTopWidth: 1, borderTopColor: bcolor.soft, paddingTop: 6, gap: 2 },
  shipHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  shipTitle: { flexShrink: 1, fontSize: 15, color: color.deckInk },
  shipLink: { fontSize: 15, color: color.deckMuted },
  deckRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  deckLow: { borderWidth: 1.5, borderColor: color.deckWarn, borderRadius: 10, marginHorizontal: -4, paddingHorizontal: 4 },
  bridge: { width: 30, height: 26, borderRadius: 4, backgroundColor: color.deckMuted },
  hatchBox: { flex: 1, height: 18, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: color.deckClear },
  hatchOn: { backgroundColor: color.deckFill },
  keel: { height: 10, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: color.deckMuted, marginBottom: 8 },
  deckLabelBox: { width: 46 },
  deckLabel: { fontSize: 13 },
  segs: { flex: 1, flexDirection: 'row', gap: 3, alignSelf: 'stretch' },
  seg: { flex: 1, borderRadius: 8, overflow: 'hidden', minHeight: 30 },
  segUnknown: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: bcolor.deckMuted, backgroundColor: 'transparent' },
  segFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.deckFill },
  hatchHead: { flex: 1, textAlign: 'center', fontSize: 13, color: color.deckMuted },
  deckRightBox: { width: 70, alignItems: 'flex-end' },
  deckRight: { fontSize: 13 },
});
