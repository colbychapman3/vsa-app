// Field / Cleared / In transit by brand (HANDOFF_SPEC 3.6, boards 1.5 and 9.1), with the vessel's "All" row last.
// Layout only: rows come from view.ts (brandTableOf, brandTotal). A field-ahead brand shows "field over" in the In transit column,
// red only at a break or end of shift. H&H is never in this table.
import { StyleSheet, View } from 'react-native';
import { Text } from './text.tsx';
import { IN_TRANSIT_DEF } from '../view.ts';
import { bcolor, color, useType } from '../theme.ts';
import { Card, Note, SectionHead } from './ui.tsx';

type Row = { name: string; field: string; cleared: string; inTransit: string | null; diff: { tone: 'plain' | 'red'; text: string } };

export function BrandTable({ rows, total }: { rows: Row[]; total: Row | null }) {
  const f = useType();
  const all = total ? [...rows, total] : rows;
  const cell = (t: string, bold: boolean, c = color.ink, first = false) => (
    <Text style={[s.cell, first && s.first, { fontFamily: bold ? f.bodySemi : f.body, color: c }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t}</Text>
  );
  return (
    <View style={{ gap: 6 }}>
      <SectionHead title="By brand" />
      <Card>
        <View style={s.row}>{cell('Brand', true, color.muted, true)}{cell('Field', true, color.muted)}{cell('Cleared', true, color.muted)}{cell('In transit', true, color.muted)}</View>
        {all.map((r) => {
          const isAll = r === total;
          return (
            <View key={r.name} style={[s.row, s.line, isAll && s.total]}>
              {cell(r.name, true, color.ink, true)}
              {cell(r.field, isAll)}
              {cell(r.cleared, isAll)}
              {cell(r.inTransit ?? r.diff.text, isAll, r.inTransit == null && r.diff.tone === 'red' ? color.red : color.ink)}
            </View>
          );
        })}
      </Card>
      <Note>{IN_TRANSIT_DEF}</Note>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 44, gap: 6 },
  line: { borderTopWidth: 1, borderTopColor: bcolor.soft },
  total: { borderTopWidth: 2, borderTopColor: bcolor.line },
  cell: { flex: 1, fontSize: 15, textAlign: 'right' },
  first: { flex: 1.3, textAlign: 'left' },
});
