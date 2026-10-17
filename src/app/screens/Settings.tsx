// Settings: app-wide items only. Per-vessel items (Backup of the open vessel, Reports, Labor, Break log) stay in Plan.
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Text } from './text.tsx';
import Constants from 'expo-constants';
import type { VesselRow } from '../../storage/vessels.ts';
import { aiStatus, AI_STATUS_TEXT } from '../ai.ts';
import { type ReminderKind, type ReminderSwitches } from '../assistant.ts';
import { REMINDER_STATUS_TEXT, type ReminderStatus } from '../reminders.ts';
import { APPEARANCES, appearanceLoaded, bcolor, color, sunPaletteLoaded, useType, type AppearanceMode } from '../theme.ts';
import { Body, Card, Chip, Go, Note, SectionHead, Seg, Sheet, u } from './ui.tsx';
import { CustomizeSnapshot } from './CustomizeSnapshot.tsx';
import type { Layout } from '../snapshotLayout.ts';

function SwitchRow({ label, note, value, onChange }: { label: string; note?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
      <View style={{ flex: 1, gap: 2 }}><Body semi>{label}</Body>{note && <Note>{note}</Note>}</View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export type ExportResult = { ok: boolean; text: string };

const NOTIFY_ROWS: { kind: ReminderKind; title: string; note: string }[] = [
  { kind: 'count', title: 'Count due', note: 'At 5 minutes past the hour, if that working hour still has no count logged. Once per missed hour; gone as soon as you log it.' },
  { kind: 'deck', title: 'Deck won’t make the cutoff', note: 'About an hour before a break’s clear-by, only if Plan already warns that a deck can’t clear in time at the current pace. A forecast, sent once.' },
  { kind: 'break', title: 'Break ending', note: 'Five minutes before the 1-hour break ends. Gone if you end the break early.' },
];

const APPEARANCE_LABEL: Record<AppearanceMode, string> = { light: 'Light', night: 'Night', auto: 'Auto' };

export function Settings({ isTest, rows, currentId, appearance, onAppearance, sun, onSun, keepPhotos, onKeepPhotos, reminders, notify, onNotify, onEnableReminders, onArchive, onDelete, onExportVessel, onClose, layout, onLayout }: {
  sun: boolean; onSun: (v: boolean) => void;
  keepPhotos: boolean; onKeepPhotos: (v: boolean) => void;
  layout: Layout; onLayout: (l: Layout) => void;
  isTest: boolean; rows: VesselRow[]; currentId: string;
  appearance: AppearanceMode; onAppearance: (m: AppearanceMode) => void;
  reminders: ReminderStatus; notify: ReminderSwitches; onNotify: (k: ReminderKind, on: boolean) => void; onEnableReminders: () => void;
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
      {/* Grouped rows with switches, one line each (Colby, 2026-10-12); every explanation sits under the row it belongs to. */}
      <SectionHead title="Look" />
      <Seg<AppearanceMode> options={APPEARANCES.map((m) => ({ value: m, label: APPEARANCE_LABEL[m] }))} value={appearance} onChange={onAppearance} />
      <Card><SwitchRow label="Extra visible (sun)" value={sun} onChange={onSun} /></Card>
      <Note>Light is the sun-readable default; Auto follows your iPhone. Extra visible: black text, bold outlines, larger labels.</Note>
      {(sun !== sunPaletteLoaded || (appearanceLoaded !== null && appearance !== appearanceLoaded)) && <Note>The new colors show after you close VSA and open it again.</Note>}
      <Go ghost label="Customize Snapshot ›" onPress={() => setCustomize(true)} />

      <SectionHead title="Reminders" />
      <Body>{REMINDER_STATUS_TEXT[reminders]}</Body>
      {reminders === 'ask' && <Go label="Allow notifications" onPress={onEnableReminders} />}
      {(reminders === 'on' || reminders === 'ask') && (
        <Card>{NOTIFY_ROWS.map((r) => <SwitchRow key={r.kind} label={r.title} note={r.note} value={notify[r.kind]} onChange={(v) => onNotify(r.kind, v)} />)}</Card>
      )}

      <SectionHead title="Paperwork" />
      <Card><SwitchRow label="Keep game plan photos on this phone" note="Only pages read after you turn it on. Not in the exported log." value={keepPhotos} onChange={onKeepPhotos} /></Card>

      <SectionHead title="Vessels" />
      <BackupPicker rows={rows} onExportVessel={onExportVessel} />
      <ArchiveList rows={rows} currentId={currentId} onArchive={onArchive} onDelete={onDelete} />

      <SectionHead title="About" />
      <Card><View style={[u.kv, { padding: 14 }]}><Body>On-device AI</Body><Body semi>{AI_STATUS_TEXT[ai]}</Body></View></Card>
      <Body>Version {version} · Build {build}</Body>
    </Sheet>
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
            style={({ pressed }) => [u.segBtn, { flexDirection: 'row', justifyContent: 'flex-start', gap: 12 }, on && { borderColor: bcolor.ink, borderWidth: 2 }, pressed && u.pressed]}>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 22, color: color.ink }}>{on ? '☑' : '☐'}</Text>
            <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.ink, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{r.name}</Text>
            <Chip text={r.isTest ? 'TEST' : 'LIVE'} tone={r.isTest ? 'orange' : 'plain'} />
          </Pressable>
        );
      })}
      <Go label={picked.length ? `Back up ${picked.length} selected` : 'Pick vessels to back up'} disabled={!picked.length}
        onPress={() => setQ({ ids: rows.filter((r) => picked.includes(r.operationId)).map((r) => r.operationId), i: 0, results: [] })} />
      <Note>Each vessel opens its own share sheet. It counts as backed up only if you use it.</Note>
    </View>
  );
}

// Delete is two taps (the second says so), beside Archive. Permanent feature (Colby, 2026-10-12; store.VESSEL_DELETE_ALLOWED).
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
      <Note>Archive hides a vessel from the menu; unarchive it here. Delete (two taps) is permanent except from a saved copy; the open vessel can't be deleted, and a LIVE vessel needs a saved copy first.</Note>
    </View>
  );
}
