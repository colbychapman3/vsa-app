// Log sheet (reference: docs/reference/screens/09 and the tracker's logSheet()).
// Forms only: entries.ts builds the events and App.save() stores them; the engine's
// exact message is shown if anything is refused, and nothing is saved.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatHM, operationDate, parseHM, suggestedStop, type Baseline, type OpTime, type Reject, type Side, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { deckSheet, decksView, hourOptions } from '../view.ts';
import { DeckForm } from './DeckSheet.tsx';
import { EvidenceForm } from './EvidenceForm.tsx';
import { color, useType } from '../theme.ts';
import { Body, ErrorBox, Field, Go, Label, Note, Seg, Sheet, TimeField, u } from './ui.tsx';

export type Mode = 'hour' | 'deck' | 'break' | 'clerk' | 'issue' | 'photo';
type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;
type Props = { state: State; baseline: Baseline; isTest: boolean; save: Save; onClose: (done?: string) => void; initial?: Mode; prefill?: HourPrefill };
// From the assistant: a count and hour that were typed. Shown in the form; nothing is saved until Save is tapped.
export type HourPrefill = { count: number; start: string | null };

// '' → null (blank); digits → number; anything else → NaN (refused with a message).
const num = (v: string) => (v.trim() === '' ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

export function LogSheet({ state, baseline, isTest, save, onClose, initial = 'hour', prefill }: Props) {
  const f = useType();
  const [deck, setDeck] = useState<string | null>(null); // a deck opened from Deck mode, shown in this same sheet
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
    { value: 'photo', label: 'Photo' },
  ];

  if (deck) {
    return (
      // The deck's own name is the title (like the tracker), so a mis-tap can't go unnoticed.
      <Sheet title={deckSheet(state.decks.find((x) => x.id === deck)!, baseline).title} isTest={isTest} onClose={() => onClose()} scrollKey={deck}>
        <Pressable onPress={() => setDeck(null)} style={({ pressed }) => [s.back, pressed && u.pressed]} accessibilityRole="button"><Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.blue }}>‹ All decks</Text></Pressable>
        <DeckForm state={state} baseline={baseline} deckId={deck} save={save} onClose={(done) => (done ? onClose(done) : setDeck(null))} />
      </Sheet>
    );
  }
  return (
    <Sheet title="Log" isTest={isTest} onClose={() => onClose()}>
          <Seg options={modes} value={mode} onChange={(m) => { setMode(m); setError(null); }} />
          {mode === 'hour' && <HourForm state={state} baseline={baseline} run={run} setError={setError} prefill={prefill} />}
          {mode === 'deck' && <DeckList state={state} onOpenDeck={setDeck} />}
          {mode === 'break' && <BreakForm state={state} run={run} now={now} timeOf={timeOf} setError={setError} />}
          {mode === 'clerk' && <ClerkForm phase={phase} run={run} now={now} timeOf={timeOf} setError={setError} />}
          {mode === 'issue' && <IssueForm run={run} now={now} timeOf={timeOf} setError={setError} />}
          {mode === 'photo' && <EvidenceForm state={state} baseline={baseline} save={save} onClose={(done) => onClose(done)} />}
          {error && <ErrorBox text={error} />}
    </Sheet>
  );
}

type Run = (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => Promise<void>;
type TimeOf = (v: string, d?: number) => OpTime | null | 'bad';

// ---------- Hourly count ----------

function HourForm({ state, baseline, run, setError, prefill }: { state: State; baseline: Baseline; run: Run; setError: (e: string | null) => void; prefill?: HourPrefill }) {
  const opts = hourOptions(state, baseline);
  const day = opts.day;
  const logged = new Map(state.periods.filter((p) => p.day === day).map((p) => [p.start, p]));
  const firstOpen = prefill?.start && opts.hours.some((h) => h.start === prefill.start) ? prefill.start : opts.defaultStart ?? opts.hours[0]?.start ?? baseline.start;
  const [hour, setHour] = useState(firstOpen);
  const existing = logged.get(hour);
  const [count, setCount] = useState(prefill ? String(prefill.count) : existing ? String(existing.count) : '');
  // Only the hour's own driver count; the day's setting (Plan › Labor) covers the rest.
  const [drivers, setDrivers] = useState(existing?.hourDrivers != null ? String(existing.hourDrivers) : '');
  const dayDrivers = state.workdayDrivers[day] ?? null;
  const [brands, setBrands] = useState<Record<string, string>>(Object.fromEntries(state.brands.map((b) => [b.name, existing?.brands?.[b.name] != null ? String(existing.brands[b.name]) : ''])));
  const cur = opts.hours.find((h) => h.start === hour);
  const short = cur?.short ?? false;
  const endHM = cur?.end ?? formatHM(parseHM(hour)! + 60); // the hour before a break ends at the break
  // Stop choices are clock times :30 / :45 (30 or 15 min before the break); stored as minutes worked from the hour's start.
  const stopChoices = (h: string) => { const b = parseHM(opts.hours.find((x) => x.start === h)?.end ?? '')!; return [30, 45].map((m) => b - 60 + m - parseHM(h)!).filter((m) => m >= 0); };
  const suggest = (h: string) => { const m = suggestedStop(sides); const b = parseHM(opts.hours.find((x) => x.start === h)?.end ?? ''); return m == null || b == null || b - 60 + m - parseHM(h)! < 0 ? null : b - 60 + m - parseHM(h)!; };
  const sides = [...new Set(baseline.destinations.map((d) => (d.side === 'N' ? 'Northside' : 'Southside')))] as Side[];
  const [stop, setStop] = useState<number | null>(existing?.stopMin ?? suggest(hour));
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');

  const pick = (h: string) => {
    const p = logged.get(h);
    setHour(h); setError(null); setReason(null); setOther('');
    setCount(p ? String(p.count) : '');
    setDrivers(p?.hourDrivers != null ? String(p.hourDrivers) : '');
    setBrands(Object.fromEntries(state.brands.map((b) => [b.name, p?.brands?.[b.name] != null ? String(p.brands[b.name]) : ''])));
    setStop(p?.stopMin ?? suggest(h));
  };

  const submit = () => {
    setError(null); // so a repeated identical error is announced again
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
    if (short && stop == null) return setError(`Pick when production stopped before the ${endHM} break.`);
    if (existing && ((existing.hourDrivers != null && dr == null) || state.brands.some((b) => existing.brands?.[b.name] != null && num(brands[b.name] ?? '') == null))) {
      return setError('Clearing a logged value isn’t supported yet. Enter the corrected number instead.');
    }
    const why = reason === 'Other' ? other.trim() : reason;
    run((ctx) => E.hourEvents(ctx, { day, start: hour, count: c, drivers: dr, brands: Object.keys(split).length ? split : null, stopMin: short ? stop : null, reason: why }),
      `Saved ${hour}–${endHM}: ${c.toLocaleString('en-US')} autos.`);
  };

  return (
    <View style={{ gap: 14 }}>
      <Label>HOUR{day > 1 ? ` · DAY ${day}` : ''}</Label>
      <Seg columns={4} value={hour} onChange={pick}
        options={opts.hours.map((h) => ({ value: h.start, label: `${h.start.slice(0, 2)}${h.start.endsWith(':00') ? '' : h.start.slice(2)}–${h.end.slice(0, 2)}${h.logged ? ' (correct)' : ''}` }))} />
      <Note>{`${hour}–${endHM}`}{existing ? ' · already logged: saving a change keeps the old value' : ''}</Note>
      <View style={s.row2}>
        <Field label="Autos counted this hour" value={count} onChange={setCount} />
        <Field label={dayDrivers != null ? 'Drivers this hour' : 'Drivers'} note={dayDrivers != null ? `(only if not ${dayDrivers})` : '(optional)'} value={drivers} onChange={setDrivers} />
      </View>
      {dayDrivers == null && <Note>Tip: set the day’s drivers once in Plan › Labor instead of every hour.</Note>}
      <Label>SPLIT BY BRAND (OPTIONAL)</Label>
      <View style={s.row2}>
        {state.brands.map((b) => <Field key={b.name} label={b.name} value={brands[b.name] ?? ''} onChange={(v) => setBrands((x) => ({ ...x, [b.name]: v }))} />)}
      </View>
      {short && (
        <View style={{ gap: 8 }}>
          <Label wrap>PRE-BREAK HOUR · WHEN DID PRODUCTION STOP?</Label>
          <Seg columns={2} value={stop} onChange={setStop}
            options={stopChoices(hour).map((m) => ({ value: m, label: `Stopped ${formatHM(parseHM(hour)! + m)}` }))} />
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
        <Pressable key={r.id} onPress={() => onOpenDeck(r.id)} style={({ pressed }) => [s.deckRow, i > 0 && { borderTopWidth: 1, borderTopColor: color.row }, pressed && u.pressed]} accessibilityRole="button">
          <Text style={{ fontFamily: f.display, fontSize: 24, flexBasis: 64, flexShrink: 1, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.label}</Text>
          <Body style={{ color: color.muted }}>{r.pill}</Body>
          <Text style={{ marginLeft: 'auto', fontFamily: f.display, fontSize: 22, color: color.ink }}>{r.remaining}<Text style={{ fontFamily: f.body, fontSize: 13, color: color.muted }}> of {r.start}</Text></Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Break / shift ----------

function BreakForm({ state, run, now, timeOf, setError }: { state: State; run: Run; now: () => string | null; timeOf: TimeOf; setError: (e: string | null) => void }) {
  const [t, setT] = useState('');
  const [end, setEnd] = useState('');
  const phase = state.ops.phase, day = state.ops.day;
  const fill = (set: (v: string) => void) => () => { const n = now(); if (n) set(n); };
  const go = (value: string, d: number, build: (c: E.Ctx, at: OpTime | null) => VsaEvent[] | Reject, done: (at: OpTime | null) => string) => {
    setError(null); // so a repeated identical error is announced again
    const at = timeOf(value, d);
    if (at === 'bad') return setError('Enter the time as HH:MM.');
    if (at === null) return setError('Enter the time, or tap Now.'); // breaks and shift changes always need their time
    run((c) => build(c, at), done(at));
  };

  if (phase === 'shift_end') {
    return (
      <View style={{ gap: 14 }}>
        <Note>Shift ended at {state.ops.shiftEnd}. Reconcile first, then start the next day.</Note>
        <TimeField required label={`Day ${day + 1} starts at`} value={t} onChange={setT} onNow={fill(setT)}
          hint={parseHM(t.trim()) != null ? `Day ${day + 1} hours will run from ${t.trim().padStart(5, '0')}.` : undefined} />
        <Go label={`Start Day ${day + 1}`} onPress={() => go(t, day + 1, E.nextDayEvents, () => `Day ${day + 1} started.`)} />
      </View>
    );
  }
  if (phase === 'break') {
    return (
      <View style={{ gap: 14 }}>
        <Note>On break since {state.ops.breakStart}.</Note>
        <TimeField required label="Back to work at" value={t} onChange={setT} onNow={fill(setT)} />
        <Go label="Log break end" onPress={() => go(t, day, E.breakEndEvents, (at) => `Break ended${at ? ` at ${at.hm}` : ''}.`)} />
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <TimeField required label="Break started at" value={t} onChange={setT} onNow={fill(setT)} />
      <Go label="Log break start" onPress={() => go(t, day, E.breakStartEvents, (at) => `Break started${at ? ` at ${at.hm}` : ''}.`)} />
      <View style={s.hr}>
        <TimeField required label="Shift ended at" value={end} onChange={setEnd} onNow={fill(setEnd)} />
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
  back: { minHeight: 56, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 24 },
  row2: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  deckRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  hr: { borderTopWidth: 1, borderTopColor: color.soft, paddingTop: 14, gap: 14 },
});
