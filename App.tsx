// App root: opens on-phone storage, loads the TEST Glovis vessel (Phase 5 adds
// real vessels), keeps the latest engine state, and shows the four tabs.
import { StatusBar } from 'expo-status-bar';
import { useFonts as loadFonts } from 'expo-font';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Baseline } from './src/engine/index.ts';
import { openExpoDb } from './src/storage/db.ts';
import { openStore, type State } from './src/storage/store.ts';
import { color, fontFiles, fonts, FontContext } from './src/app/theme.ts';
import { Header, LogButton, TabBar, type Tab } from './src/app/screens/Chrome.tsx';
import glovisJson from './docs/reference/glovis-condor-101-baseline.json';

const OP = 'TEST-GLOVIS-101';
const glovis = glovisJson as Baseline;

export type Store = Awaited<ReturnType<typeof openStore>>;
type Loaded = { baseline: Baseline; isTest: boolean; state: State; eventCount: number };

const SUBTITLE: Record<Tab, (b: Baseline) => string> = {
  snap: (b) => b.date,
  decks: () => 'Working view · what’s left aboard, H4 → H1',
  hourly: () => 'Official field record · autos per hour',
  plan: (b) => `${b.date} · Start ${b.start}`,
};

export default function App() {
  const [fontsLoaded, fontError] = loadFonts(fontFiles);
  const store = useRef<Store | null>(null);
  const [vessel, setVessel] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('snap');

  const reload = useCallback(async () => {
    const r = await store.current!.load(OP);
    if (!r.ok) throw new Error(r.error);
    if (!r.state.ok) throw new Error(`Stored log refused by the engine: ${r.state.error}`);
    setVessel({ baseline: r.baseline, isTest: r.vessel.isTest, state: r.state, eventCount: r.events.length });
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

  // Fonts: wait for them, but never block the app if they fail.
  if (!fontsLoaded && !fontError) return <View style={s.page} />;

  return (
    <SafeAreaProvider>
      <FontContext.Provider value={fonts(fontsLoaded)}>
        <View style={s.page}>
          {vessel ? (
            <>
              <Header isTest={vessel.isTest} place={`${String(vessel.baseline.port)} discharge · Berth ${String(vessel.baseline.berth)}`}
                vessel={vessel.baseline.vessel} sub={SUBTITLE[tab](vessel.baseline)} />
              <ScrollView contentContainerStyle={s.main}>
                <Text style={s.note}>{tab} screen: built in Phase 3 tasks 4–8. {vessel.eventCount} stored events.</Text>
              </ScrollView>
              <LogButton onPress={() => {}} />
              <TabBar tab={tab} onTab={setTab} badges={{}} />
            </>
          ) : (
            <View style={s.main}>
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
  main: { padding: 20, paddingBottom: 180, gap: 16 },
  note: { fontSize: 15, color: color.muted },
  err: { color: color.rInk, backgroundColor: color.rBg, padding: 12, borderRadius: 10 },
});
