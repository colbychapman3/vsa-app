// Field record box: the same layout as the vessel hero (Colby, 2026-10-08). The big count fills with the share counted.
import { StyleSheet, Text, View } from 'react-native';
import type { snapshot } from '../view.ts';
import { color, useType } from '../theme.ts';
import { Bar, Body, Card, FillNumber, Label, Note, u } from './ui.tsx';

export function FieldBox({ v }: { v: ReturnType<typeof snapshot> }) {
  const f = useType();
  const h = v.fieldRecord.hero;
  const rows = v.fieldRecord.rows.filter((r) => r.k !== 'Field count' && r.k !== 'Field balance'); // those two are the hero's number and "to go"
  return (
    <Card style={[u.pad, { gap: 10 }]}>
      <View style={u.secH}>
        <Label style={{ flexShrink: 1 }}>FIELD RECORD</Label>
        <Text style={{ fontFamily: f.body, fontSize: 13, color: color.muted }}>official counts</Text>
      </View>
      <FillNumber size={112} pct={h.pct} fill={color.ink}>{h.value}</FillNumber>
      <Body style={{ fontSize: 17 }}>{h.of}</Body>
      <Bar pct={h.pct} />
      <View style={u.secH}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.ink }}>{h.barLeft}</Text>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.ink }}>{h.barRight}</Text>
      </View>
      <View style={s.hr}>
        {rows.map((r) => (
          <View key={r.k} style={u.kv}>
            <Body style={{ color: color.muted, maxWidth: '45%' }}>{r.k}</Body>
            <Text style={{ flex: 1, textAlign: 'right' }}>
              <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{r.v}</Text>
              {r.sub ? <Text style={{ fontFamily: f.body, fontSize: 13, color: color.muted }}> {r.sub}</Text> : null}
            </Text>
          </View>
        ))}
        {v.fieldRecord.brands.length > 0 && <Label>FIELD / CLEARED BY BRAND</Label>}
        {v.fieldRecord.brands.map((b) => (
          <View key={b.name} style={u.kv}>
            <Body semi style={{ maxWidth: '35%' }}>{b.name}</Body>
            <Text style={{ flex: 1, textAlign: 'right', fontFamily: f.body, fontSize: 14, color: b.diff.tone === 'red' ? color.red : color.ink }}>
              {b.field} / {b.cleared}{b.diff.text !== '—' && b.diff.text !== '0' ? ` · ${b.diff.text}` : ''}
            </Text>
          </View>
        ))}
        {v.fieldRecord.unsplitNote && <Note>{v.fieldRecord.unsplitNote}</Note>}
        <Note>{v.fieldRecord.note}</Note>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  hr: { borderTopWidth: 1, borderTopColor: color.soft, marginTop: 6, paddingTop: 12, gap: 8 },
});
