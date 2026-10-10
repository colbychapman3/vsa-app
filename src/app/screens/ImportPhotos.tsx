// Paperwork photos kept from Setup (Settings › Paperwork photos). Shown on Plan only when this vessel has some.
// Tap a thumbnail to see it full width right here (no second modal); tap it again to close. The files are not part of the log.
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { listImports, photoUri } from '../evidenceFiles.ts';
import { color } from '../theme.ts';
import { Card, InfoNote, Note, SectionHead, u } from './ui.tsx';

export function ImportPhotos({ vesselId }: { vesselId: string }) {
  const files = useMemo(() => listImports(vesselId), [vesselId]);
  const [open, setOpen] = useState<string | null>(null);
  if (!files.length) return null;
  return (
    <Card style={[u.pad, { gap: 10 }]}>
      <SectionHead title="Paperwork photos" right={`${files.length}`} />
      {open && (
        <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel="Paperwork photo, full size. Tap to close.">
          <Image source={{ uri: photoUri(open) }} style={s.full} resizeMode="contain" />
        </Pressable>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {files.map((p, i) => (
          <Pressable key={p} onPress={() => setOpen(open === p ? null : p)} style={({ pressed }) => [s.thumb, open === p && s.on, pressed && u.pressed]} accessibilityRole="button" accessibilityLabel={`Paperwork photo ${i + 1}`}>
            <Image source={{ uri: photoUri(p) }} style={s.img} resizeMode="cover" />
          </Pressable>
        ))}
      </ScrollView>
      <InfoNote><Note>The pages you photographed in Setup, kept on this phone only. They are not in the exported log. Turn this off in Settings.</Note></InfoNote>
    </Card>
  );
}

const s = StyleSheet.create({
  full: { width: '100%', height: 420, backgroundColor: color.soft, borderRadius: 8 },
  thumb: { width: 76, height: 76, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: color.line },
  on: { borderColor: color.ink },
  img: { width: '100%', height: '100%' },
});
