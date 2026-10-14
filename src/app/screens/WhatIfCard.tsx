// "What if" on the Decks tab (Every Screen, Colby 2026-10-14): ONE widget holding every factor the log can back, each moved in
// its own way (a stepper, share chips), the finish answering at once. Drivers, Southside share and heavy cargo (H/H) today;
// weather comes later, when something measured stands behind it. A factor with no measured basis says so and stays out.
// Nothing here is saved, and nothing here is on the Snapshot.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatHM, type Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { levers, scenario, type Factors } from '../whatif.ts';
import { bcolor, color, TAP, useType } from '../theme.ts';
import { Big, Label, Note, Tag, u } from './ui.tsx';

const SHARES = [0, 0.25, 0.5, 0.75, 1];

export function WhatIfCard({ state, baseline }: { state: State; baseline: Baseline }) {
  const f = useType();
  const [d, setD] = useState<number | null>(null);      // drivers (null = as now)
  const [south, setSouth] = useState<number | null>(null);
  const [heavy, setHeavy] = useState<number | null>(null);
  if (state.vesselRemaining == null || state.vesselRemaining === 0 || state.eta.rate == null) return null; // nothing to project: stay out of the way
  const lv = levers(state, baseline);
  const factors: Factors = { ...(d != null ? { drivers: d } : {}), ...(south != null ? { south } : {}), ...(heavy != null ? { heavy } : {}) };
  const r = scenario(state, baseline, factors);
  const moved = d != null || south != null || heavy != null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const step = (delta: number) => lv.drivers && setD(Math.max(1, Math.min(300, (d ?? lv.drivers.now) + delta)));
  const chips = (cur: number | null, now: number, on: (v: number | null) => void, label: string) => (
    <View style={s.chips}>
      {SHARES.map((v) => {
        const sel = (cur ?? now) === v, isNow = cur == null && now === v;
        return (
          <Pressable key={v} onPress={() => on(v === now ? null : v)} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`${label} ${pct(v)}${isNow ? ', as now' : ''}`}
            style={({ pressed }) => [s.chip, sel && s.chipOn, pressed && u.pressed]}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: sel ? color.bg : color.ink }}>{pct(v)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const delta = r.ok ? (r.deltaMin === 0 ? 'Same as the forecast now' : `${Math.abs(r.deltaMin)} min ${r.deltaMin < 0 ? 'earlier' : 'later'} than the forecast now`) : null;
  return (
    <View style={[u.card, u.pad, { gap: 12 }]}>
      <View style={u.secH}>
        <Text style={{ fontFamily: f.displaySemi, fontSize: 17, color: color.ink }}>What if</Text>
        <Tag kind="FORECAST" />
      </View>
      {r.ok ? (
        <View style={{ gap: 2 }}>
          <Label>Finish</Label>
          <Big size={44}>{`${formatHM(r.endAbs % 1440)}${r.endAbs >= 1440 ? ' · next day' : ''}`}</Big>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: r.deltaMin <= 0 ? color.gInk : color.oInk }}>{delta}</Text>
        </View>
      ) : <Note>{r.error}</Note>}

      <View style={s.lever}>
        <Label>Drivers</Label>
        {lv.drivers ? (
          <View style={s.row}>
            <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="One fewer driver" style={({ pressed }) => [s.step, pressed && u.pressed]}><Text style={{ fontFamily: f.displaySemi, fontSize: 28, color: color.ink }}>−</Text></Pressable>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontFamily: f.display, fontSize: 32, color: color.ink }}>{d ?? lv.drivers.now}</Text>
              <Note>{d != null && d !== lv.drivers.now ? `now ${lv.drivers.now}` : 'as now'}</Note>
            </View>
            <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="One more driver" style={({ pressed }) => [s.step, pressed && u.pressed]}><Text style={{ fontFamily: f.displaySemi, fontSize: 28, color: color.ink }}>+</Text></Pressable>
          </View>
        ) : <Note>No per-driver rate yet: an hour needs its drivers and its stoppage time.</Note>}
      </View>

      <View style={s.lever}>
        <Label>Southside share of the cars</Label>
        {chips(south, lv.south.now, setSouth, 'Southside share')}
        <Note>{`Now the forecast stops ${Math.round(15 + 15 * lv.south.now)} min before a break${lv.south.ofAutos != null ? `; Southside is ${pct(lv.south.ofAutos)} of this vessel's autos` : ''}.`}</Note>
      </View>

      <View style={s.lever}>
        <Label>Heavy cargo (H/H) running, share of the hours left</Label>
        {lv.heavy ? <>{chips(heavy, lv.heavy.now, setHeavy, 'H/H share')}<Note>Measured from this vessel's own hours with and without H/H. Observed, not proven.</Note></> : <Note>{lv.heavyWhy}</Note>}
      </View>

      {moved && (
        <Pressable onPress={() => { setD(null); setSouth(null); setHeavy(null); }} accessibilityRole="button" style={({ pressed }) => [s.reset, pressed && u.pressed]}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>Back to now</Text>
        </Pressable>
      )}
      {r.ok && r.lines.map((l) => <Note key={l}>{l}</Note>)}
    </View>
  );
}

const s = StyleSheet.create({
  lever: { gap: 6, borderTopWidth: 1, borderTopColor: bcolor.soft, paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: TAP + 12, height: TAP + 12, borderRadius: 999, borderWidth: 2, borderColor: bcolor.ink, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: TAP, minWidth: 56, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: bcolor.ink, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: color.ink },
  reset: { minHeight: TAP, alignSelf: 'flex-start', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: bcolor.line, justifyContent: 'center' },
});
