// "What if" on the Decks tab (Every Screen mockup A3, Colby 2026-10-14). One honest lever: the driver count, run through the last
// per-driver rate by the same pure calculator the Ask answers use. Weather, heavy cargo and the Southside share are left out: they
// would be invented effects, and VSA has no measured numbers for them yet. Nothing here is saved.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatHM, type Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { driversChange, driversFinish } from '../whatif.ts';
import { bcolor, color, TAP, useType } from '../theme.ts';
import { Big, Label, Note, Tag, u } from './ui.tsx';

export function WhatIfCard({ state, baseline, nowMin }: { state: State; baseline: Baseline; nowMin: number }) {
  const f = useType();
  const last = [...state.periods].reverse().find((x) => x.driverRate.rate != null && typeof x.drivers === 'number');
  const cur = last ? (last.drivers as number) : 0;
  const [picked, setPicked] = useState<number | null>(null);
  const n = picked ?? cur;
  if (!last || state.vesselRemaining == null || state.vesselRemaining === 0) return null; // nothing to project: the card stays out of the way
  const fin = driversFinish(state, baseline, nowMin, n), why = driversChange(state, baseline, nowMin, n);
  const step = (d: number) => setPicked(Math.max(1, Math.min(300, n + d)));
  const btn = (label: string, d: number, hint: string) => (
    <Pressable onPress={() => step(d)} accessibilityRole="button" accessibilityLabel={hint} style={({ pressed }) => [s.step, pressed && u.pressed]}>
      <Text style={{ fontFamily: f.displaySemi, fontSize: 28, color: color.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[u.card, u.pad, { gap: 10 }]}>
      <View style={u.secH}>
        <Text style={{ fontFamily: f.displaySemi, fontSize: 17, color: color.ink }}>What if</Text>
        <Tag kind="FORECAST" />
      </View>
      <Label>Finish with this many drivers</Label>
      {fin.ok
        ? <Big size={44} style={{ color: color.ink }}>{`${formatHM(fin.endAbs % 1440)}${fin.endAbs >= 1440 ? ' · next day' : ''}`}</Big>
        : <Note>{fin.error}</Note>}
      <View style={s.row}>
        {btn('−', -1, 'One fewer driver')}
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontFamily: f.display, fontSize: 32, color: color.ink }}>{n}</Text>
          <Note>drivers{picked != null && picked !== cur ? ` (now ${cur})` : ''}</Note>
        </View>
        {btn('+', 1, 'One more driver')}
      </View>
      {why.ok && why.lines.map((l) => <Note key={l}>{l}</Note>)}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: TAP + 12, height: TAP + 12, borderRadius: 999, borderWidth: 2, borderColor: bcolor.ink, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
});
