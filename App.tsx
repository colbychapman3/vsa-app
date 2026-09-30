// App root: opens on-phone storage, opens the last vessel (the TEST Glovis demo on first run),
// keeps the latest engine state, and shows the four tabs. The header opens the vessel list.
// Every save goes through save(): entries → store.append (engine-checked) → new state.
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFonts as loadFonts } from 'expo-font';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { operationDate, type Baseline, type Reject, type VsaEvent } from './src/engine/index.ts';
import { openExpoDb, type Db } from './src/storage/db.ts';
import { exportLog, importLog, markExported, backupStatus } from './src/storage/backup.ts';
import { openStore, type State, type Store } from './src/storage/store.ts';
import { getNotes, lastOpened, listRows, setArchived, setLastOpened, setNote, type VesselRow } from './src/storage/vessels.ts';
import { buildReport, reportHtml, type ReportKind } from './src/app/report.ts';
import type { Built } from './src/app/setup.ts';
import { offsetFor, openDiscrepancyEvents, type Ctx } from './src/app/entries.ts';
import { badges, subtitles, type Banner } from './src/app/view.ts';
import { color, fontFiles, fonts, FontContext } from './src/app/theme.ts';
import { Header, LogButton, TabBar, type Tab } from './src/app/screens/Chrome.tsx';
import { Snapshot } from './src/app/screens/Snapshot.tsx';
import { LogSheet } from './src/app/screens/LogSheet.tsx';
import { Decks } from './src/app/screens/Decks.tsx';
import { DeckSheet } from './src/app/screens/DeckSheet.tsx';
import { Hourly } from './src/app/screens/Hourly.tsx';
import { MapScreen } from './src/app/screens/MapScreen.tsx';
import { Search } from './src/app/screens/Search.tsx';
import { Plan, type Backup, type Reports } from './src/app/screens/Plan.tsx';
import { Vessels } from './src/app/screens/Vessels.tsx';
import glovisJson from './docs/reference/glovis-condor-101-baseline.json';

const DEMO = 'TEST-GLOVIS-101';
const glovis = glovisJson as Baseline;

type Loaded = { id: string; baseline: Baseline; isTest: boolean; state: State };
export type SaveResult = { ok: true } | Reject;

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
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>('snap');
  const [nowMin, setNowMin] = useState(minutesNow);
  const [logOpen, setLogOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'vessels' | 'map' | 'search' | null>(null); // one modal at a time
  const [rows, setRows] = useState<VesselRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  // The break strip and "forecast passed" follow the clock: refresh every minute and
  // whenever the app comes back to the foreground.
  useEffect(() => {
    const t = setInterval(() => setNowMin(minutesNow()), 60_000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setNowMin(minutesNow()); });
    return () => { clearInterval(t); sub.remove(); };
  }, []);

  // Latest state for building events, so two quick taps never build from a stale state.
  const latest = useRef<State | null>(null);
  useEffect(() => { latest.current = vessel?.state ?? null; }, [vessel]);

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
    (async () => {
      try {
        dbRef.current = await openExpoDb();
        store.current = await openStore(dbRef.current);
        const all = await store.current.listVessels();
        if (!all.length) {
          const c = await store.current.createVessel({ operationId: DEMO, baseline: glovis, isTest: true });
          if (!c.ok) throw new Error(c.error);
        }
        const last = await lastOpened(dbRef.current);
        const id = (last && (await store.current.listVessels()).some((v) => v.operationId === last)) ? last : (await store.current.listVessels())[0].operationId;
        latestId.current = id;
        await openVessel(id);
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

  // Backup: the phone's log is the only official record. Export hands the JSON text to the iOS share
  // sheet (Save to Files, Messages, Notes...). It counts as exported only if the sheet reports it was used.
  const backup: Backup = {
    ...bk,
    onExport: async () => {
      const at = recordedNow();
      const r = await exportLog(store.current!, vessel!.id, at);
      if (!r.ok) return setNotice({ ok: false, text: `Not exported: ${r.error}` });
      try {
        const res = await Share.share({ title: r.fileName, message: r.text });
        if (res.action === Share.dismissedAction) return setNotice({ ok: true, text: 'Export cancelled. Nothing marked as backed up.' });
      } catch (e) {
        return setNotice({ ok: false, text: `Not exported: ${(e as Error).message}` });
      }
      await markExported(dbRef.current!, vessel!.id, at, r.count);
      setBk(await backupStatus(dbRef.current!, vessel!.id, r.count));
      setNotice({ ok: true, text: `Shared ${r.count} entries.` });
    },
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
    onReport: async (kind: ReportKind) => {
      try {
        const at = recordedNow();
        const rep = buildReport(kind, vessel!.state, vessel!.baseline, { isTest: vessel!.isTest, generatedAt: `${at.slice(0, 10)} ${at.slice(11, 16)}`, notes });
        const { uri } = await Print.printToFileAsync({ html: reportHtml(rep) });
        if (!(await Sharing.isAvailableAsync())) return setNotice({ ok: false, text: 'Sharing is not available on this device. The report was not sent.' });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${vessel!.baseline.vessel} ${rep.title}` });
        setNotice({ ok: true, text: `${rep.title} ready${rep.interim ? ' (INTERIM)' : ''}.` });
      } catch (e) {
        setNotice({ ok: false, text: `Report not created: ${(e as Error).message}` });
      }
    },
  };

  const openVessels = async () => {
    setNotice(null);
    try { setRows(await listRows(dbRef.current!, store.current!)); setSheet('vessels'); }
    catch (e) { setNotice({ ok: false, text: `Could not list vessels: ${(e as Error).message}` }); }
  };
  const switchTo = async (id: string) => {
    if (saving.current) return setNotice({ ok: false, text: 'Still saving the last entry. Try again.' });
    try { await openVessel(id); setSheet(null); setTab('snap'); setNotice(null); }
    catch (e) { setNotice({ ok: false, text: `Could not open the vessel: ${(e as Error).message}` }); setSheet(null); }
  };
  const create = async (b: Extract<Built, { ok: true }>, isTest: boolean): Promise<{ ok: true } | Reject> => {
    const c = await store.current!.createVessel({ operationId: b.operationId, baseline: b.baseline, isTest });
    if (!c.ok) return c;
    await switchTo(b.operationId);
    setNotice({ ok: true, text: `${b.baseline.vessel} created (${isTest ? 'TEST' : 'LIVE'}).` });
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
              <Header isTest={vessel.isTest} place={`${String(vessel.baseline.port)} discharge · Berth ${String(vessel.baseline.berth)}`}
                vessel={vessel.baseline.vessel} sub={subtitles(vessel.state, vessel.baseline)[tab]} onVessels={openVessels} onMap={() => { setNotice(null); setSheet('map'); }} onSearch={() => { setNotice(null); setSheet('search'); }} />
              {notice && (
                // Fixed under the header so a save message is never scrolled out of view.
                <View style={[s.notice, notice.ok ? s.ok : s.errBar]}>
                  <Text style={[s.noticeText, { color: notice.ok ? color.gInk : color.rInk }]}>{notice.text}</Text>
                  <Pressable onPress={() => setNotice(null)} style={s.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss message">
                    <Text style={{ fontSize: 18, color: color.ink }}>✕</Text>
                  </Pressable>
                </View>
              )}
              <ScrollView key={tab} contentContainerStyle={s.scroll}>{/* new tab starts at the top */}
                {tab === 'snap' && bk.unsaved > 0 && <Text style={[s.note, { paddingHorizontal: 20, paddingTop: 12 }]}>{bk.unsaved} {bk.unsaved === 1 ? 'entry' : 'entries'} not backed up. Export from Plan, Backup.</Text>}
                {tab === 'snap'
                  ? <Snapshot state={vessel.state} baseline={vessel.baseline} nowMin={nowMin} onOpenTab={openTab} onTrack={track} />
                  : tab === 'decks'
                    ? <Decks state={vessel.state} onOpenDeck={(id) => { setNotice(null); setDeckOpen(id); }} onOpenPlan={() => openTab('plan')} />
                    : tab === 'hourly'
                      ? <Hourly state={vessel.state} baseline={vessel.baseline} />
                      : <Plan state={vessel.state} baseline={vessel.baseline} isTest={vessel.isTest} save={save} backup={backup} reports={reports} onNotice={setNotice} />}
              </ScrollView>
              <LogButton onPress={() => { setNotice(null); setLogOpen(true); }} />
              {logOpen && (
                <LogSheet state={vessel.state} baseline={vessel.baseline} isTest={vessel.isTest} save={save}
                  onClose={(done) => { setLogOpen(false); if (done) setNotice({ ok: true, text: done }); }} />
              )}
              {deckOpen && (
                <DeckSheet state={vessel.state} baseline={vessel.baseline} isTest={vessel.isTest} deckId={deckOpen} save={save}
                  onClose={(done) => { setDeckOpen(null); if (done) setNotice({ ok: true, text: done }); }} />
              )}
              {sheet === 'vessels' && (
                <Vessels rows={rows} currentId={vessel.id} isTest={vessel.isTest} onClose={() => setSheet(null)} onOpen={switchTo} onCreate={create}
                  onArchive={async (id, a) => { try { await setArchived(dbRef.current!, id, a); setRows(await listRows(dbRef.current!, store.current!)); } catch (e) { setNotice({ ok: false, text: `Not archived: ${(e as Error).message}` }); } }} />
              )}
              {sheet === 'map' && <MapScreen onClose={() => setSheet(null)} />}
              {sheet === 'search' && <Search isTest={vessel.isTest} onClose={() => setSheet(null)} />}
              <TabBar tab={tab} onTab={openTab} badges={badges(vessel.state)} />
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
  dismiss: { minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  ok: { backgroundColor: color.gBg },
  errBar: { backgroundColor: color.rBg },
  err: { color: color.rInk, backgroundColor: color.rBg, padding: 12, borderRadius: 10 },
});
