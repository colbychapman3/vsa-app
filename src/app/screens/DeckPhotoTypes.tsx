// Photos by deck and type (Colby, 2026-10-09; spec phase-7j). Inside the deck sheet: a row per photo type on this deck, a type page
// listing each incident with all its photos, select-and-remove, add photos (deck and type already set), full-size view, and save to the
// camera roll. Layout only: counts come from view.ts, every save from entries.ts through App.save(). One sheet; content swaps.
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Baseline, EvidenceType, Reject, VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import * as E from '../entries.ts';
import { photoExists, photoUri, saveToCameraRoll } from '../evidenceFiles.ts';
import { deckPhotoTypes, TYPE_ICON, typePage } from '../view.ts';
import { color, useType } from '../theme.ts';
import { EvidenceForm } from './EvidenceForm.tsx';
import { Body, Chip, ErrorBox, Field, Go, Label, Note, Seg, u } from './ui.tsx';

type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;
export type PhotoView = { kind: 'type'; type: EvidenceType } | { kind: 'add'; type: EvidenceType | null } | { kind: 'edit'; id: string } | { kind: 'full'; type: EvidenceType; uri: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// The Photos section at the bottom of a deck sheet: one row per type present, and an Add photos button.
export function DeckPhotoTypes({ state, deckId, onOpen, onAdd }: { state: State; deckId: string; onOpen: (t: EvidenceType) => void; onAdd: () => void }) {
  const types = deckPhotoTypes(state, deckId);
  return (
    <View style={{ gap: 10 }}>
      <Label>{`PHOTOS (${types.reduce((n, t) => n + t.photos, 0)})`}</Label>
      {types.map((t) => (
        <Pressable key={t.type} onPress={() => onOpen(t.type)} accessibilityRole="button" accessibilityLabel={`${t.label}, ${plural(t.photos, 'photo')}. Open`}
          style={({ pressed }) => [s.typeRow, pressed && u.pressed]}>
          <Chip text={`${t.icon} ${t.label}`} tone={t.tone} />
          <Body semi style={{ marginLeft: 'auto' }}>{plural(t.photos, 'photo')}</Body>
          <Text style={{ fontSize: 18, color: color.muted }}>›</Text>
        </Pressable>
      ))}
      {types.length === 0 && <Note>No photos on this deck yet.</Note>}
      <Go ghost label="Add photos" onPress={onAdd} />
    </View>
  );
}

// The pages reached from the section above. Replaces the deck form's content while open.
export function PhotoPages({ state, baseline, save, deckId, deckLabel, view, setView, onClose }: {
  state: State; baseline: Baseline; save: Save; deckId: string; deckLabel: string; view: PhotoView; setView: (v: PhotoView | null) => void; onClose: (done?: string) => void;
}) {
  const f = useType();
  const back = (label: string, to: PhotoView | null) => (
    <Pressable onPress={() => setView(to)} style={s.back} accessibilityRole="button"><Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.blue }}>‹ {label}</Text></Pressable>
  );
  if (view.kind === 'add') {
    return (
      <View style={{ gap: 14 }}>
        {back(deckLabel, null)}
        <EvidenceForm state={state} baseline={baseline} save={save} start={{ deck: deckId, type: view.type }} onClose={(done) => (done ? onClose(done) : setView(null))} />
      </View>
    );
  }
  if (view.kind === 'edit') {
    const item = state.evidence.find((x) => x.id === view.id && !x.removed);
    if (!item) { setView(null); return null; }
    return (
      <View style={{ gap: 14 }}>
        {back(`${deckLabel} photos`, { kind: 'type', type: item.type })}
        <Note>Edit the details, or change the deck, hatch or type to move this record. A reason is asked for any change.</Note>
        <EvidenceForm state={state} baseline={baseline} save={save} item={item} onClose={(done) => (done ? onClose(done) : setView({ kind: 'type', type: item.type }))} />
      </View>
    );
  }
  if (view.kind === 'full') {
    return (
      <View style={{ gap: 14 }}>
        {back(`${deckLabel} photos`, { kind: 'type', type: view.type })}
        {photoExists(view.uri)
          ? <Image source={{ uri: photoUri(view.uri) }} style={s.full} resizeMode="contain" accessibilityLabel="Photo, full size" />
          : <Note style={{ color: color.oInk }}>The photo file is missing on this phone. The record is kept.</Note>}
      </View>
    );
  }
  return <TypePage state={state} baseline={baseline} save={save} deckId={deckId} deckLabel={deckLabel} type={view.type} setView={setView} onBack={() => setView(null)} back={back} />;
}

function TypePage({ state, save, deckId, deckLabel, type, setView, back }: {
  state: State; baseline: Baseline; save: Save; deckId: string; deckLabel: string; type: EvidenceType; setView: (v: PhotoView | null) => void; onBack: () => void;
  back: (label: string, to: PhotoView | null) => React.ReactNode;
}) {
  const f = useType();
  const page = typePage(state, deckId, type);
  const label = deckPhotoTypes(state, deckId).find((t) => t.type === type)?.label ?? type;
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string[]>>({}); // record id → chosen files
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = Object.values(chosen).reduce((n, a) => n + a.length, 0);
  const files = page.flatMap((i) => i.photos);

  const toggle = (id: string, file: string) => setChosen((c) => { const a = c[id] ?? []; return { ...c, [id]: a.includes(file) ? a.filter((x) => x !== file) : [...a, file] }; });
  const remove = async () => {
    setError(null); setMsg(null);
    const why = reason === 'Other' ? other.trim() : reason;
    setBusy(true);
    try {
      let n = 0;
      for (const [id, paths] of Object.entries(chosen)) {
        if (!paths.length) continue;
        const r = await save((c) => E.removePhotosEvents(c, id, paths, why));
        if (!r.ok) return setError(`${r.error}${n ? ` ${plural(n, 'photo')} removed before this.` : ''}`);
        n += paths.length;
      }
      setChosen({}); setPicking(false); setReason(null); setOther('');
      setMsg(`${plural(n, 'photo')} removed. They stay in the log.`);
    } finally { setBusy(false); }
  };
  const toRoll = async () => {
    setError(null); setMsg(null); setBusy(true);
    try {
      const r = await saveToCameraRoll(files);
      if (r.ok) setMsg(`${plural(r.saved, 'photo')} saved to your camera roll.${r.missing ? ` ${plural(r.missing, 'file')} missing on this phone.` : ''}`);
      else setError(r.error);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 14 }}>
      {back(deckLabel, null)}
      <Body semi style={{ fontSize: 20 }}>{TYPE_ICON[type]} {label} · {deckLabel}</Body>
      <Note>{plural(files.length, 'photo')} in {plural(page.length, 'incident')}.</Note>
      <Go label="Add photos" disabled={busy} onPress={() => setView({ kind: 'add', type })} />
      {files.length > 0 && <Go ghost label="Save these photos to camera roll" disabled={busy} onPress={toRoll} />}
      {files.length > 0 && <Go ghost label={picking ? 'Cancel selecting' : 'Select photos to remove'} disabled={busy} onPress={() => { setPicking(!picking); setChosen({}); setError(null); }} />}
      {msg && <Note style={{ color: color.gInk }}>{msg}</Note>}
      {error && <ErrorBox text={error} />}

      {page.map((i) => (
        <View key={i.id} style={s.card}>
          <Body semi>{`Hatch ${i.hatch}`}</Body>
          <Note>{i.meta}</Note>
          {i.vins && <Note>{i.vins}</Note>}
          {i.warn.map((w) => <Note key={w} style={{ color: color.oInk }}>{w}</Note>)}
          {i.notes && <Note>{i.notes}</Note>}
          <View style={s.grid}>
            {i.photos.map((p) => {
              const on = (chosen[i.id] ?? []).includes(p);
              return (
                <Pressable key={p} onPress={() => (picking ? toggle(i.id, p) : setView({ kind: 'full', type, uri: p }))} accessibilityRole={picking ? 'checkbox' : 'button'}
                  accessibilityState={picking ? { checked: on } : undefined} accessibilityLabel={picking ? 'Select photo' : 'Open photo full size'} style={({ pressed }) => [s.cell, pressed && u.pressed]}>
                  {photoExists(p) ? <Image source={{ uri: photoUri(p) }} style={s.img} resizeMode="cover" /> : <View style={[s.img, s.gone]}><Text style={{ fontSize: 11, color: color.oInk }}>missing</Text></View>}
                  {picking && <View style={[s.tick, on && s.tickOn]}>{on && <Text style={{ color: color.bg, fontWeight: '700' }}>✓</Text>}</View>}
                </Pressable>
              );
            })}
          </View>
          {!picking && <Pressable onPress={() => setView({ kind: 'edit', id: i.id })} accessibilityRole="button" style={({ pressed }) => [s.edit, pressed && u.pressed]}><Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.blue }}>Edit or move ›</Text></Pressable>}
        </View>
      ))}

      {picking && (
        <View style={{ gap: 10 }}>
          <Label wrap>{`REASON FOR REMOVING ${total ? plural(total, 'PHOTO') : 'THE SELECTED PHOTOS'}`}</Label>
          <Seg columns={2} value={reason} onChange={setReason} options={[...E.PHOTO_REMOVE_REASONS, 'Other'].map((r) => ({ value: r, label: r === 'Other' ? 'Other…' : r }))} />
          {reason === 'Other' && <Field label="Reason" value={other} onChange={setOther} keyboard="default" maxLength={120} />}
          <Go label={total ? `Remove ${plural(total, 'photo')}` : 'Select photos first'} disabled={busy || total === 0} onPress={remove} />
          <Note>Removed photos leave this list. They stay in the log, and a removed record keeps its reason.</Note>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  back: { minHeight: 56, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 24 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, borderWidth: 1, borderColor: color.line, borderRadius: 12, backgroundColor: color.card },
  card: { gap: 6, padding: 12, borderWidth: 1, borderColor: color.line, borderRadius: 12, backgroundColor: color.card },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  cell: { width: '31%', aspectRatio: 1 },
  img: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: color.soft },
  gone: { alignItems: 'center', justifyContent: 'center' },
  tick: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: color.ink, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: color.ink },
  edit: { minHeight: 56, justifyContent: 'center', alignSelf: 'flex-end' },
  full: { width: '100%', aspectRatio: 3 / 4, maxHeight: 640, borderRadius: 12, backgroundColor: color.ink },
});
