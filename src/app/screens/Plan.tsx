// Plan tab (reference: docs/reference/screens/08). Layout only; values from view.planView().
// Actions (confirm height, resolve discrepancy, shift settings) save through App.save().
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatHM, operationDate, parseHM, type Baseline, type BreakEntry, type Reject, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { planView } from '../view.ts';
import { color, useType } from '../theme.ts';
import { Big, Body, Card, Chip, ErrorBox, Field, Go, Label, Note, SectionHead, Seg, Sheet, TimeField, u } from './ui.tsx';

type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;

export function Plan({ state, baseline, save, onNotice }: { state: State; baseline: Baseline; save: Save; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const f = useType();
  const [recheck, setRecheck] = useState<Set<string>>(new Set());
  const [shiftOpen, setShiftOpen] = useState(false);
  const [driversOpen, setDriversOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState<{ entry: BreakEntry | null } | null>(null); // entry null = add a missed break
  const v = planView(state, baseline, recheck);

  const act = async (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => {
    const r = await save(build);
    onNotice(r.ok ? { ok: true, text: done } : { ok: false, text: `Not saved: ${r.error}` });
    return r.ok;
  };
  const kv = (k: string, val: string) => (
    <View key={k} style={u.kv}><Body style={{ color: color.muted, maxWidth: '45%' }}>{k}</Body><Body semi style={{ textAlign: 'right', flex: 1 }}>{val}</Body></View>
  );

  return (
    <View style={s.main}>
      {(v.heights.pending.length > 0 || v.heights.confirmed.length > 0) && (
        <Card style={[u.pad, { gap: 10 }, v.heights.pending.length > 0 && { borderWidth: 2, borderColor: color.red }]}>
          <SectionHead title="Confirm deck heights" right={v.heights.pending.length ? `${v.heights.pending.length} to confirm` : 'All confirmed'} />
          {v.heights.pending.length > 0 && <Note>These decks can be set below 1.85 m, where shuttle vans can’t drive on. Pick each deck’s actual setting.</Note>}
          {v.heights.pending.map((d) => (
            <View key={d.id} style={s.pending}>
              <View style={u.secH}><Body semi style={{ fontSize: 17 }}>{d.label}</Body><Note>{d.stow}</Note></View>
              <Seg columns={Math.min(d.options.length, 3)} value={d.options.find((o) => o.selected)?.m ?? null}
                options={d.options.map((o) => ({ value: o.m, label: o.label }))}
                onChange={(m) => act((c) => E.heightEvents(c, d.id, m, null), `${d.label} height confirmed at ${m.toFixed(2)} m.`)
                  .then((ok) => { if (ok) setRecheck((x) => { const n = new Set(x); n.delete(d.id); return n; }); })} />
            </View>
          ))}
          {v.heights.confirmed.length > 0 && (
            <View style={s.chips}>
              {v.heights.confirmed.map((d) => (
                <Pressable key={d.id} onPress={() => setRecheck((x) => new Set(x).add(d.id))} accessibilityRole="button" accessibilityLabel={`Change ${d.text}`}>
                  <Chip text={d.text} tone={d.low ? 'red' : 'plain'} tall />
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      )}

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Open discrepancies" right={`${v.issues.open.length} open`} />
        {v.issues.open.length === 0 && <Note>Nothing open.</Note>}
        {v.issues.open.map((i) => (
          <View key={i.id} style={s.issue}>
            <Body semi>{i.text}</Body>
            <View style={u.secH}>
              <Note style={{ flexShrink: 1 }}>{i.opened}</Note>
              <Go ghost label="Mark resolved" onPress={() => act((c) => E.resolveDiscrepancyEvents(c, i.id, null), 'Marked resolved.')} />
            </View>
          </View>
        ))}
        {v.issues.resolved && <Note>{v.issues.resolved}</Note>}
      </Card>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Baseline & data status" />
        {kv('Starting autos', `${v.baseline.start} · ${v.baseline.brands}`)}
        {kv('High & Heavy', `${v.baseline.hh} · separate ledger`)}
        <View style={s.chips}>
          <Chip text={v.baseline.verified ? '✓ Totals verified' : 'Not verified'} tone={v.baseline.verified ? 'plain' : 'orange'} />
          <Chip text={v.baseline.discrepancies} />
          <Chip text={v.baseline.missing} tone={v.baseline.missing === 'Nothing missing' ? 'plain' : 'orange'} />
        </View>
        {v.baseline.checks.map((c) => <Note key={c}>• {c}</Note>)}
        <Note>{v.baseline.sources}</Note>
      </Card>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Labor" />
        {kv('Start', v.labor.start)}
        {kv('Auto drivers (ordered)', v.labor.autoDrivers)}
        {kv('Van drivers', v.labor.vanDrivers)}
        {kv('Heavy gang', v.labor.heavyGang)}
        <Note>Labor order figures are ordered, not a confirmed shape-up.</Note>
        {v.workday.map((d) => kv(d.label, d.value))}
        <Go ghost label="Set the day’s drivers" onPress={() => setDriversOpen(true)} />
      </Card>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Forecast settings" />
        {kv('Breaks', v.forecast.breaks)}
        {kv('Day 1 shift ends', v.forecast.dayEnd)}
        {kv('Next day starts', v.forecast.nextStart)}
        <Note>Set a shift end when the ship carries over to a second day. The ETA then resumes the next morning.</Note>
        <Go ghost label="Change shift settings" onPress={() => setShiftOpen(true)} />
      </Card>

      <Card style={[u.pad, { gap: 12 }]}>
        <SectionHead title="Side split" right="Calculated from destinations" />
        {v.side.northPct == null ? <Note>{v.side.unknown}</Note> : (
          <View style={s.split}>
            {v.side.northPct > 0 && <View style={{ flex: v.side.northPct, backgroundColor: color.blue }} />}
            {v.side.northPct < 100 && <View style={{ flex: 100 - v.side.northPct, backgroundColor: color.ink }} />}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {([['Northside', v.side.north, v.side.northAutos], ['Southside', v.side.south, v.side.southAutos]] as const).map(([l, pc, n]) => (
            <View key={l} style={{ flex: 1, gap: 2 }}><Label>{l}</Label><Big size={40}>{pc}</Big><Note>{n}</Note></View>
          ))}
        </View>
      </Card>

      <View style={{ gap: 10 }}>
        <SectionHead title={v.destinations.title} />
        <Card>
          {v.destinations.rows.map((d, i) => (
            <View key={d.name} style={[s.row, i > 0 && s.rowLine]}>
              <View style={u.secH}><Body semi style={{ fontSize: 16, flexShrink: 1 }}>{d.name}</Body><Big size={26}>{d.autos}</Big></View>
              <Note>{d.note}</Note>
            </View>
          ))}
        </Card>
        <Note>{v.destinations.footnote}</Note>
      </View>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Break log" />
        {v.breakLog.length === 0 ? <Note>No breaks logged yet.</Note> : v.breakLog.map((b, i) => {
          const entry = state.breakLog[i];
          return entry.kind === 'shift'
            ? <View key={i} style={s.logRow}>{kv(b.label, b.value)}</View>
            : <Pressable key={i} onPress={() => setBreakOpen({ entry })} style={({ pressed }) => [s.logRow, pressed && { opacity: 0.6 }]}
                accessibilityRole="button" accessibilityLabel={`${b.label} ${b.value}. Edit or remove`}>
                {kv(b.label, b.value)}
                <Text style={[s.edit, { fontFamily: f.bodySemi }]}>Edit ›</Text>
              </Pressable>;
        })}
        <Go ghost label="Add a missed break" onPress={() => setBreakOpen({ entry: null })} />
        <Note>Changes keep the old times in the log.</Note>
      </Card>

      {driversOpen && <DriversSheet state={state} baseline={baseline} save={save} onClose={(done) => { setDriversOpen(false); if (done) onNotice({ ok: true, text: done }); }} />}
      {breakOpen && <BreakSheet state={state} baseline={baseline} entry={breakOpen.entry} save={save} onClose={(done) => { setBreakOpen(null); if (done) onNotice({ ok: true, text: done }); }} />}
      {shiftOpen && <ShiftSheet state={state} baseline={baseline} save={save} onClose={(done) => { setShiftOpen(false); if (done) onNotice({ ok: true, text: done }); }} />}
    </View>
  );
}

// Shift settings sheet: "Finish today" or "Carries to Day 2" with Day 1 end and next start.
function ShiftSheet({ state, baseline, save, onClose }: { state: State; baseline: Baseline; save: Save; onClose: (done?: string) => void }) {
  const [mode, setMode] = useState<'one' | 'two'>(state.plan.shiftEnd ? 'two' : 'one');
  const [end, setEnd] = useState(state.plan.shiftEnd ?? '');
  const [next, setNext] = useState(state.plan.nextStart ?? baseline.start);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (mode === 'two' && parseHM(end.trim()) == null) return setError('Enter when Day 1 ends (HH:MM).');
    if (parseHM(next.trim()) == null) return setError('Enter when the next day starts (HH:MM).');
    const r = await save((c) => E.shiftSettingsEvents(c, mode === 'two' ? end.trim().padStart(5, '0') : null, next.trim().padStart(5, '0')));
    if (r.ok) onClose('Shift settings saved.'); else setError(r.error);
  };
  return (
    <Sheet title="Shift settings" isTest={state.operationId.startsWith('TEST-')} onClose={() => onClose()}>
      <Seg columns={2} value={mode} onChange={setMode} options={[{ value: 'one', label: 'Finish today' }, { value: 'two', label: 'Carries to Day 2' }]} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {mode === 'two' && <Field label="Day 1 shift ends" value={end} onChange={setEnd} keyboard="numbers-and-punctuation" maxLength={5} />}
        <Field label="Next day starts" value={next} onChange={setNext} keyboard="numbers-and-punctuation" maxLength={5} />
      </View>
      {error && <ErrorBox text={error} />}
      <Go label="Save shift settings" onPress={submit} />
    </Sheet>
  );
}

// '' → null; digits → number; anything else → NaN (refused with a message).
const num = (v: string) => (v.trim() === '' ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

// Reason picker: quick picks plus "Other…" with a text box.
function Reasons({ options, value, onChange, other, onOther }: { options: readonly string[]; value: string | null; onChange: (r: string) => void; other: string; onOther: (v: string) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Label>REASON</Label>
      <Seg columns={2} value={value} onChange={onChange} options={[...options, 'Other'].map((r) => ({ value: r, label: r === 'Other' ? 'Other…' : r }))} />
      {value === 'Other' && <Field label="Reason" value={other} onChange={onOther} keyboard="default" maxLength={120} />}
    </View>
  );
}

// Workday drivers: set once per operation day; every hour of that day without its own count uses it.
function DriversSheet({ state, baseline, save, onClose }: { state: State; baseline: Baseline; save: Save; onClose: (done?: string) => void }) {
  const days = planView(state, baseline).workday;
  const [day, setDay] = useState(Math.min(state.ops.day, days.length));
  const cur = days.find((d) => d.day === day)?.n ?? null;
  const [n, setN] = useState(cur != null ? String(cur) : '');
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pick = (d: number) => { setDay(d); const x = days.find((y) => y.day === d)?.n; setN(x != null ? String(x) : ''); setReason(null); setError(null); };
  const submit = async () => {
    setError(null);
    const v = num(n);
    if (v == null || Number.isNaN(v)) return setError('Enter the day’s drivers as a whole number (1 or more).');
    const why = reason === 'Other' ? other.trim() : reason;
    const r = await save((c) => E.workdayDriversEvents(c, day, v, why));
    if (r.ok) onClose(`Day ${day} drivers set to ${v}.`); else setError(r.error);
  };
  return (
    <Sheet title="Day’s drivers" isTest={state.operationId.startsWith('TEST-')} onClose={() => onClose()}>
      <Seg columns={days.length} value={day} onChange={pick} options={days.map((d) => ({ value: d.day, label: `Day ${d.day}` }))} />
      <Field label={`Drivers on Day ${day}`} value={n} onChange={setN} />
      {cur != null && <Reasons options={E.REASONS} value={reason} onChange={setReason} other={other} onOther={setOther} />}
      <Note>Used for every hour of that day. If the gang changes during the day, enter the drivers on that hour in the Log sheet instead.</Note>
      {error && <ErrorBox text={error} />}
      <Go label="Save drivers" onPress={submit} />
      {cur != null && <Go ghost label={`Clear Day ${day} (back to not set)`} onPress={async () => {
        setError(null);
        const r = await save((c) => E.clearWorkdayDriversEvents(c, day, reason === 'Other' ? other.trim() : reason));
        if (r.ok) onClose(`Day ${day} drivers cleared. The old value is kept in the log.`); else setError(r.error);
      }} />}
    </Sheet>
  );
}

// Break log: fix a break's times, remove a wrong or duplicate one, or add one that was missed.
function BreakSheet({ state, baseline, entry, save, onClose }: { state: State; baseline: Baseline; entry: BreakEntry | null; save: Save; onClose: (done?: string) => void }) {
  const hm = (abs: number | null) => (abs == null ? '' : formatHM(abs));
  const entryDay = entry ? Math.floor(entry.startAbs / 1440) + 1 : state.ops.day;
  const [day, setDay] = useState(entryDay);
  const [start, setStart] = useState(hm(entry?.startAbs ?? null));
  const [end, setEnd] = useState(hm(entry?.endAbs ?? null));
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inProgress = !!entry && entry.endAbs == null;
  const stranded = inProgress && !E.isCurrentBreak(state, entry!); // an old start that never got an end
  const now = (set: (v: string) => void) => () => { const t = E.nowOpTime(operationDate(baseline)!, new Date()); if (t) set(t.hm); };
  const time = (v: string) => (v.trim() === '' ? null : parseHM(v.trim()) == null ? 'bad' as const : { day, hm: v.trim().padStart(5, '0') });
  const why = () => (reason === 'Other' ? other.trim() : reason);
  const run = async (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => {
    setError(null);
    const r = await save(build);
    if (r.ok) onClose(done); else setError(r.error);
  };
  const submit = () => {
    const a = time(start), b = inProgress ? null : time(end);
    if (a === 'bad' || b === 'bad') return setError('Times are HH:MM, for example 12:00.');
    return entry
      ? run((c) => E.editBreakEvents(c, entry, a, b, why()), 'Break changed. The old times are kept in the log.')
      : run((c) => E.missedBreakEvents(c, a, b), 'Missed break added.');
  };
  const days = Array.from({ length: state.ops.day }, (_, i) => i + 1);
  return (
    <Sheet title={entry ? 'Edit break' : 'Add a missed break'} isTest={state.operationId.startsWith('TEST-')} onClose={() => onClose()}>
      {!entry && days.length > 1 && <Seg columns={days.length} value={day} onChange={setDay} options={days.map((d) => ({ value: d, label: `Day ${d}` }))} />}
      {stranded && <Note style={{ color: color.oInk }}>{E.STRANDED}</Note>}
      {!stranded && <TimeField required label="Break started at" value={start} onChange={setStart} onNow={now(setStart)} />}
      {stranded ? null : inProgress
        ? <Note>This break is still in progress. End it from the Log sheet.</Note>
        : <TimeField required label="Work resumed at" value={end} onChange={setEnd} onNow={now(setEnd)} />}
      {entry && <Reasons options={E.BREAK_REASONS} value={reason} onChange={setReason} other={other} onOther={setOther} />}
      {error && <ErrorBox text={error} />}
      {!stranded && <Go label={entry ? 'Save changes' : 'Add break'} onPress={submit} />}
      {entry && <Go ghost label="Remove this break" onPress={() => run((c) => E.removeBreakEvents(c, entry, why()), 'Break removed. It stays in the log, marked removed.')} />}
      <Note>Nothing is overwritten: the original times stay in the log.</Note>
    </Sheet>
  );
}

const s = StyleSheet.create({
  main: { padding: 20, gap: 16 },
  logRow: { minHeight: 56, justifyContent: 'center', gap: 2, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: color.row },
  edit: { fontSize: 13, color: color.blue, alignSelf: 'flex-end' },
  pending: { gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.row },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  issue: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.row },
  split: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', gap: 3 },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 6 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.row },
});
