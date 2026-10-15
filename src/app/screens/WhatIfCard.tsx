// "What if" on the Decks tab (Every Screen, Colby 2026-10-14): ONE widget, every control moved with a tap, the finish answering at
// once through the engine's own forecast. Pace, drivers, Southside share and heavy cargo (H/H); a control with no measured basis
// says so in three words and stays out. No prose: the assumptions are the chosen values, printed under the finish.
// Nothing here is saved, and nothing here is on the Snapshot.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './text.tsx';
import { formatHM, type Baseline } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { levers, scenario, type Factors } from '../whatif.ts';
import { bcolor, color, TAP, useType } from '../theme.ts';
import { Big, Label, Note, Tag, u } from './ui.tsx';

const SHARES = [0, 0.25, 0.5, 0.75, 1];

export function WhatIfCard({ state, baseline }: { state: State; baseline: Baseline }) {
  const f = useType();
  const [pace, setPace] = useState<number | null>(null); // each null = as now
  const [d, setD] = useState<number | null>(null);
  const [south, setSouth] = useState<number | null>(null);
  const [heavy, setHeavy] = useState<number | null>(null);
  if (state.vesselRemaining == null || state.vesselRemaining === 0 || state.eta.rate == null) return null; // nothing to project: stay out of the way
  const lv = levers(state, baseline);
  const factors: Factors = { ...(pace != null ? { pace } : {}), ...(d != null ? { drivers: d } : {}), ...(south != null ? { south } : {}), ...(heavy != null ? { heavy } : {}) };
  const r = scenario(state, baseline, factors);
  const moved = pace != null || d != null || south != null || heavy != null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const paceNow = lv.pace ? Math.round(lv.pace.now) : null;
  const delta = r.ok ? (r.deltaMin === 0 ? 'Same as now' : `${Math.abs(r.deltaMin)} min ${r.deltaMin < 0 ? 'earlier' : 'later'} than now`) : null;
  // The assumption list: the pace the finish runs at (the engine's, after pace, drivers and H/H), then the other values chosen.
  const chosen = [r.ok && (pace != null || d != null || heavy != null) ? `${Math.round(r.rate)}/hr` : null, d != null ? `${d} drivers` : null, south != null ? `${pct(south)} Southside` : null, heavy != null ? `${pct(heavy)} H/H` : null].filter(Boolean).join(' · ');

  const stepper = (label: string, value: number, now: number, unit: string, step: number, set: (v: number) => void, min: number, max: number) => (
    <View style={s.lever}>
      <View style={u.secH}>
        <Label>{label}</Label>
        {value !== now && <Note>now {now}{unit}</Note>}
      </View>
      <View style={s.row}>
        <Pressable onPress={() => set(Math.max(min, value - step))} accessibilityRole="button" accessibilityLabel={`${label}: ${step} less`} style={({ pressed }) => [s.step, pressed && u.pressed]}><Text style={{ fontFamily: f.displaySemi, fontSize: 28, color: color.ink }}>−</Text></Pressable>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontFamily: f.display, fontSize: 32, color: value === now ? color.ink : color.blue }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.1}>{value}<Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.muted }}>{unit}</Text></Text>
        </View>
        <Pressable onPress={() => set(Math.min(max, value + step))} accessibilityRole="button" accessibilityLabel={`${label}: ${step} more`} style={({ pressed }) => [s.step, pressed && u.pressed]}><Text style={{ fontFamily: f.displaySemi, fontSize: 28, color: color.ink }}>+</Text></Pressable>
      </View>
    </View>
  );
  const chips = (label: string, cur: number | null, now: number | null, on: (v: number | null) => void) => {
    const vals = [...new Set([...(now != null ? [now] : []), ...SHARES])].sort((a, b) => a - b);
    return (
      <View style={s.lever}>
        <View style={u.secH}>
          <Label>{label}</Label>
          {now != null && cur != null && cur !== now && <Note>now {pct(now)}</Note>}
        </View>
        <View style={s.chips}>
          {vals.map((v) => {
            const sel = (cur ?? now) === v, isNow = v === now;
            return (
              <Pressable key={v} onPress={() => on(v === now ? null : v)} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`${label} ${pct(v)}${isNow ? ', as now' : ''}`}
                style={({ pressed }) => [s.chip, sel && s.chipOn, pressed && u.pressed]}>
                <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: sel ? color.bg : color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2}>{pct(v)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };
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
          {moved && chosen !== '' && <Note>{chosen}</Note>}
        </View>
      ) : <Note>{r.error}</Note>}

      {lv.pace && paceNow != null ? stepper('Pace', pace ?? paceNow, paceNow, '/hr', 10, (v) => setPace(v === paceNow ? null : v), 10, 600) : null}
      {lv.drivers ? stepper('Drivers', d ?? lv.drivers.now, lv.drivers.now, '', 1, (v) => setD(v === lv.drivers!.now ? null : v), 1, 300)
        : <View style={s.lever}><Label>Drivers</Label><Note>Needs an hour with drivers logged.</Note></View>}
      {chips(lv.south.known ? 'Southside share' : 'Southside share (not known)', south, lv.south.known ? lv.south.now : null, setSouth)}
      {lv.heavy ? chips('Heavy cargo (H/H), share of hours left', heavy, lv.heavy.now, setHeavy)
        : <View style={s.lever}><Label>Heavy cargo (H/H)</Label><Note>Not enough hours with and without it.</Note></View>}

      {moved && (
        <Pressable onPress={() => { setPace(null); setD(null); setSouth(null); setHeavy(null); }} accessibilityRole="button" style={({ pressed }) => [s.reset, pressed && u.pressed]}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>Back to now</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  lever: { gap: 6, borderTopWidth: 1, borderTopColor: bcolor.soft, paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: TAP + 12, height: TAP + 12, borderRadius: 999, borderWidth: 2, borderColor: bcolor.ink, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, minWidth: 0, minHeight: TAP, paddingHorizontal: 2, borderRadius: 999, borderWidth: 1.5, borderColor: bcolor.ink, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: color.ink },
  reset: { minHeight: TAP, alignSelf: 'flex-start', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: bcolor.line, justifyContent: 'center' },
});
