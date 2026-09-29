// Vessels on the phone: a baseline plus an append-only event log per vessel.
// Every append is checked by the engine (project) before anything is written,
// and state is always rebuilt from the stored log, never stored itself.
import { project, type Baseline, type VsaEvent, type Reject } from '../engine/index.ts';
import type { Db } from './db.ts';
import { migrate } from './schema.ts';

export type Vessel = { operationId: string; name: string; isTest: boolean; createdAt: string };
export type State = Extract<ReturnType<typeof project>, { ok: true }>;
type Row = { operation_id: string; name: string; is_test: number; baseline_json: string; created_at: string };

// Reference baselines that may only ever be loaded as TEST. Names are compared with case,
// spaces and punctuation removed, so "GLOVIS  Condor-101" is still caught.
const TEST_ONLY = ['gloviscondor101'];
const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const reject = (error: string): Reject => ({ ok: false, error });
const toVessel = (r: Row): Vessel => ({ operationId: r.operation_id, name: r.name, isTest: r.is_test === 1, createdAt: r.created_at });

export async function openStore(db: Db) {
  await migrate(db);
  const row = async (id: string) => (await db.all<Row>('SELECT * FROM vessels WHERE operation_id = ?', [id]))[0];
  const eventsOf = async (q: Db, id: string) =>
    (await q.all<{ event_json: string }>('SELECT event_json FROM events WHERE operation_id = ? ORDER BY sequence', [id]))
      .map((r) => JSON.parse(r.event_json) as VsaEvent);

  return {
    // TEST vessels have ids starting "TEST-" and LIVE vessels never do, so a TEST
    // event (its operation_id) can never be accepted into a LIVE vessel.
    async createVessel(v: { operationId: string; baseline: Baseline; isTest: boolean }): Promise<{ ok: true; vessel: Vessel } | Reject> {
      const { operationId: id, baseline, isTest } = v;
      if (!id.trim()) return reject('A vessel needs an operation id.');
      if (isTest !== id.startsWith('TEST-')) return reject(isTest ? `TEST vessel ids start with "TEST-" (got ${id}).` : `A LIVE vessel id cannot start with "TEST-" (got ${id}).`);
      if (!isTest && TEST_ONLY.some((n) => squash(baseline.vessel).includes(n))) return reject(`${baseline.vessel} is reference data and can only be loaded as TEST.`);
      const check = project(baseline, [], id);
      if (!check.ok) return check;
      if (await row(id)) return reject(`Vessel ${id} already exists. Nothing was changed.`);
      const createdAt = new Date().toISOString(); // processing time
      await db.run('INSERT INTO vessels VALUES (?, ?, ?, ?, ?)', [id, baseline.vessel, isTest ? 1 : 0, JSON.stringify(baseline), createdAt]);
      return { ok: true, vessel: { operationId: id, name: baseline.vessel, isTest, createdAt } };
    },

    async listVessels(): Promise<Vessel[]> {
      return (await db.all<Row>('SELECT * FROM vessels ORDER BY created_at')).map(toVessel);
    },

    // Always returns the stored events, even if the engine refuses them (state is
    // then the rejection), so stored data is never hidden.
    async load(id: string) {
      const r = await row(id);
      if (!r) return reject(`No vessel ${id} on this phone.`);
      const baseline = JSON.parse(r.baseline_json) as Baseline;
      const events = await eventsOf(db, id);
      return { ok: true as const, vessel: toVessel(r), baseline, events, state: project(baseline, events, id) };
    },

    // Validate stored + new with the engine, then insert only the new events, all
    // in one exclusive transaction. Re-delivered events are skipped by the engine.
    async append(id: string, events: VsaEvent[]): Promise<{ ok: true; saved: number; state: State } | Reject> {
      const r = await row(id);
      if (!r) return reject(`No vessel ${id} on this phone. Nothing was saved.`);
      const other = events.find((e) => e?.operation_id !== id);
      if (other) return reject(`Event ${other?.event_id} belongs to operation ${other?.operation_id}, not ${id}. Nothing was saved.`);
      const baseline = JSON.parse(r.baseline_json) as Baseline;
      // The database keeps JSON text, so the engine must judge what will be read back (Infinity becomes null).
      const incoming = events.map((e) => JSON.parse(JSON.stringify(e)) as VsaEvent);
      let result: { ok: true; saved: number; state: State } | Reject = reject('Nothing was saved.');
      try {
        await db.transaction(async (tx) => {
          const stored = await eventsOf(tx, id);
          const state = project(baseline, [...stored, ...incoming], id);
          if (!state.ok) { result = state; return; }
          const have = new Set(stored.map((e) => e.event_id));
          const fresh = state.log.events.filter((e) => !have.has(e.event_id));
          const max = stored.at(-1)?.sequence ?? 0;
          const late = fresh.find((e) => e.sequence <= max);
          if (late) { result = reject(`Event ${late.event_id}: sequence ${late.sequence} is not after the last saved event (${max}). Nothing was saved.`); return; }
          for (const e of fresh) {
            await tx.run('INSERT INTO events VALUES (?, ?, ?, ?, ?)', [id, e.sequence, e.event_id, e.idempotency_key, JSON.stringify(e)]);
          }
          result = { ok: true, saved: fresh.length, state };
        });
      } catch (e) {
        return reject(`Nothing was saved (database error: ${(e as Error).message}).`);
      }
      return result;
    },

    close: () => db.close(),
  };
}

export type Store = Awaited<ReturnType<typeof openStore>>;
