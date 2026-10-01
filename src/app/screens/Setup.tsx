// New-vessel setup (protocol §11.1), one step per screen, plus baseline import. Nothing is saved until
// Review. All checks live in src/app/setup.ts; the destination directory (side, cutoff, miles) is
// src/engine/terminal.ts. This only lays out the questions.
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Reject } from '../../engine/index.ts';
import { TERMINAL, terminalInfo } from '../../engine/terminal.ts';
import { buildBaseline, deckFromDraft, emptyDeck, groupAllocations, importBaseline, mergeProposal, noteLines, type Allocation, type Built, type DeckDraft, type SetupForm } from '../setup.ts';
import { aiStatus, proposeSetup, readPhotos } from '../ai.ts';
import { color, TAP, useType } from '../theme.ts';
import { Body, Card, Chip, ErrorBox, Field, Go, Note, SectionHead, Seg, u } from './ui.tsx';

const STEPS = ['Vessel', 'Start', 'Cargo to destinations', 'Decks', 'Review'];
const blank = (): Allocation => ({ brand: '', autos: '', destination: '' });
const BERTHS = [{ value: '1', label: 'Berth 1' }, { value: '2', label: 'Berth 2' }, { value: '3', label: 'Berth 3' }];

// Content only: it lives inside the Vessels sheet, so there is never a second modal (iOS freezes on stacked modals).
export function Setup({ isTest, setIsTest, onKey, onCreate }: {
  isTest: boolean; setIsTest: (t: boolean) => void; onKey: (k: string) => void;
  onCreate: (b: Extract<Built, { ok: true }>, isTest: boolean, notes: string[]) => Promise<{ ok: true } | Reject>;
}) {
  const f = useType();
  const [step, setStep] = useState(0);
  const [v, setV] = useState({ vessel: '', date: '', port: '', berth: '', start: '08:00', drivers: '' });
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  const [allocs, setAllocs] = useState<Allocation[]>([blank()]);
  const [decks, setDecks] = useState<DeckDraft[]>([]);
  const [imported, setImported] = useState<Built | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openDrop, setOpenDrop] = useState<number | null>(null);
  // Photo import: the recognized text, which fields were prefilled (tag clears when the step is confirmed with Next),
  // messages about values that were not used, and the paperwork lines Colby ticked to keep as Plan notes.
  const [photo, setPhoto] = useState<{ text: string; pages: number; filled: string[]; msgs: string[] } | null>(null);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  const [showText, setShowText] = useState(false);
  const [keep, setKeep] = useState<string[]>([]);

  useEffect(() => { setAck(false); setOpenDrop(null); onKey(`${step}${imported ? 'i' : ''}${pasteOpen}`); }, [step, imported, pasteOpen]);

  // Typed answers → SetupForm → checked baseline.
  const typed = (): Built => {
    const errs: string[] = [];
    const ds = decks.map((d) => { const r = deckFromDraft(d); errs.push(...r.errors); return r.deck; });
    const g = groupAllocations(allocs);
    errs.push(...g.errors);
    const form: SetupForm = {
      vessel: v.vessel, date: v.date, port: v.port, berth: v.berth, isTest, start: v.start,
      drivers: v.drivers.trim() === '' ? null : Number(v.drivers),
      sources: photo ? [`Photo import (${photo.pages} page${photo.pages === 1 ? '' : 's'})`] : [], destinations: g.destinations, decks: ds,
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
      const r = await onCreate(built, isTest, imported ? [] : keep);
      if (!r.ok) setError(r.error);
    } catch (e) {
      setError(`Could not save the vessel: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  const back = () => { setError(null); if (imported) { setImported(null); setStep(0); } else setStep(step - 1); };
  const go = (n: number) => { setError(null); if (n > step && !confirmed.includes(step)) setConfirmed([...confirmed, step]); setStep(n); };

  // Paperwork photos → text → (AI on) a checked proposal merged into the empty fields. AI off: text only.
  const fromPhotos = async (src: 'camera' | 'library') => {
    setError(null); setBusy(true);
    try {
      const r = await readPhotos(src);
      if (!r) return;
      const text = r.pages.join('\n\n').trim();
      if (!text) return setError('No text found in those photos. Try a sharper photo, or type the values.');
      const msgs: string[] = [];
      let filled: string[] = [];
      if (aiStatus() === 'ready') {
        const p = await proposeSetup(text);
        if (!p) msgs.push('The on-device AI could not read values from this text. Copy them from the text below.');
        else {
          const m = mergeProposal({ v: { vessel: v.vessel, date: v.date, port: v.port, berth: v.berth }, allocs, decks }, p.value);
          setV({ ...v, ...m.drafts.v }); setAllocs(m.drafts.allocs); setDecks(m.drafts.decks);
          filled = m.filled;
          msgs.push(...m.unplaced, ...p.dropped.map((d) => `Not used: ${d}`));
          if (!filled.length) msgs.push('Nothing could be filled from this text. Copy values from the text below.');
        }
      } else msgs.push('On-device AI is not available, so nothing is prefilled. The text is shown on every step to copy from.');
      setPhoto({ text, pages: r.pages.length, filled, msgs }); setConfirmed([]); setKeep([]);
    } catch (e) {
      setError(`Could not read the photos: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  const STEP_FIELDS: Record<number, string[]> = { 0: ['vessel', 'date', 'port', 'berth'], 2: ['destinations'], 3: ['decks'] };
  const tagged = photo && !confirmed.includes(step) ? (STEP_FIELDS[step] ?? []).filter((k) => photo.filled.includes(k)) : [];
  const photoAids = photo && !imported && step < 4 && (
    <View style={{ gap: 8 }}>
      {tagged.length > 0 && <Chip tone="orange" text={`From photo: check ${tagged.join(', ')}`} />}
      <Go ghost label={showText ? 'Hide paperwork text' : 'Show paperwork text'} onPress={() => setShowText(!showText)} />
      {showText && <Card style={[u.pad]}><Body>{photo.text}</Body></Card>}
    </View>
  );

  const setAlloc = (i: number, a: Partial<Allocation>) => setAllocs(allocs.map((x, j) => (j === i ? { ...x, ...a } : x)));
  const setDeck = (i: number, d: DeckDraft) => setDecks(decks.map((x, j) => (j === i ? d : x)));
  const brands = [...new Set(allocs.map((a) => a.brand.trim()).filter(Boolean))]; // brands already typed, offered as taps in Decks
  const setItem = (i: number, hi: number, ii: number, p: Partial<{ brand: string; qty: string }>) =>
    setDeck(i, { ...decks[i], hatches: decks[i].hatches.map((h, k) => (k === hi ? { ...h, items: h.items.map((z, m) => (m === ii ? { ...z, ...p } : z)) } : h)) });
  const modes = [{ value: 'live', label: 'LIVE vessel' }, { value: 'test', label: 'TEST / demo' }];

  return (
    <>
      <Note>{imported ? 'Imported baseline: check every value, then save.' : step === 4 ? 'Step 5 of 5: Review. Check everything, then save.' : `Step ${step + 1} of 5: ${STEPS[step]}. Nothing is saved until Review.`}</Note>

      {photoAids}

      {step === 0 && !pasteOpen && (
        <View style={{ gap: 12 }}>
          {photo?.msgs.map((m) => <Note key={m}>{m}</Note>)}
          <Field label="Vessel name" value={v.vessel} onChange={set('vessel')} keyboard="default" />
          <Field label="Operation date" note="M/D/YYYY" value={v.date} onChange={set('date')} keyboard="numbers-and-punctuation" />
          <Field label="Port" value={v.port} onChange={set('port')} keyboard="default" />
          <Body semi>Berth</Body>
          <Seg options={BERTHS} value={v.berth || null} onChange={set('berth')} />
          <Note>The berth sets the miles to each destination.</Note>
          <Seg options={modes} columns={2} value={isTest ? 'test' : 'live'} onChange={(x) => setIsTest(x === 'test')} />
          <Note>TEST data never mixes with a live vessel. Reference vessels (Glovis Condor 101) can only be TEST.</Note>
          <Go label="Next" onPress={() => { if (!v.vessel.trim()) setError('The vessel needs a name.'); else if (!v.berth) setError('Choose the berth.'); else go(1); }} />
          <Go ghost label="Read paperwork: choose photos" disabled={busy} onPress={() => fromPhotos('library')} />
          <Go ghost label="Read paperwork: take a picture" disabled={busy} onPress={() => fromPhotos('camera')} />
          {busy && <Note>Reading the paperwork…</Note>}
          <Go ghost label="Import a baseline instead" onPress={() => { setError(null); setPasteOpen(true); }} />
        </View>
      )}

      {step === 0 && pasteOpen && (
        <View style={{ gap: 12 }}>
          <Note>Paste a baseline JSON (same shape as the Glovis Condor 101 baseline). Its text is data only.</Note>
          <TextInput value={paste} onChangeText={setPaste} multiline autoCorrect={false} autoCapitalize="none" accessibilityLabel="Baseline JSON"
            placeholder="Paste here" placeholderTextColor={color.muted} style={[u.input, { fontFamily: f.body, fontSize: 15, minHeight: 160, paddingTop: 12, textAlignVertical: 'top' }]} />
          <Seg options={modes} columns={2} value={isTest ? 'test' : 'live'} onChange={(x) => setIsTest(x === 'test')} />
          <Go label="Review imported baseline" disabled={paste.trim() === ''} onPress={() => {
            const r = importBaseline(paste, isTest);
            if (r.ok) { setError(null); setImported(r); setStep(4); } else setError(r.errors.join('\n'));
          }} />
          <Go ghost label="Back" onPress={() => { setError(null); setPasteOpen(false); }} />
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 12 }}>
          <Field label="Planned start" note="HH:MM" value={v.start} onChange={set('start')} keyboard="numbers-and-punctuation" />
          <Field label="Drivers, Day 1" note="leave empty if unknown" value={v.drivers} onChange={set('drivers')} />
          <Nav back={back} next={() => go(2)} />
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 12 }}>
          <Note>One line per brand and destination. The side, clear-by and miles fill in from the destination you choose.</Note>
          {allocs.map((a, i) => {
            const info = a.destination ? terminalInfo(a.destination, v.berth) : null;
            return (
              <Card key={i} style={[u.pad, { gap: 10 }]}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Field label="Brand" value={a.brand} onChange={(x) => setAlloc(i, { brand: x })} keyboard="default" placeholder="Kia, Hyundai…" />
                  <Field label="Autos" value={a.autos} onChange={(x) => setAlloc(i, { autos: x })} />
                </View>
                <Body semi>Destination</Body>
                <Pressable onPress={() => setOpenDrop(openDrop === i ? null : i)} accessibilityRole="button" accessibilityLabel="Choose destination"
                  style={({ pressed }) => [u.input, { minHeight: TAP, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
                  <Text style={{ fontFamily: f.bodyMedium, fontSize: 18, color: a.destination ? color.ink : color.muted }}>{a.destination || 'Choose destination'}  ▾</Text>
                </Pressable>
                {openDrop === i && (['N', 'S'] as const).map((side) => (
                  <View key={side} style={{ gap: 4 }}>
                    <Note>{side === 'N' ? 'Northside · clear-by 15 min' : 'Southside · clear-by 30 min'}</Note>
                    {TERMINAL.filter((d) => d.side === side).map((d) => {
                      const mi = terminalInfo(d.name, v.berth)?.mi;
                      return (
                        <Pressable key={d.name} onPress={() => { setAlloc(i, { destination: d.name }); setOpenDrop(null); }} accessibilityRole="button"
                          style={({ pressed }) => [{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: color.row }, pressed && { opacity: 0.6 }]}>
                          <Text style={{ fontFamily: f.bodyMedium, fontSize: 17, color: color.ink, flexShrink: 1 }}>{d.name}</Text>
                          <Text style={{ fontFamily: f.body, fontSize: 14, color: color.muted }}>{mi == null ? '' : `${mi.toFixed(2)} mi`}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
                {info && <Chip text={`${info.side === 'N' ? 'Northside' : 'Southside'} · clear-by −${info.clearBy} min · ${info.mi == null ? 'miles unknown' : `${info.mi.toFixed(2)} mi from Berth ${v.berth}`}`} />}
                {allocs.length > 1 && <Go ghost label="Remove line" onPress={() => setAllocs(allocs.filter((_, j) => j !== i))} />}
              </Card>
            );
          })}
          <Go ghost label="Add another brand / destination" onPress={() => setAllocs([...allocs, blank()])} />
          <Nav back={back} next={() => go(3)} />
        </View>
      )}

      {step === 3 && (
        <View style={{ gap: 12 }}>
          <Note>Decks in discharge order. Hatches read H4 → H1; leave a hatch empty if it holds nothing.</Note>
          {decks.map((d, i) => (
            <Card key={i} style={[u.pad, { gap: 10 }]}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Deck" value={d.label} onChange={(x) => setDeck(i, { ...d, label: x })} keyboard="default" placeholder="Upper, D12, D9…" />
                <Field label="Deck total" note="check" value={d.total} onChange={(x) => setDeck(i, { ...d, total: x })} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Deck height (m)" note="optional" value={d.current} onChange={(x) => setDeck(i, { ...d, current: x })} keyboard="numbers-and-punctuation" />
              </View>
              {d.hatches.map((h, hi) => (
                <View key={h.h} style={{ gap: 8, borderTopWidth: 1, borderTopColor: color.row, paddingTop: 10 }}>
                  <Body semi>Hatch {h.h}</Body>
                  {h.items.map((it, ii) => (
                    <View key={ii} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Field label="Brand" value={it.brand} onChange={(x) => setItem(i, hi, ii, { brand: x })} keyboard="default" />
                        <Field label="Autos" value={it.qty} onChange={(x) => setItem(i, hi, ii, { qty: x })} />
                      </View>
                      {brands.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {brands.map((b) => <Pressable key={b} onPress={() => setItem(i, hi, ii, { brand: b })} accessibilityRole="button" accessibilityLabel={`Brand ${b}`}><Chip tall text={b} /></Pressable>)}
                        </View>
                      )}
                    </View>
                  ))}
                  <Go ghost label={`Add another brand in ${h.h}`} onPress={() => setDeck(i, { ...d, hatches: d.hatches.map((y, k) => (k === hi ? { ...y, items: [...y.items, { brand: '', qty: '' }] } : y)) })} />
                </View>
              ))}
              <Go ghost label="Remove deck" onPress={() => setDecks(decks.filter((_, j) => j !== i))} />
            </Card>
          ))}
          <Go ghost label="Add deck" onPress={() => setDecks([...decks, emptyDeck()])} />
          <Nav back={back} next={() => go(4)} nextLabel="Review" />
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
                <Body>{built.baseline.date} · Start {built.baseline.start} · Berth {String(built.baseline.berth ?? '')}</Body>
                <Body semi>{built.total.toLocaleString('en-US')} autos: {Object.entries(built.brandStart).map(([b, q]) => `${q.toLocaleString('en-US')} ${b}`).join(' + ') || 'no cargo'}</Body>
                <Body>ID {built.operationId} · {isTest ? 'TEST' : 'LIVE'}</Body>
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
                    <Body key={d.name}>{d.name} · {d.side === 'N' ? 'Northside' : 'Southside'} · clear-by −{d.clearBy} min{d.mi != null ? ` · ${d.mi.toFixed(2)} mi` : ''}{d.autos != null ? ` · ${d.autos.toLocaleString('en-US')} autos` : ''}{d.brands?.length ? ` · ${d.brands.join(' + ')}` : ''}</Body>
                  ))}
                </Card>
              )}
              {built.warnings.map((w) => <ErrorBox key={w} text={w} />)}
              {built.discrepancies.map((w) => <ErrorBox key={w} text={`Discrepancy: ${w} It stays visible on the vessel; nothing is adjusted.`} />)}
              {built.discrepancies.length > 0 && (
                <Seg options={[{ value: 'no', label: 'Not yet' }, { value: 'yes', label: 'I have seen this' }]} columns={2} value={ack ? 'yes' : 'no'} onChange={(x) => setAck(x === 'yes')} />
              )}
              {photo && !imported && noteLines(photo.text).length > 0 && (
                <Card style={[u.pad, { gap: 8 }]}>
                  <SectionHead title="Notes for Plan" />
                  <Note>Tick the paperwork lines to keep as Plan notes. You can edit them in Plan later.</Note>
                  {noteLines(photo.text).map((line) => {
                    const on = keep.includes(line);
                    return (
                      <Pressable key={line} onPress={() => setKeep(on ? keep.filter((x) => x !== line) : [...keep, line])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        style={({ pressed }) => [{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.row }, pressed && { opacity: 0.6 }]}>
                        <Text style={{ fontFamily: f.bodySemi, fontSize: 22, color: color.ink }}>{on ? '☑' : '☐'}</Text>
                        <Body style={{ flexShrink: 1 }}>{line}</Body>
                      </Pressable>
                    );
                  })}
                </Card>
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
