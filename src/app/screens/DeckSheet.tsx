// Deck sheet (reference: docs/reference/screens/05 and the tracker's deckSheet()).
// A full snapshot (Colby chose A): boxes open with the current counts; clearing a box
// saves that hatch as unknown. entries.deckEvents writes only what changed.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { operationDate, parseHM, type Baseline, type DeckStatus, type Reject, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { deckSheet, STATUS_PILL } from '../view.ts';
import { color, useType } from '../theme.ts';
import { DeckPhotoTypes, PhotoPages, type PhotoView } from './DeckPhotoTypes.tsx';
import { Body, Chip, ErrorBox, Field, Go, Label, Note, Pill, Seg, Sheet, TimeField } from './ui.tsx';

type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;

const num = (v: string) => (v.trim() === '' ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
const STATUSES = Object.keys(STATUS_PILL) as DeckStatus[];

// Standalone (from the Decks tab).
export function DeckSheet(p: { state: State; baseline: Baseline; isTest: boolean; deckId: string; save: Save; onClose: (done?: string) => void }) {
  const d = p.state.decks.find((x) => x.id === p.deckId)!;
  return (
    <Sheet title={deckSheet(d, p.baseline).title} isTest={p.isTest} onClose={() => p.onClose()}>
      <DeckForm state={p.state} baseline={p.baseline} deckId={p.deckId} save={p.save} onClose={p.onClose} />
    </Sheet>
  );
}

// The form itself; the Log sheet shows it inside its own sheet (never two sheets at once).
export function DeckForm({ state, baseline, deckId, save, onClose }: { state: State; baseline: Baseline; deckId: string; save: Save; onClose: (done?: string) => void }) {
  const f = useType();
  const d = state.decks.find((x) => x.id === deckId)!;
  const v = deckSheet(d, baseline);
  const [status, setStatus] = useState<DeckStatus>(d.status);
  const [skipped, setSkipped] = useState(d.skipped);
  const [hatches, setHatches] = useState<Record<string, string>>(
    Object.fromEntries(d.hatches.map((h) => [h.h, v.prefill.hatches[h.h] != null ? String(v.prefill.hatches[h.h]) : ''])));
  const [total, setTotal] = useState(v.prefill.deck != null ? String(v.prefill.deck) : '');
  const [t, setT] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pv, setPv] = useState<PhotoView | null>(null); // a photo page (type page, add, edit, full size), in this same sheet
  const counted = status === 'active' || status === 'paused';

  const submit = async () => {
    setError(null);
    const hr: Record<string, number | null> = {};
    for (const h of d.hatches) {
      const n = num(hatches[h.h] ?? '');
      if (Number.isNaN(n)) return setError(`${h.h} must be a whole number.`);
      hr[h.h] = n;
    }
    const dr = num(total);
    if (Number.isNaN(dr)) return setError('Deck total must be a whole number.');
    let time = null;
    if (t.trim()) {
      if (parseHM(t.trim()) == null) return setError('Enter the time as HH:MM.');
      time = { day: state.ops.day, hm: t.trim().padStart(5, '0') };
    }
    const r = await save((c) => E.deckEvents(c, { deck: d.id, status, skipped: status === 'notStarted' && skipped, hatchRemaining: counted ? hr : {}, deckRemaining: counted ? dr : null, time }));
    if (r.ok) onClose(`${d.label} saved.`); else setError(r.error);
  };

  if (pv) return <PhotoPages state={state} baseline={baseline} save={save} deckId={d.id} deckLabel={d.label} view={pv} setView={setPv} onClose={onClose} />;
  return (
        <View style={{ gap: 14 }}>
          <View style={s.line}>
            <Pill text={v.pill} />
            <Text style={{ marginLeft: 'auto' }} numberOfLines={1}>
              <Text style={{ fontFamily: f.display, fontSize: 30, color: color.ink }}>{v.remaining}</Text>
              <Text style={{ fontFamily: f.body, fontSize: 14, color: color.muted }}> remaining</Text>
            </Text>
          </View>
          <View style={s.chips}><Chip text={v.height.text} tone={v.height.tone} /><Note>{v.possible}</Note></View>
          <Note>Deck heights are confirmed on the Plan tab.</Note>

          <Label>STATUS</Label>
          <Seg options={STATUSES.map((x) => ({ value: x, label: STATUS_PILL[x] }))} value={status} onChange={setStatus} />
          {status === 'notStarted' && (
            <Pressable onPress={() => setSkipped(!skipped)} style={s.check} accessibilityRole="checkbox" accessibilityState={{ checked: skipped }}>
              <View style={[s.box, skipped && s.boxOn]}>{skipped && <Text style={{ color: color.bg, fontWeight: '700' }}>✓</Text>}</View>
              <Body semi style={{ flexShrink: 1 }}>Skipped: passed over, still aboard</Body>
            </Pressable>
          )}

          {counted ? (
            <>
              {v.split && <Note>Deck split: {v.split}. Counts per hatch are not on the paperwork.</Note>}
              <Label wrap>REMAINING BY HATCH (H4 → H1) · CLEAR A BOX IF UNKNOWN</Label>
              <View style={s.grid}>
                {d.hatches.map((h, i) => (
                  <View key={h.h} style={s.cell}>
                    <Field label={`${h.h} · of ${h.qty ?? '—'}`} note={v.hatches[i].brands} value={hatches[h.h] ?? ''} onChange={(x) => setHatches((m) => ({ ...m, [h.h]: x }))} />
                  </View>
                ))}
              </View>
              <Field label="Or deck total remaining" value={total} onChange={setTotal} />
            </>
          ) : (
            <Note>{status === 'complete' ? 'Complete sets remaining to 0 and records the cleared brands.' : status === 'notStarted' ? 'Not started keeps the full count.' : 'Unknown: remaining is unknown until counted.'}</Note>
          )}

          <TimeField label="Time of this update" value={t} onChange={setT}
            onNow={() => { const n = E.nowOpTime(operationDate(baseline)!, new Date()); if (n) setT(n.hm); else setError('The phone’s date is before this operation’s Day 1.'); }} />
          {error && <ErrorBox text={error} />}
          <Go label="Save deck update" onPress={submit} />
          {v.history.length > 0 && <Note>Previous: {v.history.join(' · ')}</Note>}
          <DeckPhotoTypes state={state} deckId={d.id} onOpen={(t) => setPv({ kind: 'type', type: t })} onAdd={() => setPv({ kind: 'add', type: null })} />
        </View>
  );
}

const s = StyleSheet.create({
  back: { minHeight: 56, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 24 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  box: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flexBasis: '47%', flexGrow: 1 },
});
