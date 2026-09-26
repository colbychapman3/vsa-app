// Log sheet (reference: docs/reference/screens/09 and the tracker's logSheet()).
// Forms only: entries.ts builds the events and App.save() stores them; the engine's
// exact message is shown if anything is refused, and nothing is saved.
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatHM, operationDate, parseHM, suggestedStop, type Baseline, type OpTime, type Reject, type Side, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { decksView } from '../view.ts';
import { color, useType } from '../theme.ts';
import { Body, ErrorBox, Field, Go, Label, Note, Seg, TimeField, u } from './ui.tsx';

export type Mode = 'hour' | 'deck' | 'break' | 'clerk' | 'issue';
type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;
type Props = { state: State; baseline: Baseline; save: Save; onClose: (done?: string) => void; onOpenDeck: (id: string) => void; initial?: Mode };

// '' → null (blank); digits → number; anything else → NaN (refused with a message).
const num = (v: string) => (v.trim() === '' ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

export function LogSheet({ state, baseline, save, onClose, onOpenDeck, initial = 'hour' }: Props) {
  const f = useType();
  const [mode, setMode] = useState<Mode>(initial);
  const [error, setError] = useState<string | null>(null);
  const opDate = operationDate(baseline)!;
  const day = state.ops.day;
  const phase = state.ops.phase;

  // Time boxes: empty, or typed / filled by Now. Typed times are on the current operation day.
  const now = (): string | null => {
    const t = E.nowOpTime(opDate, new Date());
    if (!t) { setError('The phone’s date is before this operation’s Day 1.'); return null; }
    return t.hm;
  };
  const timeOf = (v: string, d = day): OpTime | null | 'bad' => (v.trim() === '' ? null : parseHM(v.trim()) == null ? 'bad' : { day: d, hm: v.trim().padStart(5, '0') });

  const run = async (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => {
    setError(null);
    const r = await save(build);
    if (r.ok) onClose(done); else setError(r.error);
  };

  const modes: { value: Mode; label: string }[] = [
    { value: 'hour', label: 'Hourly count' },
    { value: 'deck', label: 'Deck' },
    { value: 'break', label: phase === 'break' ? 'End break' : phase === 'shift_end' ? 'Next day' : 'Break / shift' },
    { value: 'clerk', label: 'Clerk count' },
    { value: 'issue', label: 'Discrepancy' },
  ];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose()}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.sheet} keyboardShouldPersistTaps="handled">
          <View style={u.secH}>
            <Text style={[s.h, { fontFamily: f.display }]}>Log</Text>
            <Pressable onPress={() => onClose()} style={s.x} accessibilityRole="button" accessibilityLabel="Close"><Text style={{ fontSize: 18 }}>✕</Text></Pressable>
          </View>
          <Seg options={modes} value={mode} onChange={(m) => { setMode(m); setError(null); }} />
          {mode === 'hour' && <HourForm state={state} baseline={baseline} day={day} run={run} setError={setError} />}
          {mode === 'deck' && <DeckList state={state} onOpenDeck={onOpenDeck} />}
          {mode === 'break' && <BreakForm state={state} baseline={baseline} run={run} now={now} timeOf={timeOf} setError={setError} />}
          {mode === 'clerk' && <ClerkForm phase={phase} run={run} now={now} timeOf={timeOf} setError={setError} />}
          {mode === 'issue' && <IssueForm run={run} now={now} timeOf={timeOf} setError={setError} />}
          {error && <ErrorBox text={error} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Run = (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => Promise<void>;
type TimeOf = (v: string, d?: number) => OpTime | null | 'bad';

// ---------- Hourly count ----------

function HourForm({ state, baseline, day, run, setError }: { state: State; baseline: Baseline; day: number; run: Run; setError: (e: string | null) => void }) {
  const breaks = baseline.breaks.map((b) => parseHM(b)!);
  const dayStart = parseHM(day > 1 ? state.plan.nextStart ?? baseline.start : baseline.start)!;
  const logged = new Map(state.periods.filter((p) => p.day === day).map((p) => [p.start, p]));
  // Hours follow the day's start; an hour that would run through a break start is left out.
  const hours = useMemo(() => {
    const out: string[] = [];
    for (let m = dayStart; m <= 23 * 60; m += 60) if (!breaks.some((b) => m < b && b < m + 60)) out.push(formatHM(m));
    return out;
  }, [dayStart, baseline.breaks.join()]);
  const firstOpen = (() => {
    const last = [...logged.keys()].at(-1);
    let m = last ? parseHM(last)! + 60 : dayStart;
    if (breaks.includes(m)) m += 60; // skip the break hour, like the tracker
    return hours.includes(formatHM(m)) ? formatHM(m) : hours[0];
  })();

  const [hour, setHour] = useState(firstOpen);
  const existing = logged.get(hour);
  const [count, setCount] = useState(existing ? String(existing.count) : '');
  const [drivers, setDrivers] = useState(existing?.drivers != null ? String(existing.drivers) : '');
  const [brands, setBrands] = useState<Record<string, string>>(Object.fromEntries(state.brands.map((b) => [b.name, existing?.brands?.[b.name] != null ? String(existing.brands[b.name]) : ''])));
  const short = breaks.includes(parseHM(hour)! + 60);
  const sides = [...new Set(baseline.destinations.map((d) => (d.side === 'N' ? 'Northside' : 'Southside')))] as Side[];
  const [stop, setStop] = useState<number | null>(existing?.stopMin ?? suggestedStop(sides));
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');

  const pick = (h: string) => {
    const p = logged.get(h);
    setHour(h); setError(null); setReason(null); setOther('');
    setCount(p ? String(p.count) : '');
    setDrivers(p?.drivers != null ? String(p.drivers) : '');
    setBrands(Object.fromEntries(state.brands.map((b) => [b.name, p?.brands?.[b.name] != null ? String(p.brands[b.name]) : ''])));
    setStop(p?.stopMin ?? suggestedStop(sides));
  };

  const submit = () => {
    const c = num(count), dr = num(drivers);
    if (c == null || Number.isNaN(c)) return setError('Enter the whole-number count for this hour.');
    if (dr != null && Number.isNaN(dr)) return setError('Drivers must be a whole number.');
    const split: Record<string, number> = {};
    for (const [b, v] of Object.entries(brands)) {
      const n = num(v);
      if (n == null) continue;
      if (Number.isNaN(n)) return setError(`${b} must be a whole number.`);
      split[b] = n;
    }
    if (short && stop == null) return setError(`Pick when production stopped before the ${formatHM(parseHM(hour)! + 60)} break.`);
    const why = reason === 'Other' ? other.trim() : reason;
    run((ctx) => E.hourEvents(ctx, { day, start: hour, count: c, drivers: dr, brands: Object.keys(split).length ? split : null, stopMin: short ? stop : null, reason: why }),
      `Saved ${hour}–${formatHM(parseHM(hour)! + 60)}: ${c.toLocaleString('en-US')} autos.`);
  };

  return (
    <View style={{ gap: 14 }}>
      <Label>HOUR{day > 1 ? ` · DAY ${day}` : ''}</Label>
      <Seg columns={4} value={hour} onChange={pick}
        options={hours.map((h) => ({ value: h, label: `${h.slice(0, 2)}${h.slice(2) === ':00' ? '' : h.slice(2)}–${formatHM(parseHM(h)! + 60).slice(0, 2)}${logged.has(h) ? ' ✓' : ''}` }))} />
      <Note>{`${hour}–${formatHM(parseHM(hour)! + 60)}`}{existing ? ' · already logged: changing it keeps the old value' : ''}</Note>
      <View style={s.row2}>
        <Field label="Autos counted this hour" value={count} onChange={setCount} />
        <Field label="Drivers" note="(optional)" value={drivers} onChange={setDrivers} />
      </View>
      <Label>SPLIT BY BRAND (OPTIONAL)</Label>
      <View style={s.row2}>
        {state.brands.map((b) => <Field key={b.name} label={b.name} value={brands[b.name] ?? ''} onChange={(v) => setBrands((x) => ({ ...x, [b.name]: v }))} />)}
      </View>
      {short && (
        <View style={{ gap: 8 }}>
          <Label>PRE-BREAK HOUR · WHEN DID PRODUCTION STOP?</Label>
          <Seg columns={2} value={stop} onChange={setStop}
            options={[30, 45].map((m) => ({ value: m, label: `Stopped ${formatHM(parseHM(hour)! + m)}` }))} />
        </View>
      )}
      {existing && (
        <View style={{ gap: 8 }}>
          <Label>REASON FOR THE CHANGE</Label>
          <Seg columns={2} value={reason} onChange={setReason} options={[...E.REASONS, 'Other'].map((r) => ({ value: r, label: r === 'Other' ? 'Other…' : r }))} />
          {reason === 'Other' && <Field label="Reason" value={other} onChange={setOther} keyboard="default" maxLength={120} />}
        </View>
      )}
      <Note>Enter the count for that hour only, not the running total. Re-entering an hour replaces it and keeps the old value.</Note>
      <Go label="Save hourly count" onPress={submit} />
    </View>
  );
}

// ---------- Deck (opens the deck sheet) ----------

function DeckList({ state, onOpenDeck }: { state: State; onOpenDeck: (id: string) => void }) {
  const f = useType();
  return (
    <View style={u.card}>
      {decksView(state).rows.map((r, i) => (
        <Pressable key={r.id} onPress={() => onOpenDeck(r.id)} style={[s.deckRow, i > 0 && { borderTopWidth: 1, borderTopColor: color.row }]} accessibilityRole="button">
          <Text style={{ fontFamily: f.display, fontSize: 24, width: 64, color: color.ink }}>{r.label}</Text>
          <Body style={{ color: color.muted }}>{r.pill}</Body>
          <Text style={{ marginLeft: 'auto', fontFamily: f.display, fontSize: 22, color: color.ink }}>{r.remaining}<Text style={{ fontFamily: f.body, fontSize: 13, color: color.muted }}> of {r.start}</Text></Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Break / shift ----------

function BreakForm({ state, baseline, run, now, timeOf, setError }: { state: State; baseline: Baseline; run: Run; now: () => string | null; timeOf: TimeOf; setError: (e: string | null) => void }) {
  const [t, setT] = useState('');
  const [end, setEnd] = useState('');
  const phase = state.ops.phase, day = state.ops.day;
  const fill = (set: (v: string) => void) => () => { const n = now(); if (n) set(n); };
  const go = (value: string, d: number, build: (c: E.Ctx, at: OpTime | null) => VsaEvent[] | Reject, done: (at: OpTime | null) => string) => {
    const at = timeOf(value, d);
    if (at === 'bad') return setError('Enter the time as HH:MM.');
    run((c) => build(c, at), done(at));
  };

  if (phase === 'shift_end') {
    return (
      <View style={{ gap: 14 }}>
        <Note>Shift ended at {state.ops.shiftEnd}. Reconcile first, then start the next day.</Note>
        <TimeField label={`Day ${day + 1} starts at`} value={t} onChange={setT} onNow={fill(setT)} />
        <Go label={`Start Day ${day + 1}`} onPress={() => go(t, day + 1, E.nextDayEvents, () => `Day ${day + 1} started.`)} />
      </View>
    );
  }
  if (phase === 'break') {
    return (
      <View style={{ gap: 14 }}>
        <Note>On break since {state.ops.breakStart}.</Note>
        <TimeField label="Back to work at" value={t} onChange={setT} onNow={fill(setT)} />
        <Go label="Log break end" onPress={() => go(t, day, E.breakEndEvents, (at) => `Break ended${at ? ` at ${at.hm}` : ''}.`)} />
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <TimeField label="Break started at" value={t} onChange={setT} onNow={fill(setT)} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {baseline.breaks.map((b) => <Go key={b} ghost label={`Scheduled ${b}`} onPress={() => setT(b)} />)}
      </View>
      <Go label="Log break start" onPress={() => go(t, day, E.breakStartEvents, (at) => `Break started${at ? ` at ${at.hm}` : ''}.`)} />
      <View style={s.hr}>
        <TimeField label="Shift ended at" value={end} onChange={setEnd} onNow={fill(setEnd)} />
        <Go ghost label="Log end of shift" onPress={() => go(end, day, E.endShiftEvents, () => 'End of shift logged. Reconcile ship and field.')} />
        <Note>Starts end-of-shift reconciliation. No cars should be in transit.</Note>
      </View>
    </View>
  );
}

// ---------- Clerk count ----------

function ClerkForm({ phase, run, now, timeOf, setError }: { phase: string; run: Run; now: () => string | null; timeOf: TimeOf; setError: (e: string | null) => void }) {
  const [rem, setRem] = useState('');
  const [t, setT] = useState('');
  return (
    <View style={{ gap: 14 }}>
      <Field label="Clerk’s vessel remaining" value={rem} onChange={setRem} />
      <TimeField label="Time" value={t} onChange={setT} onNow={() => { const n = now(); if (n) setT(n); }} />
      <Note>{phase !== 'working' ? 'Shows as match or discrepancy on the snapshot during this reconciliation.' : 'Tip: log this during a break so it shows on the snapshot.'}</Note>
      <Go label="Save clerk count" onPress={() => {
        const n = num(rem), at = timeOf(t);
        if (n == null || Number.isNaN(n)) return setError('Enter the clerk’s remaining count as a whole number.');
        if (at === 'bad') return setError('Enter the time as HH:MM.');
        run((c) => E.clerkEvents(c, n, at), `Clerk count saved: ${n.toLocaleString('en-US')}.`);
      }} />
    </View>
  );
}

// ---------- Discrepancy ----------

function IssueForm({ run, now, timeOf, setError }: { run: Run; now: () => string | null; timeOf: TimeOf; setError: (e: string | null) => void }) {
  const [text, setText] = useState('');
  const [t, setT] = useState('');
  return (
    <View style={{ gap: 14 }}>
      <Field label="What doesn’t match" value={text} onChange={setText} keyboard="default" maxLength={200} />
      <TimeField label="Noticed at" value={t} onChange={setT} onNow={() => { const n = now(); if (n) setT(n); }} />
      <Note>Stays on the open list until someone marks it resolved.</Note>
      <Go label="Add to open discrepancies" onPress={() => {
        const at = timeOf(t);
        if (at === 'bad') return setError('Enter the time as HH:MM.');
        run((c) => E.openDiscrepancyEvents(c, text, at), 'Added to open discrepancies.');
      }} />
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { padding: 20, paddingBottom: 48, gap: 14 },
  h: { fontSize: 30, color: color.ink },
  x: { minWidth: 48, minHeight: 48, borderRadius: 999, backgroundColor: color.soft, alignItems: 'center', justifyContent: 'center' },
  row2: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  deckRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  hr: { borderTopWidth: 1, borderTopColor: color.soft, paddingTop: 14, gap: 14 },
});
