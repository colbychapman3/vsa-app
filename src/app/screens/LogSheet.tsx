// Log sheet (reference: docs/reference/screens/09 and the tracker's logSheet()).
// Forms only: entries.ts builds the events and App.save() stores them; the engine's
// exact message is shown if anything is refused, and nothing is saved.
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './text.tsx';
import { formatHM, operationDate, parseHM, suggestedStop, type Baseline, type OpTime, type Reject, type Side, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { deckSheet, decksView, hourOptions } from '../view.ts';
import { DeckForm } from './DeckSheet.tsx';
import { EvidenceForm } from './EvidenceForm.tsx';
import { bcolor, color, TAP, useType } from '../theme.ts';
import { Body, Collapse, ErrorBox, Field, Go, KeyboardSave, Label, Note, Panel, Reasons, Seg, Sheet, TimeField, u } from './ui.tsx';

export type Mode = 'hour' | 'deck' | 'hh' | 'issue' | 'photo';
type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;
type Props = { state: State; baseline: Baseline; isTest: boolean; save: Save; onClose: (done?: string) => void; initial?: Mode; prefill?: HourPrefill };
// From the assistant: a count and hour that were typed. Shown in the form; nothing is saved until Save is tapped.
export type HourPrefill = { count: number; start: string | null };

// '' → null (blank); digits → number; anything else → NaN (refused with a message).
const num = (v: string) => (v.trim() === '' ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

export function LogSheet({ state, baseline, isTest, save, onClose, initial = 'hour', prefill }: Props) {
  const [deck, setDeck] = useState<string | null>(null); // the deck picked in Deck mode (null: the first working deck); its editor shows below the picker
  const [mode, setMode] = useState<Mode>((initial as string) === 'break' ? 'hour' : initial);
  // The error shows right under the part that raised it (the hourly form or the break box), not at the end of a long sheet.
  const [err, setErr] = useState<{ text: string; where: 'hour' | 'break' | 'other' } | null>(null);
  const setErrorAt = (where: 'hour' | 'break' | 'other') => (e: string | null) => setErr(e == null ? null : { text: e, where });
  const opDate = operationDate(baseline)!;
  const day = state.ops.day;
  const phase = state.ops.phase;

  // Time boxes: empty, or typed / filled by Now. Typed times are on the current operation day.
  const now = (): string | null => {
    const t = E.nowOpTime(opDate, new Date());
    if (!t) { setErrorAt(mode === 'hour' ? 'break' : 'other')('The phone’s date is before this operation’s Day 1.'); return null; } // in Hourly count, Now is only in the break box
    return t.hm;
  };
  const timeOf = (v: string, d = day): OpTime | null | 'bad' => (v.trim() === '' ? null : parseHM(v.trim()) == null ? 'bad' : { day: d, hm: v.trim().padStart(5, '0') });

  const runAt = (where: 'hour' | 'break' | 'other'): Run => async (build, done) => {
    setErrorAt(where)(null);
    const r = await save(build);
    if (r.ok) onClose(done); else setErrorAt(where)(r.error);
  };
  const run = runAt('other');
  const errorAt = (where: 'hour' | 'break' | 'other') => (err && err.where === where ? <ErrorBox text={err.text} /> : null);

  const modes: { value: Mode; label: string }[] = [
    { value: 'hour', label: 'Hourly' },
    { value: 'deck', label: 'Deck' },
    { value: 'hh', label: 'H/H' },
    { value: 'issue', label: 'Issue' },
    { value: 'photo', label: 'Photo' },
  ];

  return (
    <Sheet title="Log" isTest={isTest} onClose={() => onClose()}>
          <Seg columns={5} options={modes} value={mode} onChange={(m) => { setMode(m); setErr(null); }} />
          {mode === 'hour' && phase !== 'working' && <BreakBox baseline={baseline} state={state} run={runAt('break')} now={now} timeOf={timeOf} setError={setErrorAt('break')} />}
          {mode === 'hour' && phase !== 'working' && errorAt('break')}
          {mode === 'hour' && <HourForm state={state} baseline={baseline} run={runAt('hour')} setError={setErrorAt('hour')} prefill={prefill} />}
          {mode === 'hour' && errorAt('hour')}
          {mode === 'hour' && phase === 'working' && <BreakBox baseline={baseline} state={state} run={runAt('break')} now={now} timeOf={timeOf} setError={setErrorAt('break')} />}
          {mode === 'hour' && phase === 'working' && errorAt('break')}
          {mode === 'deck' && <DeckPick state={state} baseline={baseline} save={save} picked={deck} onPick={setDeck} onClose={onClose} />}
          {mode === 'hh' && <HhForm state={state} run={run} now={now} timeOf={timeOf} setError={setErrorAt('other')} />}
          {mode === 'issue' && <IssueForm run={run} now={now} timeOf={timeOf} setError={setErrorAt('other')} />}
          {mode === 'photo' && <EvidenceForm state={state} baseline={baseline} save={save} onClose={(done) => onClose(done)} />}
          {mode !== 'hour' && errorAt('other')}
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
  const [allHours, setAllHours] = useState(false);
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
  const [rmReason, setRmReason] = useState<string | null>(null); // why a wrongly logged hour is taken back
  const [rmOther, setRmOther] = useState('');
  const f = useType();

  const pick = (h: string) => {
    const p = logged.get(h);
    setHour(h); setError(null); setReason(null); setOther(''); setRmReason(null); setRmOther('');
    setCount(p ? String(p.count) : '');
    setDrivers(p?.hourDrivers != null ? String(p.hourDrivers) : '');
    setBrands(Object.fromEntries(state.brands.map((b) => [b.name, p?.brands?.[b.name] != null ? String(p.brands[b.name]) : ''])));
    setStop(p?.stopMin ?? suggest(h));
  };

  const removeHour = () => {
    setError(null);
    const why = rmReason === 'Other' ? rmOther.trim() : rmReason;
    void run((ctx) => E.removeHourEvents(ctx, { day, start: hour, reason: why }), `Removed the ${hour} hour. Its values stay in the log, marked removed.`);
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
    void run((ctx) => E.hourEvents(ctx, { day, start: hour, count: c, drivers: dr, brands: Object.keys(split).length ? split : null, stopMin: short ? stop : null, reason: why }),
      `Saved ${hour}–${endHM}: ${c.toLocaleString('en-US')} autos.`);
  };

  const split = Object.values(brands).reduce((t, v) => t + (/^\d+$/.test(v.trim()) ? Number(v.trim()) : 0), 0);
  const c0 = num(count);

  return (
    <View style={{ gap: 14 }}>
      <Panel title={day > 1 ? `Hour · Day ${day}` : 'Hour'} right={`${hour}–${endHM}${existing ? ' · logged' : ''}`}>
        <HourStrip hours={opts.hours} value={hour} onChange={pick} all={allHours} />
        {/* ponytail: "Paste clerk's text" has no action in the app yet (designQ); "All hours" opens the full scrolling list. */}
        <View style={{ alignSelf: 'flex-start' }}><Go ghost small label={allHours ? 'Fewer hours' : 'All hours'} onPress={() => setAllHours(!allHours)} /></View>
        {short && (
          <View style={{ gap: 8 }}>
            <Label wrap>Before the break: when did production stop?</Label>
            <Seg columns={2} value={stop} onChange={setStop}
              options={stopChoices(hour).map((m) => ({ value: m, label: `Stopped ${formatHM(parseHM(hour)! + m)}` }))} />
          </View>
        )}
      </Panel>

      <Panel title="Count">
        <View style={s.row2}>
          <Field label="Autos" value={count} onChange={setCount} accessoryId="hour-save" />
          <Field label="Drivers" placeholder={dayDrivers != null ? String(dayDrivers) : 'optional'} value={drivers} onChange={setDrivers} accessoryId="hour-save" />
        </View>
        {state.hh.passes.some((p) => p.end && p.end.abs >= (day - 1) * 1440 + parseHM(hour)! - 60 && p.end.abs < (day - 1) * 1440 + parseHM(hour)! + 60) && <Note>H/H finished near this hour. If drivers moved to cars, enter this hour’s driver count.</Note>}
        {existing && count.trim() === '0' && <Note>0 saves a real hour with nothing counted. Wrong hour? Use Remove below.</Note>}
        <Note>The count for this hour only, not the running total.{dayDrivers != null ? ` Empty drivers means the day’s ${dayDrivers}.` : ''}</Note>
      </Panel>

      {state.brands.length > 0 && (
        <Panel title="By brand" right={split > 0 ? `${split.toLocaleString('en-US')}${c0 != null && !Number.isNaN(c0) ? ` of ${c0.toLocaleString('en-US')}${split === c0 ? ' ✓' : ''}` : ''}` : 'optional'}>
          {state.brands.map((b, i) => (
            <View key={b.name} style={[s.brandRow, i > 0 && { borderTopWidth: 1, borderTopColor: bcolor.row }]}>
              <Text style={{ flex: 1, fontFamily: f.bodySemi, fontSize: 17, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{b.name}</Text>
              <TextInput value={brands[b.name] ?? ''} onChangeText={(v) => setBrands((x) => ({ ...x, [b.name]: v }))} keyboardType="number-pad" inputAccessoryViewID="hour-save"
                accessibilityLabel={`${b.name} this hour`} maxLength={5} style={[u.input, s.brandBox, { fontFamily: f.bodyMedium }]} />
            </View>
          ))}
        </Panel>
      )}

      {existing && (
        <Panel title="Reason for the change">
          <Seg columns={2} value={reason} onChange={setReason} options={[...E.REASONS, 'Other'].map((r) => ({ value: r, label: r === 'Other' ? 'Other…' : r }))} />
          {reason === 'Other' && <Field label="Reason" value={other} onChange={setOther} keyboard="default" maxLength={120} accessoryId="hour-save" />}
        </Panel>
      )}

      <Go label="Save hourly count" onPress={submit} />
      <KeyboardSave id="hour-save" label="Save hourly count" onPress={submit} />

      {existing && (
        <Collapse title="Logged the wrong hour?">
          <Seg columns={2} value={rmReason} onChange={setRmReason} options={[...E.HOUR_REMOVE_REASONS, 'Other'].map((r) => ({ value: r, label: r === 'Other' ? 'Other…' : r }))} />
          {rmReason === 'Other' && <Field label="Reason" value={rmOther} onChange={setRmOther} keyboard="default" maxLength={120} />}
          <Go ghost label={`Remove the ${hour} hour`} onPress={removeHour} />
          <Note>The hour leaves the record and the averages. Its values stay in the log, marked removed.</Note>
        </Collapse>
      )}
    </View>
  );
}

// Four chips in one row around the hour picked (two before, the next after); "All hours" swaps in every hour of the day
// in one row that scrolls sideways, opened on the hour picked (the due hour by default).
function HourStrip({ hours, value, onChange, all }: { hours: { start: string; end: string; logged?: boolean }[]; value: string; onChange: (h: string) => void; all: boolean }) {
  const f = useType();
  const ref = useRef<ScrollView>(null);
  const opened = useRef(false);
  const label = (h: { start: string; end: string; logged?: boolean }) => `${h.start.slice(0, 2)}${h.start.endsWith(':00') ? '' : h.start.slice(2)}–${h.end.slice(0, 2)}${h.logged ? ' ✓' : ''}`;
  if (!all) {
    const i = Math.max(0, hours.findIndex((h) => h.start === value));
    const from = Math.max(0, Math.min(i - 2, hours.length - 4));
    return (
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
        {hours.slice(from, from + 4).map((h) => {
          const on = h.start === value;
          return (
            <Pressable key={h.start} onPress={() => onChange(h.start)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={({ pressed }) => [u.segBtn, { flex: 1 }, on && u.segOn, pressed && u.pressed]}>
              <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: on ? color.bg : color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{label(h)}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.strip} accessibilityRole="radiogroup">
      {hours.map((h) => {
        const on = h.start === value;
        return (
          <Pressable key={h.start} onPress={() => onChange(h.start)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            onLayout={(e) => { if (on && !opened.current) { opened.current = true; ref.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 24), animated: false }); } }}
            style={({ pressed }) => [u.segBtn, s.stripChip, on && u.segOn, pressed && u.pressed]}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: on ? color.bg : color.ink }} numberOfLines={1}>{label(h)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------- Deck (board 2.5: pick a deck, its editor opens below) ----------

const WORK_ORDER: Record<string, number> = { active: 0, paused: 1, notStarted: 2, unknown: 3, complete: 4 };
function DeckPick({ state, baseline, save, picked, onPick, onClose }: { state: State; baseline: Baseline; save: Save; picked: string | null; onPick: (id: string) => void; onClose: (done?: string) => void }) {
  const f = useType();
  const rows = [...decksView(state).rows].sort((a, b) => (WORK_ORDER[a.status] ?? 3) - (WORK_ORDER[b.status] ?? 3)); // working first; stable within a group
  const id = picked ?? rows[0]?.id ?? null;
  const d = id ? state.decks.find((x) => x.id === id) : undefined;
  return (
    <>
      <View style={[u.card, u.pad, { gap: 10 }]}>
        <View style={u.secH}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.ink }}>Which deck</Text>
          <Text style={{ fontFamily: f.body, fontSize: 13, color: color.muted }}>working first</Text>
        </View>
        <View style={s.deckGrid}>
          {rows.map((r) => {
            const on = r.id === id;
            return (
              <Pressable key={r.id} onPress={() => onPick(r.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${r.label}, ${r.pill}`}
                style={({ pressed }) => [s.deckCell, on && s.deckCellOn, pressed && u.pressed]}>
                <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: on ? color.onBlue : color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.label}{r.status === 'complete' ? ' ✓' : ''}</Text>
                <Text style={{ fontFamily: f.body, fontSize: 13, color: on ? color.onBlue : color.muted }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.pill}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {d && (
        <View style={[u.card, u.pad, { gap: 12 }]}>
          <Text style={{ fontFamily: f.display, fontSize: 20, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{(() => { const r = rows.find((x) => x.id === d.id); return r ? `${r.label} · ${r.heightShort}` : deckSheet(d, baseline).title; })()}</Text>
          <DeckForm key={d.id} state={state} baseline={baseline} deckId={d.id} save={save} onClose={(done) => onClose(done)} />
        </View>
      )}
    </>
  );
}

// ---------- Break / shift (part of the Hourly count tab) ----------

// One card that follows the shift: working → "Break start" or "End of shift"; on a break → "Back to work at"; shift over →
// "Start Day N". Each step is one time and one button. Working: tap-to-open at the bottom. On a break or at shift end it is
// open at the top, because it is the next thing to do.
type BreakProps = { baseline: Baseline; state: State; run: Run; now: () => string | null; timeOf: TimeOf; setError: (e: string | null) => void };
function BreakBox(p: BreakProps) {
  const f = useType();
  const { phase, breakStart, shiftEnd } = p.state.ops;
  const working = phase === 'working';
  const [open, setOpen] = useState(!working);
  const title = phase === 'break' ? `On break since ${breakStart}` : phase === 'shift_end' ? `Shift ended ${shiftEnd}` : 'Break or end of shift';
  if (working && !open) return <Go to label={title} onPress={() => setOpen(true)} />; // one "go to" button until it is opened (buttons, 2026-10-17)
  return (
    <View style={[u.card, u.pad, { gap: 12 }]}>
      <Pressable disabled={!working} onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => [{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: 10 }, pressed && u.pressed]}>
        <Text style={{ fontFamily: f.displaySemi, fontSize: 17, color: color.ink, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{title}</Text>
        {working && <Text style={{ marginLeft: 'auto', fontSize: 22, color: color.muted, transform: [{ rotate: open ? '-90deg' : '0deg' }] }}>›</Text>}
      </Pressable>
      {open && <BreakForm {...p} />}
    </View>
  );
}

function BreakForm({ baseline, state, run, now, timeOf, setError }: BreakProps) {
  const [t, setT] = useState('');
  const [kind, setKind] = useState<'start' | 'end'>('start');
  const [side, setSide] = useState<'N' | 'S' | null>(null); // the side the shift ends on: sets when the last hour stopped
  const phase = state.ops.phase, day = state.ops.day;
  const fill = () => { const n = now(); if (n) setT(n); };
  const go = (d: number, build: (c: E.Ctx, at: OpTime | null) => VsaEvent[] | Reject, done: (at: OpTime | null) => string) => {
    setError(null); // so a repeated identical error is announced again
    const at = timeOf(t, d);
    if (at === 'bad') return setError('Enter the time as HH:MM.');
    if (at === null) return setError('Enter the time, or tap Now.'); // breaks and shift changes always need their time
    void run((c) => build(c, at), done(at));
  };
  const startDay = () => go(day + 1, E.nextDayEvents, () => `Day ${day + 1} started.`);
  const breakEnd = () => go(day, E.breakEndEvents, (at) => `Break ended${at ? ` at ${at.hm}` : ''}.`);
  const breakStart = () => go(day, E.breakStartEvents, (at) => `Break started${at ? ` at ${at.hm}` : ''}.`);
  const endShift = () => go(day, (c, at) => E.endShiftEvents(c, at, side), () => 'End of shift logged. Reconcile ship and field.');

  if (phase === 'shift_end') {
    return (
      <View style={{ gap: 14 }}>
        <TimeField required accessoryId="brk-day" label={`Day ${day + 1} starts at`} value={t} onChange={setT} onNow={fill} />
        <Go label={`Start Day ${day + 1}`} onPress={startDay} />
        <KeyboardSave id="brk-day" label={`Start Day ${day + 1}`} onPress={startDay} />
      </View>
    );
  }
  if (phase === 'break') {
    return (
      <View style={{ gap: 14 }}>
        <TimeField required accessoryId="brk-back" label="Back to work at" value={t} onChange={setT} onNow={fill} />
        <Go label="Log break end" onPress={breakEnd} />
        <KeyboardSave id="brk-back" label="Log break end" onPress={breakEnd} />
      </View>
    );
  }
  const scheduled = baseline.breaks;
  return (
    <View style={{ gap: 14 }}>
      <Seg columns={2} value={kind} onChange={(k) => { setKind(k); setT(''); setError(null); }} options={[{ value: 'start', label: 'Break start' }, { value: 'end', label: 'End of shift' }]} />
      {kind === 'start' ? (
        <>
          {scheduled.length > 0 && (
            <View style={{ gap: 8 }}>
              <Label>Scheduled breaks</Label>
              <Seg columns={scheduled.length} value={scheduled.find((b) => b === t.trim()) ?? null} onChange={setT} options={scheduled.map((b) => ({ value: b, label: b }))} />
            </View>
          )}
          <TimeField required accessoryId="brk-start" label="Break started at" value={t} onChange={setT} onNow={fill} />
          <Go label="Log break start" onPress={breakStart} />
          <KeyboardSave id="brk-start" label="Log break start" onPress={breakStart} />
        </>
      ) : (
        <>
          <TimeField required accessoryId="brk-end" label="Shift ended at" value={t} onChange={setT} onNow={fill} />
          <View style={{ gap: 8 }}>
            <Label>Shift ends on</Label>
            <Seg columns={2} value={side} onChange={setSide} options={[{ value: 'N', label: 'Northside −15 min' }, { value: 'S', label: 'Southside −30 min' }]} />
          </View>
          <Go label="Log end of shift" onPress={endShift} />
          <KeyboardSave id="brk-end" label="Log end of shift" onPress={endShift} />
        </>
      )}
    </View>
  );
}

// ---------- H/H start / complete (spec 7g): awareness only, a time and nothing else ----------

function HhForm({ state, run, now, timeOf, setError }: { state: State; run: Run; now: () => string | null; timeOf: TimeOf; setError: (e: string | null) => void }) {
  const f = useType();
  const [t, setT] = useState('');
  const [edit, setEdit] = useState<{ id: string; what: string } | null>(null);
  const [fix, setFix] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const hh = state.hh, day = state.ops.day;
  const fill = (set: (v: string) => void) => () => { const n = now(); if (n) set(n); };
  const active = hh.status === 'active'; // a pass is on and no shift end has closed it: no second start
  const needsEnd = hh.passes.length > 0 && hh.passes.at(-1)!.end == null; // no complete entered yet (a real one may still be back-timed)
  const why = () => (reason === 'Other' ? other.trim() : reason);
  const log = (kind: 'started' | 'completed') => {
    setError(null);
    const at = timeOf(t, day);
    if (at === 'bad') return setError('Enter the time as HH:MM, or leave it empty.');
    void run((c) => E.hhMarkerEvents(c, kind, at), kind === 'started' ? 'H/H start logged.' : 'H/H complete logged.');
  };
  const change = (remove: boolean) => {
    if (!edit) return;
    setError(null);
    if (remove) return void run((c) => E.removeHhMarkerEvents(c, edit.id, why()), 'H/H marker removed. It stays in the log, marked removed.');
    const at = timeOf(fix, day);
    if (at === 'bad') return setError('Enter the time as HH:MM.');
    void run((c) => E.editHhMarkerEvents(c, edit.id, at, why()), 'H/H time changed. The old time is kept in the log.');
  };

  if (edit) {
    return (
      <View style={{ gap: 14 }}>
        <Body semi>{edit.what}</Body>
        <TimeField required label="Corrected time" value={fix} onChange={setFix} onNow={fill(setFix)} />
        <Reasons options={E.HH_REASONS} value={reason} onChange={setReason} other={other} onOther={setOther} />
        <Go label="Save the new time" onPress={() => change(false)} />
        <Go ghost label="Remove this marker" onPress={() => change(true)} />
        <Go ghost label="Back" onPress={() => { setEdit(null); setError(null); }} />
        <Note>Nothing is overwritten: the original time stays in the log.</Note>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <Body semi>{hh.text}</Body>
      <TimeField label="Time (optional)" value={t} onChange={setT} onNow={fill(setT)} />
      <Go ghost={active} label="Start H/H" disabled={active} onPress={() => log('started')} />{/* the next step is the one peach button */}
      <Go ghost={!needsEnd} label="H/H complete" disabled={!needsEnd} onPress={() => log('completed')} />
      {hh.passes.map((p, i) => (
        <View key={p.start.id} style={s.hr}>
          <Body semi>Pass {i + 1}</Body>
          <Pressable onPress={() => { setEdit({ id: p.start.id, what: `Pass ${i + 1} start, ${p.start.label}` }); setFix(''); setReason(null); setOther(''); setError(null); }} style={({ pressed }) => [u.ghostBtn, pressed && u.pressed]} accessibilityRole="button">
            <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>Started {p.start.label} · change</Text>
          </Pressable>
          {p.end
            ? <Pressable onPress={() => { setEdit({ id: p.end!.id, what: `Pass ${i + 1} complete, ${p.end!.label}` }); setFix(''); setReason(null); setOther(''); setError(null); }} style={({ pressed }) => [u.ghostBtn, pressed && u.pressed]} accessibilityRole="button">
              <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>Complete {p.end.label} · change</Text>
            </Pressable>
            : <Note>{p.endedWithShift ? 'No closing time entered: ended with the shift.' : 'Still active.'}</Note>}
        </View>
      ))}
      <Note>Awareness only: never added to the auto counts. No complete logged? The pass ends with the shift.</Note>
    </View>
  );
}

// ---------- Discrepancy ----------

function IssueForm({ run, now, timeOf, setError }: { run: Run; now: () => string | null; timeOf: TimeOf; setError: (e: string | null) => void }) {
  const [text, setText] = useState('');
  const [t, setT] = useState('');
  const add = () => {
    const at = timeOf(t);
    if (at === 'bad') return setError('Enter the time as HH:MM.');
    void run((c) => E.openDiscrepancyEvents(c, text, at), 'Added to open discrepancies.');
  };
  return (
    <View style={{ gap: 14 }}>
      <Field label="What doesn’t match" value={text} onChange={setText} keyboard="default" maxLength={200} accessoryId="issue-add" />
      <TimeField accessoryId="issue-add" label="Noticed at" value={t} onChange={setT} onNow={() => { const n = now(); if (n) setT(n); }} />
      <Go label="Add" onPress={add} />
      <KeyboardSave id="issue-add" label="Add" onPress={add} />
    </View>
  );
}

const s = StyleSheet.create({
  row2: { flexDirection: 'row', gap: 10 },
  strip: { gap: 8, paddingRight: 8 },
  stripChip: { flexGrow: 0, minWidth: 76, paddingHorizontal: 6 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  brandBox: { width: 104, fontSize: 20, textAlign: 'right' },
  deckGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  deckCell: { width: '23%', minHeight: TAP, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1.5, borderColor: bcolor.line, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  deckCellOn: { backgroundColor: color.ink, borderColor: bcolor.ink },
  hr: { borderTopWidth: 1, borderTopColor: bcolor.soft, paddingTop: 14, gap: 14 },
});
