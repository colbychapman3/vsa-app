// Settings: app-wide items only. Per-vessel items (Backup of the open vessel, Reports, Labor, Break log) stay in Plan.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import type { VesselRow } from '../../storage/vessels.ts';
import { aiStatus, AI_STATUS_TEXT } from '../ai.ts';
import { makeQuiet, type Quiet } from '../assistant.ts';
import { REMINDER_STATUS_TEXT, type ReminderStatus } from '../reminders.ts';
import { APPEARANCES, color, useType, type AppearanceMode } from '../theme.ts';
import { Body, Card, Chip, ErrorBox, Field, Go, InfoNote, Note, SectionHead, Seg, Sheet, u } from './ui.tsx';
import { CustomizeSnapshot } from './CustomizeSnapshot.tsx';
import type { Layout } from '../snapshotLayout.ts';

export type ExportResult = { ok: boolean; text: string };

const APPEARANCE_LABEL: Record<AppearanceMode, string> = { light: 'Light', night: 'Night', auto: 'Auto' };

export function Settings({ isTest, rows, currentId, appearance, onAppearance, sun, onSun, keepPhotos, onKeepPhotos, reminders, remindersPaused, onPauseReminders, onEnableReminders, quiet, onQuiet, onArchive, onDelete, onExportVessel, onClose, layout, onLayout }: {
  sun: boolean; onSun: (v: boolean) => void;
  keepPhotos: boolean; onKeepPhotos: (v: boolean) => void;
  layout: Layout; onLayout: (l: Layout) => void;
  isTest: boolean; rows: VesselRow[]; currentId: string;
  appearance: AppearanceMode; onAppearance: (m: AppearanceMode) => void;
  reminders: ReminderStatus; remindersPaused: boolean; onPauseReminders: (paused: boolean) => void; onEnableReminders: () => void;
  quiet: Quiet | null; onQuiet: (q: Quiet | null) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onExportVessel: (id: string) => Promise<ExportResult>;
  onClose: () => void;
}) {
  const ai = aiStatus();
  const version = Constants.expoConfig?.version ?? 'unknown';
  const build = Constants.nativeBuildVersion ?? 'dev';
  const [customize, setCustomize] = useState(false); // swaps the content of this sheet: one modal at a time
  if (customize) {
    return (
      <Sheet title="Customize Snapshot" isTest={isTest} onClose={onClose}>
        <Go ghost label="‹ Settings" onPress={() => setCustomize(false)} />
        <CustomizeSnapshot layout={layout} onLayout={onLayout} />
      </Sheet>
    );
  }
  return (
    <Sheet title="Settings" isTest={isTest} onClose={onClose}>
      <SectionHead title="Appearance" />
      <Seg<AppearanceMode> options={APPEARANCES.map((m) => ({ value: m, label: APPEARANCE_LABEL[m] }))} value={appearance} onChange={onAppearance} />
      <InfoNote><Note>Light is the sun-readable default. Night is for night shifts. Auto follows your iPhone.</Note></InfoNote>
      <Seg<'off' | 'on'> columns={2} options={[{ value: 'off', label: 'Standard' }, { value: 'on', label: 'Extra visible' }]} value={sun ? 'on' : 'off'} onChange={(v) => onSun(v === 'on')} />
      <InfoNote><Note>Extra visible: heavier text, thicker outlines and slightly larger writing, for direct sun and gloves.</Note></InfoNote>

      <SectionHead title="Paperwork photos" />
      <Seg<'off' | 'on'> columns={2} options={[{ value: 'off', label: 'Don’t keep' }, { value: 'on', label: 'Keep on this phone' }]} value={keepPhotos ? 'on' : 'off'} onChange={(v) => onKeepPhotos(v === 'on')} />
      <InfoNote><Note>When on, the game plan and discharge summary pages you photograph in Setup are kept with the new vessel (see Plan). Only the pages read after you turn it on. They stay on this phone and are not in the exported log.</Note></InfoNote>

      <SectionHead title="Snapshot" />
      <Go ghost label="Customize Snapshot" onPress={() => setCustomize(true)} />
      <InfoNote><Note>Move, hide or send any Snapshot box to Plan, Hourly or Decks. Saved on this phone.</Note></InfoNote>

      <SectionHead title="Plan reminders" />
      <Body>{REMINDER_STATUS_TEXT[reminders]}</Body>
      {reminders === 'ask' && <Go label="Turn on reminders" onPress={onEnableReminders} />}
      {reminders === 'on' && (
        <Seg<'on' | 'paused'> options={[{ value: 'on', label: 'Reminders on' }, { value: 'paused', label: 'Paused' }]} value={remindersPaused ? 'paused' : 'on'} columns={2}
          onChange={(v) => onPauseReminders(v === 'paused')} />
      )}
      {reminders === 'on' && <QuietHours quiet={quiet} onQuiet={onQuiet} />}

      <SectionHead title="Back up vessels" />
      <BackupPicker rows={rows} onExportVessel={onExportVessel} />

      <SectionHead title="Archive, restore or delete vessels" />
      <ArchiveList rows={rows} currentId={currentId} onArchive={onArchive} onDelete={onDelete} />

      <SectionHead title="On-device AI" />
      <Body>{AI_STATUS_TEXT[ai]}</Body>
      <InfoNote><Note>The app works fully without it.</Note></InfoNote>

      <SectionHead title="About" />
      <Body>Version {version} · Build {build}</Body>
    </Sheet>
  );
}

// Quiet hours: no reminders while the clock is inside the window (it may wrap midnight, e.g. 22:00 to 06:00).
function QuietHours({ quiet, onQuiet }: { quiet: Quiet | null; onQuiet: (q: Quiet | null) => void }) {
  const [from, setFrom] = useState(quiet?.from ?? '');
  const [to, setTo] = useState(quiet?.to ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const r = makeQuiet(from, to);
    if (!r.ok) return setError(r.error);
    setError(null); setFrom(r.quiet.from); setTo(r.quiet.to); onQuiet(r.quiet);
  };
  return (
    <Card style={[u.pad, { gap: 10 }]}>
      <Body semi>Quiet hours</Body>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Field label="From" value={from} onChange={setFrom} placeholder="22:00" keyboard="numbers-and-punctuation" maxLength={5} />
        <Field label="To" value={to} onChange={setTo} placeholder="06:00" keyboard="numbers-and-punctuation" maxLength={5} />
      </View>
      {error && <ErrorBox text={error} />}
      <Go label="Save quiet hours" onPress={save} />
      {quiet && <Go ghost label="Turn quiet hours off" onPress={() => { setFrom(''); setTo(''); setError(null); onQuiet(null); }} />}
      <Note>{quiet ? `Quiet from ${quiet.from} to ${quiet.to}.` : 'Off: reminders can come at any hour.'}</Note>
    </Card>
  );
}

// Pick vessels, then share them one at a time: the share sheet takes one log, and import is one log at a time.
type Queue = { ids: string[]; i: number; results: { name: string; r: ExportResult }[] };
function BackupPicker({ rows, onExportVessel }: { rows: VesselRow[]; onExportVessel: (id: string) => Promise<ExportResult> }) {
  const f = useType();
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState<Queue | null>(null);
  const [busy, setBusy] = useState(false);
  const name = (id: string) => rows.find((r) => r.operationId === id)?.name ?? id;
  const all = rows.length > 0 && picked.length === rows.length;
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const advance = (cur: Queue, r: ExportResult | null) => setQ({ ...cur, i: cur.i + 1, results: r ? [...cur.results, { name: name(cur.ids[cur.i]), r }] : cur.results });
  const share = async (cur: Queue) => {
    setBusy(true);
    try { advance(cur, await onExportVessel(cur.ids[cur.i])); }
    catch (e) { advance(cur, { ok: false, text: `Not exported: ${(e as Error).message}` }); }
    finally { setBusy(false); }
  };

  if (q) {
    const done = q.i >= q.ids.length;
    return (
      <Card style={[u.pad, { gap: 10 }]}>
        {done ? <Body semi>Finished</Body> : <Body semi>Vessel {q.i + 1} of {q.ids.length}: {name(q.ids[q.i])}</Body>}
        {q.results.map((x, i) => <Body key={i} style={{ color: x.r.ok ? color.ink : color.rInk }}>{x.name}: {x.r.text}</Body>)}
        {!done && <Go label="Share this vessel" disabled={busy} onPress={() => share(q)} />}
        {!done && <Go ghost label="Skip this vessel" disabled={busy} onPress={() => advance(q, null)} />}
        <Go ghost label={done ? 'Done' : 'Stop'} disabled={busy} onPress={() => { setQ(null); setPicked([]); }} />
      </Card>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Go ghost label={all ? 'Clear selection' : 'Select all'} onPress={() => setPicked(all ? [] : rows.map((r) => r.operationId))} />
      {rows.map((r) => {
        const on = picked.includes(r.operationId);
        return (
          <Pressable key={r.operationId} onPress={() => toggle(r.operationId)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={r.name}
            style={({ pressed }) => [u.ghostBtn, { flexDirection: 'row', justifyContent: 'flex-start', gap: 12 }, on && { borderColor: color.ink, borderWidth: 2 }, pressed && u.pressed]}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 20, color: color.ink }}>{on ? '☑' : '☐'}</Text>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 16, color: color.ink, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.name}</Text>
            <Chip text={r.isTest ? 'TEST' : 'LIVE'} tone={r.isTest ? 'orange' : 'plain'} />
          </Pressable>
        );
      })}
      <Go label={picked.length ? `Back up ${picked.length} selected` : 'Pick vessels to back up'} disabled={!picked.length}
        onPress={() => setQ({ ids: rows.filter((r) => picked.includes(r.operationId)).map((r) => r.operationId), i: 0, results: [] })} />
      <InfoNote><Note>Each vessel opens its own share sheet, one after another. A vessel counts as backed up only if you use the share sheet.</Note></InfoNote>
    </View>
  );
}

// Delete is two taps (the second says so), beside Archive. Prototype-phase only (store.VESSEL_DELETE_ALLOWED).
function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  return <Go ghost label={sure ? 'Tap again to delete' : 'Delete'} onPress={() => { if (sure) { setSure(false); onDelete(); } else setSure(true); }} />;
}

function ArchiveList({ rows, currentId, onArchive, onDelete }: { rows: VesselRow[]; currentId: string; onArchive: (id: string, archived: boolean) => void; onDelete: (id: string) => void }) {
  const f = useType();
  const others = rows.filter((r) => r.operationId !== currentId);
  return (
    <View style={{ gap: 8 }}>
      {others.length === 0 && <Note>Only the open vessel is on this phone.</Note>}
      {others.map((r) => (
        <View key={r.operationId}>
          <Card style={[u.pad, { gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Chip text={r.isTest ? 'TEST' : 'LIVE'} tone={r.isTest ? 'orange' : 'plain'} />
              {r.archived && <Chip text="Archived" />}
            </View>
            <Text style={{ fontFamily: f.display, fontSize: 22, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Go ghost label={r.archived ? 'Unarchive' : 'Archive'} onPress={() => onArchive(r.operationId, !r.archived)} /></View>
              <View style={{ flex: 1 }}><DeleteButton onDelete={() => onDelete(r.operationId)} /></View>
            </View>
          </Card>
        </View>
      ))}
      <InfoNote><Note>Archive hides a vessel from the menu. Its record stays on the phone and can be unarchived here.</Note></InfoNote>
      <InfoNote><Note>Tap Delete twice to delete a vessel. A deleted vessel and its photos cannot be brought back, except from a saved copy. The open vessel can't be deleted. Deleting is on during the prototype phase only.</Note></InfoNote>
    </View>
  );
}
