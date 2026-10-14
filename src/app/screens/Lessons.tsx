// Lessons from past ships (Phase 5, the no loop): finished ships' pooled pace and H.A., how far the forecast ran off, and the
// answers to "What slowed you down today?" grouped into themes; the most common one is the next fix. Layout only: src/app/history.ts.
// LIVE and TEST are never mixed. Nothing here enters any vessel's record.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { biasLine, type Lessons as L, type ShipResult } from '../history.ts';
import { WHERE_LABEL, type feedbackSummary } from '../feedback.ts';
type Nos = ReturnType<typeof feedbackSummary>;
import { bcolor, color, useType } from '../theme.ts';
import { Body, Card, InfoNote, Note, SectionHead, Seg, Sheet, u } from './ui.tsx';

const r0 = (x: number | null) => (x == null ? 'unknown' : `${Math.round(x)}/hr`);
const err = (m: number | null) => (m == null ? 'not scored' : m === 0 ? 'on the forecast' : `${Math.abs(m)} min ${m > 0 ? 'late' : 'early'}`);

export function Lessons({ live, test, liveNos, testNos, startTest, onClose }: { live: L; test: L; liveNos: Nos; testNos: Nos; startTest: boolean; onClose: () => void }) {
  const f = useType();
  const [which, setWhich] = useState<'live' | 'test'>(startTest ? 'test' : 'live');
  const l = which === 'test' ? test : live;
  const top = l.themes[0];
  const nos = which === 'test' ? testNos : liveNos;
  return (
    <Sheet title="Lessons & Insights" isTest={which === 'test'} onClose={onClose}>
      <Seg<'live' | 'test'> columns={2} value={which} onChange={setWhich} options={[{ value: 'live', label: `LIVE (${live.ships})` }, { value: 'test', label: `TEST (${test.ships})` }]} />
      {l.ships === 0 ? (
        <Note>No {which === 'test' ? 'TEST' : 'LIVE'} ship is marked complete yet. A ship teaches the next one once you mark it complete at Closeout.</Note>
      ) : (
        <>
          <Card style={[u.pad, { gap: 6 }]}>
            <SectionHead title="The next fix" />
            {top
              ? <Body semi>{top.name}: {top.ships} of {l.answers.length} answer{l.answers.length === 1 ? '' : 's'}</Body>
              : <Body>No answers yet to "What slowed you down today?".</Body>}
            <Note>Themes are matched by keywords. Read the answers below before deciding.</Note>
          </Card>
          <Card style={[u.pad, { gap: 6 }]}>
            <SectionHead title="Rates" right={`${l.ships} finished`} />
            <Body>Pace {r0(l.pace)} over {l.paceShips} ship{l.paceShips === 1 ? '' : 's'} · H.A. {r0(l.ha)} over {l.haShips}</Body>
            <Body>{biasLine(l) ?? 'Forecast not scored on these ships yet.'}</Body>
            <Note>Pooled: all autos over all hours, so a long ship weighs more than a short one.</Note>
          </Card>
          {l.themes.length > 0 && (
            <Card style={[u.pad, { gap: 4 }]}>
              <SectionHead title="What slowed us down" />
              {l.themes.map((t) => <Body key={t.name}>{t.name} · {t.ships} ship{t.ships === 1 ? '' : 's'}</Body>)}
            </Card>
          )}
          {l.answers.length > 0 && (
            <Card style={[u.pad, { gap: 8 }]}>
              <SectionHead title="The answers" />
              {l.answers.map((a, k) => (
                <View key={k} style={{ gap: 2, borderBottomWidth: 1, borderBottomColor: bcolor.row, paddingBottom: 6 }}>
                  <Text style={{ fontFamily: f.bodySemi, fontSize: 15, color: color.ink }}>{a.name} · {a.date}</Text>
                  <Body>{a.text}</Body>
                </View>
              ))}
            </Card>
          )}
          <Card style={[u.pad, { gap: 6 }]}>
            <SectionHead title="Ship by ship" />
            {l.results.map((x: ShipResult) => <Body key={x.id}>{x.name} · {x.date} · pace {r0(x.pace)} · H.A. {r0(x.ha)} · forecast {err(x.forecastErrMin)}</Body>)}
          </Card>
        </>
      )}
      <Card style={[u.pad, { gap: 6 }]}>
        <SectionHead title={'"Not useful" taps'} right={String(nos.total)} />
        {nos.total === 0 ? <Note>None yet. Tap "Not useful?" on an answer, the Now line or a reminder when it didn't help.</Note> : (
          <>
            {nos.byWhere.map((w) => <Body key={w.where}>{WHERE_LABEL[w.where]} · {w.count}</Body>)}
            {nos.byReason.map((r) => <Note key={r.reason}>{r.reason} · {r.count}</Note>)}
            {nos.recent.slice(0, 8).map((x) => <Note key={x.key}>{x.at.slice(5, 16).replace('T', ' ')} · {WHERE_LABEL[x.where]}: {x.text.slice(0, 140)}{x.reason ? ` (${x.reason})` : ''}</Note>)}
          </>
        )}
      </Card>
      <InfoNote><Note>Only rates and patterns carry forward. No ship's cargo, counts or times enter another ship's record, and TEST ships only teach TEST ships.</Note></InfoNote>
    </Sheet>
  );
}
