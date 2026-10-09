// App root: opens on-phone storage, opens the last vessel (the TEST Glovis demo on first run),
// keeps the latest engine state, and shows the four tabs. The header menu opens the sidebar (vessels, settings).
// Every save goes through save(): entries → store.append (engine-checked) → new state.
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFonts as loadFonts } from 'expo-font';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, AppState, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { operationDate, type Baseline, type Reject, type VsaEvent } from './src/engine/index.ts';
import { openExpoDb, type Db } from './src/storage/db.ts';
import { exportLog, importLog, markExported, backupStatus } from './src/storage/backup.ts';
import { openStore, type State, type Store } from './src/storage/store.ts';
import { dropVesselPhotos } from './src/app/evidenceFiles.ts';
import { deleteVessel, getNotes, lastOpened, listRows, setArchived, setLastOpened, setNote, type VesselRow } from './src/storage/vessels.ts';
import { getPref, setPref } from './src/storage/prefs.ts';
import { buildReport, reportHtml, type ReportKind } from './src/app/report.ts';
import { buildEvidenceReport, evidenceReportHtml, reportPhotos, type EvidenceReportKind } from './src/app/evidenceReport.ts';
import { reducedPhotoData } from './src/app/evidencePhotos.ts';
import type { Built } from './src/app/setup.ts';
import { addNoteEvents, offsetFor, openDiscrepancyEvents, type Ctx } from './src/app/entries.ts';
import { badges, offerCopy, openFirst, unsavedNote, type Banner } from './src/app/view.ts';
import { applyAppearance, asAppearance, color, fontFiles, fonts, FontContext, type AppearanceMode } from './src/app/theme.ts';
import { AskButton, Header, LogButton, TabBar, type Tab } from './src/app/screens/Chrome.tsx';
import { Snapshot } from './src/app/screens/Snapshot.tsx';
import { Boxes } from './src/app/screens/SnapshotBoxes.tsx';
import { EtaHistory } from './src/app/screens/EtaHistory.tsx';
import { CompleteSheet } from './src/app/screens/CompleteSheet.tsx';
import { completionDue, completionStale, clockOf } from './src/app/complete.ts';
import { defaultLayout, layoutText, parseLayout, type Layout } from './src/app/snapshotLayout.ts';
import { anySheetOpen, Go } from './src/app/screens/ui.tsx';
import { LogSheet, type HourPrefill } from './src/app/screens/LogSheet.tsx';
import { Ask } from './src/app/screens/Ask.tsx';
import { quietFromText, quietToText, reminderPlan, type Quiet } from './src/app/assistant.ts';
import { enableReminders, installHandlers, reminderStatus, syncReminders, type ReminderStatus } from './src/app/reminders.ts';
import { Decks } from './src/app/screens/Decks.tsx';
import { DeckSheet } from './src/app/screens/DeckSheet.tsx';
import { Hourly } from './src/app/screens/Hourly.tsx';
import { MapScreen } from './src/app/screens/MapScreen.tsx';
import { Search } from './src/app/screens/Search.tsx';
import { Plan, type Backup, type Reports } from './src/app/screens/Plan.tsx';
import { Vessels } from './src/app/screens/Vessels.tsx';
import { Sidebar } from './src/app/screens/Sidebar.tsx';
import { Settings } from './src/app/screens/Settings.tsx';
import glovisJson from './docs/reference/glovis-condor-101-baseline.json';

const DEMO = 'TEST-GLOVIS-101';
const glovis = glovisJson as Baseline;

type Loaded = { id: string; baseline: Baseline; isTest: boolean; state: State };
export type SaveResult = { ok: true } | Reject;
type Notice = { ok: boolean; text: string; action?: { label: string; onPress: () => void } }; // action: one tap to do what the message offers

const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// Phone clock as ISO with offset: processing time only (recorded_at), never an event time.
function recordedNow(): string {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${offsetFor(d)}`;
}

export default function App() {
  const [fontsLoaded, fontError] = loadFonts(fontFiles);
  const store = useRef<Store | null>(null);
  const dbRef = useRef<Db | null>(null);
  const [bk, setBk] = useState<{ lastAt: string | null; unsaved: number }>({ lastAt: null, unsaved: 0 });
  const saving = useRef(false);
  const [vessel, setVessel] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tab, setTab] = useState<Tab>('snap');
  const [nowMin, setNowMin] = useState(minutesNow);
  const [logOpen, setLogOpen] = useState(false);
  const [prefill, setPrefill] = useState<HourPrefill | undefined>(undefined); // an hourly count typed in Ask, shown in the Log form
  const [drawer, setDrawer] = useState(false); // the left-side menu (an overlay, not a modal)
  const [appearance, setAppearance] = useState<AppearanceMode>('light');
  const [layout, setLayout] = useState<Layout>(defaultLayout()); // which Snapshot boxes show where (a per-phone preference)
  const [remindersPaused, setRemindersPaused] = useState(false);
  const [quiet, setQuiet] = useState<Quiet | null>(null);
  const [remind, setRemind] = useState<ReminderStatus>('ask');
  const [fg, setFg] = useState(0); // bumps when the app returns to the foreground, to re-plan reminders
  const [deckOpen, setDeckOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'new' | 'settings' | 'map' | 'search' | 'ask' | 'eta' | 'complete' | null>(null); // one modal at a time
  const [rows, setRows] = useState<VesselRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Remaining reaches exactly 0: ask once per vessel "Is the vessel complete?" (never marks it by itself). Asks again only after
  // remaining leaves 0 and comes back (a reopen at 0 does not re-ask). Waits 450 ms for a closing sheet to slide away, and until no
  // sheet anywhere is open (a tab's own sheets included), so two modals never stack.
  const askedFor = useRef(new Set<string>());
  const openAny = logOpen || deckOpen != null || sheet != null || drawer;
  useEffect(() => {
    const st = vessel?.state, id = vessel?.id;
    if (!st || !id) return;
    if (st.vesselRemaining !== 0) { askedFor.current.delete(id); return; }
    if (!completionDue(st) || askedFor.current.has(id) || openAny) return;
    let t: ReturnType<typeof setTimeout>;
    const tryOpen = () => {
      if (anySheetOpen()) { t = setTimeout(tryOpen, 1000); return; }
      askedFor.current.add(id); setNotice(null); setSheet('complete');
    };
    t = setTimeout(tryOpen, 450);
    return () => clearTimeout(t);
  }, [vessel, openAny]);

  // The break strip and "forecast passed" follow the clock: refresh every minute and
  // whenever the app comes back to the foreground.
  useEffect(() => {
    const t = setInterval(() => setNowMin(minutesNow()), 60_000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { setNowMin(minutesNow()); setFg((n) => n + 1); } });
    return () => { clearInterval(t); sub.remove(); };
  }, []);

  // Latest state for building events, so two quick taps never build from a stale state.
  const latest = useRef<State | null>(null);
  useEffect(() => { latest.current = vessel?.state ?? null; }, [vessel]);

  // Plan reminders: notifications tapped open Plan; the schedule is replaced whenever the vessel's state changes or the app returns.
  const openPlan = useRef<() => void>(() => {});
  useEffect(() => { openPlan.current = () => { setDrawer(false); setSheet(null); setLogOpen(false); setDeckOpen(null); setTab('plan'); }; });
  useEffect(() => { void reminderStatus().then(setRemind); return installHandlers(() => openPlan.current()); }, []);
  useEffect(() => {
    if (!vessel) { void syncReminders(null); return; } // no open vessel: no reminders
    void syncReminders(remind === 'on' && !remindersPaused ? reminderPlan(vessel.state, vessel.baseline, minutesNow(), vessel.isTest, 20, quiet) : null);
  }, [vessel, remind, fg, remindersPaused, quiet]);

  // Load a vessel from its stored log and make it the open one. Nothing from another vessel stays in memory.
  const openVessel = useCallback(async (id: string) => {
    const r = await store.current!.load(id);
    if (!r.ok) throw new Error(r.error);
    if (!r.state.ok) throw new Error(`Stored log refused by the engine: ${r.state.error}`);
    latestId.current = id;
    latest.current = r.state;
    setVessel({ id, baseline: r.baseline, isTest: r.vessel.isTest, state: r.state });
    setBk(await backupStatus(dbRef.current!, id, r.events.length));
    setNotes(await getNotes(dbRef.current!, id));
    await setLastOpened(dbRef.current!, id);
  }, []);
  const reload = useCallback(async () => { await openVessel(latestId.current!); }, [openVessel]);
  const latestId = useRef<string | null>(null);
  useEffect(() => { latestId.current = vessel?.id ?? null; }, [vessel]);

  useEffect(() => {
    void (async () => {
      try {
        dbRef.current = await openExpoDb();
        store.current = await openStore(dbRef.current); // creates the settings table on a new install
        // Preferences before the vessel opens, so a Night user never sees a light flash; a bad pref falls back to defaults.
        try {
          const mode = asAppearance(await getPref(dbRef.current, 'appearance'));
          applyAppearance(mode); setAppearance(mode);
          setRemindersPaused((await getPref(dbRef.current, 'remindersPaused')) === '1');
          setQuiet(quietFromText(await getPref(dbRef.current, 'quiet')));
          setLayout(parseLayout(await getPref(dbRef.current, 'snapshotLayout')));
        } catch { applyAppearance('light'); /* defaults: Light, reminders on, no quiet hours */ }
        const all = await store.current.listVessels();
        if (!all.length) {
          const c = await store.current.createVessel({ operationId: DEMO, baseline: glovis, isTest: true });
          if (!c.ok) throw new Error(c.error);
        }
        // One vessel that cannot open never locks the app: try the last one, then the others, and say which failed.
        const ids = (await store.current.listVessels()).map((v) => v.operationId);
        const r = await openFirst(ids, await lastOpened(dbRef.current), openVessel);
        if (!r.opened) throw new Error(r.failed.map((x) => `${x.id}: ${x.error}`).join(' | ') || 'No vessel could be opened.');
        if (r.failed.length) setNotice({ ok: false, text: `${r.failed.map((x) => `${x.id} could not open (${x.error})`).join('; ')}. Opened ${r.opened} instead; the menu lists the problem.` });
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [openVessel]);

  // Context for building events. The UTC offset is fixed per operation (its Day 1 at noon),
  // so an hour re-entered later is recognised as the same hour.
  const ctx = useCallback((): Ctx | null => {
    if (!vessel) return null;
    const opDate = operationDate(vessel.baseline)!;
    return { operationId: vessel.id, opDate, offset: offsetFor(new Date(`${opDate}T12:00:00`)), recordedAt: recordedNow(), state: latest.current ?? vessel.state };
  }, [vessel]);

  // One save at a time; nothing is written unless the engine accepts the whole batch.
  const save = useCallback(async (build: (c: Ctx) => VsaEvent[] | Reject): Promise<SaveResult> => {
    const c = ctx();
    if (!c || !store.current) return { ok: false, error: 'The vessel is still loading.' };
    if (saving.current) return { ok: false, error: 'Still saving the last entry. Try again.' };
    saving.current = true;
    try {
      const evs = build(c);
      if (!Array.isArray(evs)) return evs;
      const r = await store.current.append(c.operationId, evs);
      if (!r.ok) return r;
      if (latestId.current !== c.operationId) return { ok: true }; // vessel switched while saving: the write is on the right vessel; the switch reloads its state
      latest.current = r.state;
      setBk(await backupStatus(dbRef.current!, c.operationId, r.state.log.events.length));
      setVessel((v) => (v ? { ...v, state: r.state } : v));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Could not write to the phone: ${(e as Error).message}` };
    } finally {
      saving.current = false;
    }
  }, [ctx]);

  const openTab = useCallback((t: Tab) => { setNotice(null); setTab(t); }, []);

  // Read save/error messages aloud for VoiceOver (a role alone doesn't announce on iOS).
  useEffect(() => { if (notice) AccessibilityInfo.announceForAccessibility(notice.text); }, [notice]);

  const track = useCallback(async (b: Banner) => {
    const r = await save((c) => openDiscrepancyEvents(c, `${b.title}. ${b.sub}`, null, b.title));
    setNotice(r.ok ? { ok: true, text: 'Added to open discrepancies.' } : { ok: false, text: `Not saved: ${r.error}` });
  }, [save]);

  // One vessel's log to the iOS share sheet; it counts as backed up only if the sheet was used.
  const exportVessel = async (id: string): Promise<{ ok: boolean; text: string }> => {
    const at = recordedNow();
    const r = await exportLog(store.current!, id, at);
    if (!r.ok) return { ok: false, text: `Not exported: ${r.error}` };
    try {
      const res = await Share.share({ title: r.fileName, message: r.text });
      if (res.action === Share.dismissedAction) return { ok: true, text: 'Export cancelled. Nothing marked as backed up.' };
    } catch (e) {
      return { ok: false, text: `Not exported: ${(e as Error).message}` };
    }
    await markExported(dbRef.current!, id, at, r.count);
    if (id === vessel?.id) setBk(await backupStatus(dbRef.current!, id, r.count));
    return { ok: true, text: `Shared ${r.count} entries.` };
  };

  // Backup: the phone's log is the only official record. Export hands the JSON text to the iOS share
  // sheet (Save to Files, Messages, Notes...). It counts as exported only if the sheet reports it was used.
  const backup: Backup = {
    ...bk,
    onExport: async () => setNotice(await exportVessel(vessel!.id)),
    onImport: async (text) => {
      const r = await importLog(store.current!, text);
      if (!r.ok) return r;
      if (r.kind !== 'current') await markExported(dbRef.current!, r.operationId, r.exportedAt, r.total); // those entries are in the file
      await reload();
      const msg = r.kind === 'current' ? `${r.operationId} is already up to date. Nothing changed.`
        : `${r.operationId}: ${r.added} ${r.added === 1 ? 'entry' : 'entries'} added (${r.kind === 'created' ? 'new vessel' : 'existing vessel kept'}).`;
      return { ok: true as const, text: r.operationId === vessel!.id ? msg : `${msg} Open it from Vessels.` };
    },
  };

  // Reports: built from the engine state, printed to PDF on the phone, handed to the share sheet. Works offline.
  const reports: Reports = {
    notes,
    onNote: async (section, text) => { await setNote(dbRef.current!, vessel!.id, section, text); setNotes(await getNotes(dbRef.current!, vessel!.id)); },
    // Photo reports embed a reduced copy of each photo (PDF only); the stored originals stay full size.
    onEvidenceReport: async (kind: EvidenceReportKind) => {
      try {
        const at = recordedNow();
        const rep = buildEvidenceReport(kind, vessel!.state, vessel!.baseline, { isTest: vessel!.isTest, generatedAt: `${at.slice(0, 10)} ${at.slice(11, 16)}` });
        const data = new Map<string, string | null>();
        for (const p of reportPhotos(rep)) data.set(p, await reducedPhotoData(p));
        const { uri } = await Print.printToFileAsync({ html: evidenceReportHtml(rep, (p) => data.get(p) ?? null) });
        if (!(await Sharing.isAvailableAsync())) return setNotice({ ok: false, text: 'Sharing is not available on this device. The report was not sent.' });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${vessel!.baseline.vessel} ${rep.title}` });
        setNotice({ ok: true, text: `${rep.title} ready${rep.interim ? ' (INTERIM)' : ''}.` });
      } catch (e) {
        setNotice({ ok: false, text: `Report not created: ${(e as Error).message}` });
      }
    },
    onReport: async (kind: ReportKind) => {
      try {
        const at = recordedNow();
        const rep = buildReport(kind, vessel!.state, vessel!.baseline, { isTest: vessel!.isTest, generatedAt: `${at.slice(0, 10)} ${at.slice(11, 16)}`, notes });
        const { uri } = await Print.printToFileAsync({ html: reportHtml(rep) });
        if (!(await Sharing.isAvailableAsync())) return setNotice({ ok: false, text: 'Sharing is not available on this device. The report was not sent.' });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${vessel!.baseline.vessel} ${rep.title}` });
        const ready = `${rep.title} ready${rep.interim ? ' (INTERIM)' : ''}.`;
        // A report is a natural checkpoint: if entries are not in a saved copy, offer one (never blocks, dismiss to skip).
        const id = vessel!.id;
        setNotice(offerCopy(bk.unsaved, vessel!.isTest)
          ? { ok: true, text: `${ready} ${unsavedNote(bk.unsaved, bk.lastAt) ?? ''}`.trim(), action: { label: 'Save a copy', onPress: () => { void exportVessel(id).then(setNotice); } } }
          : { ok: true, text: ready });
      } catch (e) {
        setNotice({ ok: false, text: `Report not created: ${(e as Error).message}` });
      }
    },
  };

  const openMenu = async () => {
    setNotice(null);
    try { setRows(await listRows(dbRef.current!, store.current!)); setDrawer(true); }
    catch (e) { setNotice({ ok: false, text: `Could not list vessels: ${(e as Error).message}` }); }
  };
  // Archiving hides a vessel but keeps its record on this phone; a copy is what survives a lost phone.
  const offerCopyOnArchive = async (id: string) => {
    try {
      const r = await store.current!.load(id);
      if (!r.ok) return;
      const b = await backupStatus(dbRef.current!, id, r.events.length);
      if (!offerCopy(b.unsaved, r.vessel.isTest)) return;
      Alert.alert('Save a copy?', `${unsavedNote(b.unsaved, b.lastAt)} A copy keeps this record if the phone is lost.`,
        [{ text: 'Not now', style: 'cancel' }, { text: 'Save a copy', onPress: () => { void exportVessel(id).then(setNotice); } }]);
    } catch { /* a failed lookup never blocks archiving */ }
  };
  // Delete a vessel for good (prototype phase). Never the open vessel; a LIVE vessel needs a current copy first.
  const deleteOne = async (id: string) => {
    if (id === vessel?.id) { setNotice({ ok: false, text: 'The open vessel cannot be deleted. Open another vessel first.' }); return; }
    try {
      const name = rows.find((r) => r.operationId === id)?.name ?? id;
      const r = await deleteVessel(dbRef.current!, store.current!, id);
      if (!r.ok) { setNotice({ ok: false, text: r.error }); return; }
      dropVesselPhotos(id);
      await refreshRows();
      setNotice({ ok: true, text: `Deleted ${name} (${r.events} event${r.events === 1 ? '' : 's'}) and its photos.` });
    } catch (e) { setNotice({ ok: false, text: `Not deleted: ${(e as Error).message}` }); }
  };
  const refreshRows = async () => { try { setRows(await listRows(dbRef.current!, store.current!)); } catch (e) { setNotice({ ok: false, text: `Could not list vessels: ${(e as Error).message}` }); } };
  const setPrefSafe = async (k: string, v: string) => { try { await setPref(dbRef.current!, k, v); } catch (e) { setNotice({ ok: false, text: `Setting not saved: ${(e as Error).message}` }); } };
  const changeLayout = (l: Layout) => { setLayout(l); void setPrefSafe('snapshotLayout', layoutText(l)); };
  const switchTo = async (id: string) => {
    if (saving.current) return setNotice({ ok: false, text: 'Still saving the last entry. Try again.' });
    try { await openVessel(id); setDrawer(false); setSheet(null); setTab('snap'); setNotice(null); }
    catch (e) { setNotice({ ok: false, text: `Could not open the vessel: ${(e as Error).message}` }); setDrawer(false); setSheet(null); }
  };
  // Paperwork lines Colby ticked at Review become Plan notes (source photo-read), written before the vessel opens.
  // If a note fails, the vessel is still created and the message says how many notes did not save.
  const create = async (b: Extract<Built, { ok: true }>, isTest: boolean, notes: string[]): Promise<{ ok: true } | Reject> => {
    const c = await store.current!.createVessel({ operationId: b.operationId, baseline: b.baseline, isTest });
    if (!c.ok) return c;
    let failed: string | null = null;
    let saved = 0;
    try {
      const opDate = operationDate(b.baseline)!;
      let state = (await store.current!.load(b.operationId) as { state: State }).state;
      for (const text of notes) {
        const evs = addNoteEvents({ operationId: b.operationId, opDate, offset: offsetFor(new Date(`${opDate}T12:00:00`)), recordedAt: recordedNow(), state }, { text, source: 'photo-read' });
        if (!Array.isArray(evs)) { failed = evs.error; break; }
        const r = await store.current!.append(b.operationId, evs);
        if (!r.ok) { failed = r.error; break; }
        state = r.state; saved++;
      }
    } catch (e) { failed = (e as Error).message; }
    await switchTo(b.operationId);
    const made = `${b.baseline.vessel} created (${isTest ? 'TEST' : 'LIVE'})`;
    setNotice(failed
      ? { ok: false, text: `${made}, but ${notes.length - saved} of ${notes.length} notes did not save: ${failed.replace(/\.?$/, '.')} Add them in Plan.` }
      : { ok: true, text: `${made}${saved ? `, ${saved} note${saved === 1 ? '' : 's'} added to Plan` : ''}.` });
    return { ok: true };
  };

  // Fonts: wait for them, but never block the app if they fail.
  if (!fontsLoaded && !fontError) return <View style={s.page} />;

  return (
    <SafeAreaProvider>
      <FontContext.Provider value={fonts(fontsLoaded)}>
        <View style={s.page}>
          {vessel ? (
            <>
              <Header isTest={vessel.isTest} berth={String(vessel.baseline.berth ?? '')} date={String(vessel.baseline.date)} vessel={vessel.baseline.vessel} onMenu={openMenu} onMap={() => { setNotice(null); setSheet('map'); }} onSearch={() => { setNotice(null); setSheet('search'); }} />
              {notice && (
                // Fixed under the header so a save message is never scrolled out of view.
                <View style={[s.notice, notice.ok ? s.ok : s.errBar]}>
                  <Text style={[s.noticeText, { color: notice.ok ? color.gInk : color.rInk }]}>{notice.text}</Text>
                  {notice.action && (
                    <Pressable onPress={() => { const a = notice.action!; setNotice(null); a.onPress(); }} style={({ pressed }) => [s.noticeAction, pressed && { opacity: 0.6 }]} accessibilityRole="button">
                      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 15, fontWeight: '700', color: color.ink }}>{notice.action.label}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setNotice(null)} style={s.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss message">
                    <Text style={{ fontSize: 18, color: color.ink }}>✕</Text>
                  </Pressable>
                </View>
              )}
              <ScrollView key={tab} contentContainerStyle={s.scroll}>{/* new tab starts at the top */}
                {tab === 'snap' && bk.unsaved > 0 && (
                  <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
                    <Text style={s.note}>{unsavedNote(bk.unsaved, bk.lastAt)}</Text>
                    <Go ghost label="Save a copy now" onPress={() => { void backup.onExport(); }} />
                  </View>
                )}
                {tab === 'snap' && (
                  <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                    {vessel.state.completed && !completionStale(vessel.state)
                      ? <Pressable onPress={() => setSheet('complete')} accessibilityRole="button" style={({ pressed }) => [s.doneBar, pressed && { opacity: 0.6 }]}>
                          <Text style={[s.noticeText, { color: color.gInk }]}>Vessel complete{clockOf(vessel.state.completed.time) ? ` at ${clockOf(vessel.state.completed.time)}` : ''}{vessel.state.completed.override ? ' · with open items' : ''} · tap to reopen</Text>
                        </Pressable>
                      : <Go ghost label={vessel.state.completed ? 'Marked complete, but remaining is not 0: review' : 'Mark vessel complete'} onPress={() => setSheet('complete')} />}
                  </View>
                )}
                {tab === 'snap'
                  ? <Snapshot state={vessel.state} baseline={vessel.baseline} nowMin={nowMin} onOpenTab={openTab} onTrack={track} isTest={vessel.isTest} save={save} onNotice={setNotice}
                      layout={layout} onLayout={changeLayout} onHistory={() => { setNotice(null); setSheet('eta'); }} />
                  : <>
                    {/* Snapshot boxes Colby moved to this tab sit at its top. */}
                    <Boxes tab={tab} layout={layout} onLayout={changeLayout} state={vessel.state} baseline={vessel.baseline} nowMin={nowMin} isTest={vessel.isTest} save={save} onNotice={setNotice}
                      onOpenTab={openTab} onHistory={() => { setNotice(null); setSheet('eta'); }} />
                    {tab === 'decks'
                    ? <Decks state={vessel.state} onOpenDeck={(id) => { setNotice(null); setDeckOpen(id); }} onOpenPlan={() => openTab('plan')} />
                    : tab === 'hourly'
                      ? <Hourly state={vessel.state} baseline={vessel.baseline} />
                      : <Plan state={vessel.state} baseline={vessel.baseline} isTest={vessel.isTest} save={save} backup={backup} reports={reports} onNotice={setNotice} />}
                  </>}
              </ScrollView>
              <LogButton onPress={() => { setNotice(null); setPrefill(undefined); setLogOpen(true); }} />
              <AskButton onPress={() => { setNotice(null); setSheet('ask'); }} />
              {logOpen && (
                <LogSheet state={vessel.state} baseline={vessel.baseline} isTest={vessel.isTest} save={save} prefill={prefill}
                  onClose={(done) => { setLogOpen(false); if (done) setNotice({ ok: true, text: done }); }} />
              )}
              {deckOpen && (
                <DeckSheet state={vessel.state} baseline={vessel.baseline} isTest={vessel.isTest} deckId={deckOpen} save={save}
                  onClose={(done) => { setDeckOpen(null); if (done) setNotice({ ok: true, text: done }); }} />
              )}
              {sheet === 'new' && <Vessels onClose={() => setSheet(null)} onCreate={create} />}
              {sheet === 'complete' && <CompleteSheet state={vessel.state} isTest={vessel.isTest} save={save} onClose={(done) => { setSheet(null); if (done) setNotice({ ok: true, text: done }); }} onGo={openTab} />}
              {sheet === 'eta' && <EtaHistory state={vessel.state} baseline={vessel.baseline} nowMin={nowMin} isTest={vessel.isTest} onClose={() => setSheet(null)} />}
              {sheet === 'settings' && (
                <Settings isTest={vessel.isTest} rows={rows} currentId={vessel.id} onClose={() => setSheet(null)} layout={layout} onLayout={changeLayout}
                  appearance={appearance} onAppearance={(m) => { setAppearance(m); applyAppearance(m); void setPrefSafe('appearance', m); }}
                  reminders={remind} remindersPaused={remindersPaused} onPauseReminders={(p) => { setRemindersPaused(p); void setPrefSafe('remindersPaused', p ? '1' : '0'); }}
                  onEnableReminders={async () => setRemind(await enableReminders())}
                  quiet={quiet} onQuiet={(q) => { setQuiet(q); void setPrefSafe('quiet', q ? quietToText(q) : ''); }}
                  onArchive={async (id, a) => { try { await setArchived(dbRef.current!, id, a); await refreshRows(); if (a) void offerCopyOnArchive(id); } catch (e) { setNotice({ ok: false, text: `Not archived: ${(e as Error).message}` }); } }}
                  onDelete={deleteOne}
                  onExportVessel={exportVessel} />
              )}
              {sheet === 'ask' && (
                <Ask state={vessel.state} baseline={vessel.baseline} nowMin={nowMin} isTest={vessel.isTest} save={save} reminders={remind}
                  onEnableReminders={async () => setRemind(await enableReminders())}
                  onShow={(w) => openTab(w)} onLog={(p) => { setPrefill(p); setTimeout(() => setLogOpen(true), 450); }} onNewVessel={() => setTimeout(() => { setNotice(null); setSheet('new'); }, 450)}
                  onClose={(done) => { setSheet(null); if (done) setNotice({ ok: true, text: done }); }} />
              )}
              {sheet === 'map' && <MapScreen onClose={() => setSheet(null)} />}
              {sheet === 'search' && <Search isTest={vessel.isTest} onClose={() => setSheet(null)} />}
              <TabBar tab={tab} onTab={openTab} badges={badges(vessel.state)} />
              {drawer && <Sidebar rows={rows} currentId={vessel.id} onClose={() => setDrawer(false)} onOpen={switchTo} onNew={() => { setDrawer(false); setSheet('new'); }} onSettings={() => { setDrawer(false); setSheet('settings'); }} />}
            </>
          ) : (
            <View style={s.pad}>
              <Text style={[s.note, error ? s.err : null]}>{error ? `Could not open the vessel: ${error}` : 'Loading vessel…'}</Text>
            </View>
          )}
          <StatusBar style="light" />
        </View>
      </FontContext.Provider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg },
  scroll: { paddingBottom: 180 },
  pad: { padding: 20 },
  note: { fontSize: 15, color: color.muted },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20, borderBottomWidth: 1, borderBottomColor: color.line },
  noticeText: { flex: 1, fontSize: 15, paddingVertical: 10 },
  noticeAction: { minHeight: 56, minWidth: 88, maxWidth: 130, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.ink, borderRadius: 10 },
  dismiss: { minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  ok: { backgroundColor: color.gBg },
  doneBar: { backgroundColor: color.gBg, borderColor: color.green, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 56, justifyContent: 'center' },
  errBar: { backgroundColor: color.rBg },
  err: { color: color.rInk, backgroundColor: color.rBg, padding: 12, borderRadius: 10 },
});
