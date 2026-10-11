// The answer after Save (Act II): shown under the header where the plain "Saved …" message used to sit.
// Three figures with what changed, then only what needs action now, or one quiet line when nothing does.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Answer, Delta } from '../answer.ts';
import { color, TAP, useType } from '../theme.ts';
import { Big, Label } from './ui.tsx';

export function answerText(a: Answer): string {
  const figs = a.figs.map((f) => `${f.k}${f.tag === 'FORECAST' ? ' (estimate)' : ''} ${f.v}${f.d ? `, ${f.d.text}` : ''}`).join('. ');
  return [a.head, figs, ...(a.watch.length ? a.watch : [a.quiet ?? ''])].filter(Boolean).join(' ');
}

const deltaColor = (d: Delta) => (d.good === true ? color.gInk : d.good === false ? color.oInk : color.muted);

export function AnswerCard({ answer, onDismiss }: { answer: Answer; onDismiss: () => void }) {
  const f = useType();
  return (
    <View style={s.wrap} accessible accessibilityLabel={answerText(answer)}>
      <View style={s.headRow}>
        <Text style={[s.head, { fontFamily: f.bodySemi }]}>{answer.head}</Text>
        <Pressable onPress={onDismiss} style={s.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text style={{ fontSize: 18, color: color.ink }}>✕</Text>
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
      {answer.watch.map((w) => (
        <View key={w} style={s.watch}>
          <Text style={[s.watchText, { fontFamily: f.bodySemi }]}>{w}</Text>
        </View>
      ))}
      {answer.quiet && <Text style={[s.quiet, { fontFamily: f.body }]}>{answer.quiet}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: color.gBg, borderBottomWidth: 1, borderBottomColor: color.line, paddingLeft: 20, paddingBottom: 12, gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  head: { flex: 1, fontSize: 15, color: color.gInk, paddingTop: 10 },
  dismiss: { minWidth: TAP, minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  figs: { flexDirection: 'row', gap: 12, paddingRight: 20 },
  fig: { flex: 1, minWidth: 0, gap: 2 },
  delta: { fontSize: 13 },
  watch: { marginRight: 20, backgroundColor: color.oBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  watchText: { fontSize: 15, color: color.oInk },
  quiet: { fontSize: 14, color: color.gInk, paddingRight: 20 },
});
