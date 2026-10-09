// The Snapshot's boxes, each shown where the layout (src/app/snapshotLayout.ts) puts it: on the Snapshot or at the top of
// Plan, Hourly or Decks. Layout only; every value comes from view.snapshot(). Long press a box for "Move to" and Hide.
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { snapshot } from '../view.ts';
import { BOX_TITLE, boxesFor, moveToTab, PINNED, setHidden, TABS, TAB_TITLE, type BoxId, type BoxTab, type Layout } from '../snapshotLayout.ts';
import { color, HA_COLOR, TAP, useType } from '../theme.ts';
import { VesselCards, type Save } from './Plan.tsx';
import { FieldBox } from './FieldBox.tsx';
import { Bar, Big, Body, Card, FillNumber, FlipTile, Label, Note, SectionHead, Tag, u } from './ui.tsx';

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
    case 'field': return wrap(<FieldBox v={v} />);
    case 'eta': return (
      <Pressable onPress={p.onHistory} onLongPress={menu} delayLongPress={450} style={half ? { flex: 1 } : undefined} accessibilityRole="button"
        accessibilityLabel="Estimated completion forecast. Tap for its history" accessibilityHint="Long press to move or hide this box">
        <View style={[u.card, s.tile, s.tileFc, v.eta.dashed && s.dashed]}>
          <Tag kind="FORECAST" />
          <Label>EST. COMPLETION</Label>
          {v.eta.day && <Body semi style={{ fontSize: 20 }}>{v.eta.day}</Body>}
          <Big size={56}>{v.eta.value}</Big>
          <Text style={[s.link, { fontFamily: f.bodySemi }]}>Tap for history ›</Text>
        </View>
      </Pressable>);
    case 'ha': return (
      <FlipTile style={half ? { flex: 1 } : undefined} cardStyle={s.tile} onLongPress={menu} label="Average hourly. Tap for how it is worked out"
        front={<>
          <Tag kind="CALCULATED" />
          <Label>AVG HOURLY (H.A.)</Label>
          <View style={s.haRow}>
            <Big size={56} style={{ flexShrink: 1, color: HA_COLOR }}>{v.ha.value}</Big>
            {v.ha.perHr && <Body style={{ fontSize: 16 }}>/hr</Body>}
          </View>
          <Text style={[s.link, { fontFamily: f.bodySemi }]}>Tap for details</Text>
        </>}
        back={<>
          <Tag kind="CALCULATED" />
          <Label>HOW THIS IS WORKED OUT</Label>
          {v.ha.notes.map((n) => <Body key={n}>{n}</Body>)}
          <Note>H.A. counts every logged hour as a full hour. Pace counts only the minutes worked, so the short hour before a break is not held against it. They match when no hour was cut short. The forecast uses Pace.</Note>
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
                <Body semi style={{ fontSize: 16 }}>{r.name}</Body>
                <Text numberOfLines={1}>
                  <Text style={{ fontFamily: f.display, fontSize: 28, color: color.ink }}>{r.remaining}</Text>
                  <Text style={{ fontFamily: f.body, fontSize: 14, color: color.muted }}> of {r.start}</Text>
                </Text>
              </View>
              {r.pct != null ? <Bar small pct={r.pct} /> : <Note>Remaining unknown</Note>}
            </View>
          ))}
        </Card>
      </View>);
    case 'side': return wrap(
      <View style={s.sec}>
        <SectionHead title="Side split" right={v.side.clearByNote} />
        <Card style={[u.pad, { gap: 12 }]}>
          {v.side.northPct == null
            ? <Note>{v.side.unknown}</Note>
            : <View style={s.split}>
                {v.side.northPct > 0 && <View style={{ flex: v.side.northPct, backgroundColor: color.blue }} />}
                {v.side.northPct < 100 && <View style={{ flex: 100 - v.side.northPct, backgroundColor: color.ink }} />}
              </View>}
          <View style={s.grid2}>
            {([['NORTHSIDE', v.side.north, color.blue], ['SOUTHSIDE', v.side.south, color.ink]] as const).map(([label, col, c]) => (
              <View key={label} style={{ flex: 1, gap: 2 }}>
                <Label style={{ color: c }}>{label}</Label>
                <Big size={40}>{col.pct}</Big>
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
      {h.value === '—' ? <Big size={112} style={{ color: heroColor }}>{h.value}</Big> : <FillNumber size={112} pct={h.pct} fill={heroColor}>{h.value}</FillNumber>}
      <Body style={{ fontSize: 17 }}>{h.of}</Body>
      <Bar pct={h.pct} />
      <View style={u.secH}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.ink }}>{h.barLeft}</Text>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.ink }}>{h.barRight}</Text>
      </View>
      {h.clerkLine && (
        <Text style={[{ fontFamily: f.body, fontSize: 14 }, h.clerkLine.tone === 'red' ? s.err : h.clerkLine.tone === 'green' ? { color: color.gInk } : { color: color.muted }]}>
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
        {h.gapNote && <Note style={{ color: color.oInk, fontWeight: '600' }}>{h.gapNote}</Note>}
        {h.unknownNote && <Note>{h.unknownNote}</Note>}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  main: { padding: 20, gap: 16 },
  moved: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  clerk: { fontSize: 12, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, overflow: 'hidden' },
  clerkOk: { backgroundColor: color.gBg, color: color.gInk, borderColor: color.green },
  clerkBad: { backgroundColor: color.rBg, color: color.rInk, borderColor: color.red },
  err: { backgroundColor: color.rBg, color: color.rInk, borderRadius: 10, padding: 10 },
  hr: { borderTopWidth: 1, borderTopColor: color.soft, marginTop: 6, paddingTop: 12, gap: 8 },
  grid2: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, padding: 16, gap: 6 },
  tileFc: { borderWidth: 2, borderColor: color.orange },
  dashed: { borderStyle: 'dashed' },
  haRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  link: { fontSize: 13, color: color.blue, marginTop: 2 },
  sec: { gap: 10 },
  banner: { backgroundColor: color.head, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.row },
  split: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', gap: 3 },
});
