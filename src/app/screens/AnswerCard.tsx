// The answer after Save (Act II): shown under the header where the plain "Saved …" message used to sit.
// Design B: a white card that drops in like a banner. Three figures with what changed, why the finish moved, then only
// what needs action now, or one quiet line when nothing does.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Answer, Delta } from '../answer.ts';
import { bcolor, color, elev, TAP, useType } from '../theme.ts';
import { Big, Label } from './ui.tsx';
import { NotUseful, type NotUsefulProps } from './NotUseful.tsx';

export function answerText(a: Answer): string {
  const figs = a.figs.map((f) => `${f.k}${f.tag === 'FORECAST' ? ' (estimate)' : ''} ${f.v}${f.d ? `, ${f.d.text}` : ''}`).join('. ');
  return [a.head, `${figs}.`, a.why ?? '', ...(a.watch.length ? a.watch : [a.quiet ?? ''])].filter(Boolean).join(' ');
}

const deltaColor = (d: Delta) => (d.good === true ? color.gInk : d.good === false ? color.oInk : color.muted);

export function AnswerCard({ answer, onDismiss, notUseful }: { answer: Answer; onDismiss: () => void; notUseful?: NotUsefulProps }) {
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
      <View style={s.figs}>
        {answer.figs.map((x) => (
          <View key={x.k} style={s.fig}>
            <Label>{x.tag === 'FORECAST' ? `${x.k} (est.)` : x.k}</Label>
            <Big size={30}>{x.v}</Big>
            {x.d && <Text style={[s.delta, { fontFamily: f.bodySemi, color: deltaColor(x.d) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{x.d.text}</Text>}
          </View>
        ))}
      </View>
      {answer.why && <Text style={[s.why, { fontFamily: f.body }]}>{answer.why}</Text>}
      {answer.watch.map((w) => (
        <View key={w} style={s.watch}>
          <Text style={[s.watchText, { fontFamily: f.bodySemi }]}>{w}</Text>
        </View>
      ))}
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
  figs: { flexDirection: 'row', gap: 12, paddingRight: 16 },
  fig: { flex: 1, minWidth: 0, gap: 2 },
  delta: { fontSize: 13 },
  why: { fontSize: 15, color: color.muted, paddingRight: 16, borderTopWidth: 1, borderTopColor: bcolor.soft, paddingTop: 10 },
  watch: { marginRight: 16, backgroundColor: color.oBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  watchText: { fontSize: 15, color: color.oInk },
  quiet: { fontSize: 15, color: color.muted, paddingRight: 16 },
});
