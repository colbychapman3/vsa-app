// Ask sheet (Phase 6d): quick questions and typed questions. Answers come only from the engine, the terminal
// directory or the knowledge pack (src/app/assistant.ts); nothing here does math. Actions are confirm cards:
// the hourly form opens prefilled, a note saves only on Add, a new vessel opens the Vessels sheet.
import { useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';
import type { Baseline, Reject, VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import indexJson from '../../../assets/knowledge/index.json';
import { NOT_FOUND, type KnowledgeIndex } from '../knowledge/search.ts';
import { aiStatus, pickIntent } from '../ai.ts';
import { answer, handoffPrompt, parseAction, QUICK, routeQuestion, type Action, type Answer, type Where } from '../assistant.ts';
import { addNoteEvents, type Ctx } from '../entries.ts';
import { hourOptions } from '../view.ts';
import { REMINDER_STATUS_TEXT, type ReminderStatus } from '../reminders.ts';
import { color, TAP, useType } from '../theme.ts';
import type { HourPrefill } from './LogSheet.tsx';
import { Body, Card, ErrorBox, Go, Note, Seg, Sheet, Tag, u } from './ui.tsx';

const INDEX = indexJson as unknown as KnowledgeIndex;
type Save = (build: (c: Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;
type Result = { kind: 'answer'; a: Answer } | { kind: 'action'; action: Action };

export function Ask({ state, baseline, nowMin, isTest, save, reminders, onEnableReminders, onShow, onLog, onNewVessel, onClose }: {
  state: State; baseline: Baseline; nowMin: number; isTest: boolean; save: Save;
  reminders: ReminderStatus; onEnableReminders: () => void;
  onShow: (w: Where) => void; onLog: (p: HourPrefill) => void; onNewVessel: () => void; onClose: (done?: string) => void;
}) {
  const f = useType();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hand, setHand] = useState<{ q: string; name: boolean } | null>(null); // the Ask my AI preview, shown inside this same sheet
  const [picked, setPicked] = useState<string | null>(null); // the quick question shown as selected, until the text is edited

  const run = async (text: string) => {
    setError(null); setHand(null);
    if (!text.trim()) return;
    const action = parseAction(text);
    if (action) return setRes({ kind: 'action', action });
    setBusy(true);
    try {
      let intent = routeQuestion(text, state);
      // No keyword rule matched: the on-device model may pick an intent from the fixed list (never write the answer).
      if (intent.k === 'knowledge' && aiStatus() === 'ready') intent = (await pickIntent(text, state)) ?? intent;
      setRes({ kind: 'answer', a: answer(intent, state, baseline, nowMin, INDEX) });
    } finally { setBusy(false); }
  };
  const quick = (label: string, ask: string) => { setPicked(label); setQ(ask); if (ask.endsWith(' ')) return setRes(null); void run(ask); };

  return (
    <Sheet title="Ask" isTest={isTest} onClose={() => onClose()} scrollTopOn={res ? 'r' : 'q'}>
      <TextInput value={q} onChangeText={(v) => { setQ(v); setRes(null); setPicked(null); }} placeholder="Ask about this vessel, or look something up" placeholderTextColor={color.muted}
        accessibilityLabel="Ask a question" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => run(q)} clearButtonMode="while-editing"
        style={[u.input, { fontFamily: f.bodyMedium, fontSize: 18 }]} />
      <Go label={busy ? 'Looking…' : 'Ask'} disabled={busy || !q.trim()} onPress={() => run(q)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {QUICK.map((x) => {
          const on = picked === x.label;
          return (
            <Pressable key={x.label} onPress={() => quick(x.label, x.ask)} style={({ pressed }) => [{ minHeight: TAP, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: color.ink, backgroundColor: on ? color.ink : color.card }, pressed && u.pressed]}
              accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={x.label}>
              <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: on ? color.bg : color.ink }} numberOfLines={1}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {res?.kind === 'answer' && <AnswerCard a={res.a} onShow={(w) => { onShow(w); onClose(); }} />}
      {res?.kind === 'answer' && !hand && (
        <Go ghost={!res.a.lines.includes(NOT_FOUND)} label="Ask my AI" onPress={() => setHand({ q, name: false })} />
      )}
      {res?.kind === 'answer' && hand && (() => {
        const text = handoffPrompt(hand.q, state, baseline, nowMin, INDEX, isTest, hand.name);
        return (
          <Card style={[u.pad, { gap: 10 }]}>
            <Text style={{ fontFamily: f.display, fontSize: 22, color: color.ink }}>Send to your AI app</Text>
            <Note>This exact text goes to the app you pick in the next step. Nothing is sent until you choose one. Its reply stays in that app and is not checked by this app.</Note>
            <Body semi>Vessel name</Body>
            <Seg options={[{ value: 'out', label: 'Keep out' }, { value: 'in', label: 'Include' }]} columns={2} value={hand.name ? 'in' : 'out'} onChange={(x) => setHand({ ...hand, name: x === 'in' })} />
            <Text selectable style={{ fontFamily: f.body, fontSize: 14, color: color.ink, lineHeight: 20 }}>{text}</Text>
            <Go label="Send…" onPress={() => { onClose(); setTimeout(() => { void Share.share({ message: text }); }, 450); }} />
            <Go ghost label="Cancel" onPress={() => setHand(null)} />
          </Card>
        );
      })()}
      {res?.kind === 'action' && <ActionCard action={res.action} state={state} baseline={baseline} save={save} setError={setError} onClose={onClose} onLog={onLog} onNewVessel={onNewVessel} />}
      {error && <ErrorBox text={error} />}

      <Card style={[u.pad, { gap: 8 }]}>
        <Note>{REMINDER_STATUS_TEXT[reminders]}</Note>
        {reminders === 'ask' && <Go ghost label="Turn on reminders" onPress={onEnableReminders} />}
      </Card>
      <Note>Answers come from the same numbers as the screens and from the loaded documents, never from a guess. Try “log 140 at 10:00”, “note: …” or “new vessel”.</Note>
    </Sheet>
  );
}

function AnswerCard({ a, onShow }: { a: Answer; onShow: (w: Where) => void }) {
  const f = useType();
  return (
    <Card style={[u.pad, { gap: 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text style={{ fontFamily: f.display, fontSize: 24, color: color.ink, flexShrink: 1 }}>{a.title}</Text>
        {a.tags.map((t) => <Tag key={t} kind={t} />)}
      </View>
      {a.lines.map((l, i) => <Body key={i} semi={i === 0}>{l}</Body>)}
      {a.passages?.map((p, i) => (
        <View key={i} style={{ gap: 4, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 8 }}>
          <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{p.cite}</Text>
          {p.flag ? <Text style={{ fontFamily: f.bodySemi, fontSize: 13, color: color.oInk }}>{p.flag}</Text> : null}
          <Text style={{ fontFamily: f.body, fontSize: 15, color: color.ink, lineHeight: 21 }}>{p.text}</Text>
        </View>
      ))}
      {a.passages?.length ? <Note>Quoted as written, not summarized. The protocol and Colby’s instruction win on any difference.</Note> : null}
      {a.where && <Go ghost label="Show me" onPress={() => onShow(a.where!)} />}
    </Card>
  );
}

function ActionCard({ action, state, baseline, save, setError, onClose, onLog, onNewVessel }: {
  action: Action; state: State; baseline: Baseline; save: Save; setError: (e: string | null) => void;
  onClose: (done?: string) => void; onLog: (p: HourPrefill) => void; onNewVessel: () => void;
}) {
  const f = useType();
  if (action.k === 'hourly') {
    const hours = hourOptions(state, baseline).hours;
    const known = action.start != null && hours.some((h) => h.start === action.start);
    return (
      <Card style={[u.pad, { gap: 8 }]}>
        <Text style={{ fontFamily: f.display, fontSize: 24, color: color.ink }}>Hourly count</Text>
        <Body semi>{action.count.toLocaleString('en-US')} autos{action.start ? ` at ${action.start}` : ''}</Body>
        <Note>{action.start == null ? 'No hour was given: pick it in the form.' : known ? 'Opens the hourly form with these values. Nothing is saved until you tap Save there.' : `${action.start} is not an hour that can be logged now: pick the hour in the form.`}</Note>
        <Go label="Open hourly form" onPress={() => { onClose(); onLog({ count: action.count, start: known ? action.start : null }); }} />
      </Card>
    );
  }
  if (action.k === 'note') {
    return (
      <Card style={[u.pad, { gap: 8 }]}>
        <Text style={{ fontFamily: f.display, fontSize: 24, color: color.ink }}>Plan note</Text>
        <Body>{action.text}</Body>
        <Go label="Add note" onPress={async () => {
          setError(null);
          const r = await save((c) => addNoteEvents(c, { text: action.text }));
          if (r.ok) onClose('Note added to Plan.'); else setError(r.error);
        }} />
      </Card>
    );
  }
  return (
    <Card style={[u.pad, { gap: 8 }]}>
      <Text style={{ fontFamily: f.display, fontSize: 24, color: color.ink }}>New vessel</Text>
      <Note>Opens the Vessels sheet on New vessel. Nothing is created until you finish setup there.</Note>
      <Go label="Open New vessel" onPress={() => { onClose(); onNewVessel(); }} />
    </Card>
  );
}
