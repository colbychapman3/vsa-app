// New vessel: the 5-step Setup inside one sheet. The vessel list lives in the sidebar; archived vessels in Settings.
// Closing with work typed in asks first (keep working / save draft and close / discard). A saved draft is offered next time.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Text } from './text.tsx';
import type { Reject } from '../../engine/index.ts';
import type { Built } from '../setup.ts';
import { blankDraft, clearDraft, createAutosaver, draftLabel, isDirty, loadDraft, saveDraft, type DraftStore, type SetupDraft, type StoredDraft } from '../setupDraft.ts';
import { color, useType } from '../theme.ts';
import { Body, Card, Go, Note, SectionHead, Sheet, u } from './ui.tsx';
import type { Lessons } from '../history.ts';
import { Setup } from './Setup.tsx';

export function Vessels({ onCreate, onClose, drafts, history }: {
  onClose: () => void;
  drafts: DraftStore;
  history?: { live: Lessons; test: Lessons };
  onCreate: (b: Extract<Built, { ok: true }>, isTest: boolean, notes: string[], photos: string[]) => Promise<{ ok: true } | Reject>;
}) {
  const f = useType();
  const [newTest, setNewTest] = useState(false);
  const [key, setKey] = useState('');
  const [phase, setPhase] = useState<'loading' | 'offer' | 'ready'>('loading');
  const [stored, setStored] = useState<StoredDraft | null>(null);
  const [initial, setInitial] = useState<SetupDraft>(blankDraft());
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snap = useRef<SetupDraft | null>(null);
  const auto = useMemo(() => createAutosaver(drafts, { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }, () => new Date()), [drafts]);
  // Going to the background saves at once; the app may be killed there.
  useEffect(() => { const sub = AppState.addEventListener('change', (st) => { if (st !== 'active') void auto.flush(); }); return () => sub.remove(); }, [auto]);
  const settled = useRef(false); // true once the user chose save / discard, or the vessel was created: nothing left to rescue

  useEffect(() => {
    let live = true;
    void loadDraft(drafts).then((d) => { if (!live) return; setStored(d); setPhase(d ? 'offer' : 'ready'); });
    return () => { live = false; };
  }, [drafts]);
  // If something else closes the sheet while work is in it (a link, a reminder), keep the work as a draft.
  useEffect(() => () => { const d = snap.current; if (!settled.current && d && isDirty(d)) void saveDraft(drafts, d, new Date()); auto.settle(true); }, [drafts, auto]);

  const attemptClose = () => {
    const d = snap.current;
    if (phase === 'ready' && d && isDirty(d)) { setError(null); setAsking(true); } else onClose();
  };
  const saveAndClose = async () => {
    const d = snap.current;
    if (d) { const r = await saveDraft(drafts, d, new Date()); if (!r.ok) { setError(r.error); return; } }
    settled.current = true; onClose();
  };
  const discard = async () => { await clearDraft(drafts); settled.current = true; onClose(); };
  const resume = () => { if (!stored) return; setInitial(stored.draft); auto.seed(stored.draft); setNewTest(stored.draft.isTest); setPhase('ready'); };
  const fresh = async () => { auto.settle(true); await clearDraft(drafts); auto.settle(false); setStored(null); setPhase('ready'); };
  const create: typeof onCreate = async (b, isTest, notes, photos) => {
    // Creating switches to the new vessel and closes this sheet before onCreate returns, so mark it settled first and undo if it fails.
    settled.current = true; auto.settle(true);
    try {
      const r = await onCreate(b, isTest, notes, photos);
      if (r.ok) await clearDraft(drafts); else { settled.current = false; auto.settle(false); }
      return r;
    } catch (e) { settled.current = false; auto.settle(false); throw e; }
  };

  return (
    <Sheet title="New vessel" isTest={phase === 'offer' ? !!stored?.draft.isTest : newTest} onClose={attemptClose} guardSwipe scrollTopOn={`${key}${asking ? '!' : ''}${phase}`}>
      {phase === 'offer' && stored && (
        <Card style={[u.pad, { gap: 10 }]}>
          <SectionHead title="You have a saved draft" />
          <Body semi>{draftLabel(stored)}</Body>
          <Go label="Resume draft" onPress={resume} />
          <Go ghost label="Delete it and start fresh" onPress={() => void fresh()} />
        </Card>
      )}
      {phase === 'ready' && asking && (
        <Card style={[u.pad, { gap: 10 }]}>
          <SectionHead title="Close this setup?" />
          <Body>You have typed things in. Save a draft to pick up where you left off, or throw it away.</Body>
          {error && <Text style={[u.note, { color: color.rInk, fontFamily: f.bodySemi }]}>{error}</Text>}
          <Go label="Keep working" onPress={() => setAsking(false)} />
          <Go ghost label="Save draft and close" onPress={() => void saveAndClose()} />
          <Go ghost label="Discard what I typed" onPress={() => void discard()} />
          <Note>Discard cannot be undone.</Note>
        </Card>
      )}
      {phase === 'ready' && <Setup history={history} isTest={newTest} setIsTest={setNewTest} onKey={setKey} onCreate={create} initial={initial} snap={snap} onDraft={auto.schedule} />}
    </Sheet>
  );
}
