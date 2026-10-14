// Field count tile (Every Screen layout, Colby 2026-10-14): a dark OFFICIAL tile beside the finish. A tap opens Hourly, where the
// counted hours, last hour and field / cleared by brand are listed. Layout only; every value comes from view.snapshot().
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { snapshot } from '../view.ts';
import { color, useType } from '../theme.ts';
import { Big, u } from './ui.tsx';

export function FieldTile({ v, half, onPress, onLongPress }: { v: ReturnType<typeof snapshot>; half?: boolean; onPress: () => void; onLongPress: () => void }) {
  const f = useType();
  const h = v.fieldRecord.hero, t = v.fieldRecord.tile;
  const pct = Math.min(100, Math.max(0, h.pct));
  const text = (size: number, semi?: boolean, muted?: boolean) => ({ fontFamily: semi ? f.bodySemi : f.body, fontSize: size, color: muted ? color.headMuted : color.headInk });
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={450} style={half ? { flex: 1 } : undefined} accessibilityRole="button"
      accessibilityLabel={`Official field count ${h.value}, ${t.through}. Opens Hourly`} accessibilityHint="Long press to move or hide this box">
      <View style={[u.card, s.tile]}>
        <Text style={[s.chip, { fontFamily: f.bodySemi }]}>OFFICIAL</Text>
        <Text style={text(17, true)}>Field count</Text>
        <Big size={44} style={{ color: color.headInk }}>{h.value}</Big>
        <Text style={text(15, true, true)}>{t.through}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${pct}%` }]} /></View>
        <Text style={text(13, true, true)}>{t.line}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tile: { flex: 1, padding: 14, gap: 6, backgroundColor: color.head },
  chip: { alignSelf: 'flex-start', fontSize: 13, letterSpacing: 0.6, color: color.head, backgroundColor: color.headInk, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  track: { height: 14, borderRadius: 7, backgroundColor: color.deckTrack, overflow: 'hidden' },
  fill: { height: 14, backgroundColor: color.deckFill },
});
