// Van list card for the Plan tab (spec: docs/specs/phase-6-van-list.md). Layout only: values come from view.vanView(),
// saves go through entries.ts via App.save(). One sheet at a time (iOS freezes on stacked modals).
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { GAS_LEVELS, MAX_VANS, operationDate, parseHM, parseVanSheet, type Baseline, type OpTime, type Reject, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { readPhotos, ocrAvailable } from '../ai.ts';
import { vanView } from '../view.ts';
import { color, TAP, useType } from '../theme.ts';
import type { Save } from './Plan.tsx';
import { Body, Card, Chip, ErrorBox, Field, Go, Note, SectionHead, Seg, Sheet, TimeField, u } from './ui.tsx';

type Which = { k: 'list' } | { k: 'create'; more: boolean } | { k: 'edit'; id: string } | { k: 'mark' } | { k: 'photo' } | null;
type Row = ReturnType<typeof vanView>['rows'][number];

// The Plan tab shows only a summary box. Tapping it opens the list in one sheet; a van, the shortcut, the photo read and
// "add slots" swap into that same sheet and come back to the list (one modal at a time).
export function Vans({ state, baseline, isTest, save, onNotice }: {
  state: State; baseline: Baseline; isTest: boolean; save: Save; onNotice: (n: { ok: boolean; text: string }) => void;
}) {
  const f = useType();
  const [which, setWhich] = useState<Which>(null);
  const v = vanView(state);
  const opDate = operationDate(baseline)!;
  // Back to the list after a save or a close; the list's own close shuts everything.
  const toList = (text?: string) => { setWhich(v.exists ? { k: 'list' } : null); if (text) onNotice({ ok: true, text }); };
  const created = (text?: string) => { setWhich({ k: 'list' }); if (text) onNotice({ ok: true, text }); };

  return (
    <>
      <Pressable onPress={() => setWhich(v.exists ? { k: 'list' } : { k: 'create', more: false })} accessibilityRole="button"
        accessibilityLabel={v.exists ? `Van list. ${v.header}. Open the list` : 'Van list. Not created yet. Create it'}
        style={({ pressed }) => [pressed && u.pressed]}>
        <Card style={[u.pad, { gap: 8, minHeight: TAP }, v.alert ? { borderWidth: 2, borderColor: color.red } : null]}>
          <SectionHead title="Van list" right={v.exists ? v.header : undefined} />
          {!v.exists ? (
            <Note>No van list for this ship yet. Tap to choose how many vans were checked out.</Note>
          ) : (
            <>
              {v.alert && <Body semi style={{ color: color.rInk }}>{v.alert}</Body>}
              <Body>{v.counts}</Body>
              <Body>{v.gassing}</Body>
            </>
          )}
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.blue }}>{v.exists ? 'Open the van list ›' : 'Create the van list ›'}</Text>
        </Card>
      </Pressable>

      {which?.k === 'list' && (
        <Sheet title="Van list" isTest={isTest} onClose={() => setWhich(null)}>
          <Body semi>{v.header}</Body>
          {v.alert && <ErrorBox text={`${v.alert}. The vessel is finished: set each van to Gassed or Not gassed.`} />}
          <Body>{v.counts}</Body>
          <Body>{v.lashers}</Body>
          <Body>{v.gassing}</Body>
          {v.backToMark.length > 0 && <Go ghost label={`Mark Back vans gassed (${v.backToMark.length})`} onPress={() => setWhich({ k: 'mark' })} />}
          {v.rows.map((r) => <VanRowView key={r.id} r={r} onOpen={() => setWhich({ k: 'edit', id: r.id })} />)}
          {ocrAvailable() && <Go ghost label="Read van sheet from a photo" onPress={() => setWhich({ k: 'photo' })} />}
          <Go ghost label="Add more slots" onPress={() => setWhich({ k: 'create', more: true })} />
          <Note>Changes to a van number or driver keep their history. Driver names stay on this phone and are in the backup.</Note>
        </Sheet>
      )}
      {which?.k === 'create' && <CreateSheet more={which.more} state={state} isTest={isTest} save={save} onClose={(t) => (t ? created(t) : toList())} />}
      {which?.k === 'edit' && <EditSheet id={which.id} opDate={opDate} state={state} isTest={isTest} save={save} onClose={(t) => (t ? created(t) : toList())} />}
      {which?.k === 'mark' && <MarkSheet opDate={opDate} state={state} isTest={isTest} save={save} onClose={(t) => (t ? created(t) : toList())} />}
      {which?.k === 'photo' && <PhotoSheet state={state} isTest={isTest} save={save} onClose={(t) => (t ? created(t) : toList())} />}
    </>
  );
}

function VanRowView({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const f = useType();
  return (
    <Pressable onPress={onOpen} disabled={r.removed} accessibilityRole="button" accessibilityLabel={`${r.title}. ${r.status}. Edit`}
      style={({ pressed }) => [{ minHeight: TAP, gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.row, opacity: r.removed ? 0.5 : 1 }, pressed && u.pressed]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontFamily: f.display, fontSize: 24, color: color.ink }}>{r.title}</Text>
        <Chip text={r.status} tone={r.statusKey === 'out' ? 'orange' : 'plain'} />
        {r.lasher && <Chip text="Lasher van" />}
        {r.gassed && <Chip text={r.gassed.text} tone={r.gassed.tone === 'red' ? 'red' : 'plain'} />}
      </View>
      {r.driver ? <Body semi>{r.driver}</Body> : null}
      {r.times ? <Note>{r.times}{r.gas ? ` · ${r.gas}` : ''}</Note> : null}
      {r.remarks ? <Note>{r.remarks}</Note> : null}
      {r.history.map((h, i) => <Note key={i} style={{ color: color.ink }}>{h.text} · {h.at}{h.note ? ` · note: ${h.note}` : ''}</Note>)}
      {r.removedNote ? <Note>{r.removedNote}</Note> : null}
    </Pressable>
  );
}

// "How many vans?": a drop-down of 1 to 30 (or the most that still fits when adding more).
function CreateSheet({ more, state, isTest, save, onClose }: { more: boolean; state: State; isTest: boolean; save: Save; onClose: (done?: string) => void }) {
  const f = useType();
  const have = state.vans.filter((x) => !x.removed).length, room = MAX_VANS - have;
  const [n, setN] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (n == null) return setError('Choose how many vans first.');
    setBusy(true); setError(null);
    const r = await save((c) => E.addVanSlotsEvents(c, n));
    setBusy(false);
    if (r.ok) onClose(`${n} van slot${n === 1 ? '' : 's'} added.`); else setError(r.error);
  };
  return (
    <Sheet title={more ? 'Add van slots' : 'How many vans?'} isTest={isTest} onClose={() => onClose()}>
      <Note>{more ? `The list has ${have} of ${MAX_VANS}. Choose how many slots to add (up to ${room}).` : 'Choose how many vans were checked out for this ship. You fill in the van numbers and drivers as they go out.'}</Note>
      {room <= 0 ? <ErrorBox text={`The list already holds ${MAX_VANS} vans.`} /> : (
        <>
          <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel="Choose the number of vans"
            style={({ pressed }) => [u.input, { minHeight: TAP, justifyContent: 'center' }, pressed && u.pressed]}>
            <Text style={{ fontFamily: f.bodyMedium, fontSize: 18, color: n != null ? color.ink : color.muted }}>{n != null ? `${n} van${n === 1 ? '' : 's'}` : 'Choose 1 to ' + room}  ▾</Text>
          </Pressable>
          {open && Array.from({ length: room }, (_, i) => i + 1).map((k) => (
            <Pressable key={k} onPress={() => { setN(k); setOpen(false); }} accessibilityRole="button"
              style={({ pressed }) => [{ minHeight: TAP, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: color.row }, pressed && u.pressed]}>
              <Text style={{ fontFamily: f.bodyMedium, fontSize: 18, color: color.ink }}>{k}</Text>
            </Pressable>
          ))}
          {error && <ErrorBox text={error} />}
          <Go label={n ? `Create ${n} slot${n === 1 ? '' : 's'}` : 'Create'} disabled={busy || n == null} onPress={go} />
        </>
      )}
    </Sheet>
  );
}

const timeText = (t: OpTime | null) => t?.hm ?? '';
// '' → null; a valid HH:MM → keeps the existing time's own day, else the operation's current day; anything else → 'bad'.
function toTime(text: string, existing: OpTime | null, day: number): OpTime | null | 'bad' {
  const t = text.trim();
  if (t === '') return null;
  const m = parseHM(t);
  if (m == null) return 'bad';
  const hm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return existing ? { day: existing.day, hm } : { day, hm }; // correcting a time keeps its day; a blank one gets today's operation day
}

function EditSheet({ id, opDate, state, isTest, save, onClose }: { id: string; opDate: string; state: State; isTest: boolean; save: Save; onClose: (done?: string) => void }) {
  const f = useType();
  const slot = state.vans.find((x) => x.id === id)!;
  const day = state.ops.day;
  const [number, setNumber] = useState(slot.number ?? '');
  const [driver, setDriver] = useState(slot.driver ?? '');
  const [lasher, setLasher] = useState(slot.lasher);
  const [out, setOut] = useState(timeText(slot.out));
  const [inn, setInn] = useState(timeText(slot.in));
  const [gas, setGas] = useState<string>(slot.gas ?? '');
  const [gassed, setGassed] = useState<string>(slot.gassed ?? '');
  const [gassedAt, setGassedAt] = useState(timeText(slot.gassedAt));
  const [gassedNote, setGassedNote] = useState(slot.gassedNote ?? '');
  const [remarks, setRemarks] = useState(slot.remarks ?? '');
  const [note, setNote] = useState(''); // Colby's optional "why" for this change
  const [removeWhy, setRemoveWhy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const nowT = (set: (v: string) => void) => () => { const t = E.nowOpTime(opDate, new Date()); set(t ? t.hm : ''); if (!t) setError('The phone’s date is before this operation’s Day 1.'); };

  const run = async (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => {
    setBusy(true); setError(null);
    const r = await save(build);
    setBusy(false);
    if (r.ok) onClose(done); else setError(r.error);
  };
  const submit = () => {
    const t = { out: toTime(out, slot.out, day), in: toTime(inn, slot.in, day), gassedAt: toTime(gassedAt, slot.gassedAt, day) };
    for (const [k, label] of [['out', 'Checked out'], ['in', 'Checked in'], ['gassedAt', 'Gassed time']] as const) if (t[k] === 'bad') return setError(`${label}: type a time like 09:15, or leave it blank.`);
    return run((c) => E.editVanEvents(c, id, {
      number: number, driver: driver, lasher, out: t.out as OpTime | null, in: t.in as OpTime | null, gas: (gas || null) as never,
      gassed: (gassed || null) as never, gassedAt: gassed === 'gassed' ? (t.gassedAt as OpTime | null) : null, gassedNote: gassed === 'not_gassed' ? gassedNote : null, remarks,
    }, note.trim() || null), 'Van row saved.');
  };
  const history = [...slot.changes].reverse();
  return (
    <Sheet title={slot.number ? `Van ${slot.number}` : `Van slot ${slot.slot}`} isTest={isTest} onClose={() => onClose()}>
      <Field label="Van number" value={number} onChange={setNumber} keyboard="default" maxLength={12} />
      <Field label="Driver name (longshoreman)" note="optional" value={driver} onChange={setDriver} keyboard="default" maxLength={60} />
      <Body semi>Lasher van</Body>
      <Seg options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes, lasher van' }]} columns={2} value={lasher ? 'yes' : 'no'} onChange={(x) => setLasher(x === 'yes')} />
      <TimeField label="Checked out" value={out} onChange={setOut} onNow={nowT(setOut)} />
      <TimeField label="Checked in" value={inn} onChange={setInn} onNow={nowT(setInn)} />
      <Body semi>Gas level</Body>
      <Seg options={[{ value: '', label: 'Not recorded' }, ...GAS_LEVELS.map((g) => ({ value: g as string, label: g }))]} columns={3} value={gas} onChange={setGas} />
      <Body semi>Gassed at end of vessel</Body>
      <Seg options={[{ value: '', label: 'Not recorded' }, { value: 'gassed', label: 'Gassed ✓' }, { value: 'not_gassed', label: 'Not gassed' }]} value={gassed} onChange={setGassed} />
      {gassed === 'gassed' && <TimeField label="Gassed at (optional)" value={gassedAt} onChange={setGassedAt} onNow={nowT(setGassedAt)} />}
      {gassed === 'not_gassed' && <Field label="Why not gassed" note="optional" value={gassedNote} onChange={setGassedNote} keyboard="default" maxLength={200} />}
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }}>Remarks</Text>
        <TextInput value={remarks} onChangeText={setRemarks} multiline maxLength={300} accessibilityLabel="Remarks" placeholder="Anything about this van" placeholderTextColor={color.muted}
          style={[u.input, { fontFamily: f.body, fontSize: 17, minHeight: 80, paddingTop: 12, textAlignVertical: 'top' }]} />
      </View>
      <Field label="Why the change? (optional)" note="saved with the history" value={note} onChange={setNote} keyboard="default" maxLength={200} />
      {error && <ErrorBox text={error} />}
      <Go label="Save" disabled={busy} onPress={submit} />
      {history.length > 0 && (
        <View style={{ gap: 6 }}>
          <Go ghost label={showAll ? 'Hide all changes' : `All changes (${history.length})`} onPress={() => setShowAll(!showAll)} />
          {showAll && history.map((c, i) => <Note key={i} style={{ color: color.ink }}>{c.assignment ? `${c.text} (first entry)` : c.text} · {c.at}{c.note ? ` · note: ${c.note}` : ''}</Note>)}
        </View>
      )}
      <Field label="Remove this row" note="reason required; it stays in the log" value={removeWhy} onChange={setRemoveWhy} keyboard="default" maxLength={200} />
      <Go ghost label="Remove this van row" disabled={busy} onPress={() => run((c) => E.removeVanEvents(c, id, removeWhy), 'Van row removed. It stays in the log, marked removed.')} />
      <Note>Nothing is overwritten: every earlier value stays in the log.</Note>
    </Sheet>
  );
}

// The shortcut: lists exactly which vans will be marked, before anything is saved.
function MarkSheet({ opDate, state, isTest, save, onClose }: { opDate: string; state: State; isTest: boolean; save: Save; onClose: (done?: string) => void }) {
  const v = vanView(state);
  const [t, setT] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const day = state.ops.day;
  const go = async () => {
    const time = toTime(t, null, day);
    if (time === 'bad') return setError('Type a time like 18:20, or leave it blank.');
    setBusy(true); setError(null);
    const r = await save((c) => E.markGassedEvents(c, v.backToMark.map((x) => x.id), time));
    setBusy(false);
    if (r.ok) onClose(`${v.backToMark.length} van${v.backToMark.length === 1 ? '' : 's'} marked gassed.`); else setError(r.error);
  };
  return (
    <Sheet title="Mark Back vans gassed" isTest={isTest} onClose={() => onClose()}>
      <Note>These vans are checked in and not yet marked. Vans that are Out, Not assigned or already marked are not touched.</Note>
      {v.backToMark.map((x) => <Body key={x.id} semi>{x.label}</Body>)}
      <TimeField label="Gassed at (optional)" value={t} onChange={setT} onNow={() => { const n = E.nowOpTime(opDate, new Date()); if (n) setT(n.hm); else setError('The phone’s date is before this operation’s Day 1.'); }} />
      {error && <ErrorBox text={error} />}
      <Go label={`Mark ${v.backToMark.length} gassed`} disabled={busy || v.backToMark.length === 0} onPress={go} />
      <Go ghost label="Cancel" onPress={() => onClose()} />
    </Sheet>
  );
}

// Read the TICO sheet: proposals only. Every row is checked before anything is saved.
function PhotoSheet({ state, isTest, save, onClose }: { state: State; isTest: boolean; save: Save; onClose: (done?: string) => void }) {
  const [rows, setRows] = useState<{ number: string; driver: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const free = state.vans.filter((x) => !x.removed && x.number == null).length;
  const read = async (src: 'camera' | 'library') => {
    setError(null); setBusy(true);
    try {
      const r = await readPhotos(src);
      if (!r) return;
      const found = parseVanSheet(r.pages.join('\n'));
      if (!found.length) setError('No van numbers found. Try a sharper, flatter photo, or type them in.'); else setRows(found);
    } catch (e) { setError(`Could not read the photo: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  const go = async () => {
    setBusy(true); setError(null);
    const r = await save((c) => E.fillVanSlotsEvents(c, rows!));
    setBusy(false);
    if (r.ok) onClose(`${rows!.length} van${rows!.length === 1 ? '' : 's'} added from the sheet.`); else setError(r.error);
  };
  return (
    <Sheet title="Read the van sheet" isTest={isTest} onClose={() => onClose()}>
      <Note>The reader proposes van numbers and any name on the same line. Handwriting and crossed-out lines are unreliable: remove anything wrong, then add. Nothing is saved until you tap Add. The photo is not kept.</Note>
      {!rows && (
        <>
          <Go label="Choose a photo" disabled={busy} onPress={() => read('library')} />
          <Go ghost label="Take a picture" disabled={busy} onPress={() => read('camera')} />
          {busy && <Note>Reading the sheet…</Note>}
        </>
      )}
      {rows && (
        <>
          <Note>{rows.length} row{rows.length === 1 ? '' : 's'} found; {free} empty slot{free === 1 ? '' : 's'} available. They fill the empty slots from the top.</Note>
          {rows.map((r, i) => (
            <View key={r.number} style={u.secH}>
              <Body semi style={{ flexShrink: 1 }}>{`Van ${r.number}${r.driver ? ` · ${r.driver}` : ''}`}</Body>
              <Go ghost label="Remove" onPress={() => setRows(rows.filter((_, j) => j !== i))} />
            </View>
          ))}
          {error && <ErrorBox text={error} />}
          <Go label={`Add ${rows.length} van${rows.length === 1 ? '' : 's'}`} disabled={busy || rows.length === 0} onPress={go} />
          <Go ghost label="Read again" onPress={() => { setRows(null); setError(null); }} />
        </>
      )}
      {!rows && error && <ErrorBox text={error} />}
    </Sheet>
  );
}
