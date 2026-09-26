// Snapshot tab (reference: docs/reference/screens/01–03). Layout only; every
// value comes from view.snapshot().
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { snapshot, type Banner } from '../view.ts';
import { color, useType } from '../theme.ts';
import { Icon } from './Chrome.tsx';
import { Bar, BannerView, Big, Body, Card, Label, Note, SectionHead, Tag, u } from './ui.tsx';

type Props = { state: State; baseline: Baseline; nowMin: number; onOpenTab: (t: 'hourly' | 'plan') => void; onTrack: (b: Banner) => void };

export function Snapshot({ state, baseline, nowMin, onOpenTab, onTrack }: Props) {
  const f = useType();
  const v = snapshot(state, baseline, nowMin);
  const h = v.hero;
  const heroColor = h.clerkBadge ? (h.clerkBadge.ok ? color.green : color.red) : color.ink;

  return (
    <View>
      {v.banners.map((b, i) => <BannerView key={i} banner={b} onTrack={onTrack} />)}

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
        <Pressable onPress={() => onOpenTab('plan')} style={[s.strip, s.issues]} accessibilityRole="button">
          <Text style={[s.issueDot, { fontFamily: f.bodySemi }]}>!</Text>
          <Body semi style={{ color: color.oInk }}>{v.openIssues} open discrepanc{v.openIssues === 1 ? 'y' : 'ies'}</Body>
          <Text style={[s.stripRight, { color: color.oInk, fontFamily: f.body }]}>View ›</Text>
        </Pressable>
      )}

      <View style={s.main}>
        {/* Hero */}
        <Card style={[u.pad, { gap: 10 }]}>
          <View style={u.secH}>
            <Label>{h.label}</Label>
            {h.clerkBadge && (
              <Text style={[s.clerk, h.clerkBadge.ok ? s.clerkOk : s.clerkBad, { fontFamily: f.bodySemi }]}>
                {h.clerkBadge.ok ? '✓ ' : '! '}{h.clerkBadge.text}
              </Text>
            )}
          </View>
          <Big size={112} style={{ color: heroColor }}>{h.value}</Big>
          <Body style={{ fontSize: 17 }}>{h.of}</Body>
          <Bar pct={h.pct} />
          {h.clerkLine && (
            <Text style={[{ fontFamily: f.body, fontSize: 14 }, h.clerkLine.tone === 'red' ? s.err : h.clerkLine.tone === 'green' ? { color: color.gInk } : { color: color.muted }]}>
              {h.clerkLine.text}
            </Text>
          )}
          <View style={s.hr}>
            {h.rows.map((r) => (
              <View key={r.k} style={u.kv}>
                <Body style={{ color: color.muted }}>{r.k}</Body>
                <Text numberOfLines={1}>
                  <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{r.v}</Text>
                  {r.sub ? <Text style={{ fontFamily: f.body, fontSize: 13, color: color.muted }}> {r.sub}</Text> : null}
                </Text>
              </View>
            ))}
            {h.gapNote && <Note style={{ color: color.oInk, fontWeight: '600' }}>{h.gapNote}</Note>}
            {h.unknownNote && <Note>{h.unknownNote}</Note>}
          </View>
        </Card>

        {/* Tiles */}
        <View style={s.grid2}>
          <Card style={[s.tile, s.tileFc, v.eta.dashed && s.dashed]}>
            <Tag kind="FORECAST" />
            <Label>EST. COMPLETION</Label>
            {v.eta.day && <Body semi style={{ fontSize: 20 }}>{v.eta.day}</Body>}
            <Big size={56}>{v.eta.value}</Big>
            {v.eta.notes.map((n) => <Note key={n}>{n}</Note>)}
          </Card>
          <Pressable style={[u.card, s.tile]} onPress={() => onOpenTab('hourly')} accessibilityRole="button" accessibilityLabel="Average hourly, open hourly breakdown">
            <Tag kind="CALCULATED" />
            <Label>AVG HOURLY (H.A.)</Label>
            <View style={s.haRow}>
              <Big size={56} style={{ flexShrink: 1 }}>{v.ha.value}</Big>
              {v.ha.perHr && <Body style={{ fontSize: 16 }}>/hr</Body>}
            </View>
            {v.ha.notes.map((n) => <Note key={n}>{n}</Note>)}
            <Text style={[s.link, { fontFamily: f.bodySemi }]}>Hourly breakdown ›</Text>
          </Pressable>
        </View>

        {/* Remaining by brand */}
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
                <Bar small pct={r.pct} />
              </View>
            ))}
          </Card>
        </View>

        {/* Side split */}
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
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  strip: { backgroundColor: color.card, borderBottomWidth: 1, borderBottomColor: color.line, paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  stripRight: { marginLeft: 'auto', fontSize: 14, color: color.muted, flexShrink: 1, textAlign: 'right' },
  issues: { backgroundColor: color.oBg },
  issueDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.orange, color: '#fff', textAlign: 'center', fontSize: 12, lineHeight: 18, overflow: 'hidden' },
  main: { padding: 20, gap: 16 },
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
