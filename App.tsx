// App root: opens on-phone storage, loads the TEST Glovis vessel (Phase 5 adds
// real vessels), keeps the latest engine state, and shows the four tabs.
// Every save goes through save(): entries → store.append (engine-checked) → new state.
import { StatusBar } from 'expo-status-bar';
import { useFonts as loadFonts } from 'expo-font';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { operationDate, type Baseline, type Reject, type VsaEvent } from './src/engine/index.ts';
import { openExpoDb } from './src/storage/db.ts';
import { openStore, type State } from './src/storage/store.ts';
import { offsetFor, openDiscrepancyEvents, type Ctx } from './src/app/entries.ts';
import { badges, subtitles, type Banner } from './src/app/view.ts';
import { color, fontFiles, fonts, FontContext } from './src/app/theme.ts';
import { Header, LogButton, TabBar, type Tab } from './src/app/screens/Chrome.tsx';
import { Snapshot } from './src/app/screens/Snapshot.tsx';
import { LogSheet } from './src/app/screens/LogSheet.tsx';
import glovisJson from './docs/reference/glovis-condor-101-baseline.json';

const OP = 'TEST-GLOVIS-101';
const glovis = glovisJson as Baseline;

export type Store = Awaited<ReturnType<typeof openStore>>;
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
  const saving = useRef(false);
  const [vessel, setVessel] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>('snap');
  const [nowMin, setNowMin] = useState(minutesNow);
  const [logOpen, setLogOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState<string | null>(null); // deck sheet (task 6)

  // The break strip and "forecast passed" follow the clock; refresh every minute.
  useEffect(() => {
    const t = setInterval(() => setNowMin(minutesNow()), 60_000);
    return () => clearInterval(t);
  }, []);

  const reload = useCallback(async () => {
    const r = await store.current!.load(OP);
    if (!r.ok) throw new Error(r.error);
    if (!r.state.ok) throw new Error(`Stored log refused by the engine: ${r.state.error}`);
    setVessel({ baseline: r.baseline, isTest: r.vessel.isTest, state: r.state });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        store.current = await openStore(await openExpoDb());
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
    return { operationId: OP, opDate, offset: offsetFor(new Date(`${opDate}T12:00:00`)), recordedAt: recordedNow(), state: vessel.state };
  }, [vessel]);

  // One save at a time; nothing is written unless the engine accepts the whole batch.
  const save = useCallback(async (build: (c: Ctx) => VsaEvent[] | Reject): Promise<SaveResult> => {
    const c = ctx();
    if (!c || !store.current) return { ok: false, error: 'The vessel is still loading.' };
    if (saving.current) return { ok: false, error: 'Still saving the last entry. Try again.' };
    const evs = build(c);
    if (!Array.isArray(evs)) return evs;
    saving.current = true;
    try {
      const r = await store.current.append(OP, evs);
      if (!r.ok) return r;
      setVessel((v) => (v ? { ...v, state: r.state } : v));
      return { ok: true };
    } finally {
      saving.current = false;
    }
  }, [ctx]);

  const track = useCallback(async (b: Banner) => {
    const r = await save((c) => openDiscrepancyEvents(c, `${b.title}. ${b.sub}`, null, b.title));
    setNotice(r.ok ? { ok: true, text: 'Added to open discrepancies.' } : { ok: false, text: `Not saved: ${r.error}` });
  }, [save]);

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
              <ScrollView contentContainerStyle={s.scroll}>
                {notice && <Text style={[s.notice, notice.ok ? s.ok : s.err]} onPress={() => setNotice(null)}>{notice.text}</Text>}
                {tab === 'snap'
                  ? <Snapshot state={vessel.state} baseline={vessel.baseline} nowMin={nowMin} onOpenTab={setTab} onTrack={track} />
                  : <Text style={[s.note, s.pad]}>{tab} screen: built in Phase 3 tasks 6–8.</Text>}
              </ScrollView>
              <LogButton onPress={() => { setNotice(null); setLogOpen(true); }} />
              {logOpen && (
                <LogSheet state={vessel.state} baseline={vessel.baseline} save={save}
                  onClose={(done) => { setLogOpen(false); if (done) setNotice({ ok: true, text: done }); }}
                  onOpenDeck={(id) => { setLogOpen(false); setDeckOpen(id); }} />
              )}
              {deckOpen && <Text style={[s.notice, s.ok]} onPress={() => setDeckOpen(null)}>Deck sheet for {deckOpen}: built in task 6.</Text>}
              <TabBar tab={tab} onTab={setTab} badges={badges(vessel.state)} />
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
  notice: { margin: 20, marginBottom: 0, padding: 12, borderRadius: 10, fontSize: 15 },
  ok: { color: color.gInk, backgroundColor: color.gBg },
  err: { color: color.rInk, backgroundColor: color.rBg, padding: 12, borderRadius: 10 },
});
