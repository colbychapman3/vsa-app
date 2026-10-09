// Log › Photo (spec phase-6-evidence). Layout only: checks live in src/engine/evidence.ts and entries.ts, every
// save goes through App.save(). Camera: expo-camera (CameraView) inside this same sheet, so only one modal is open.
// The photo is copied at full size into the app folder (never the camera roll) just before saving.
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { EVIDENCE_REASONS, EVIDENCE_TYPES, needsReason, TYPE_LABEL, checkVin, evidencePath, operationDate, parseHM, type Baseline, type EvidenceType, type Reject, type VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { dropUnsavedPhoto, keepPhoto, photoExists, photoUri } from '../evidenceFiles.ts';
import { aiStatus, ocrAvailable, pickLibraryPhotos, readPhotos, tidyNote } from '../ai.ts';
import { vinCandidates, type VinCandidate } from '../../engine/scan.ts';
import { color, useType } from '../theme.ts';
import { TYPE_ICON } from '../view.ts';
import { Body, ErrorBox, Go, Label, Note, Seg, TimeField, u } from './ui.tsx';

type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;
type Item = State['evidence'][number];

// Add a photo (item = null) or edit one already saved (item set: no camera, the file stays as taken).
export function EvidenceForm({ state, baseline, save, item = null, start, onClose }: { state: State; baseline: Baseline; save: Save; item?: Item | null; start?: { deck: string; type: EvidenceType | null }; onClose: (done?: string) => void }) {
  const f = useType();
  const [perm, askPerm] = useCameraPermissions();
  const [cam, setCam] = useState<CameraView | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [added, setAdded] = useState<string[]>([]); // editing: photos to add to this record
  const [queue, setQueue] = useState<string[]>([]); // more photos chosen together with the first; each becomes its own record
  const [shot, setShot] = useState<string | null>(null); // the camera's temporary file, until Save copies it
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0); // photos saved with Save and add another
  const [type, setType] = useState<EvidenceType | null>(item?.type ?? start?.type ?? null);
  const [deck, setDeck] = useState(item?.deck ?? start?.deck ?? '');
  const [hatch, setHatch] = useState(item?.hatch ?? '');
  const [time, setTime] = useState(item?.at?.hm ?? '');
  const listed = (r: string | undefined) => (r == null ? null : (EVIDENCE_REASONS as readonly string[]).includes(r) ? r : 'Other');
  const [reason, setReason] = useState<string | null>(listed(item?.reason));
  const [other, setOther] = useState(item && listed(item.reason) === 'Other' ? item.reason : '');
  const [vins, setVins] = useState<string[]>(item?.vins ?? []);
  const [vinText, setVinText] = useState('');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [found, setFound] = useState<VinCandidate[] | null>(null); // VIN scan results; Colby taps the right one(s)
  const [tidy, setTidy] = useState<string | null>(null); // AI rewording shown beside the original; only used if Colby picks it
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [whyOther, setWhyOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const day = item?.at?.day ?? state.ops.day;
  const hatches = state.decks.find((d) => d.id === deck)?.hatches ?? [];
  const reasonText = !type || !needsReason(type) ? '' : reason === 'Other' ? other.trim() : reason ?? '';
  const change = (r: string | null, o: string) => (r === 'Other' ? o.trim() : r);

  const open = async () => {
    setError(null);
    const p = perm?.granted ? perm : await askPerm();
    if (!p.granted) return setError(p.canAskAgain ? 'The camera was not allowed. Tap Take photo again and allow it.' : 'Camera access is off for VSA. Turn it on in iPhone Settings › VSA › Camera.');
    setCamOn(true);
  };
  const snap = async () => {
    if (!cam || busy) return;
    setBusy(true);
    try {
      const pic = await cam.takePictureAsync({ quality: 1, exif: false }); // full size
      if (item) setAdded((a) => [...a, pic.uri]); else setShot(pic.uri);
      setCamOn(false);
    } catch (e) { setError(`The photo could not be taken: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const choose = async () => {
    setError(null);
    try { const uris = await pickLibraryPhotos(); if (uris.length) { if (item) setAdded((a) => [...a, ...uris]); else { setShot(uris[0]); setQueue(uris.slice(1)); } setCamOn(false); } }
    catch (e) { setError(`The photo could not be chosen: ${(e as Error).message}`); }
  };
  const addVin = () => {
    setError(null);
    const r = checkVin(vinText);
    if (!r.ok) return setError(r.error);
    if (vins.includes(r.vin)) return setError(`VIN ${r.vin} is listed twice on this photo.`);
    setVins([...vins, r.vin]); setVinText('');
  };
  const now = () => { const t = E.nowOpTime(operationDate(baseline)!, new Date()); if (t) setTime(t.hm); else setError('The phone’s date is before this operation’s Day 1.'); };

  const scanVin = async () => {
    setError(null); setFound(null); setBusy(true);
    try {
      const r = await readPhotos('camera');
      if (r) setFound(vinCandidates(r.pages.join('\n')));
    } catch (e) { setError(`Could not read the VIN: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const pickVin = (vin: string) => {
    if (vins.includes(vin)) return setError(`VIN ${vin} is already on this photo.`);
    setError(null); setVins([...vins, vin]); setFound(null);
  };
  const askTidy = async () => {
    setAiNote(null); setTidy(null); setBusy(true);
    try {
      const t = await tidyNote(notes);
      if (t && t.value !== notes.trim()) setTidy(t.value);
      else setAiNote('No better wording was suggested. Your note is unchanged.');
    } finally { setBusy(false); }
  };

  const form = (photo: string | null): E.EvidenceForm => ({ type, deck, hatch, reason: reasonText, vins, notes, time: parseHM(time.trim()) == null ? null : { day, hm: time.trim().padStart(5, '0') }, photo });

  const submit = async (another = false) => {
    setError(null);
    if (busy) return;
    if (vinText.trim()) return setError('Tap Add VIN to add the VIN you typed, or clear the box.');
    if (time.trim() !== '' && parseHM(time.trim()) == null) return setError('Enter the time as HH:MM.');
    setBusy(true);
    try {
      if (item) {
        const base = E.nextEventId(state), rels = added.map((_, i) => evidencePath(state.operationId, `${base}-m${i}`));
        const more = [...(item.more ?? []), ...rels];
        const bad = rels.length ? E.evidenceProblem(state, { ...form(item.photo), more }, item.photo) : null;
        if (bad) return setError(bad);
        for (let i = 0; i < added.length; i++) {
          try { await keepPhoto(added[i], rels[i]); } catch (e) { rels.slice(0, i).forEach(dropUnsavedPhoto); return setError(`A photo could not be kept on this phone: ${(e as Error).message} Nothing was saved.`); }
        }
        const r = await save((c) => E.editEvidenceEvents(c, item.id, { ...form(item.photo), more }, change(why, whyOther)));
        if (!r.ok) rels.forEach(dropUnsavedPhoto);
        return r.ok ? onClose(rels.length ? `${rels.length} photo${rels.length === 1 ? '' : 's'} added. The old values are kept in the log.` : 'Photo record changed. The old values are kept in the log.') : setError(r.error);
      }
      // Check everything first so a refused form never copies a file. Photos chosen together are saved one by one, each its
      // own record with the same type, deck, hatch, reason, time and notes; the VINs go on the first only.
      const files = shot ? [shot, ...queue] : [];
      const rels = E.nextEvidencePaths(state, files.length);
      const bad = E.evidenceProblem(state, form(shot ? rels[0] : null), shot ? rels[0] : null);
      if (bad) return setError(bad);
      let done = 0;
      for (let i = 0; i < files.length; i++) {
        try { await keepPhoto(files[i], rels[i]); } catch (e) { setQueue(files.slice(i + 1)); setShot(files[i]); return setError(`The photo could not be kept on this phone: ${(e as Error).message} ${done} saved; the rest are still here.`); }
        const r = await save((c) => E.addEvidenceEvents(c, { ...form(rels[i]), vins: i === 0 ? vins : [] }));
        if (!r.ok) { dropUnsavedPhoto(rels[i]); setShot(files[i]); setQueue(files.slice(i + 1)); return setError(`${r.error} ${done} saved; the rest are still here.`); }
        done++;
      }
      const msg = done === 1 ? 'Photo saved on this phone.' : `${done} photos saved on this phone.`;
      if (another) { setSaved((n) => n + done); setShot(null); setQueue([]); setVins([]); setVinText(''); setNotes(''); setTime(''); setFound(null); setTidy(null); }
      else onClose(msg);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setError(null);
    const r = await save((c) => E.removeEvidenceEvents(c, item!.id, change(why, whyOther)));
    if (r.ok) onClose('Photo removed. It stays in the log, marked removed.'); else setError(r.error);
  };

  return (
    <View style={{ gap: 14 }}>
      <Label>PHOTO TYPE</Label>
      <Seg columns={2} value={type} onChange={setType} options={EVIDENCE_TYPES.map((t) => ({ value: t, label: `${TYPE_ICON[t]} ${TYPE_LABEL[t]}` }))} />

      <Label>PHOTO</Label>
      {item && !camOn ? (
        <View style={{ gap: 10 }}>
          <Thumb path={item.photo} big />
          {(item.more ?? []).map((m) => <Thumb key={m} path={m} big />)}
          {added.map((a) => <Image key={a} source={{ uri: a }} style={s.cam} resizeMode="cover" accessibilityLabel="Photo to add" />)}
          {added.length > 0 && <Note>{`${added.length} photo${added.length === 1 ? '' : 's'} will be added when you save. Pick a reason below (New information).`}</Note>}
          {!item.removed && <Go ghost label="Add photos from camera roll" onPress={choose} />}
          {!item.removed && <Go ghost label="Take another photo" onPress={open} />}
        </View>
      ) : camOn ? (
        <View style={{ gap: 10 }}>
          <CameraView ref={setCam} style={s.cam} facing="back" />
          <Go label={busy ? 'Taking photo…' : 'Take photo'} disabled={busy} onPress={snap} />
          <Go ghost label="Cancel" onPress={() => setCamOn(false)} />
        </View>
      ) : shot ? (
        <View style={{ gap: 10 }}>
          <Image source={{ uri: shot }} style={s.cam} resizeMode="cover" accessibilityLabel="Photo just taken" />
          {queue.length > 0 && <Note>{`${queue.length + 1} photos chosen. Each is saved as its own record with the same type, deck, hatch, reason, time and notes; a VIN goes on the first only.`}</Note>}
          <Go ghost label="Retake photo" onPress={() => { setShot(null); setQueue([]); void open(); }} />
          <Go ghost label="Choose a different photo" onPress={choose} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Go label="Open camera" onPress={open} />
          <Go ghost label="Choose from camera roll (one or many)" onPress={choose} />
        </View>
      )}

      <Label>DECK</Label>
      <Seg columns={4} value={deck || null} onChange={(d) => { setDeck(d); setHatch(''); }} options={state.decks.map((d) => ({ value: d.id, label: d.label }))} />
      {deck !== '' && (
        <>
          <Label>HATCH</Label>
          <Seg columns={4} value={hatch || null} onChange={setHatch} options={hatches.map((h) => ({ value: h.h, label: h.h }))} />
        </>
      )}

      <TimeField required label={`Time${day > 1 ? ` (Day ${day})` : ''}`} value={time} onChange={setTime} onNow={now} />

      {type && needsReason(type) && (
        <>
      <Label>REASON</Label>
      <Seg columns={1} value={reason} onChange={setReason} options={[...EVIDENCE_REASONS, 'Other'].map((r) => ({ value: r as string, label: r === 'Other' ? 'Other…' : r }))} />
      {reason === 'Other' && <Input label="Reason" value={other} onChange={setOther} maxLength={120} />}
        </>
      )}

      <Label wrap>{type === 'accident' ? 'VIN(S) · REQUIRED, AT LEAST ONE' : 'VIN(S) · OPTIONAL'}</Label>
      {vins.map((v) => {
        const c = checkVin(v);
        return (
          <View key={v} style={s.vin}>
            <View style={{ flex: 1, flexShrink: 1 }}>
              <Body semi>{v}</Body>
              {c.ok && c.warning && <Note style={{ color: color.oInk }}>Does not pass the check digit; confirm it.</Note>}
            </View>
            <Pressable onPress={() => setVins(vins.filter((x) => x !== v))} style={({ pressed }) => [u.x, pressed && u.pressed]} accessibilityRole="button" accessibilityLabel={`Remove VIN ${v}`}><Text style={{ fontSize: 18, color: color.ink }}>✕</Text></Pressable>
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Input label="VIN (17 characters)" value={vinText} onChange={setVinText} maxLength={17} caps /></View>
        <Pressable onPress={addVin} style={[u.ghostBtn, { paddingHorizontal: 18 }]} accessibilityRole="button"><Text style={{ fontFamily: f.bodySemi, fontSize: 16, color: color.ink }}>Add VIN</Text></Pressable>
      </View>
      {ocrAvailable() && <Go ghost label="Scan a VIN with the camera" disabled={busy} onPress={scanVin} />}
      {found && (found.length === 0 ? <Note>No VIN found. Type it or scan again.</Note> : (
        <View style={{ gap: 8 }}>
          <Note>Tap the VIN that matches the car. Check every character.</Note>
          {found.map((c) => 'unreadable' in c ? (
            <View key={c.vin} style={s.vin}><View style={{ flex: 1, flexShrink: 1 }}><Body semi>{c.vin}</Body><Note style={{ color: color.oInk }}>Unreadable: {c.unreadable} Type it instead.</Note></View></View>
          ) : (
            <Pressable key={c.vin} onPress={() => pickVin(c.vin)} accessibilityRole="button" accessibilityLabel={`Use VIN ${c.vin}`} style={({ pressed }) => [s.vin, u.ghostBtn, { paddingHorizontal: 12 }, pressed && u.pressed]}>
              <View style={{ flex: 1, flexShrink: 1 }}><Body semi>{c.vin}</Body>{c.warning && <Note style={{ color: color.oInk }}>Does not pass the check digit; confirm it.</Note>}</View>
            </Pressable>
          ))}
        </View>
      ))}
      <Note>Typed or scanned exactly as on the car. A VIN is never corrected for you; a check digit that does not pass only warns.</Note>

      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }}>Notes (optional)</Text>
        <TextInput value={notes} onChangeText={(t) => { setNotes(t); setTidy(null); }} multiline accessibilityLabel="Notes" placeholder="Type what you saw" placeholderTextColor={color.muted}
          style={[u.input, { fontFamily: f.body, fontSize: 17, minHeight: 110, paddingTop: 12, textAlignVertical: 'top' }]} />
      </View>
      {notes.trim() !== '' && aiStatus() === 'ready' && <Go ghost label="Tidy wording (AI)" disabled={busy} onPress={askTidy} />}
      {aiNote && <Note>{aiNote}</Note>}
      {tidy && (
        <View style={{ gap: 8 }}>
          <Label wrap>SUGGESTED WORDING · CHECK IT</Label>
          <Body>{tidy}</Body>
          <Seg options={[{ value: 'mine', label: 'Keep mine' }, { value: 'tidy', label: 'Use this' }]} columns={2} value={null} onChange={(x) => { if (x === 'tidy') setNotes(tidy); setTidy(null); }} />
        </View>
      )}

      {item && (
        <>
          <Label wrap>REASON FOR A CHANGE OR A REMOVAL</Label>
          <Seg columns={2} value={why} onChange={setWhy} options={[...E.EVIDENCE_CHANGE_REASONS, ...E.EVIDENCE_REMOVE_REASONS, 'Other'].map((r) => ({ value: r as string, label: r === 'Other' ? 'Other…' : r }))} />
          {why === 'Other' && <Input label="Reason" value={whyOther} onChange={setWhyOther} maxLength={120} />}
        </>
      )}
      {error && <ErrorBox text={error} />}
      {saved > 0 && <Note>{`${saved} photo${saved === 1 ? '' : 's'} saved. The type, deck, hatch and reason stay for the next one.`}</Note>}
      {item && !item.removed && (
        <View style={{ gap: 10 }}>
          <Go ghost label={added.length ? `Add more photos (${added.length} waiting)` : 'Add photos to this record'} onPress={choose} />
          {added.length > 0 && <Note>{`${added.length} photo${added.length === 1 ? '' : 's'} will be added to this record when you tap Save changes. Pick the reason New information.`}</Note>}
        </View>
      )}
      <Go label={item ? 'Save changes' : 'Save photo'} disabled={busy} onPress={() => submit()} />
      {!item && <Go ghost label="Save and add another" disabled={busy} onPress={() => submit(true)} />}
      {item && (
        <>
          <Go ghost label="Remove this photo" onPress={remove} />
        </>
      )}
      <Note>{item ? 'Nothing is overwritten: the old values and the photo file stay.' : 'The photo stays on this phone only (not in the camera roll and not in the backup export). It never changes a count.'}</Note>
    </View>
  );
}

function Input({ label, value, onChange, maxLength, caps }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number; caps?: boolean }) {
  const f = useType();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: f.bodySemi, fontSize: 14, color: color.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} maxLength={maxLength} accessibilityLabel={label} autoCorrect={false} autoCapitalize={caps ? 'characters' : 'sentences'}
        placeholderTextColor={color.muted} style={[u.input, { fontFamily: f.bodyMedium, fontSize: 17 }]} />
    </View>
  );
}

function Thumb({ path, big, small }: { path: string; big?: boolean; small?: boolean }) {
  return photoExists(path)
    ? <Image source={{ uri: photoUri(path) }} style={big ? s.cam : small ? s.mini : s.thumb} resizeMode="cover" accessibilityLabel="Saved photo" />
    : <Note style={{ color: color.oInk }}>The photo file is missing on this phone. The record is kept.</Note>;
}

const s = StyleSheet.create({
  cam: { width: '100%', aspectRatio: 3 / 4, maxHeight: 460, borderRadius: 12, backgroundColor: color.ink, overflow: 'hidden' },
  thumb: { width: '100%', height: 160, borderRadius: 10, backgroundColor: color.soft },
  mini: { width: 72, height: 72, borderRadius: 8, backgroundColor: color.soft },
  vin: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  card: { gap: 4, padding: 12, borderWidth: 1, borderColor: color.line, borderRadius: 12, backgroundColor: color.card, minHeight: 56 },
  edit: { fontSize: 13, color: color.blue, alignSelf: 'flex-end' },
});
