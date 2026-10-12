// "Is it an assistant?" in the moment (assistant step 4): one tap says this wasn't useful; a reason is optional. Kept on this
// phone and read in Lessons; nothing in the vessel's record changes.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FEEDBACK_REASONS } from '../feedback.ts';
import { color, TAP, useType } from '../theme.ts';
import { u } from './ui.tsx';

export type NotUsefulProps = { onTap: () => Promise<string | null>; onReason: (key: string, reason: string) => void };

export function NotUseful({ onTap, onReason }: NotUsefulProps) {
  const f = useType();
  const [key, setKey] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) return <Text style={[u.note, { fontFamily: f.body }]}>Thanks. Kept for Lessons.</Text>;
  if (!key) return (
    <Pressable onPress={() => { void onTap().then((k) => { if (k) setKey(k); else setDone(true); }); }} accessibilityRole="button" accessibilityLabel="This was not useful"
      style={({ pressed }) => [{ minHeight: TAP, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 12 }, pressed && u.pressed]}>
      <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.muted, textDecorationLine: 'underline' }}>Not useful?</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <Text style={[u.note, { fontFamily: f.body }]}>Noted. Why? (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FEEDBACK_REASONS.map((r) => (
          <Pressable key={r} onPress={() => { onReason(key, r); setDone(true); }} accessibilityRole="button"
            style={({ pressed }) => [u.segBtn, { minHeight: TAP, paddingHorizontal: 12 }, pressed && u.pressed]}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{r}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
