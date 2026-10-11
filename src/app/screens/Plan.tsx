// Plan tab (reference: docs/reference/screens/08). Layout only; values from view.planView().
// Actions (confirm height, resolve discrepancy, shift settings) save through App.save().
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatHM, operationDate, parseHM, type Baseline, type BreakEntry, type Reject, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { NOTE_SECTIONS } from '../report.ts';
import { allPhotoFiles, planView, photoHourNotes, photoTypesPresent } from '../view.ts';
import { saveToCameraRoll } from '../evidenceFiles.ts';
import { EVIDENCE_REPORTS, type EvidenceReportKind } from '../evidenceReport.ts';
import { AI_STATUS_TEXT, aiStatus, ocrAvailable, readPhotos } from '../ai.ts';
import { reportStatus } from '../complete.ts';
import { color, TAP, useType } from '../theme.ts';
import { Vans } from './Vans.tsx';
import { ImportPhotos } from './ImportPhotos.tsx';
import { Big, Body, Card, Chip, Collapse, ErrorBox, Field, Go, InfoNote, Label, Note, Reasons, SectionHead, Seg, Sheet, TimeField, u } from './ui.tsx';

export type Backup = {
  lastAt: string | null; unsaved: number;
  onExport: () => Promise<void>;
  onImport: (text: string) => Promise<{ ok: true; text: string } | Reject>;
};
export type Reports = {
  notes: Record<string, string>;
  onReport: (kind: 'break' | 'completion') => Promise<void>;
  onEvidenceReport: (kind: EvidenceReportKind) => Promise<void>;
  onNote: (section: string, text: string) => Promise<void>;
};
export type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;

export function Plan({ vesselId, state, baseline, isTest, save, backup, reports, onNotice }: { vesselId: string; state: State; baseline: Baseline; isTest: boolean; save: Save; backup: Backup; reports: Reports; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const f = useType();
  const [recheck, setRecheck] = useState<Set<string>>(new Set());
  const [shiftOpen, setShiftOpen] = useState(false);
  const [driversOpen, setDriversOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteSheet, setNoteSheet] = useState<{ id: string | null } | null>(null); // id null = add a note
  const [busy, setBusy] = useState(false); // a save is in flight: no second tap
  const [making, setMaking] = useState<'break' | 'completion' | EvidenceReportKind | null>(null); // which report is being made
  const [breakOpen, setBreakOpen] = useState<{ entry: BreakEntry | null } | null>(null); // entry null = add a missed break
  const v = planView(state, baseline, recheck);
  const ph = photoHourNotes(state); // photos that cannot be placed on an hour (no time, or outside the logged hours)

  const act = async (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => {
    setBusy(true);
    try {
      const r = await save(build);
      onNotice(r.ok ? { ok: true, text: done } : { ok: false, text: `Not saved: ${r.error}` });
      return r.ok;
    } finally {
      setBusy(false);
    }
  };
  const status = reportStatus(state);
  const makeReport = async (kind: NonNullable<typeof making>, run: () => Promise<void>) => {
    if (busy || making) return;
    setBusy(true); setMaking(kind);
    try { await run(); } finally { setBusy(false); setMaking(null); }
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
                onChange={(m) => !busy && act((c) => E.heightEvents(c, d.id, m, null), `${d.label} height confirmed at ${m.toFixed(2)} m.`)
                  .then((ok) => { if (ok) setRecheck((x) => { const n = new Set(x); n.delete(d.id); return n; }); })} />
            </View>
          ))}
          {v.heights.confirmed.length > 0 && (
            <View style={s.chips}>
              {v.heights.confirmed.map((d) => (
                <Pressable key={d.id} onPress={() => setRecheck((x) => new Set(x).add(d.id))} style={({ pressed }) => pressed && u.pressed} accessibilityRole="button" accessibilityLabel={`Change ${d.text}`}>
                  <Chip text={d.text} tone={d.low ? 'red' : 'plain'} tall />
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      )}

      <Collapse title="Open discrepancies" right={`${v.issues.open.length} open`} open={v.issues.open.length > 0}>
        {v.issues.open.length === 0 && <Note>Nothing open.</Note>}
        {v.issues.open.map((i) => (
          <View key={i.id} style={s.issue}>
            <Body semi>{i.text}</Body>
            <View style={u.secH}>
              <Note style={{ flexShrink: 1 }}>{i.opened}</Note>
              <Go ghost label="Mark resolved" disabled={busy} onPress={() => act((c) => E.resolveDiscrepancyEvents(c, i.id, null), 'Marked resolved.')} />
            </View>
          </View>
        ))}
        {v.issues.resolved && <Note>{v.issues.resolved}</Note>}
      </Collapse>

      <Collapse title="Notes" right={v.notes.current.length ? `${v.notes.current.length}` : undefined}>
        {v.notes.current.length === 0 && <Note>No ship notes yet.</Note>}
        {v.notes.current.map((n) => (
          <Pressable key={n.id} onPress={() => setNoteSheet({ id: n.id })} style={({ pressed }) => [s.logRow, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${n.title ?? 'Note'}. Edit or remove`}>
            {n.title ? <Body semi>{n.title}</Body> : null}
            <Body>{n.text}</Body>
            <Note>{n.meta}</Note>
            <Text style={[s.edit, { fontFamily: f.bodySemi }]}>Edit ›</Text>
          </Pressable>
        ))}
        {v.notes.removed.map((n) => <Note key={n.id}>Removed: {n.text} ({n.meta})</Note>)}
        <Go ghost label="Add a note" onPress={() => setNoteSheet({ id: null })} />
        <InfoNote><Note>Notes never change any count, ledger or forecast. Edits and removals keep the earlier text in the log.</Note></InfoNote>
      </Collapse>

      <Vans state={state} baseline={baseline} isTest={isTest} save={save} onNotice={onNotice} />

      {(ph.noTime.length > 0 || ph.outside.length > 0) && (
        <Card style={[u.pad, { gap: 6 }]}>
          <SectionHead title="Photos not on an hour" />
          {ph.noTime.map((p) => <Body key={p}>{p}</Body>)}
          {ph.outside.map((p) => <Body key={p}>{p}</Body>)}
          <InfoNote><Note>{ph.noTime.length > 0 ? 'Rows with no time were saved without one. ' : ''}{ph.outside.length > 0 ? 'Rows with a time fall outside the logged hours (a break, or the hour is not logged yet). ' : ''}Photos are records only. They never change a count or a rate.</Note></InfoNote>
        </Card>
      )}

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Labor" />
        {kv('Start', v.labor.start)}
        {kv('Auto drivers (ordered)', v.labor.autoDrivers)}
        {kv('Van drivers', v.labor.vanDrivers)}
        {kv('Heavy gang', v.labor.heavyGang)}
        <InfoNote><Note>Labor order figures are ordered, not a confirmed shape-up.</Note></InfoNote>
        {v.workday.map((d) => kv(d.label, d.value))}
        <Go ghost label="Set the day’s drivers" onPress={() => setDriversOpen(true)} />
      </Card>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="H/H timeline" right="Awareness only" />
        <Body semi>{v.hh.text}</Body>
        {kv('H/H units (read-only)', v.hh.units)}
        {v.hh.passes.map((p) => <Note key={p}>{p}</Note>)}
        {v.hh.lines.map((l) => <Note key={l}>{l}</Note>)}
        <InfoNote><Note>Log H/H start and complete from the Log sheet (H/H). H/H counts stay with the other stevedore and are never added to the auto counts.</Note></InfoNote>
      </Card>

      <Collapse title="Forecast settings">
        {kv('Breaks', v.forecast.breaks)}
        {kv('Day 1 shift ends', v.forecast.dayEnd)}
        {kv('Next day starts', v.forecast.nextStart)}
        <InfoNote><Note>Set a shift end when the ship carries over to a second day. The ETA then resumes the next morning.</Note></InfoNote>
        <Go ghost label="Change shift settings" onPress={() => setShiftOpen(true)} />
      </Collapse>

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
        <InfoNote><Note>Changes keep the old times in the log.</Note></InfoNote>
      </Card>

      <Card style={[u.pad, { gap: 10 }]}>
        <View style={u.secH}>
          <SectionHead title="Reports" />
          <Chip text={status.text} tone={status.tone} />
        </View>
        <InfoNote><Note>Each report is a PDF through the share sheet. Unknowns print as unknown. A report is INTERIM until you mark the vessel complete; at 0 remaining it reads “ready to close, not confirmed”.</Note></InfoNote>
        <Label>SHIFT REPORTS</Label>
        <ReportRow title="Break / shift-end report" sub="Ship vs field at a break or end of shift" busy={making === 'break'} onPress={() => makeReport('break', () => reports.onReport('break'))} />
        <ReportRow title="Vessel completion report" sub="Totals, notes and open items" busy={making === 'completion'} onPress={() => makeReport('completion', () => reports.onReport('completion'))} />
        <Pressable onPress={() => setNotesOpen(true)} accessibilityRole="button" style={({ pressed }) => [{ minHeight: TAP, justifyContent: 'center', paddingLeft: 14 }, pressed && u.pressed]}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.blue }}>Completion report notes ›</Text>
        </Pressable>
        {/* Photo reports exist only for photo types that have photos. */}
        {photoTypesPresent(state).length > 0 && <Label>PHOTO REPORTS</Label>}
        {photoTypesPresent(state).map((t) => {
          const r = EVIDENCE_REPORTS[t];
          return <ReportRow key={r.kind} title={r.title} sub="Every photo with its details" busy={making === r.kind} onPress={() => makeReport(r.kind, () => reports.onEvidenceReport(r.kind))} />;
        })}
      </Card>

      <ImportPhotos vesselId={vesselId} />
      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Backup" />
        <Body>Last exported: {backup.lastAt ? `${backup.lastAt.replace('T', ' ').slice(0, 16)} ` : 'never'}</Body>
        {backup.unsaved > 0 && <Note>{backup.unsaved} {backup.unsaved === 1 ? 'entry' : 'entries'} not backed up.</Note>}
        <Go label="Export vessel log" disabled={busy} onPress={async () => { setBusy(true); try { await backup.onExport(); } finally { setBusy(false); } }} />
        <Go ghost label="Import vessel log" onPress={() => setImportOpen(true)} />
        <Go ghost label="Save all photos to camera roll" disabled={busy} onPress={async () => {
          setBusy(true);
          try {
            const files = allPhotoFiles(state);
            if (!files.length) return onNotice({ ok: false, text: 'This vessel has no photos to save.' });
            const r = await saveToCameraRoll(files);
            onNotice(r.ok ? { ok: true, text: `${r.saved} photo${r.saved === 1 ? '' : 's'} saved to your camera roll.${r.missing ? ` ${r.missing} file${r.missing === 1 ? '' : 's'} missing on this phone.` : ''}` } : { ok: false, text: r.error });
          } finally { setBusy(false); }
        }} />
        <InfoNote label="About backups">
          <Note>Export shares one file with the whole log, corrections included. Import only adds missing entries; it never overwrites.</Note>
          <Note>If iCloud Backup is on for this iPhone, the app’s data may also be in that backup. iOS runs it on its own schedule, not after each entry, so Export is the copy you control.</Note>
          <Note>Photos are not in the export. They stay in the app on this phone ({state.evidence.filter((x) => !x.removed).length} saved for this vessel); the export keeps each photo’s record only.</Note>
          <Note>{AI_STATUS_TEXT[aiStatus()]}</Note>
        </InfoNote>
      </Card>

      {noteSheet && <PlanNoteSheet isTest={isTest} state={state} baseline={baseline} noteId={noteSheet.id} save={save} onClose={(done) => { setNoteSheet(null); if (done) onNotice({ ok: true, text: done }); }} />}
      {notesOpen && <NotesSheet isTest={isTest} reports={reports} onClose={() => setNotesOpen(false)} />}
      {importOpen && <ImportSheet isTest={isTest} backup={backup} onClose={(done) => { setImportOpen(false); if (done) onNotice({ ok: true, text: done }); }} />}
      {driversOpen && <DriversSheet isTest={isTest} state={state} baseline={baseline} save={save} onClose={(done) => { setDriversOpen(false); if (done) onNotice({ ok: true, text: done }); }} />}
      {breakOpen && <BreakSheet isTest={isTest} state={state} baseline={baseline} entry={breakOpen.entry} save={save} onClose={(done) => { setBreakOpen(null); if (done) onNotice({ ok: true, text: done }); }} />}
      {shiftOpen && <ShiftSheet isTest={isTest} state={state} baseline={baseline} save={save} onClose={(done) => { setShiftOpen(false); if (done) onNotice({ ok: true, text: done }); }} />}
    </View>
  );
}

// Shift settings sheet: "Finish today" or "Carries to Day 2" with Day 1 end and next start.
// Vessel facts shown on the Snapshot tab (moved from Plan 2026-10-01): baseline status, the day's start time, destinations.
// Same view-model values as before; the start-time sheet opens from here (one sheet at a time).
export function VesselCards({ state, baseline, isTest, save, onNotice }: { state: State; baseline: Baseline; isTest: boolean; save: Save; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const f = useType();
  const [startOpen, setStartOpen] = useState<number | null>(null); // operation day whose start time is being set
  const v = planView(state, baseline);
  const kv = (k: string, val: string) => (
    <View key={k} style={u.kv}><Body style={{ color: color.muted, maxWidth: '45%' }}>{k}</Body><Body semi style={{ textAlign: 'right', flex: 1 }}>{val}</Body></View>
  );
  return (
    <View style={{ gap: 16 }}>
        <Card style={[u.pad, { gap: 10 }]}>
          <SectionHead title="Baseline status" />
          {kv('Starting autos', `${v.baseline.start} · ${v.baseline.brands}`)}
          {kv('High & Heavy', `${v.baseline.hh} · separate ledger`)}
          <View style={s.chips}>
            <Chip text={v.baseline.verified ? '✓ Totals verified' : 'Not verified'} tone={v.baseline.verified ? 'plain' : 'orange'} />
            <Chip text={v.baseline.discrepancies} />
            <Chip text={v.baseline.missing} tone={v.baseline.missing === 'Nothing missing' ? 'plain' : 'orange'} />
          </View>
          {v.baseline.status && <Body semi>{v.baseline.status}</Body>}
          {v.baseline.discrepancyLines.map((d) => <ErrorBox key={d} text={d} />)}
          {v.baseline.checks.map((c) => <Note key={c}>• {c}</Note>)}
          {v.baseline.sources !== 'Sources: ' && <Note>{v.baseline.sources}</Note>}
        </Card>

        <Card style={[u.pad, { gap: 10 }]}>
          <SectionHead title="Day’s start time" />
          {v.dayStarts.map((d) => (
            <Pressable key={d.day} onPress={() => setStartOpen(d.day)} style={({ pressed }) => [s.logRow, pressed && { opacity: 0.6 }]}
              accessibilityRole="button" accessibilityLabel={`${d.label}: ${d.value}. Change`}>
              {kv(d.label, d.value)}
              <Text style={[s.edit, { fontFamily: f.bodySemi }]}>{d.actual ? 'Change ›' : 'Started late? ›'}</Text>
            </Pressable>
          ))}
          <InfoNote><Note>Operations start on the hour. If something delays the start, enter when work actually started. Hours before it count only the minutes worked.</Note></InfoNote>
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

      {startOpen != null && <StartSheet isTest={isTest} state={state} baseline={baseline} day={startOpen} save={save} onClose={(done) => { setStartOpen(null); if (done) onNotice({ ok: true, text: done }); }} />}
    </View>
  );
}

function ShiftSheet({ state, baseline, isTest, save, onClose }: { isTest: boolean; state: State; baseline: Baseline; save: Save; onClose: (done?: string) => void }) {
  const [mode, setMode] = useState<'one' | 'two'>(state.plan.shiftEnd ? 'two' : 'one');
  const [end, setEnd] = useState(state.plan.shiftEnd ?? '');
  const [next, setNext] = useState(state.plan.nextStart ?? baseline.start);
  const [side, setSide] = useState<'N' | 'S' | null>(state.plan.shiftEndSide ?? null);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (mode === 'two' && parseHM(end.trim()) == null) return setError('Enter when Day 1 ends (HH:MM).');
    if (mode === 'two' && parseHM(next.trim()) == null) return setError('Enter when the next day starts (HH:MM).');
    if (mode === 'two' && side == null) return setError('Pick the side Day 1 ends on: Northside or Southside.');
    const r = await save((c) => E.shiftSettingsEvents(c, mode === 'two' ? end.trim().padStart(5, '0') : null, next.trim().padStart(5, '0'), mode === 'two' ? side : null));
    if (r.ok) onClose('Shift settings saved.'); else setError(r.error);
  };
  return (
    <Sheet title="Shift settings" isTest={isTest} onClose={() => onClose()}>
      <Seg columns={2} value={mode} onChange={setMode} options={[{ value: 'one', label: 'One day' }, { value: 'two', label: 'Two days' }]} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {mode === 'two' && <Field label="Day 1 shift ends" value={end} onChange={setEnd} keyboard="numbers-and-punctuation" maxLength={5} />}
        {mode === 'two' && <Field label="Day 2 starts" value={next} onChange={setNext} keyboard="numbers-and-punctuation" maxLength={5} />}
      </View>
      {mode === 'two' && (
        <View style={{ gap: 8 }}>
          <Label>DAY 1 ENDS ON WHICH SIDE?</Label>
          <Seg columns={2} value={side} onChange={setSide} options={[{ value: 'N', label: 'Northside (−15)' }, { value: 'S', label: 'Southside (−30)' }]} />
          <InfoNote><Note>The forecast stops that many minutes before the shift end.</Note></InfoNote>
        </View>
      )}
      {error && <ErrorBox text={error} />}
      <Go label="Save shift settings" onPress={submit} />
    </Sheet>
  );
}

// '' → null; digits → number; anything else → NaN (refused with a message).
const num = (v: string) => (v.trim() === '' ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

// Workday drivers: set once per operation day; every hour of that day without its own count uses it.
function DriversSheet({ state, baseline, isTest, save, onClose }: { isTest: boolean; state: State; baseline: Baseline; save: Save; onClose: (done?: string) => void }) {
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
    <Sheet title="Day’s drivers" isTest={isTest} onClose={() => onClose()}>
      <Seg columns={days.length} value={day} onChange={pick} options={days.map((d) => ({ value: d.day, label: `Day ${d.day}` }))} />
      <Field label={`Drivers on Day ${day}`} value={n} onChange={setN} />
      {cur != null && <Reasons options={E.REASONS} value={reason} onChange={setReason} other={other} onOther={setOther} />}
      <InfoNote><Note>Used for every hour of that day. If the gang changes during the day, enter the drivers on that hour in the Log sheet instead.</Note></InfoNote>
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

// Day's actual start: only when something delayed it. Empty = not provided; the planned start applies.
function StartSheet({ state, baseline, isTest, day: first, save, onClose }: { isTest: boolean; state: State; baseline: Baseline; day: number; save: Save; onClose: (done?: string) => void }) {
  const days = planView(state, baseline).dayStarts;
  const [day, setDay] = useState(first);
  const row = (d: number) => days.find((x) => x.day === d)!;
  const listed = (c: string | null) => (c == null ? null : (E.START_CAUSES as readonly string[]).includes(c) ? c : 'Other');
  const [time, setTime] = useState(row(first).actual ?? '');
  const [cause, setCause] = useState<string | null>(listed(row(first).cause));
  const [causeOther, setCauseOther] = useState(listed(row(first).cause) === 'Other' ? row(first).cause ?? '' : '');
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cur = row(day);
  const pick = (d: number) => { const r = row(d); setDay(d); setTime(r.actual ?? ''); setCause(listed(r.cause)); setCauseOther(listed(r.cause) === 'Other' ? r.cause ?? '' : ''); setReason(null); setError(null); };
  const now = () => { const t = E.nowOpTime(operationDate(baseline)!, new Date()); if (t) setTime(t.hm); else setError('The phone’s date is before this operation’s Day 1.'); };
  const why = () => (reason === 'Other' ? other.trim() : reason);
  const submit = async () => {
    setError(null);
    if (parseHM(time.trim()) == null) return setError('Enter the actual start as HH:MM, for example 08:40.');
    const c = cause === 'Other' ? causeOther.trim() : cause;
    const r = await save((ctx) => E.dayStartEvents(ctx, day, time, c, why()));
    if (r.ok) onClose(`Day ${day} start recorded at ${time.trim().padStart(5, '0')}.`); else setError(r.error);
  };
  return (
    <Sheet title="Day’s start time" isTest={isTest} onClose={() => onClose()}>
      {days.length > 1 && <Seg columns={days.length} value={day} onChange={pick} options={days.map((d) => ({ value: d.day, label: `Day ${d.day}` }))} />}
      <Note>Planned start: {cur.planned}. Only a later start can be recorded.</Note>
      <TimeField required label={`Day ${day} work actually started at`} value={time} onChange={setTime} onNow={now} />
      <View style={{ gap: 8 }}>
        <Label>CAUSE (OPTIONAL)</Label>
        <Seg columns={2} value={cause} onChange={setCause} options={[...E.START_CAUSES, 'Other'].map((r) => ({ value: r as string, label: r === 'Other' ? 'Other…' : r }))} />
        {cause === 'Other' && <Field label="Cause" value={causeOther} onChange={setCauseOther} keyboard="default" maxLength={120} />}
      </View>
      {cur.actual != null && <Reasons options={E.REASONS} value={reason} onChange={setReason} other={other} onOther={setOther} />}
      {error && <ErrorBox text={error} />}
      <Go label="Save start time" onPress={submit} />
      {cur.actual != null && <Go ghost label={`Clear Day ${day} (back to planned ${cur.planned})`} onPress={async () => {
        setError(null);
        const r = await save((ctx) => E.clearDayStartEvents(ctx, day, why()));
        if (r.ok) onClose(`Day ${day} start cleared. The old time is kept in the log.`); else setError(r.error);
      }} />}
      <Note>Nothing is overwritten: the old start stays in the log.</Note>
    </Sheet>
  );
}

// Ship notes: add, edit (reason required, old text kept) or remove (reason required, stays in the log).
function PlanNoteSheet({ state, baseline, isTest, noteId, save, onClose }: { isTest: boolean; state: State; baseline: Baseline; noteId: string | null; save: Save; onClose: (done?: string) => void }) {
  const f = useType();
  const note = noteId ? state.notes.find((n) => n.id === noteId) ?? null : null;
  const [title, setTitle] = useState(note?.title ?? '');
  const [text, setText] = useState(note?.text ?? '');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fromPhoto, setFromPhoto] = useState(false); // text read from a photo: saved as source photo-read once Colby has checked it
  const [reading, setReading] = useState(false);
  const why = () => (reason === 'Other' ? other.trim() : reason);
  const now = () => { const t = E.nowOpTime(operationDate(baseline)!, new Date()); if (t) setTime(t.hm); else setError('The phone’s date is before this operation’s Day 1.'); };
  const read = async (src: 'camera' | 'library') => {
    setError(null); setReading(true);
    try {
      const r = await readPhotos(src);
      if (!r) return;
      const t = r.pages.join('\n\n').trim();
      if (!t) return setError('No text found in that photo. Try a sharper photo, or type the note.');
      setText(text.trim() ? `${text.trim()}\n\n${t}` : t); setFromPhoto(true);
    } catch (e) { setError(`Could not read the photo: ${(e as Error).message}`); }
    finally { setReading(false); }
  };
  const run = async (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => {
    setError(null);
    const r = await save(build);
    if (r.ok) onClose(done); else setError(r.error);
  };
  const submit = () => {
    if (!note) {
      if (time.trim() !== '' && parseHM(time.trim()) == null) return setError('Times are HH:MM, for example 09:15.');
      return run((c) => E.addNoteEvents(c, { title, text, source: fromPhoto ? 'photo-read' : 'typed', time: time.trim() === '' ? null : { day: c.state.ops.day, hm: time.trim().padStart(5, '0') } }), 'Note added.');
    }
    return run((c) => E.editNoteEvents(c, note.id, { title, text }, why()), 'Note changed. The old text is kept in the log.');
  };
  return (
    <Sheet title={note ? 'Edit note' : 'Add a note'} isTest={isTest} onClose={() => onClose()}>
      <Field label="Title (optional)" value={title} onChange={setTitle} keyboard="default" maxLength={80} />
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }}>Note</Text>
        <TextInput value={text} onChangeText={setText} multiline accessibilityLabel="Note text" placeholder="Type the note" placeholderTextColor={color.muted}
          style={[u.input, { fontFamily: f.body, fontSize: 17, minHeight: 140, paddingTop: 12, textAlignVertical: 'top' }]} />
      </View>
      {!note && ocrAvailable() && (
        <View style={{ gap: 10 }}>
          <Go ghost label="Read text from a photo" disabled={reading} onPress={() => read('library')} />
          <Go ghost label="Read text: take a picture" disabled={reading} onPress={() => read('camera')} />
          {reading && <Note>Reading the photo…</Note>}
          {fromPhoto && <Note>Text read from a photo: check and fix it before adding. The photo is not kept.</Note>}
        </View>
      )}
      {!note && <TimeField label="Time (optional)" value={time} onChange={setTime} onNow={now} />}
      {note && <Reasons options={E.NOTE_REASONS} value={reason} onChange={setReason} other={other} onOther={setOther} />}
      {error && <ErrorBox text={error} />}
      <Go label={note ? 'Save changes' : 'Add note'} onPress={submit} />
      {note && <Go ghost label="Remove this note" onPress={() => run((c) => E.removeNoteEvents(c, note.id, why()), 'Note removed. It stays in the log, marked removed.')} />}
      {note && note.history.length > 1 && (
        <View style={{ gap: 6 }}>
          <Label>EARLIER VERSIONS</Label>
          {note.history.slice(0, -1).reverse().map((h, i) => <Note key={i}>{h.title ? `${h.title}: ` : ''}{h.text} ({h.at})</Note>)}
        </View>
      )}
      <Note>Notes never change a count, ledger or forecast. Nothing is overwritten: the original text stays in the log.</Note>
    </Sheet>
  );
}

// Break log: fix a break's times, remove a wrong or duplicate one, or add one that was missed.
function BreakSheet({ state, baseline, isTest, entry, save, onClose }: { isTest: boolean; state: State; baseline: Baseline; entry: BreakEntry | null; save: Save; onClose: (done?: string) => void }) {
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
  const now = (set: (v: string) => void) => () => { const t = E.nowOpTime(operationDate(baseline)!, new Date()); if (t) set(t.hm); else setError('The phone’s date is before this operation’s Day 1.'); };
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
    <Sheet title={entry ? 'Edit break' : 'Add a missed break'} isTest={isTest} onClose={() => onClose()}>
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

// Import by paste: copy the exported file's text, paste it here. Nothing is written unless every check passes.
function ImportSheet({ isTest, backup, onClose }: { isTest: boolean; backup: Backup; onClose: (done?: string) => void }) {
  const f = useType();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setError(null); setBusy(true);
    try {
      const r = await backup.onImport(text);
      if (r.ok) onClose(r.text); else setError(r.error);
    } finally { setBusy(false); }
  };
  return (
    <Sheet title="Import vessel log" isTest={isTest} onClose={() => onClose()}>
      <Note>Paste the full text of an exported vessel log file.</Note>
      <TextInput value={text} onChangeText={setText} multiline autoCorrect={false} autoCapitalize="none" accessibilityLabel="Vessel log text"
        placeholder="Paste here" placeholderTextColor={color.muted} style={[u.input, { fontFamily: f.body, fontSize: 15, minHeight: 160, paddingTop: 12, textAlignVertical: 'top' }]} />
      {error && <ErrorBox text={error} />}
      <Go label="Import" disabled={busy || text.trim() === ''} onPress={run} />
    </Sheet>
  );
}

// Typed notes for the completion report's analysis sections. The app never writes conclusions itself.
// One report: a white row with its title and what it holds; the chevron says it is tappable.
function ReportRow({ title, sub, busy, onPress }: { title: string; sub: string; busy: boolean; onPress: () => void }) {
  const f = useType();
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}
      style={({ pressed }) => [{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: color.line, borderRadius: 12, backgroundColor: color.card }, (pressed || busy) && u.pressed]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.ink }}>{busy ? 'Preparing report…' : title}</Text>
        <Note>{sub}</Note>
      </View>
      <Text style={{ fontSize: 22, color: color.blue }}>›</Text>
    </Pressable>
  );
}

function NotesSheet({ isTest, reports, onClose }: { isTest: boolean; reports: Reports; onClose: () => void }) {
  const f = useType();
  const [text, setText] = useState<Record<string, string>>(reports.notes);
  return (
    <Sheet title="Report notes" isTest={isTest} onClose={onClose}>
      <Note>Short notes for sections the app has no data for. Empty prints “Not recorded.”</Note>
      {NOTE_SECTIONS.map((sec) => (
        <View key={sec} style={{ gap: 6 }}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }}>{sec}</Text>
          <TextInput value={text[sec] ?? ''} onChangeText={(x) => setText({ ...text, [sec]: x })} onEndEditing={() => reports.onNote(sec, text[sec] ?? '')} onBlur={() => reports.onNote(sec, text[sec] ?? '')}
            multiline accessibilityLabel={sec} placeholderTextColor={color.muted} style={[u.input, { fontFamily: f.body, fontSize: 15, minHeight: 80, paddingTop: 12, textAlignVertical: 'top' }]} />
        </View>
      ))}
      <Go label="Done" onPress={async () => { for (const sec of NOTE_SECTIONS) await reports.onNote(sec, text[sec] ?? ''); onClose(); }} />
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
