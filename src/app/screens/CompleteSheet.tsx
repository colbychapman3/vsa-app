// "Is the vessel complete?" (Colby, 2026-10-08; spec phase-7k). Opens when remaining reaches 0, or from Snapshot at any time.
// Yes marks it when nothing is open; open items are listed and can be overridden with a reason. A marked vessel can be reopened.
import { useState } from 'react';
import { View } from 'react-native';
import type { Reject, VsaEvent } from '../../engine/index.ts';
import type { State } from '../../storage/store.ts';
import { completeBlockers, completionStale } from '../complete.ts';
import * as E from '../entries.ts';
import { Body, ErrorBox, Go, Note, Reasons, Sheet } from './ui.tsx';

type Save = (build: (c: E.Ctx) => VsaEvent[] | Reject) => Promise<{ ok: true } | Reject>;

export function CompleteSheet({ state, isTest, save, onClose, onGo }: { state: State; isTest: boolean; save: Save; onClose: (done?: string) => void; onGo: (tab: 'decks' | 'hourly' | 'snap') => void }) {
  const marked = state.completed;
  const blockers = completeBlockers(state);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const why = reason === 'Other' ? other.trim() : reason;

  const run = async (build: (c: E.Ctx) => VsaEvent[] | Reject, done: string) => {
    setError(null); setBusy(true);
    try { const r = await save(build); if (r.ok) onClose(done); else setError(r.error); } finally { setBusy(false); }
  };

  return (
    <Sheet title={marked ? 'Vessel complete' : 'Is the vessel complete?'} isTest={isTest} onClose={() => onClose()}>
      {marked ? (
        <>
          <Body semi>Marked complete {marked.time}.</Body>
          {marked.override && <Note>Closed with open items: {marked.blockers.join(' ')} Reason: {marked.reason}</Note>}
          {completionStale(state) && <Note>The remaining count is no longer 0, so this mark no longer holds. Reopen it, or add the count back.</Note>}
          <Reasons options={E.REOPEN_REASONS} value={reason} onChange={setReason} other={other} onOther={setOther} />
          {error && <ErrorBox text={error} />}
          <Go label="Reopen the vessel" disabled={busy || !why} onPress={() => run((c) => E.reopenVesselEvents(c, why), 'Vessel reopened. The earlier mark stays in the log.')} />
        </>
      ) : (
        <>
          {blockers.length === 0
            ? <Note>Nothing is open: every deck is counted, ship and field match, and no issues are open. Yes marks the vessel complete and finalizes the reports.</Note>
            : (
              <View style={{ gap: 8 }}>
                <Body semi>{blockers.length === 1 ? 'One item is still open:' : `${blockers.length} items are still open:`}</Body>
                {blockers.map((b) => <Go ghost key={b.text} label={`${b.text} Go fix it ›`} onPress={() => { onClose(); onGo(b.go); }} />)}
              </View>
            )}
          {override && (
            <>
              <Reasons options={E.OVERRIDE_REASONS} value={reason} onChange={setReason} other={other} onOther={setOther} />
              <Note>The open items are saved with the mark and printed on the report.</Note>
            </>
          )}
          {error && <ErrorBox text={error} />}
          {blockers.length === 0
            ? <Go label="Yes, the vessel is complete" disabled={busy} onPress={() => run((c) => E.completeVesselEvents(c, null), 'Vessel marked complete. Reports are final.')} />
            : override
              ? <Go label="Mark complete anyway" disabled={busy || !why} onPress={() => run((c) => E.completeVesselEvents(c, why), 'Vessel marked complete with open items. The report lists them.')} />
              : <Go label="Mark complete anyway…" onPress={() => setOverride(true)} />}
          <Go ghost label="No, not yet" onPress={() => onClose()} />
        </>
      )}
    </Sheet>
  );
}
