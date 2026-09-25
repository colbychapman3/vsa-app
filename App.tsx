// TEMPORARY Phase 2 check screen: proves on-phone storage (restart, airplane mode,
// replay). TEST data only. Replaced by the real screens in Phase 3.
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { operationDate, type Baseline, type VsaEvent } from './src/engine/index.ts';
import { openExpoDb } from './src/storage/db.ts';
import { openStore, type State } from './src/storage/store.ts';
import glovisJson from './docs/reference/glovis-condor-101-baseline.json';

const glovis = glovisJson as Baseline;
const OP = 'TEST-GLOVIS-101';
// Fixed TEST counts for a Day 1 shift. 11:00 is the short pre-break hour (Zone 3 is Northside → stop :45).
const TEST_HOURS: { start: string; count: number; stopMin?: number }[] = [
  { start: '08:00', count: 200 }, { start: '09:00', count: 210 }, { start: '10:00', count: 190 },
  { start: '11:00', count: 150, stopMin: 45 }, { start: '13:00', count: 205 }, { start: '14:00', count: 200 },
  { start: '15:00', count: 195 }, { start: '16:00', count: 190 },
];

type Store = Awaited<ReturnType<typeof openStore>>;

function hourEvents(start: string, count: number, stopMin: number | undefined, firstSeq: number): VsaEvent[] {
  const date = operationDate(glovis)!;
  const end = `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`;
  const period = { period_start: `${date}T${start}:00-04:00`, period_end: `${date}T${end}:00-04:00` };
  const make = (i: number, metric: string, value: number, kind: 'interval' | 'not_applicable'): VsaEvent => ({
    schema_version: '1.0', event_id: `CHK-${firstSeq + i}`, operation_id: OP, sequence: firstSeq + i, idempotency_key: `CHK-${firstSeq + i}`,
    event_type: 'observation', scope: { workstream: 'auto_discharge', deck: null, hatch: null, commodity: null, destination: null },
    occurred_at: null, recorded_at: new Date().toISOString(), actor: 'phase2_check_screen', source_ids: ['TEST'], provenance: 'user_report',
    supersedes_event_id: null,
    payload: { metric, value, unit: null, count_kind: kind, ...period, reason: null, input_event_ids: [] },
  });
  const evs = [make(0, 'field_units', count, 'interval'), make(1, 'drivers', 70, 'not_applicable')];
  if (stopMin != null) evs.push(make(2, 'productive_minutes', stopMin, 'not_applicable'));
  return evs;
}

const fmt = (n: number | null | undefined) => (n == null ? 'unknown' : n.toLocaleString('en-US'));

export default function App() {
  const store = useRef<Store | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [events, setEvents] = useState(0);
  const [exists, setExists] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(true);

  const refresh = async () => {
    const r = await store.current!.load(OP);
    setExists(r.ok);
    if (!r.ok) return;
    setEvents(r.events.length);
    if (r.state.ok) setState(r.state);
    else setMsg({ text: `Stored log refused by engine: ${r.state.error}`, bad: true });
  };

  useEffect(() => {
    (async () => {
      try {
        store.current = await openStore(await openExpoDb());
        await refresh();
      } catch (e) {
        setMsg({ text: `Could not open storage: ${(e as Error).message}`, bad: true });
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const run = (fn: () => Promise<void>) => async () => {
    if (!store.current || busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { setMsg({ text: `Error: ${(e as Error).message}`, bad: true }); }
    setBusy(false);
  };

  const create = run(async () => {
    const r = await store.current!.createVessel({ operationId: OP, baseline: glovis, isTest: true });
    setMsg(r.ok ? { text: 'TEST vessel created.' } : { text: r.error, bad: true });
    await refresh();
  });

  const logHour = run(async () => {
    const logged = new Set(state?.periods.map((p) => p.start) ?? []);
    const next = TEST_HOURS.find((h) => !logged.has(h.start));
    if (!next) { setMsg({ text: 'All TEST hours are logged.' }); return; }
    const r = await store.current!.append(OP, hourEvents(next.start, next.count, next.stopMin, events + 1));
    if (r.ok) { setState(r.state); setEvents(events + r.saved); setMsg({ text: `Saved ${next.start} hour: ${next.count} autos (${r.saved} events).` }); }
    else setMsg({ text: `Not saved: ${r.error}`, bad: true });
  });

  const tryBad = run(async () => {
    const r = await store.current!.append(OP, hourEvents('19:00', 5000, undefined, events + 1));
    const after = await store.current!.load(OP);
    const count = after.ok ? after.events.length : NaN;
    setMsg(r.ok
      ? { text: 'FAIL: an impossible count was saved.', bad: true }
      : { text: `Refused as expected: ${r.error} Stored events still ${count}${count === events ? ' ✓' : ' ✗'}.`, bad: count !== events });
  });

  const replayCheck = run(async () => {
    const r = await store.current!.load(OP);
    if (!r.ok || !r.state.ok) { setMsg({ text: 'Replay check FAIL: stored log did not load.', bad: true }); return; }
    const same = JSON.stringify(r.state) === JSON.stringify(state) && r.events.length === events;
    setMsg(same
      ? { text: `Replay check PASS: ${r.events.length} stored events rebuild the same state.` }
      : { text: 'Replay check FAIL: stored log gives a different state than on screen.', bad: true });
  });

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.test}>TEST · STORAGE CHECK</Text>
      <Text style={s.title}>Glovis Condor 101</Text>

      <View style={s.card}>
        <Row k="Stored events" v={fmt(exists ? events : null)} />
        <Row k="Field count" v={fmt(state?.field ?? (exists ? 0 : null))} />
        <Row k={state?.vesselRemaining == null ? 'Field balance' : 'Vessel remaining'} v={fmt(state ? state.vesselRemaining ?? state.fieldBalance : null)} />
        <Row k="H.A." v={state?.production.ha == null ? '—' : `${Math.round(state.production.ha)} (${fmt(state.field)} ÷ ${state.production.countedHours} hr)`} />
      </View>

      {msg && <Text style={[s.msg, msg.bad ? s.bad : s.good]}>{msg.text}</Text>}

      {!exists && <Button label="Create TEST vessel" onPress={create} disabled={busy} />}
      {exists && <Button label="Log next test hour" onPress={logHour} disabled={busy} />}
      {exists && <Button label="Try an impossible count" onPress={tryBad} disabled={busy} />}
      {exists && <Button label="Replay check" onPress={replayCheck} disabled={busy} />}
      <StatusBar style="dark" />
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <View style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>;
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, (pressed || disabled) && s.btnDim]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, paddingTop: 64, gap: 14, backgroundColor: '#fff', flexGrow: 1 },
  test: { alignSelf: 'flex-start', backgroundColor: '#FFD600', color: '#000', fontWeight: '800', fontSize: 16, paddingHorizontal: 10, paddingVertical: 4 },
  title: { fontSize: 30, fontWeight: '800', color: '#000' },
  card: { borderWidth: 2, borderColor: '#000', borderRadius: 12, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  k: { fontSize: 18, color: '#222' },
  v: { fontSize: 20, fontWeight: '700', color: '#000', flexShrink: 1, textAlign: 'right' },
  msg: { fontSize: 17, padding: 12, borderRadius: 10, borderWidth: 2 },
  good: { borderColor: '#0A7A2F', color: '#064D1D', backgroundColor: '#E6F6EA' },
  bad: { borderColor: '#C00', color: '#700', backgroundColor: '#FDECEC' },
  btn: { minHeight: 64, borderRadius: 12, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnDim: { opacity: 0.5 },
  btnText: { color: '#FFD600', fontSize: 20, fontWeight: '800' },
});
