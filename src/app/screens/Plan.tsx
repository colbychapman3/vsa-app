// Plan tab (reference: docs/reference/screens/08). Layout only; values from view.planView().
// Actions (confirm height, resolve discrepancy, shift settings) save through App.save().
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { parseHM, type Baseline, type Reject, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { planView } from '../view.ts';
import { color, useType } from '../theme.ts';
import { Big, Body, Card, Chip, ErrorBox, Field, Go, Label, Note, SectionHead, Seg, Sheet, u } from './ui.tsx';

type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;

export function Plan({ state, baseline, save, onNotice }: { state: State; baseline: Baseline; save: Save; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const f = useType();
  const [recheck, setRecheck] = useState<Set<string>>(new Set());
  const [shiftOpen, setShiftOpen] = useState(false);
  const v = planView(state, baseline, recheck);

  const act = async (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => {
    const r = await save(build);
    onNotice(r.ok ? { ok: true, text: done } : { ok: false, text: `Not saved: ${r.error}` });
    return r.ok;
  };
  const kv = (k: string, val: string) => (
    <View key={k} style={u.kv}><Body style={{ color: color.muted, maxWidth: '45%' }}>{k}</Body><Body semi style={{ textAlign: 'right', flex: 1 }}>{val}</Body></View>
  );

  return (
    <View style={s.main}>
      {(v.heights.pending.length > 0 || v.heights.confirmed.length > 0) && (
        <Card style={[u.pad, { gap: 10 }, v.heights.pending.length > 0 && { borderWidth: 2, borderColor: color.red }]}>
          <SectionHead title="Confirm deck heights" right={v.heights.pending.length ? `${v.heights.pending.length} to confirm` : 'All confirmed'} />
          {v.heights.pending.length > 0 && <Note>These decks can be set below 1.85 m, where shuttle vans can’t drive on. Pick each deck’s actual setting.</Note>}
          {v.heights.pending.map((d) => (
            <View key={d.id} style={s.pending}>
              <View style={u.secH}><Body semi style={{ fontSize: 17 }}>{d.label}</Body><Note>{d.stow}</Note></View>
              <Seg columns={Math.min(d.options.length, 3)} value={d.options.find((o) => o.selected)?.m ?? null}
                options={d.options.map((o) => ({ value: o.m, label: o.label }))}
                onChange={(m) => act((c) => E.heightEvents(c, d.id, m, null), `${d.label} height confirmed at ${m.toFixed(2)} m.`)
                  .then((ok) => { if (ok) setRecheck((x) => { const n = new Set(x); n.delete(d.id); return n; }); })} />
            </View>
          ))}
          {v.heights.confirmed.length > 0 && (
            <View style={s.chips}>
              {v.heights.confirmed.map((d) => (
                <Pressable key={d.id} onPress={() => setRecheck((x) => new Set(x).add(d.id))} accessibilityRole="button" accessibilityLabel={`Change ${d.text}`}>
                  <Chip text={d.text} tone={d.low ? 'red' : 'plain'} tall />
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      )}

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Open discrepancies" right={`${v.issues.open.length} open`} />
        {v.issues.open.length === 0 && <Note>Nothing open.</Note>}
        {v.issues.open.map((i) => (
          <View key={i.id} style={s.issue}>
            <Body semi>{i.text}</Body>
            <View style={u.secH}>
              <Note style={{ flexShrink: 1 }}>{i.opened}</Note>
              <Go ghost label="Mark resolved" onPress={() => act((c) => E.resolveDiscrepancyEvents(c, i.id, null), 'Marked resolved.')} />
            </View>
          </View>
        ))}
        {v.issues.resolved && <Note>{v.issues.resolved}</Note>}
      </Card>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Baseline & data status" />
        {kv('Starting autos', `${v.baseline.start} · ${v.baseline.brands}`)}
        {kv('High & Heavy', `${v.baseline.hh} · separate ledger`)}
        <View style={s.chips}>
          <Chip text={v.baseline.verified ? '✓ Totals verified' : 'Not verified'} tone={v.baseline.verified ? 'plain' : 'orange'} />
          <Chip text={v.baseline.discrepancies} />
          <Chip text={v.baseline.missing} tone={v.baseline.missing === 'Nothing missing' ? 'plain' : 'orange'} />
        </View>
        {v.baseline.checks.map((c) => <Note key={c}>• {c}</Note>)}
        <Note>{v.baseline.sources}</Note>
      </Card>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Labor" />
        {kv('Start', v.labor.start)}
        {kv('Auto drivers (ordered)', v.labor.autoDrivers)}
        {kv('Van drivers', v.labor.vanDrivers)}
        {kv('Heavy gang', v.labor.heavyGang)}
        <Note>Labor order figures are ordered, not a confirmed shape-up.</Note>
      </Card>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Forecast settings" />
        {kv('Breaks', v.forecast.breaks)}
        {kv('Day 1 shift ends', v.forecast.dayEnd)}
        {kv('Next day starts', v.forecast.nextStart)}
        <Note>Set a shift end when the ship carries over to a second day. The ETA then resumes the next morning.</Note>
        <Go ghost label="Change shift settings" onPress={() => setShiftOpen(true)} />
      </Card>

      <Card style={[u.pad, { gap: 12 }]}>
        <SectionHead title="Side split" right="Calculated from destinations" />
        {v.side.northPct == null ? <Note>{v.side.unknown}</Note> : (
          <View style={s.split}>
            {v.side.northPct > 0 && <View style={{ flex: v.side.northPct, backgroundColor: color.blue }} />}
            {v.side.northPct < 100 && <View style={{ flex: 100 - v.side.northPct, backgroundColor: color.ink }} />}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {([['Northside', v.side.north, v.side.northAutos], ['Southside', v.side.south, v.side.southAutos]] as const).map(([l, pc, n]) => (
            <View key={l} style={{ flex: 1, gap: 2 }}><Label>{l}</Label><Big size={40}>{pc}</Big><Note>{n}</Note></View>
          ))}
        </View>
      </Card>

      <View style={{ gap: 10 }}>
        <SectionHead title={v.destinations.title} />
        <Card>
          {v.destinations.rows.map((d, i) => (
            <View key={d.name} style={[s.row, i > 0 && s.rowLine]}>
              <View style={u.secH}><Body semi style={{ fontSize: 16, flexShrink: 1 }}>{d.name}</Body><Big size={26}>{d.autos}</Big></View>
              <Note>{d.note}</Note>
            </View>
          ))}
        </Card>
        <Note>{v.destinations.footnote}</Note>
      </View>

      <Card style={[u.pad, { gap: 10 }]}>
        <SectionHead title="Break log" />
        {v.breakLog.length === 0 ? <Note>No breaks logged yet.</Note> : v.breakLog.map((b, i) => <View key={i}>{kv(b.label, b.value)}</View>)}
      </Card>

      {shiftOpen && <ShiftSheet state={state} baseline={baseline} save={save} onClose={(done) => { setShiftOpen(false); if (done) onNotice({ ok: true, text: done }); }} />}
    </View>
  );
}

// Shift settings sheet: "Finish today" or "Carries to Day 2" with Day 1 end and next start.
function ShiftSheet({ state, baseline, save, onClose }: { state: State; baseline: Baseline; save: Save; onClose: (done?: string) => void }) {
  const [mode, setMode] = useState<'one' | 'two'>(state.plan.shiftEnd ? 'two' : 'one');
  const [end, setEnd] = useState(state.plan.shiftEnd ?? '');
  const [next, setNext] = useState(state.plan.nextStart ?? baseline.start);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (mode === 'two' && parseHM(end.trim()) == null) return setError('Enter when Day 1 ends (HH:MM).');
    if (parseHM(next.trim()) == null) return setError('Enter when the next day starts (HH:MM).');
    const r = await save((c) => E.shiftSettingsEvents(c, mode === 'two' ? end.trim().padStart(5, '0') : null, next.trim().padStart(5, '0')));
    if (r.ok) onClose('Shift settings saved.'); else setError(r.error);
  };
  return (
    <Sheet title="Shift settings" isTest={state.operationId.startsWith('TEST-')} onClose={() => onClose()}>
      <Seg columns={2} value={mode} onChange={setMode} options={[{ value: 'one', label: 'Finish today' }, { value: 'two', label: 'Carries to Day 2' }]} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {mode === 'two' && <Field label="Day 1 shift ends" value={end} onChange={setEnd} keyboard="numbers-and-punctuation" maxLength={5} />}
        <Field label="Next day starts" value={next} onChange={setNext} keyboard="numbers-and-punctuation" maxLength={5} />
      </View>
      {error && <ErrorBox text={error} />}
      <Go label="Save shift settings" onPress={submit} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  main: { padding: 20, gap: 16 },
  pending: { gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.row },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  issue: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.row },
  split: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', gap: 3 },
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 6 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.row },
});
