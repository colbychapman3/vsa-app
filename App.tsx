// App root: opens on-phone storage, loads the TEST Glovis vessel (Phase 5 adds
// real vessels), keeps the latest engine state, and shows the four tabs.
// Every save goes through save(): entries → store.append (engine-checked) → new state.
import { StatusBar } from 'expo-status-bar';
import { useFonts as loadFonts } from 'expo-font';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { operationDate, type Baseline, type Reject, type VsaEvent } from './src/engine/index.ts';
import { openExpoDb, type Db } from './src/storage/db.ts';
import { exportLog, importLog, markExported, backupStatus } from './src/storage/backup.ts';
import { openStore, type State, type Store } from './src/storage/store.ts';
import { offsetFor, openDiscrepancyEvents, type Ctx } from './src/app/entries.ts';
import { badges, subtitles, type Banner } from './src/app/view.ts';
import { color, fontFiles, fonts, FontContext } from './src/app/theme.ts';
import { Header, LogButton, TabBar, type Tab } from './src/app/screens/Chrome.tsx';
import { Snapshot } from './src/app/screens/Snapshot.tsx';
import { LogSheet } from './src/app/screens/LogSheet.tsx';
import { Decks } from './src/app/screens/Decks.tsx';
import { DeckSheet } from './src/app/screens/DeckSheet.tsx';
import { Hourly } from './src/app/screens/Hourly.tsx';
import { Plan, type Backup } from './src/app/screens/Plan.tsx';
import glovisJson from './docs/reference/glovis-condor-101-baseline.json';

const OP = 'TEST-GLOVIS-101';
const glovis = glovisJson as Baseline;

type Loaded = { baseline: Baseline; isTest: boolean; state: State };
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

  const reload = useCallback(async () => {
    const r = await store.current!.load(OP);
    if (!r.ok) throw new Error(r.error);
    if (!r.state.ok) throw new Error(`Stored log refused by the engine: ${r.state.error}`);
    setVessel({ baseline: r.baseline, isTest: r.vessel.isTest, state: r.state });
    setBk(await backupStatus(dbRef.current!, OP, r.events.length));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        dbRef.current = await openExpoDb();
        store.current = await openStore(dbRef.current);
        if (!(await store.current.listVessels()).some((v) => v.operationId === OP)) {
          const c = await store.current.createVessel({ operationId: OP, baseline: glovis, isTest: true });
          if (!c.ok) throw new Error(c.error);
        }
        await reload();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [reload]);

  // Context for building events. The UTC offset is fixed per operation (its Day 1 at noon),
  // so an hour re-entered later is recognised as the same hour.
  const ctx = useCallback((): Ctx | null => {
    if (!vessel) return null;
    const opDate = operationDate(vessel.baseline)!;
    return { operationId: OP, opDate, offset: offsetFor(new Date(`${opDate}T12:00:00`)), recordedAt: recordedNow(), state: latest.current ?? vessel.state };
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
      const r = await store.current.append(OP, evs);
      if (!r.ok) return r;
      latest.current = r.state;
      setBk(await backupStatus(dbRef.current!, OP, r.state.log.events.length));
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
      const r = await exportLog(store.current!, OP, at);
      if (!r.ok) return setNotice({ ok: false, text: `Not exported: ${r.error}` });
      try {
        const res = await Share.share({ title: r.fileName, message: r.text });
        if (res.action === Share.dismissedAction) return setNotice({ ok: true, text: 'Export cancelled. Nothing marked as backed up.' });
      } catch (e) {
        return setNotice({ ok: false, text: `Not exported: ${(e as Error).message}` });
      }
      await markExported(dbRef.current!, OP, at, r.count);
      setBk(await backupStatus(dbRef.current!, OP, r.count));
      setNotice({ ok: true, text: `Shared ${r.count} entries.` });
    },
    onImport: async (text) => {
      const r = await importLog(store.current!, text);
      if (!r.ok) return r;
      if (r.kind !== 'current') await markExported(dbRef.current!, r.operationId, r.exportedAt, r.total); // those entries are in the file
      await reload();
      const msg = r.kind === 'current' ? `${r.operationId} is already up to date. Nothing changed.`
        : `${r.operationId}: ${r.added} ${r.added === 1 ? 'entry' : 'entries'} added (${r.kind === 'created' ? 'new vessel' : 'existing vessel kept'}).`;
      return { ok: true as const, text: r.operationId === OP ? msg : `${msg} This app opens ${OP} for now.` };
    },
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
                vessel={vessel.baseline.vessel} sub={subtitles(vessel.state, vessel.baseline)[tab]} />
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
                      ? <Hourly state={vessel.state} />
                      : <Plan state={vessel.state} baseline={vessel.baseline} isTest={vessel.isTest} save={save} backup={backup} onNotice={setNotice} />}
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
