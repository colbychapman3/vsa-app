// App-shell orchestration (8d), plain TS: the save guard and the export-and-mark flow, with store, clock and share sheet passed in.
// App.tsx wires React state around these; the rules (one save at a time, nothing written unless the engine accepts the batch,
// a dismissed share sheet is not a backup) are tested here without a phone.
import type { Reject } from '../engine/time.ts';
import type { VsaEvent } from '../engine/events.ts';
import type { State } from '../storage/store.ts';
import type { Ctx } from './entries.ts';

export type SaveResult = { ok: true } | Reject;
export type Appender = { append: (id: string, evs: VsaEvent[]) => Promise<{ ok: true; state: State } | Reject> };
export type Guard = { current: boolean };

export async function saveBatch(a: {
  ctx: Ctx | null; store: Appender | null; guard: Guard; build: (c: Ctx) => VsaEvent[] | Reject;
  openId: () => string | null; // the vessel open now: a switch while saving only reloads, never overwrites
  after: (c: Ctx, state: State) => Promise<void>;
}): Promise<SaveResult> {
  const { ctx: c, store } = a;
  if (!c || !store) return { ok: false, error: 'The vessel is still loading.' };
  if (a.guard.current) return { ok: false, error: 'Still saving the last entry. Try again.' };
  a.guard.current = true;
  try {
    const evs = a.build(c);
    if (!Array.isArray(evs)) return evs;
    const r = await store.append(c.operationId, evs);
    if (!r.ok) return r;
    if (a.openId() !== c.operationId) return { ok: true };
    await a.after(c, r.state);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not write to the phone: ${(e as Error).message}` };
  } finally {
    a.guard.current = false;
  }
}

// Share the exported text; it counts as backed up only when the share sheet was actually used.
export async function shareAndMark(a: {
  exported: { ok: true; text: string; fileName: string; count: number } | Reject;
  share: (title: string, message: string) => Promise<'shared' | 'dismissed'>;
  mark: (count: number) => Promise<void>;
}): Promise<{ ok: boolean; text: string }> {
  const r = a.exported;
  if (!r.ok) return { ok: false, text: `Not exported: ${r.error}` };
  try {
    if ((await a.share(r.fileName, r.text)) === 'dismissed') return { ok: true, text: 'Export cancelled. Nothing marked as backed up.' };
  } catch (e) {
    return { ok: false, text: `Not exported: ${(e as Error).message}` };
  }
  await a.mark(r.count);
  return { ok: true, text: `Shared ${r.count} entries.` };
}
