// Field count tile (Every Screen layout, Colby 2026-10-14): a dark OFFICIAL tile beside the finish. Flip it for the full field
// record (counted hours, last hour, field / cleared by brand). Layout only; every value comes from view.snapshot().
import { StyleSheet, Text, View } from 'react-native';
import type { snapshot } from '../view.ts';
import { bcolor, color, useType } from '../theme.ts';
import { Big, FlipTile } from './ui.tsx';

export function FieldTile({ v, half, onLongPress }: { v: ReturnType<typeof snapshot>; half?: boolean; onLongPress: () => void }) {
  const f = useType();
  const h = v.fieldRecord.hero, t = v.fieldRecord.tile;
  const rows = v.fieldRecord.rows.filter((r) => r.k !== 'Field count' && r.k !== 'Field balance'); // the tile's number and "to go"
  const pct = Math.min(100, Math.max(0, h.pct));
  const text = (size: number, semi?: boolean, muted?: boolean) => ({ fontFamily: semi ? f.bodySemi : f.body, fontSize: size, color: muted ? color.headMuted : color.headInk });
  return (
    <FlipTile style={half ? { flex: 1 } : undefined} cardStyle={s.tile} onLongPress={onLongPress} label="Official field count. Tap for the field record"
      front={<>
        <Text style={[s.chip, { fontFamily: f.bodySemi }]}>OFFICIAL</Text>
        <Text style={text(17, true)}>Field count</Text>
        <Big size={40} style={{ color: color.headInk }}>{h.value}</Big>
        <Text style={text(13, false, true)}>{t.through}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${pct}%` }]} /></View>
        <Text style={text(13, false, true)}>{t.line}</Text>
        <Text style={text(13, true, true)}>Details ›</Text>
      </>}
      back={<>
        <Text style={[s.chip, { fontFamily: f.bodySemi }]}>OFFICIAL</Text>
        <Text style={text(17, true)}>Field record</Text>
        <Text style={text(15)}>{h.of}</Text>
        {rows.map((r) => (
          <View key={r.k} style={{ gap: 0 }}>
            <Text style={text(13, false, true)}>{r.k}{r.sub ? ` (${r.sub})` : ''}</Text>
            <Text style={text(17, true)}>{r.v}</Text>
          </View>
        ))}
        {v.fieldRecord.brands.length > 0 && <Text style={text(13, true, true)}>Field / cleared by brand</Text>}
        {v.fieldRecord.brands.map((b) => (
          <Text key={b.name} style={text(15)}>{b.name}: {b.field} / {b.cleared}{b.diff.text !== '—' && b.diff.text !== '0' ? ` · ${b.diff.text}` : ''}</Text>
        ))}
        {v.fieldRecord.unsplitNote && <Text style={text(13, false, true)}>{v.fieldRecord.unsplitNote}</Text>}
        <Text style={text(13, false, true)}>{v.fieldRecord.note}</Text>
        <Text style={text(13, true, true)}>Tap the box to flip back</Text>
      </>} />
  );
}

const s = StyleSheet.create({
  tile: { flex: 1, padding: 16, gap: 6, backgroundColor: color.head, borderWidth: 1.5, borderColor: bcolor.line },
  chip: { alignSelf: 'flex-start', fontSize: 13, color: color.headInk, borderWidth: 1.5, borderColor: color.headInk, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  track: { height: 8, borderRadius: 4, backgroundColor: color.deckTrack, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: color.deckFill },
});
