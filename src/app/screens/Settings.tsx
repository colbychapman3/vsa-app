// Settings: app-wide items only. Per-vessel items (Backup of the open vessel, Reports, Labor, Break log) stay in Plan.
import { useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import type { VesselRow } from '../../storage/vessels.ts';
import { aiStatus, AI_STATUS_TEXT } from '../ai.ts';
import { makeQuiet, type Quiet } from '../assistant.ts';
import { REMINDER_STATUS_TEXT, type ReminderStatus } from '../reminders.ts';
import { APPEARANCES, color, useType, type AppearanceMode } from '../theme.ts';
import { Body, Card, Chip, ErrorBox, Field, Go, Note, SectionHead, Seg, Sheet, u } from './ui.tsx';

export type ExportResult = { ok: boolean; text: string };

const APPEARANCE_LABEL: Record<AppearanceMode, string> = { light: 'Light', night: 'Night', auto: 'Auto' };

export function Settings({ isTest, rows, currentId, appearance, onAppearance, reminders, remindersPaused, onPauseReminders, onEnableReminders, quiet, onQuiet, onArchive, onDelete, onExportVessel, onClose }: {
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
  return (
    <Sheet title="Settings" isTest={isTest} onClose={onClose}>
      <SectionHead title="Appearance" />
      <Seg<AppearanceMode> options={APPEARANCES.map((m) => ({ value: m, label: APPEARANCE_LABEL[m] }))} value={appearance} onChange={onAppearance} />
      <Note>Light is the sun-readable default. Night is for night shifts. Auto follows your iPhone.</Note>

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
      <Note>The app works fully without it.</Note>

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
      <Note>Each vessel opens its own share sheet, one after another. A vessel counts as backed up only if you use the share sheet.</Note>
    </View>
  );
}

const TRASH_W = 96;

// Swipe the row left and a trash can appears behind it; tapping the trash deletes. Only a clear, mostly horizontal drag
// moves the row (the sheet still scrolls up and down). Delete is a prototype-phase feature (store.VESSEL_DELETE_ALLOWED).
function SwipeToDelete({ label, onDelete, children }: { label: string; onDelete: () => void; children: ReactNode }) {
  const f = useType();
  const x = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const settle = (to: number) => { open.current = to !== 0; Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0 }).start(); };
  const from = () => (open.current ? -TRASH_W : 0);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > 2 * Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => x.setValue(Math.max(-TRASH_W, Math.min(0, from() + g.dx))),
    onPanResponderRelease: (_, g) => settle(from() + g.dx < -TRASH_W / 2 ? -TRASH_W : 0),
    onPanResponderTerminate: () => settle(from()),
  })).current;
  return (
    <View>
      <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, width: TRASH_W + 12 }, { opacity: x.interpolate({ inputRange: [-TRASH_W, -8, 0], outputRange: [1, 1, 0] }) }]}>
        <Pressable onPress={() => { settle(0); onDelete(); }} accessibilityRole="button" accessibilityLabel={`Delete ${label}. This cannot be undone.`}
          style={({ pressed }) => [{ flex: 1, backgroundColor: color.red, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingLeft: 12, minHeight: 56 }, pressed && u.pressed]}>
          <Text style={{ fontSize: 28 }}>🗑</Text>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.onRed }} numberOfLines={1} adjustsFontSizeToFit>Delete</Text>
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>{children}</Animated.View>
    </View>
  );
}

function ArchiveList({ rows, currentId, onArchive, onDelete }: { rows: VesselRow[]; currentId: string; onArchive: (id: string, archived: boolean) => void; onDelete: (id: string) => void }) {
  const f = useType();
  const others = rows.filter((r) => r.operationId !== currentId);
  return (
    <View style={{ gap: 8 }}>
      {others.length === 0 && <Note>Only the open vessel is on this phone.</Note>}
      {others.map((r) => (
        <SwipeToDelete key={r.operationId} label={r.name} onDelete={() => onDelete(r.operationId)}>
          <Card style={[u.pad, { gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Chip text={r.isTest ? 'TEST' : 'LIVE'} tone={r.isTest ? 'orange' : 'plain'} />
              {r.archived && <Chip text="Archived" />}
            </View>
            <Text style={{ fontFamily: f.display, fontSize: 22, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
              accessibilityActions={[{ name: 'delete', label: 'Delete this vessel' }]} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') onDelete(r.operationId); }}>{r.name}</Text>
            <Go ghost label={r.archived ? 'Unarchive' : 'Archive'} onPress={() => onArchive(r.operationId, !r.archived)} />
          </Card>
        </SwipeToDelete>
      ))}
      <Note>Archive hides a vessel from the menu. Its record stays on the phone and can be unarchived here.</Note>
      <Note>Swipe a vessel left and tap the trash can to delete it. A deleted vessel and its photos cannot be brought back, except from a saved copy. The open vessel can't be deleted. Deleting is on during the prototype phase only.</Note>
    </View>
  );
}
