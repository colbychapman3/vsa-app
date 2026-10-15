// The answer after Save (Act II): shown under the header where the plain "Saved …" message used to sit.
// Design B with board 2.1b / 3.1b: the OFFICIAL field count, then H.A., Pace (each with its denominator), remaining and the
// finish, why the finish moved, when the decks were saved, then only what needs action now (peach "Update decks" when the decks
// are older than the last hour), or one quiet line when nothing does.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './text.tsx';
import type { Answer, Delta } from '../answer.ts';
import { bcolor, color, elev, TAP, useType } from '../theme.ts';
import { Big, Go, Label } from './ui.tsx';
import { NotUseful, type NotUsefulProps } from './NotUseful.tsx';

export function answerText(a: Answer): string {
  const figs = a.figs.map((f) => `${f.k}${f.tag === 'FORECAST' ? ' (estimate)' : ''} ${f.v}${f.d ? `, ${f.d.text}` : ''}`).join('. ');
  return [a.head, `Official field count ${a.official.v}, ${a.official.through}.`, `${figs}.`, a.short ?? '', a.why ?? '', a.decks ?? '', a.stale ?? '', ...(a.watch.length ? a.watch : [a.quiet ?? ''])].filter(Boolean).join(' ');
}

const deltaColor = (d: Delta) => (d.good === true ? color.gInk : d.good === false ? color.oInk : color.muted);

export function AnswerCard({ answer, onDismiss, notUseful, onUpdateDecks }: { answer: Answer; onDismiss: () => void; notUseful?: NotUsefulProps; onUpdateDecks?: () => void }) {
  const f = useType();
  return (
    <View style={s.wrap} accessible accessibilityLabel={answerText(answer)}>
      <View style={s.headRow}>
        <View style={s.check}><Text style={[s.checkMark, { fontFamily: f.display }]}>✓</Text></View>
        <Text style={[s.head, { fontFamily: f.displaySemi }]}>{answer.head}</Text>
        <Pressable onPress={onDismiss} style={({ pressed }) => [s.dismiss, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text style={{ fontSize: 17, color: color.ink }}>✕</Text>
        </Pressable>
      </View>
      <View style={s.official}>
        <Text style={[s.chip, { fontFamily: f.bodySemi }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>OFFICIAL</Text>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.headInk }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Field count {answer.official.through}</Text>
        <Big size={34} style={{ color: color.headInk }}>{answer.official.v}</Big>
      </View>
      <View style={s.figs}>
        {answer.figs.map((x) => (
          <View key={x.k} style={s.fig}>
            <Label>{x.tag === 'FORECAST' ? `${x.k} (est.)` : x.k}</Label>
            <Big size={30}>{x.v}</Big>
            {x.d && <Text style={[s.delta, { fontFamily: f.bodySemi, color: deltaColor(x.d) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{x.d.text}</Text>}
            {x.sub && <Text style={[s.delta, { fontFamily: f.body, color: color.muted }]} numberOfLines={2}>{x.sub}</Text>}
          </View>
        ))}
      </View>
      {answer.short && <Text style={[s.quiet, { fontFamily: f.bodySemi, color: color.ink }]}>{answer.short}</Text>}
      {answer.why && <Text style={[s.why, { fontFamily: f.body }]}>{answer.why}</Text>}
      {(answer.decks || answer.stale) && <Text style={[s.quiet, { fontFamily: f.body }]}>{[answer.decks, answer.stale].filter(Boolean).join(' ')}</Text>}
      {answer.watch.map((w) => (
        <View key={w} style={s.watch}>
          <Text style={[s.watchText, { fontFamily: f.bodySemi }]}>{w}</Text>
        </View>
      ))}
      {answer.action === 'update-decks' && onUpdateDecks && <View style={{ paddingRight: 16 }}><Go label="Update decks" onPress={onUpdateDecks} /></View>}
      {answer.quiet && <Text style={[s.quiet, { fontFamily: f.body }]}>{answer.quiet}</Text>}
      {notUseful && <NotUseful {...notUseful} />}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: color.card, marginHorizontal: 10, marginTop: 10, borderRadius: 12, paddingLeft: 16, paddingBottom: 14, gap: 10, borderWidth: 1, borderColor: bcolor.line, ...elev.raised },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.green, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: color.card, fontSize: 17 },
  head: { flex: 1, fontSize: 17, color: color.ink },
  dismiss: { minWidth: TAP, minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  official: { marginRight: 16, backgroundColor: color.head, borderRadius: 12, padding: 12, gap: 4 },
  chip: { alignSelf: 'flex-start', fontSize: 13, letterSpacing: 0.6, color: color.head, backgroundColor: color.headInk, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  figs: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 12, paddingRight: 16 },
  fig: { width: '46%', minWidth: 0, gap: 2 },
  delta: { fontSize: 13 },
  why: { fontSize: 15, color: color.muted, paddingRight: 16, borderTopWidth: 1, borderTopColor: bcolor.soft, paddingTop: 10 },
  watch: { marginRight: 16, backgroundColor: color.oBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  watchText: { fontSize: 15, color: color.oInk },
  quiet: { fontSize: 15, color: color.muted, paddingRight: 16 },
});
