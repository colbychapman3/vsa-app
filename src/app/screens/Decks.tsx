// Decks tab (reference: docs/reference/screens/04). Layout only; values from view.decksView().
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { State } from '../../storage/store.ts';
import { decksView } from '../view.ts';
import { color, useType } from '../theme.ts';
import { Icon } from './Chrome.tsx';
import { Body, Card, Chip, Note, Pill, SectionHead, u } from './ui.tsx';

export function Decks({ state, onOpenDeck, onOpenPlan }: { state: State; onOpenDeck: (id: string) => void; onOpenPlan: () => void }) {
  const f = useType();
  const v = decksView(state);
  return (
    <View style={s.main}>
      <View style={{ gap: 10 }}>
        <SectionHead title="Deck insights" right="Vans need 1.85 m or more" />
        {v.low.length === 0 && <Card style={u.pad}><Note>No low decks with cargo remaining.</Note></Card>}
        {v.low.map((d) => (
          <View key={d.id} style={s.lowAlert} accessibilityRole="alert">
            <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.rInk }}>{d.title}</Text>
            <Text style={{ fontFamily: f.body, fontSize: 14, color: color.rInk }}>{d.sub}</Text>
          </View>
        ))}
        {v.unconfirmed > 0 && (
          <Pressable onPress={onOpenPlan} style={[u.card, s.strip]} accessibilityRole="button">
            <Body semi>{v.unconfirmed} deck height{v.unconfirmed === 1 ? '' : 's'} unconfirmed</Body>
            <Text style={{ marginLeft: 'auto', fontFamily: f.body, fontSize: 14, color: color.muted }}>Confirm on Plan ›</Text>
          </Pressable>
        )}
      </View>

      <Card>
        {v.rows.map((r, i) => (
          <Pressable key={r.id} onPress={() => onOpenDeck(r.id)} accessibilityRole="button" accessibilityLabel={`${r.label}, ${r.pill}, ${r.remaining} of ${r.start} remaining`}
            style={[s.row, i > 0 && s.rowLine, r.low && { backgroundColor: color.rBg }]}>
            <View style={s.line}>
              <Text style={[s.dn, { fontFamily: f.display }]} numberOfLines={1} adjustsFontSizeToFit>{r.label}</Text>
              <Pill text={r.pill} />
              <Text style={s.rn} numberOfLines={1}>
                <Text style={{ fontFamily: f.display, fontSize: 26, color: r.status === 'complete' ? color.done : color.ink }}>{r.remaining}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 14, color: color.muted }}> of {r.start}</Text>
              </Text>
              <Icon name="chev" color={color.muted} />
            </View>
            {r.cleared && <Note style={s.indent}>{r.cleared}</Note>}
            <View style={[s.chips, s.indent]}>
              <Chip text={r.height.text} tone={r.height.tone} />
              {r.hatches.map((h) => <Chip key={h.h} text={`${h.h} ${h.text}`} />)}
            </View>
          </Pressable>
        ))}
      </Card>
      <Note>Heights come from the stow plan until confirmed on the Plan tab. Red rows are low decks.</Note>
    </View>
  );
}

const s = StyleSheet.create({
  main: { padding: 20, gap: 16 },
  lowAlert: { backgroundColor: color.rBg, borderBottomWidth: 3, borderBottomColor: color.red, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 16 },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 8, minHeight: 56 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.row },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dn: { width: 56, fontSize: 26, color: color.ink },
  rn: { marginLeft: 'auto', textAlign: 'right' },
  indent: { paddingLeft: 68 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
