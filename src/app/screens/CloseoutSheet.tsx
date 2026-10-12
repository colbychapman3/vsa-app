// The coach at closeout (Phase 3, Colby 2026-10-12): what is left, in the order that would hurt most if forgotten; how close the
// forecast came; the answer sheet to send; then the vessel-complete question (the same sheet, swapped in, so one modal at a time).
// Layout only: the rows, scorecard and sheet text come from ../closeout.ts.
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Baseline, Reject, VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { answerSheet, coachList, scorecard, slowedNote, SLOWED_QUESTION, type Row } from '../closeout.ts';
import * as E from '../entries.ts';
import { biasLine, type Lessons } from '../history.ts';
import { bcolor, color, TAP, useType } from '../theme.ts';
import { CompleteSheet } from './CompleteSheet.tsx';
import { Body, Card, Go, Note, SectionHead, Sheet, u } from './ui.tsx';

type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;
type Tab = 'decks' | 'hourly' | 'snap';

export function CloseoutSheet({ state, baseline, isTest, save, onShare, onClose, onGo, lessons }: {
  state: State; baseline: Baseline; isTest: boolean;
  save: Save; onShare: (text: string) => void; onClose: (done?: string) => void; onGo: (tab: Tab) => void; lessons?: Lessons | null;
}) {
  const f = useType();
  const [mark, setMark] = useState(false);
  const [slow, setSlow] = useState(slowedNote(state)?.text ?? '');
  const [slowErr, setSlowErr] = useState<string | null>(null);
  const list = useMemo(() => coachList(state), [state]);
  const [tickErr, setTickErr] = useState<string | null>(null);
  const score = useMemo(() => scorecard(state, baseline), [state, baseline]);
  if (mark) return <CompleteSheet state={state} isTest={isTest} save={save} onClose={onClose} onGo={onGo} />;

  // Kept with the vessel (a Plan note in the log), so it travels with the export and teaches the next ships.
  const saveSlow = () => {
    if (slow.trim() === (slowedNote(state)?.text ?? '')) return;
    void save((c) => E.slowedEvents(c, slow, SLOWED_QUESTION)).then((r) => setSlowErr(r.ok ? null : r.error));
  };
  const open = list.rows.filter((r) => !r.ok), done = list.rows.filter((r) => r.ok);
  const sheetText = () => answerSheet(state, baseline, { isTest, closeout: list });

  const row = (r: Row) => (
    <Pressable key={r.id} accessibilityRole={r.kind === 'tick' ? 'checkbox' : 'button'} accessibilityState={r.kind === 'tick' ? { checked: r.ok } : undefined}
      accessibilityLabel={`${r.label}. ${r.detail}`}
      onPress={() => { if (r.kind === 'tick') void save((c) => E.closeoutCheckEvents(c, r.id, !r.ok)).then((x) => setTickErr(x.ok ? null : x.error)); else if (r.go) { onClose(); onGo(r.go); } }}
      disabled={r.kind === 'check' && (r.ok || !r.go)}
      style={({ pressed }) => [{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: bcolor.row }, pressed && u.pressed]}>
      <View style={{ width: 32, height: 32, borderRadius: r.kind === 'tick' ? 6 : 16, borderWidth: 2, borderColor: r.ok ? color.green : color.orange, backgroundColor: r.ok ? color.green : color.card, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: r.ok ? color.onAction : color.oInk }}>{r.ok ? '✓' : r.kind === 'tick' ? '' : '!'}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: f.bodySemi, fontSize: 17, color: color.ink }}>{r.label}</Text>
        <Note>{r.detail}{!r.ok && r.kind === 'check' && r.go ? ' Go fix it ›' : ''}</Note>
      </View>
    </Pressable>
  );

  return (
    <Sheet title="Closeout" isTest={isTest} onClose={() => { saveSlow(); onClose(); }}>
      <Card style={[u.pad, { gap: 4, backgroundColor: list.clear ? color.gBg : color.card }]}>
        <Text style={{ fontFamily: f.display, fontSize: 28, color: list.clear ? color.gInk : color.ink }}>{list.clear ? "You're clear" : `${list.left} item${list.left === 1 ? '' : 's'} left`}</Text>
        <Note>{list.clear ? 'Everything on the list is closed. Send the answer sheet, then mark the vessel complete.' : 'Open items first, the ones that would hurt most if forgotten at the top.'}</Note>
      </Card>

      {tickErr && <Note style={{ color: color.rInk }}>{tickErr}</Note>}
      <View>
        {open.map(row)}
        {done.length > 0 && <SectionHead title="Closed" />}
        {done.map(row)}
      </View>

      <SectionHead title="How close the forecast came" />
      {score.rows.length > 0 && (
        <Card style={[u.pad, { gap: 8 }]}>
          <Body semi>Actual finish {score.actual}</Body>
          {score.rows.map((r) => (
            <View key={r.label} style={{ gap: 2 }}>
              <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{r.label}</Text>
              <Note>{r.forecast} · finished {r.result}</Note>
            </View>
          ))}
        </Card>
      )}
      {score.note && <Note>{score.note}</Note>}
      {lessons && biasLine(lessons) && <Note>{biasLine(lessons)}</Note>}

      <SectionHead title={SLOWED_QUESTION} />
      <TextInput value={slow} onChangeText={setSlow} onEndEditing={saveSlow} onBlur={saveSlow} multiline maxLength={300} accessibilityLabel={SLOWED_QUESTION}
        placeholder="One line is enough. Kept with this vessel." placeholderTextColor={color.muted}
        style={[u.input, { fontFamily: f.body, fontSize: 15, minHeight: 80, paddingTop: 12, textAlignVertical: 'top' }]} />
      {slowErr && <Note style={{ color: color.rInk }}>{slowErr}</Note>}

      <Go label="Send the answer sheet" onPress={() => { saveSlow(); onShare(sheetText()); }} />
      <Go ghost label={state.completed ? 'Completion mark…' : 'Mark the vessel complete…'} onPress={() => { saveSlow(); setMark(true); }} />
      <Note>The answer sheet goes to the superintendent and/or the operations manager: pick who in the share sheet. Ticks and your line are kept in the vessel's log, so they go with the export; your line is read for trends on later ships.</Note>
    </Sheet>
  );
}
