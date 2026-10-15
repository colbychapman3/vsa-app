// New-vessel setup (protocol §11.1), one step per screen. Start from a photo of the APS game plan cover page
// (spec phase-6e: deterministic reader, no AI), choose a file (picture or text), paste text, or type it in. Nothing is saved until Review.
// All checks live in src/app/setup.ts and src/app/gamePlan.ts; this only lays out the questions.
import { pickSetupFile } from '../importFile.ts';
import { readDeckLines } from '../deckLines.ts';
import { useEffect, useState, type MutableRefObject } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Text, TextInput } from './text.tsx';
import type { Reject } from '../../engine/index.ts';
import { TERMINAL, terminalInfo } from '../../engine/terminal.ts';
import {
  buildBaseline, deckFromDraft, emptyDeck, groupAllocations, HATCHES, importBaseline, loadListCheck, mergeGamePlan, verificationFor,
  type Allocation, type Built, type DeckDraft, type HhEntry, type SetupForm,
} from '../setup.ts';
import { blankDraft, type SetupDraft } from '../setupDraft.ts';
import { readGamePlanPages, type GamePlan } from '../gamePlan.ts';
import { doubts, shipCard, watchList } from '../prep.ts';
import { historyLine, type Lessons } from '../history.ts';
import { brandFor, readDischargeSummary } from '../dischargeSummary.ts';
import type { Page } from '../layout.ts';
import { readImages, readPhotos } from '../ai.ts';
import { bcolor, color, TAP, useType } from '../theme.ts';
import { Body, Card, Chip, ErrorBox, Field, Go, Note, SectionHead, Seg, u, InfoNote } from './ui.tsx';

const STEPS = ['Vessel', 'Start', 'Cargo to destinations', 'Decks', 'Load list', 'Review'];
const LAST = STEPS.length - 1;
const blank = (): Allocation => ({ brand: '', autos: '', destination: '' });
// A refused file shows its first 3 problems, not a wall of them (Colby, 2026-10-12).
const fewErrors = (e: string[]) => [...e.slice(0, 3), ...(e.length > 3 ? [`…and ${e.length - 3} more.`] : [])].join('\n');
const BERTHS = [{ value: '1', label: 'Berth 1' }, { value: '2', label: 'Berth 2' }, { value: '3', label: 'Berth 3' }];
const SOURCE = 'Game plan photo (APS cover page)';
const n = (x: number) => x.toLocaleString('en-US');
type GameRead = { filled: string[]; problems: string[]; notes: string[]; extras: string[]; scans: Page[]; decks: number; autos: number | null; hhTotal: number | null };

// Content only: it lives inside the New vessel sheet, so there is never a second modal (iOS freezes on stacked modals).
export function Setup({ isTest, setIsTest, onKey, onCreate, initial = blankDraft(), snap, onDraft, history }: {
  isTest: boolean; setIsTest: (t: boolean) => void; onKey: (k: string) => void; history?: { live: Lessons; test: Lessons };
  initial?: SetupDraft; snap?: MutableRefObject<SetupDraft | null>; onDraft?: (d: SetupDraft) => void; // a resumed draft in; the current answers out (the sheet asks before closing)
  onCreate: (b: Extract<Built, { ok: true }>, isTest: boolean, notes: string[], photos: string[]) => Promise<{ ok: true } | Reject>;
}) {
  const f = useType();
  const [mode, setMode] = useState<'start' | 'form' | 'paste'>(initial.mode);
  const [step, setStep] = useState(initial.step);
  const [v, setV] = useState(initial.v);
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  const [allocs, setAllocs] = useState<Allocation[]>(initial.allocs);
  const [decks, setDecks] = useState<DeckDraft[]>(initial.decks);
  const [hh, setHh] = useState<HhEntry[]>(initial.hh);
  const [load, setLoad] = useState<Record<string, string>>(initial.load);
  const [loadHh, setLoadHh] = useState(initial.loadHh);
  const [override, setOverride] = useState(initial.override);
  const [imported, setImported] = useState<Built | null>(() => { if (!initial.imported) return null; const r = importBaseline(initial.paste, initial.isTest); return r.ok ? r : null; });
  const [paste, setPaste] = useState(initial.paste);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState<string[]>([]); // temporary copies of the paperwork photos read here; saved with the vessel only if Settings says keep
  const [sumMsg, setSumMsg] = useState<string | null>(null); // what the last discharge summary photo filled, or why not
  const [openDrop, setOpenDrop] = useState<number | null>(null);
  const [read, setRead] = useState<GameRead | null>(initial.read ? { ...initial.read, scans: [] } : null);
  const [failed, setFailed] = useState<{ text: string; scans: Page[] } | null>(null);
  const [confirmed, setConfirmed] = useState<number[]>(initial.confirmed);
  const [keep, setKeep] = useState<string[]>(initial.keep);
  const [source, setSource] = useState(SOURCE); // what the drafts were read from, for the baseline's sources
  const [fieldByField, setFieldByField] = useState(false); // after a photo read the ship card comes first; this opens the step-by-step questions instead

  // The sheet reads this when the user tries to close: the answers so far, as text only (no photos).
  if (snap) snap.current = {
    isTest, mode: imported ? 'paste' : mode, step, imported: !!imported, v, allocs, decks, hh, load, loadHh, override, paste, keep, confirmed,
    read: read ? { filled: read.filled, problems: read.problems, notes: read.notes, extras: read.extras, decks: read.decks, autos: read.autos, hhTotal: read.hhTotal } : null,
  };

  useEffect(() => { if (snap?.current) onDraft?.(snap.current); }); // every render: the autosaver only acts on a real change

  useEffect(() => { setAck(false); setOpenDrop(null); onKey(`${step}${imported ? 'i' : ''}${mode}`); }, [step, imported, mode, onKey]);

  // Typed answers → SetupForm → checked baseline. withCheck adds the load list verification (Review only).
  const typed = (withCheck = false): Built => {
    const errs: string[] = [];
    const ds = decks.map((d) => { const r = deckFromDraft(d); errs.push(...r.errors); return r.deck; });
    const g = groupAllocations(allocs);
    errs.push(...g.errors);
    const form: SetupForm = {
      vessel: v.vessel, date: v.date, port: v.port, berth: v.berth, isTest, start: v.start,
      drivers: v.drivers.trim() === '' ? null : Number(v.drivers),
      sources: read ? [source] : [], destinations: g.destinations, decks: ds,
      ...(hh.length ? { hh } : {}),
      ...(read ? { hhTotal: read.hhTotal } : {}),
    };
    const built = buildBaseline(form);
    if (errs.length || !built.ok) return { ok: false, errors: [...errs, ...(built.ok ? [] : built.errors)] };
    if (!withCheck) return built;
    const c = check(built.brandStart);
    return buildBaseline({ ...form, verification: verificationFor(c, override) });
  };
  // The game plan's H/H figure is its printed TOTAL only; a sum of the rows read is never shown in its place.
  const hhKnown = read?.hhTotal ?? null;
  const check = (brandStart: Record<string, number>) => loadListCheck(load, brandStart, loadHh, hhKnown, hh.length > 0);
  const built = step === LAST ? imported ?? typed(true) : null;
  const loadCheck = built?.ok && !imported ? check(built.brandStart) : null;
  const blocked = !!loadCheck?.mismatch && !override;

  const save = async () => {
    if (!built?.ok) return;
    if (blocked) return setError('The load list differs from the decks. Fix the deck numbers, or choose “Game plan controls (override)”.');
    if (built.discrepancies.length > 0 && !ack) return setError('Choose “I have seen this” under the discrepancy above, then Save.');
    setBusy(true); setError(null);
    try {
      const r = await onCreate(built, isTest, imported ? [] : keep, imported ? [] : kept);
      if (!r.ok) setError(r.error);
    } catch (e) {
      setError(`Could not save the vessel: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  const back = () => { setError(null); if (imported) { setImported(null); setMode('paste'); setStep(0); } else if (step === 0) setMode('start'); else setStep(step - 1); };
  const go = (k: number) => { setError(null); if (k > step && !confirmed.includes(step)) setConfirmed([...confirmed, step]); setStep(k); };

  // Game plan photo → positions → reader → drafts. Fills only empty fields; every filled field is tagged until its step is confirmed.
  const fromPhoto = (src: 'camera' | 'library') => fromImages(() => readPhotos(src, true));
  const fromImages = async (get: () => Promise<{ scans: Page[]; files: string[] } | null>) => {
    setError(null); setFailed(null); setBusy(true);
    try {
      const r = await get();
      if (!r) return;
      const res = readGamePlanPages(r.scans);
      if (!res.ok) { setFailed({ text: res.error, scans: r.scans }); return; }
      setSource(SOURCE);
      takePlan(res.plan, r.scans, r.files);
    } catch (e) {
      setError(`Could not read the photo: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  // Pasted or chosen text: a VSA baseline file is imported as it is; anything else is read as deck lines
  // ("DK12 H4: 53 BMW, 99 MB = 152 > BMW Field, MBZ") into the same drafts a photo fills.
  const fromText = (text: string) => {
    setError(null); setFailed(null);
    if (/^s*{/.test(text)) {
      const r = importBaseline(text, isTest);
      if (r.ok) { setPaste(text); setImported(r); setMode('paste'); setStep(LAST); } else setError(fewErrors(r.errors));
      return;
    }
    const r = readDeckLines(text);
    if (!r.ok) return setError(r.error);
    setSource('Game plan summary (pasted text)');
    takePlan(r.plan, [], []);
  };
  const fromFile = async () => {
    setError(null);
    const p = await pickSetupFile();
    if (p.ok === 'cancelled') return;
    if (p.ok === false) return setError(p.error);
    if ('image' in p) return fromImages(() => readImages([p.image], true));
    fromText(p.text);
  };
  const takePlan = (plan: GamePlan, scans: Page[], files: string[]) => {
    setKept(files); // a new game plan read replaces the earlier pages
    // A second photo replaces the first read: its values never mix with another page's.
    const base = read ? { v: { vessel: '', date: '', port: '', drivers: '' }, allocs: [blank()], decks: [] as DeckDraft[] } : { v: { vessel: v.vessel, date: v.date, port: v.port, drivers: v.drivers }, allocs, decks };
    const m = mergeGamePlan(base, plan);
    setV({ ...v, ...m.drafts.v }); setAllocs(m.drafts.allocs); setDecks(m.drafts.decks); setHh(m.hh);
    setRead({ filled: m.filled, problems: [...plan.problems, ...m.problems], notes: plan.notes, extras: plan.extras, scans,
      decks: m.drafts.decks.length, autos: plan.autosTotal, hhTotal: plan.hhTotal });
    setKeep(plan.notes); // notes-area lines start ticked; Colby can untick them at Review
    if (read) { setLoad({}); setLoadHh(''); setOverride(false); } // a new read starts its load list check over
    setConfirmed([]); setFieldByField(false); setStep(0); setMode('form');
  };
  // Discharge summary photo → its printed brand totals → the load list boxes below (empty boxes only; Colby checks them).
  const fromSummary = async (src: 'camera' | 'library', rowBrands: string[]) => {
    setError(null); setSumMsg(null); setBusy(true);
    try {
      const r = await readPhotos(src, true);
      if (!r) return;
      const res = readDischargeSummary(r.scans);
      if (!res.ok) { setSumMsg(res.error); return; }
      setKept((k) => [...k, ...r.files]);
      const next = { ...load }; const left: string[] = [];
      for (const tt of res.totals) { const b = brandFor(tt.label, rowBrands); if (b && !(next[b] ?? '').trim()) next[b] = String(tt.count); else if (!b) left.push(`${tt.count} ${tt.label}`); }
      setLoad(next); setOverride(false);
      if (res.hh != null && !loadHh.trim()) setLoadHh(String(res.hh));
      setSumMsg(`Filled from the page: check each box. ${res.note}${left.length ? ` Not placed (no matching brand on this vessel): ${left.join(', ')}.` : ''}`);
    } catch (e) {
      setError(`Could not read the photo: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  const shareRead = (scans: Page[]) => { void Share.share({ message: JSON.stringify({ kind: 'VSA game plan read', scans }) }); };
  const startOver = () => {
    setV({ vessel: '', date: '', port: '', berth: '', start: '08:00', drivers: '' }); setAllocs([blank()]); setDecks([]); setHh([]);
    setLoad({}); setLoadHh(''); setOverride(false); setRead(null); setFailed(null); setKeep([]); setConfirmed([]); setFieldByField(false); setStep(0); setMode('start');
  };

  const STEP_FIELDS: Record<number, string[]> = { 0: ['vessel', 'date', 'port'], 1: ['drivers'], 2: ['destinations'], 3: ['decks'] };
  const tagged = read && !confirmed.includes(step) ? (STEP_FIELDS[step] ?? []).filter((k) => read.filled.includes(k)) : [];

  const setAlloc = (i: number, a: Partial<Allocation>) => setAllocs(allocs.map((x, j) => (j === i ? { ...x, ...a } : x)));
  const setDeck = (i: number, d: DeckDraft) => setDecks(decks.map((x, j) => (j === i ? d : x)));
  const brands = [...new Set(allocs.map((a) => a.brand.trim()).filter(Boolean))]; // brands already typed, offered as taps in Decks
  const setItem = (i: number, hi: number, ii: number, p: Partial<{ brand: string; qty: string }>) =>
    setDeck(i, { ...decks[i], hatches: decks[i].hatches.map((h, k) => (k === hi ? { ...h, items: h.items.map((z, m) => (m === ii ? { ...z, ...p } : z)) } : h)) });
  const setSplit = (i: number, si: number, p: Partial<{ brand: string; qty: string }>) =>
    setDeck(i, { ...decks[i], split: decks[i].split!.map((z, m) => (m === si ? { ...z, ...p } : z)) });
  const toggleHatch = (i: number, h: string) => {
    const d = decks[i];
    const on = d.hatches.some((x) => x.h === h);
    setDeck(i, { ...d, hatches: on ? d.hatches.filter((x) => x.h !== h) : HATCHES.filter((x) => x === h || d.hatches.some((y) => y.h === x)).map((x) => ({ h: x, items: [] })) });
  };
  const modes = [{ value: 'live', label: 'LIVE vessel' }, { value: 'test', label: 'TEST / demo' }];
  const tag = tagged.length > 0 && <Chip tone="orange" text={`From game plan: check ${tagged.join(', ')}`} />;

  return (
    <>
      {mode === 'start' && (
        <View style={{ gap: 12 }}>
          <Card style={[u.pad, { gap: 10 }]}>
            <SectionHead title="Read the game plan" />
            <Body>A photo of the game plan cover page, flat and in focus. Everything fills in for you to check; nothing is saved until Review.</Body>
            {busy ? <Note>Reading the game plan…</Note> : (
              <>
                <Go label="Take a picture" onPress={() => fromPhoto('camera')} />
                <Go ghost label="Choose a photo" onPress={() => fromPhoto('library')} />
              </>
            )}
          </Card>
          {failed && (
            <>
              <ErrorBox text={failed.text} />
              <Go ghost label="Share what was read" onPress={() => shareRead(failed.scans)} />
            </>
          )}
          {error && <ErrorBox text={error} />}
          {/* Other ways in, one row each (Colby, 2026-10-12: the old JSON-only import was clunky). Choose a file takes any
              picture or text file and sends it the right way; Paste text takes deck lines or a VSA file. */}
          <Card style={[u.pad, { gap: 10 }]}>
            <SectionHead title="Other ways" />
            <Go ghost label="Choose a file" onPress={() => { void fromFile(); }} />
            <Go ghost label="Paste text" onPress={() => { setError(null); setMode('paste'); }} />
            <Go ghost label="Type it in" onPress={() => { setError(null); setMode('form'); }} />
          </Card>
        </View>
      )}

      {mode === 'paste' && !imported && (
        <View style={{ gap: 12 }}>
          <Body>Paste the deck lines, like “DK12 H4: 53 BMW, 99 MB = 152 &gt; BMW Field, MBZ”. You check everything before it’s saved.</Body>
          <TextInput value={paste} onChangeText={setPaste} multiline autoCorrect={false} autoCapitalize="none" accessibilityLabel="Pasted text"
            placeholder="Paste here" placeholderTextColor={color.muted} style={[u.input, { fontFamily: f.body, fontSize: 15, minHeight: 160, paddingTop: 12, textAlignVertical: 'top' }]} />
          <Seg options={modes} columns={2} value={isTest ? 'test' : 'live'} onChange={(x) => setIsTest(x === 'test')} />
          <Go label="Read it" disabled={paste.trim() === ''} onPress={() => fromText(paste)} />
          <Go ghost label="Back" onPress={() => { setError(null); setMode('start'); }} />
          {error && <ErrorBox text={error} />}
        </View>
      )}

      {(mode === 'form' || imported) && !(read && !fieldByField && step === 0 && !imported) && (
        <Note>{imported ? 'Imported baseline: check every value, then save.' : step === LAST ? `Step ${LAST + 1} of ${LAST + 1}: Review. Check everything, then save.` : `Step ${step + 1} of ${LAST + 1}: ${STEPS[step]}. Nothing is saved until Review.`}</Note>
      )}

      {mode === 'form' && !imported && step === 0 && read && !fieldByField && (() => {
        const b = typed();
        const d = doubts({ built: b, gamePlanAutos: read.autos, problems: read.problems, berth: v.berth, decks });
        const c = b.ok ? shipCard(b, hhKnown) : null;
        const blocking = d.some((x) => x.blocks);
        return (
          <View style={{ gap: 12 }}>
            {c && (
              <Card style={[u.pad, { gap: 6 }]}>
                <SectionHead title={v.vessel || 'The ship'} />
                <Body semi>{n(c.total)} autos · {c.decks} deck{c.decks === 1 ? '' : 's'}</Body>
                {c.destinations.map((x) => <Body key={x.name}>{x.name} · {x.side === 'N' ? 'Northside' : 'Southside'}{x.autos != null ? ` · ${n(x.autos)}` : ''}</Body>)}
                <Body>{c.southPct == null ? 'Southside share: unknown (a destination has no count)' : `Southside share: ${n(c.southAutos!)} autos (${c.southPct}%)`}</Body>
                {c.hh != null && <Note>High & Heavy {n(c.hh)} (own ledger, not in the autos)</Note>}
              </Card>
            )}
            <Body semi>{d.length === 0 ? 'Nothing is in doubt.' : d.length === 1 ? 'One thing is in doubt:' : `${d.length} things are in doubt:`}</Body>
            {d.map((x) => (
              <Card key={x.id} style={[u.pad, { gap: 8 }]}>
                <Text style={[u.note, { color: x.kind === 'missing' ? color.ink : color.oInk, fontFamily: f.bodyMedium }]}>{x.text}</Text>
                {x.ask === 'berth' && <Seg options={BERTHS} value={v.berth || null} onChange={set('berth')} />}
                {x.ask && x.ask !== 'berth' && <Field label="Deck height (m)" note="optional" value={decks[x.ask.height]?.current ?? ''} onChange={(t) => { const k = (x.ask as { height: number }).height; setDeck(k, { ...decks[k], current: t }); }} keyboard="numbers-and-punctuation" />}
              </Card>
            ))}
            <Field label="Planned start" note="HH:MM · not on the paperwork" value={v.start} onChange={set('start')} keyboard="numbers-and-punctuation" />
            {error && <ErrorBox text={error} />}
            <Go label="Looks right: load list" disabled={blocking} onPress={() => { setError(null); setConfirmed([0, 1, 2, 3]); setStep(4); }} />
            <Go ghost label="Check every field one by one" onPress={() => setFieldByField(true)} />
            <Go ghost label="Start over with another photo" onPress={startOver} />
          </View>
        );
      })()}

      {mode === 'form' && !imported && step === 0 && read && fieldByField && (
        <Card style={[u.pad, { gap: 8 }]}>
          <SectionHead title="Read from the game plan" />
          <Body>
            Filled: {[read.filled.includes('vessel') && 'vessel', read.filled.includes('date') && 'date', read.filled.includes('port') && 'port',
              read.filled.includes('decks') && `${read.decks} deck${read.decks === 1 ? '' : 's'}${read.autos != null ? ` (game plan total ${n(read.autos)} autos)` : ''}`,
              read.filled.includes('destinations') && 'brand / destination lines', hh.length && `H/H ${hhKnown != null ? n(hhKnown) : 'count'} (own ledger)`,
              read.notes.length && `${read.notes.length} note${read.notes.length === 1 ? '' : 's'}`].filter(Boolean).join(', ') || 'nothing'}.
          </Body>
          <InfoNote><Note>Not on the game plan: berth, planned start{read.filled.includes('drivers') ? '' : ', drivers'}, deck heights, counts per hatch.</Note></InfoNote>
          {read.problems.map((p) => <Text key={p} style={[u.note, { color: color.oInk, fontFamily: f.body }]}>• {p}</Text>)}
          {read.scans.length > 0 && <Go ghost label="Share what was read" onPress={() => shareRead(read.scans)} />}
          <Go ghost label="Start over with another photo" onPress={startOver} />
        </Card>
      )}

      {mode === 'form' && !imported && step === 0 && !(read && !fieldByField) && (
        <View style={{ gap: 12 }}>
          {tag}
          <Field label="Vessel name" value={v.vessel} onChange={set('vessel')} keyboard="default" />
          <Field label="Operation date" note="M/D/YYYY" value={v.date} onChange={set('date')} keyboard="numbers-and-punctuation" />
          <Field label="Port" value={v.port} onChange={set('port')} keyboard="default" />
          <Body semi>Berth</Body>
          <Seg options={BERTHS} value={v.berth || null} onChange={set('berth')} />
          <InfoNote><Note>The berth sets the miles to each destination.</Note></InfoNote>
          <Seg options={modes} columns={2} value={isTest ? 'test' : 'live'} onChange={(x) => setIsTest(x === 'test')} />
          <InfoNote><Note>TEST data never mixes with a live vessel. Reference vessels (Glovis Condor 101) can only be TEST.</Note></InfoNote>
          <Go label="Next" onPress={() => { if (!v.vessel.trim()) setError('The vessel needs a name.'); else if (!v.berth) setError('Choose the berth.'); else go(1); }} />
          <Go ghost label="Back" onPress={back} />
        </View>
      )}

      {mode === 'form' && step === 1 && (
        <View style={{ gap: 12 }}>
          {tag}
          <Field label="Planned start" note="HH:MM" value={v.start} onChange={set('start')} keyboard="numbers-and-punctuation" />
          <Field label="Drivers, Day 1" note="leave empty if unknown" value={v.drivers} onChange={set('drivers')} />
          <Nav back={back} next={() => go(2)} />
        </View>
      )}

      {mode === 'form' && step === 2 && (
        <View style={{ gap: 12 }}>
          {tag}
          <InfoNote><Note>One line per brand and destination. The side, clear-by and miles fill in from the destination you choose.</Note></InfoNote>
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
                  <Text style={{ fontFamily: f.bodyMedium, fontSize: 17, color: a.destination ? color.ink : color.muted }}>{a.destination || 'Choose destination'}  ▾</Text>
                </Pressable>
                {openDrop === i && (['N', 'S'] as const).map((side) => (
                  <View key={side} style={{ gap: 4 }}>
                    <Note>{side === 'N' ? 'Northside · clear-by 15 min' : 'Southside · clear-by 30 min'}</Note>
                    {TERMINAL.filter((d) => d.side === side).map((d) => {
                      const mi = terminalInfo(d.name, v.berth)?.mi;
                      return (
                        <Pressable key={d.name} onPress={() => { setAlloc(i, { destination: d.name }); setOpenDrop(null); }} accessibilityRole="button"
                          style={({ pressed }) => [{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: bcolor.row }, pressed && { opacity: 0.6 }]}>
                          <Text style={{ fontFamily: f.bodyMedium, fontSize: 17, color: color.ink, flexShrink: 1 }}>{d.name}</Text>
                          <Text style={{ fontFamily: f.body, fontSize: 15, color: color.muted }}>{mi == null ? '' : `${mi.toFixed(2)} mi`}</Text>
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

      {mode === 'form' && step === 3 && (
        <View style={{ gap: 12 }}>
          {tag}
          <InfoNote><Note>Decks in discharge order. Hatches read H4 → H1. A deck from the game plan carries its brand split; counts per hatch are not on the game plan and are tracked as you go.</Note></InfoNote>
          {decks.map((d, i) => (
            <Card key={i} style={[u.pad, { gap: 10 }]}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Deck" value={d.label} onChange={(x) => setDeck(i, { ...d, label: x })} keyboard="default" placeholder="Upper, D12, D9…" />
                <Field label="Deck total" note="check" value={d.total} onChange={(x) => setDeck(i, { ...d, total: x })} />
              </View>
              <Field label="Deck height (m)" note="optional" value={d.current} onChange={(x) => setDeck(i, { ...d, current: x })} keyboard="numbers-and-punctuation" />
              {d.split ? (
                <>
                  <Body semi>Brand split</Body>
                  {d.split.map((it, si) => (
                    <View key={si} style={{ flexDirection: 'row', gap: 10 }}>
                      <Field label="Brand" value={it.brand} onChange={(x) => setSplit(i, si, { brand: x })} keyboard="default" />
                      <Field label="Autos" value={it.qty} onChange={(x) => setSplit(i, si, { qty: x })} />
                    </View>
                  ))}
                  <Go ghost label="Add a brand" onPress={() => setDeck(i, { ...d, split: [...d.split!, { brand: '', qty: '' }] })} />
                  <Body semi>Hatches with cargo</Body>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {HATCHES.map((h) => {
                      const on = d.hatches.some((x) => x.h === h);
                      return (
                        <Pressable key={h} onPress={() => toggleHatch(i, h)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Hatch ${h}`}
                          style={({ pressed }) => [u.segBtn, { flexBasis: '22%' }, on && u.segOn, pressed && u.pressed]}>
                          <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: on ? color.bg : color.ink }}>{h}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Go ghost label="Type counts per hatch instead" onPress={() => setDeck(i, { ...d, split: null, hatches: (d.hatches.length ? d.hatches : HATCHES.map((h) => ({ h, items: [] }))).map((h) => ({ h: h.h, items: [{ brand: '', qty: '' }] })) })} />
                </>
              ) : (
                <>
                  {d.hatches.map((h, hi) => (
                    <View key={h.h} style={{ gap: 8, borderTopWidth: 1, borderTopColor: bcolor.row, paddingTop: 10 }}>
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
                  <Go ghost label="Use a deck brand split instead" onPress={() => setDeck(i, { ...d, split: [{ brand: '', qty: '' }], hatches: d.hatches.map((h) => ({ h: h.h, items: [] })) })} />
                </>
              )}
              <Go ghost label="Remove deck" onPress={() => setDecks(decks.filter((_, j) => j !== i))} />
            </Card>
          ))}
          <Go ghost label="Add deck" onPress={() => setDecks([...decks, emptyDeck()])} />
          <Nav back={back} next={() => go(4)} />
        </View>
      )}

      {mode === 'form' && step === 4 && (() => {
        const b = typed();
        if (!b.ok) return (
          <View style={{ gap: 12 }}>
            <ErrorBox text={`Fix these first:\n${b.errors.map((e) => `• ${e}`).join('\n')}`} />
            <Go ghost label="Back" onPress={back} />
          </View>
        );
        const c = check(b.brandStart);
        return (
          <View style={{ gap: 12 }}>
            <InfoNote><Note>Type each brand total from the discharge summary (load list). Leave a box empty if you don't have it. The load list controls unless you choose the game plan at Review.</Note></InfoNote>
            <Card style={[u.pad, { gap: 10 }]}>
              <SectionHead title="Read the discharge summary" />
              {busy ? <Note>Reading the page…</Note> : (
                <>
                  <Go label="Take a picture of the totals" onPress={() => fromSummary('camera', c.rows.map((x) => x.brand))} />
                  <Go ghost label="Choose from camera roll" onPress={() => fromSummary('library', c.rows.map((x) => x.brand))} />
                </>
              )}
              {sumMsg && <Note>{sumMsg}</Note>}
            </Card>
            {c.rows.map((r) => (
              <Card key={r.brand} style={[u.pad, { gap: 6 }]}>
                <Field label={r.brand} value={load[r.brand] ?? ''} onChange={(x) => { setLoad({ ...load, [r.brand]: x }); setOverride(false); }} />
                <Text style={[u.note, { fontFamily: f.body, color: r.diff == null ? color.muted : r.diff === 0 ? color.gInk : color.rInk }]}>
                  Decks: {n(r.decks)}{r.diff == null ? '' : r.diff === 0 ? ' · ✓ match' : ` · difference ${n(Math.abs(r.diff))}`}
                </Text>
              </Card>
            ))}
            {(hh.length > 0 || hhKnown != null) && (
              <Card style={[u.pad, { gap: 6 }]}>
                <Field label="H/H total" value={loadHh} onChange={(x) => { setLoadHh(x); setOverride(false); }} />
                <Text style={[u.note, { fontFamily: f.body }]}>Game plan H/H: {hhKnown == null ? 'not fully read' : n(hhKnown)} (own ledger, not in autos)</Text>
              </Card>
            )}
            {c.errors.map((e) => <ErrorBox key={e} text={e} />)}
            <Nav back={back} next={() => { if (c.errors.length) setError(c.errors[0]); else go(LAST); }} nextLabel="Review" />
          </View>
        );
      })()}

      {step === LAST && built && (mode === 'form' || imported) && (
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
                <Body semi>{n(built.total)} autos: {Object.entries(built.brandStart).map(([b, q]) => `${n(q)} ${b}`).join(' + ') || 'no cargo'}</Body>
                {read?.autos != null && !imported && (
                  <Body style={{ color: built.total === read.autos ? color.gInk : color.rInk }}>Game plan TOTAL {n(read.autos)}: {built.total === read.autos ? 'decks match ✓' : `decks add to ${n(built.total)} (difference ${n(Math.abs(built.total - read.autos))})`}</Body>
                )}
                {(() => { const c = shipCard(built, typeof built.baseline.hhTotal === 'number' ? built.baseline.hhTotal : hhKnown); return (
                  <Body>{c.decks} deck{c.decks === 1 ? '' : 's'} · {c.destinations.length} destination{c.destinations.length === 1 ? '' : 's'} · {c.southPct == null ? 'Southside share unknown' : `Southside ${n(c.southAutos!)} autos (${c.southPct}%)`}</Body>
                ); })()}
                <Body>ID {built.operationId} · {isTest ? 'TEST' : 'LIVE'}</Body>
              </Card>
              <Card style={[u.pad, { gap: 6 }]}>
                <SectionHead title="Decks" />
                {built.baseline.decks.map((d) => (
                  <Body key={d.id}>{d.label}{d.heights ? ` (${d.heights.map((h) => `${h.m.toFixed(2)} m${h.current ? '*' : ''}`).join(' / ')})` : ''}: {d.cargo
                    ? `${d.cargo.map((i) => `${i.brand} ${n(i.qty)}`).join(' + ')} · hatches ${d.hatches.map((h) => h.h).join(' ')} (counts not on paperwork)`
                    : d.hatches.map((h) => `${h.h} ${h.items.map((i) => `${i.brand} ${i.qty}`).join(' + ') || 'empty'}`).join(' · ')}</Body>
                ))}
              </Card>
              {built.baseline.destinations.length > 0 && (
                <Card style={[u.pad, { gap: 6 }]}>
                  <SectionHead title="Destinations" />
                  {built.baseline.destinations.map((d) => (
                    <Body key={d.name}>{d.name} · {d.side === 'N' ? 'Northside' : 'Southside'} · clear-by −{d.clearBy} min{d.mi != null ? ` · ${d.mi.toFixed(2)} mi` : ''}{d.autos != null ? ` · ${n(d.autos)} autos` : ''}{d.brands?.length ? ` · ${d.brands.join(' + ')}` : ''}</Body>
                  ))}
                </Card>
              )}
              {hh.length > 0 && !imported && (
                <Card style={[u.pad, { gap: 6 }]}>
                  <SectionHead title="High & Heavy" right="own ledger" />
                  {hh.map((x, i) => <Body key={i}>{x.deck ? `Deck ${x.deck}` : 'Deck not read'}: {x.qty == null ? 'count not read' : n(x.qty)}{x.cargo ? ` · ${x.cargo}` : ''}</Body>)}
                  <InfoNote><Note>Counted by the H/H stevedore. Never added to your autos.</Note></InfoNote>
                </Card>
              )}
              {loadCheck && (
                <Card style={[u.pad, { gap: 6 }]}>
                  <SectionHead title="Load list" />
                  {!loadCheck.entered && <Body>Load list not checked.</Body>}
                  {loadCheck.entered && !loadCheck.mismatch && <Body style={{ color: color.gInk }}>Load list matches the decks.</Body>}
                  {loadCheck.missing.map((m) => <Note key={m}>{m}</Note>)}
                  {loadCheck.discrepancies.map((d) => <ErrorBox key={d} text={d} />)}
                  {loadCheck.mismatch && (
                    <>
                      <InfoNote><Note>Fix the deck numbers until they match, or let the game plan control. Either way both numbers stay on the vessel and show on Plan.</Note></InfoNote>
                      <Seg options={[{ value: 'fix', label: 'Fix the decks' }, { value: 'gp', label: 'Game plan controls (override)' }]} columns={2}
                        value={override ? 'gp' : 'fix'} onChange={(x) => setOverride(x === 'gp')} />
                    </>
                  )}
                </Card>
              )}
              {built.warnings.map((w) => <ErrorBox key={w} text={w} />)}
              {built.discrepancies.map((w) => <ErrorBox key={w} text={`Discrepancy: ${w} It stays visible on the vessel; nothing is adjusted.`} />)}
              {built.discrepancies.length > 0 && (
                <Seg options={[{ value: 'no', label: 'Not yet' }, { value: 'yes', label: 'I have seen this' }]} columns={2} value={ack ? 'yes' : 'no'} onChange={(x) => setAck(x === 'yes')} />
              )}
              {read && !imported && read.problems.length > 0 && (
                <Card style={[u.pad, { gap: 6 }]}>
                  <SectionHead title="Game plan checks" />
                  {read.problems.map((p) => <Text key={p} style={[u.note, { color: color.oInk, fontFamily: f.body }]}>• {p}</Text>)}
                </Card>
              )}
              {read && !imported && read.notes.length + read.extras.length > 0 && (
                <Card style={[u.pad, { gap: 8 }]}>
                  <SectionHead title="Notes for Plan" />
                  <InfoNote><Note>From the game plan. Ticked lines become Plan notes; untick any you don't want. Notes never change a count.</Note></InfoNote>
                  {[...read.notes, ...read.extras].map((line) => {
                    const on = keep.includes(line);
                    return (
                      <Pressable key={line} onPress={() => setKeep(on ? keep.filter((x) => x !== line) : [...keep, line])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        style={({ pressed }) => [{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: bcolor.row }, pressed && { opacity: 0.6 }]}>
                        <Text style={{ fontFamily: f.bodySemi, fontSize: 22, color: color.ink }}>{on ? '☑' : '☐'}</Text>
                        <Body style={{ flexShrink: 1 }}>{line}</Body>
                      </Pressable>
                    );
                  })}
                </Card>
              )}
              {(
                <Card style={[u.pad, { gap: 6 }]}>
                  <SectionHead title="What the app will watch today" />
                  {watchList(built, { hhExists: imported ? Array.isArray(built.baseline.hh) && built.baseline.hh.length > 0 : hh.length > 0 }).map((l) => <Body key={l}>• {l}</Body>)}
                  {history && historyLine(isTest ? history.test : history.live, built.total) && <Note>{historyLine(isTest ? history.test : history.live, built.total)}</Note>}
                </Card>
              )}
              {error && <ErrorBox text={error} />}
              <Go label="Save vessel" disabled={busy || blocked} onPress={save} />
              <Go ghost label="Back" onPress={back} />
            </>
          )}
        </View>
      )}

      {error && mode === 'form' && !(step === LAST && built) && <ErrorBox text={error} />}
    </>
  );
}

function Nav({ back, next, nextLabel = 'Next' }: { back: () => void; next: () => void; nextLabel?: string }) {
  return <View style={{ gap: 10 }}><Go label={nextLabel} onPress={next} /><Go ghost label="Back" onPress={back} /></View>;
}
