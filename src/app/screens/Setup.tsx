// New-vessel setup (protocol §11.1), one step per screen, plus baseline import. Nothing is saved until
// Review. All checks live in src/app/setup.ts; this only lays out the questions.
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { Reject } from '../../engine/index.ts';
import { buildBaseline, deckFromDraft, emptyDeck, importBaseline, type Built, type DeckDraft, type SetupForm } from '../setup.ts';
import { color, useType } from '../theme.ts';
import { Body, Card, ErrorBox, Field, Go, Note, SectionHead, Seg, u } from './ui.tsx';

type Dest = { name: string; side: 'N' | 'S' | null; clearBy: string; brands: string; autos: string; mi: string; ref: string };
const STEPS = ['Vessel', 'Start', 'Destinations', 'Decks', 'Review'];
const blankDest = (): Dest => ({ name: '', side: null, clearBy: '', brands: '', autos: '', mi: '', ref: '' });

// Content only: it lives inside the Vessels sheet, so there is never a second modal (iOS freezes on stacked modals).
export function Setup({ isTest, setIsTest, onKey, onCreate }: {
  isTest: boolean; setIsTest: (t: boolean) => void; onKey: (k: string) => void;
  onCreate: (b: Extract<Built, { ok: true }>, isTest: boolean) => Promise<{ ok: true } | Reject>;
}) {
  const f = useType();
  const [step, setStep] = useState(0);
  const [v0, setV] = useState({ vessel: '', date: '', port: '', berth: '', sources: '', start: '08:00', drivers: '' });
  const v = { ...v0, isTest };
  const set = (k: keyof typeof v0) => (x: string) => setV({ ...v0, [k]: x });
  const [dests, setDests] = useState<Dest[]>([blankDest()]);
  const [decks, setDecks] = useState<DeckDraft[]>([emptyDeck()]);
  const [imported, setImported] = useState<Built | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAck(false); onKey(`${step}${imported ? 'i' : ''}${pasteOpen}`); }, [step, imported, pasteOpen]);
  const input = [u.input, { fontFamily: f.body, fontSize: 15, minHeight: 160, paddingTop: 12, textAlignVertical: 'top' as const }];

  // Draft text → SetupForm → checked baseline.
  const typed = (): Built => {
    const errs: string[] = [];
    const ds = decks.map((d) => { const r = deckFromDraft(d); errs.push(...r.errors); return r.deck; });
    const drivers = v.drivers.trim() === '' ? null : Number(v.drivers);
    const form: SetupForm = {
      vessel: v.vessel, date: v.date, port: v.port, berth: v.berth, isTest: v.isTest, start: v.start, drivers,
      sources: v.sources.split(';'),
      destinations: dests.filter((d) => d.name.trim()).map((d) => ({
        name: d.name, side: d.side ?? undefined, clearBy: d.clearBy.trim() ? Number(d.clearBy) : undefined,
        brands: d.brands.split(',').map((x) => x.trim()).filter(Boolean), autos: d.autos.trim() ? Number(d.autos) : undefined,
        mi: d.mi.trim() ? Number(d.mi) : undefined, ref: d.ref,
      })),
      decks: ds,
    };
    const built = buildBaseline(form);
    return errs.length ? { ok: false, errors: [...errs, ...(built.ok ? [] : built.errors)] } : built;
  };
  const built = step === 4 ? imported ?? typed() : null;

  const save = async () => {
    if (!built?.ok) return;
    if (built.discrepancies.length > 0 && !ack) return setError('Choose “I have seen this” under the discrepancy above, then Save.');
    setBusy(true); setError(null);
    try {
      const r = await onCreate(built, v.isTest);
      if (!r.ok) setError(r.error);
    } finally { setBusy(false); }
  };
  const back = () => { setError(null); if (imported) { setImported(null); setStep(0); } else setStep(step - 1); };

  const setDeck = (i: number, d: DeckDraft) => setDecks(decks.map((x, j) => (j === i ? d : x)));
  const setDest = (i: number, d: Partial<Dest>) => setDests(dests.map((x, j) => (j === i ? { ...x, ...d } : x)));

  return (
    <>
      <Note>{imported ? 'Imported baseline: check every value, then save.' : `Step ${step + 1} of 5: ${STEPS[step]}. Nothing is saved until Review.`}</Note>

      {step === 0 && !pasteOpen && (
        <View style={{ gap: 12 }}>
          <Field label="Vessel name" value={v.vessel} onChange={set('vessel')} keyboard="default" />
          <Field label="Operation date" note="M/D/YYYY" value={v.date} onChange={set('date')} keyboard="numbers-and-punctuation" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Port" value={v.port} onChange={set('port')} keyboard="default" />
            <Field label="Berth" value={v.berth} onChange={set('berth')} keyboard="default" />
          </View>
          <Field label="Sources" note="separate with ;" value={v.sources} onChange={set('sources')} keyboard="default" />
          <Seg options={[{ value: 'live', label: 'LIVE vessel' }, { value: 'test', label: 'TEST / demo' }]} columns={2} value={v.isTest ? 'test' : 'live'} onChange={(x) => setIsTest(x === 'test')} />
          <Note>TEST data never mixes with a live vessel. Reference vessels (Glovis Condor 101) can only be TEST.</Note>
          <Go label="Next" onPress={() => { setError(null); if (!v.vessel.trim()) setError('The vessel needs a name.'); else setStep(1); }} />
          <Go ghost label="Import a baseline instead" onPress={() => { setError(null); setPasteOpen(true); }} />
        </View>
      )}

      {step === 0 && pasteOpen && (
        <View style={{ gap: 12 }}>
          <Note>Paste a baseline JSON (same shape as the Glovis Condor 101 baseline). Its text is data only.</Note>
          <TextInput value={paste} onChangeText={setPaste} multiline autoCorrect={false} autoCapitalize="none" accessibilityLabel="Baseline JSON"
            placeholder="Paste here" placeholderTextColor={color.muted} style={input} />
          <Seg options={[{ value: 'live', label: 'LIVE vessel' }, { value: 'test', label: 'TEST / demo' }]} columns={2} value={v.isTest ? 'test' : 'live'} onChange={(x) => setIsTest(x === 'test')} />
          <Go label="Review imported baseline" disabled={paste.trim() === ''} onPress={() => {
            const r = importBaseline(paste, v.isTest);
            if (r.ok) { setError(null); setImported(r); setStep(4); } else setError(r.errors.join('\n'));
          }} />
          <Go ghost label="Back" onPress={() => { setError(null); setPasteOpen(false); }} />
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 12 }}>
          <Field label="Planned start" note="HH:MM" value={v.start} onChange={set('start')} keyboard="numbers-and-punctuation" />
          <Field label="Drivers, Day 1" note="leave empty if unknown" value={v.drivers} onChange={set('drivers')} />
          <Card style={[u.pad, { gap: 4 }]}><Body semi>Breaks: 12:00 and 18:00, 1 hour each</Body><Note>Fixed by protocol; not editable.</Note></Card>
          <Nav back={back} next={() => setStep(2)} />
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 12 }}>
          {dests.map((d, i) => (
            <Card key={i} style={[u.pad, { gap: 10 }]}>
              <Field label="Destination" value={d.name} onChange={(x) => setDest(i, { name: x })} keyboard="default" placeholder="Zone 3, MBZ, Zone T…" />
              <Seg options={[{ value: 'N', label: 'Northside' }, { value: 'S', label: 'Southside' }]} columns={2} value={d.side} onChange={(x) => setDest(i, { side: x })} />
              <Note>Side left unset uses the protocol list (Zone 1, MBZ, Zone T, Zone V = Southside).</Note>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Clear-by min" note="15 N / 30 S" value={d.clearBy} onChange={(x) => setDest(i, { clearBy: x })} />
                <Field label="Autos" value={d.autos} onChange={(x) => setDest(i, { autos: x })} />
              </View>
              <Field label="Brands" note="comma separated" value={d.brands} onChange={(x) => setDest(i, { brands: x })} keyboard="default" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Miles" value={d.mi} onChange={(x) => setDest(i, { mi: x })} keyboard="numbers-and-punctuation" />
                <Field label="Reference time" value={d.ref} onChange={(x) => setDest(i, { ref: x })} keyboard="default" placeholder="as typed" />
              </View>
              {dests.length > 1 && <Go ghost label="Remove destination" onPress={() => setDests(dests.filter((_, j) => j !== i))} />}
            </Card>
          ))}
          <Go ghost label="Add a destination" onPress={() => setDests([...dests, blankDest()])} />
          <Nav back={back} next={() => setStep(3)} />
        </View>
      )}

      {step === 3 && (
        <View style={{ gap: 12 }}>
          {decks.map((d, i) => (
            <Card key={i} style={[u.pad, { gap: 10 }]}>
              <Field label={`Deck ${i + 1} label`} value={d.label} onChange={(x) => setDeck(i, { ...d, label: x })} keyboard="default" placeholder="Upper, D12, D9…" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Heights (m)" note="e.g. 2.00, 1.70" value={d.heights} onChange={(x) => setDeck(i, { ...d, heights: x })} keyboard="numbers-and-punctuation" />
                <Field label="Current (m)" value={d.current} onChange={(x) => setDeck(i, { ...d, current: x })} keyboard="numbers-and-punctuation" />
              </View>
              {d.hatches.map((h, hi) => (
                <View key={hi} style={{ gap: 6 }}>
                  <Field label={`Hatch ${h.h || hi + 1}`} value={h.h} onChange={(x) => setDeck(i, { ...d, hatches: d.hatches.map((y, k) => (k === hi ? { ...y, h: x } : y)) })} keyboard="default" />
                  {h.items.map((it, ii) => (
                    <View key={ii} style={{ flexDirection: 'row', gap: 10 }}>
                      <Field label="Brand" value={it.brand} onChange={(x) => setDeck(i, { ...d, hatches: d.hatches.map((y, k) => (k === hi ? { ...y, items: y.items.map((z, m) => (m === ii ? { ...z, brand: x } : z)) } : y)) })} keyboard="default" />
                      <Field label="Quantity" value={it.qty} onChange={(x) => setDeck(i, { ...d, hatches: d.hatches.map((y, k) => (k === hi ? { ...y, items: y.items.map((z, m) => (m === ii ? { ...z, qty: x } : z)) } : y)) })} />
                    </View>
                  ))}
                  <Go ghost label="Add another brand in this hatch" onPress={() => setDeck(i, { ...d, hatches: d.hatches.map((y, k) => (k === hi ? { ...y, items: [...y.items, { brand: '', qty: '' }] } : y)) })} />
                </View>
              ))}
              {decks.length > 1 && <Go ghost label="Remove deck" onPress={() => setDecks(decks.filter((_, j) => j !== i))} />}
            </Card>
          ))}
          <Go ghost label="Add a deck" onPress={() => setDecks([...decks, emptyDeck()])} />
          <Note>Decks in discharge order. Hatches read H4 → H1. Leave a hatch empty if it holds nothing.</Note>
          <Nav back={back} next={() => setStep(4)} nextLabel="Review" />
        </View>
      )}

      {step === 4 && built && (
        <View style={{ gap: 12 }}>
          {!built.ok ? (
            <>
              <ErrorBox text={`Fix these before saving:\n${built.errors.map((e) => `• ${e}`).join('\n')}`} />
              <Go ghost label="Back" onPress={back} />
            </>
          ) : (
            <>
              <Card style={[u.pad, { gap: 6 }]}>
                <SectionHead title={built.baseline.vessel} />
                <Body>{built.baseline.date} · Start {built.baseline.start} · Breaks {built.baseline.breaks.join(', ')}</Body>
                <Body semi>{built.total.toLocaleString('en-US')} autos: {Object.entries(built.brandStart).map(([b, q]) => `${q.toLocaleString('en-US')} ${b}`).join(' + ') || 'no cargo'}</Body>
                <Body>ID {built.operationId} · {v.isTest ? 'TEST' : 'LIVE'}</Body>
              </Card>
              <Card style={[u.pad, { gap: 6 }]}>
                <SectionHead title="Decks" />
                {built.baseline.decks.map((d) => (
                  <Body key={d.id}>{d.label}{d.heights ? ` (${d.heights.map((h) => `${h.m.toFixed(2)} m${h.current ? '*' : ''}`).join(' / ')})` : ''}: {d.hatches.map((h) => `${h.h} ${h.items.map((i) => `${i.brand} ${i.qty}`).join(' + ') || 'empty'}`).join(' · ')}</Body>
                ))}
              </Card>
              {built.baseline.destinations.length > 0 && (
                <Card style={[u.pad, { gap: 6 }]}>
                  <SectionHead title="Destinations" />
                  {built.baseline.destinations.map((d) => (
                    <Body key={d.name}>{d.name} · {d.side === 'N' ? 'Northside' : 'Southside'} · clear-by −{d.clearBy} min{d.autos != null ? ` · ${d.autos.toLocaleString('en-US')} autos` : ''}{d.ref ? ` · ${d.ref}` : ''}</Body>
                  ))}
                </Card>
              )}
              {built.warnings.map((w) => <ErrorBox key={w} text={w} />)}
              {built.discrepancies.map((w) => <ErrorBox key={w} text={`Discrepancy: ${w} It stays visible on the vessel; nothing is adjusted.`} />)}
              {built.discrepancies.length > 0 && (
                <Seg options={[{ value: 'no', label: 'Not yet' }, { value: 'yes', label: 'I have seen this' }]} columns={2} value={ack ? 'yes' : 'no'} onChange={(x) => setAck(x === 'yes')} />
              )}
              {error && <ErrorBox text={error} />}
              <Go label="Save vessel" disabled={busy} onPress={save} />
              <Go ghost label="Back" onPress={back} />
            </>
          )}
        </View>
      )}

      {error && !(step === 4 && built) && <ErrorBox text={error} />}
    </>
  );
}

function Nav({ back, next, nextLabel = 'Next' }: { back: () => void; next: () => void; nextLabel?: string }) {
  return <View style={{ gap: 10 }}><Go label={nextLabel} onPress={next} /><Go ghost label="Back" onPress={back} /></View>;
}
