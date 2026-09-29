// Export / import of one vessel's log as a JSON file. The phone's SQLite log is the only official
// record, so this is its backup. Import only ever appends: nothing is overwritten or deleted.
import type { Baseline, VsaEvent, Reject } from '../engine/index.ts';
import { project } from '../engine/index.ts';
import type { Db } from './db.ts';
import { SCHEMA_VERSION } from './schema.ts';
import type { Store } from './store.ts';
import { sha256Hex } from './sha256.ts';

const reject = (error: string): Reject => ({ ok: false, error });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// The checksum catches accidents and corruption (a cut-off or edited file), not deliberate forgery:
// anyone who edits the file can recompute it. v1 covered events only; v2 covers the whole payload.
const checksumV1 = (events: VsaEvent[]) => sha256Hex(JSON.stringify(events));
const checksumV2 = (operation_id: string, is_test: boolean, baseline: unknown, events: VsaEvent[]) =>
  sha256Hex(JSON.stringify({ operation_id, is_test, baseline, events }));

export async function exportLog(store: Store, id: string, nowIso: string): Promise<{ ok: true; text: string; fileName: string; count: number } | Reject> {
  const r = await store.load(id);
  if (!r.ok) return r;
  const file = {
    format: 'vsa-log', version: 2,
    exported_at: nowIso, // phone clock: processing time
    app_schema_version: SCHEMA_VERSION,
    vessel: { operation_id: id, is_test: r.vessel.isTest, baseline: r.baseline },
    events: r.events, event_count: r.events.length, checksum: checksumV2(id, r.vessel.isTest, r.baseline, r.events),
  };
  return { ok: true, text: JSON.stringify(file, null, 1), fileName: `vsa-log-${id}.json`, count: r.events.length };
}

export type ImportResult = { ok: true; operationId: string; kind: 'created' | 'appended' | 'current'; added: number; total: number; exportedAt: string } | Reject;

export async function importLog(store: Store, text: string): Promise<ImportResult> {
  let f: any;
  try { f = JSON.parse(text); } catch { return reject('This is not a readable VSA log file (not valid JSON). Nothing was imported.'); }
  const bad = (why: string) => reject(`${why} Nothing was imported.`);
  if (!f || typeof f !== 'object' || f.format !== 'vsa-log') return bad('This is not a VSA log file (format is not "vsa-log").');
  if (f.version !== 1 && f.version !== 2) return bad(`This log file is version ${String(f.version)}; this app reads versions 1 and 2.`);
  if (typeof f.app_schema_version !== 'number' || f.app_schema_version > SCHEMA_VERSION) return bad(`This log file comes from a newer app (schema ${String(f.app_schema_version)}, this app is ${SCHEMA_VERSION}). Update the app.`);
  const v = f.vessel;
  if (!v || typeof v.operation_id !== 'string' || typeof v.is_test !== 'boolean' || !v.baseline || typeof v.baseline !== 'object') return bad('The vessel section of this file is incomplete.');
  if (!Array.isArray(f.events) || f.events.some((e: unknown) => !e || typeof e !== 'object')) return bad('The events section of this file is missing or damaged.');
  const events = f.events as VsaEvent[];
  if (f.event_count !== events.length) return bad(`The file says ${String(f.event_count)} events but holds ${events.length}. It is damaged.`);
  const expect = f.version === 1 ? checksumV1(events) : checksumV2(v.operation_id, v.is_test, v.baseline, events);
  if (f.checksum !== expect) return bad('The checksum does not match: the events were changed or damaged after export.');

  const id: string = v.operation_id;
  const baseline = v.baseline as Baseline;
  const done = (kind: 'created' | 'appended' | 'current', added: number): ImportResult => ({ ok: true, operationId: id, kind, added, total: events.length, exportedAt: String(f.exported_at) });
  const other = events.find((e) => e.operation_id !== id);
  if (other) return bad(`Event ${other.event_id} belongs to operation ${other.operation_id}, not ${id}.`);
  const check = project(baseline, events, id);
  if (!check.ok) return bad(`The engine refuses this log: ${check.error}`);

  const have = await store.load(id);
  if (!have.ok) { // new vessel
    const c = await store.createVessel({ operationId: id, baseline, isTest: v.is_test });
    if (!c.ok) return bad(c.error);
    const a = await store.append(id, events);
    return a.ok ? done('created', a.saved) : bad(`Vessel ${id} was created but its events were refused: ${a.error}`);
  }
  if (have.vessel.isTest !== v.is_test) return bad(`Vessel ${id} is ${have.vessel.isTest ? 'TEST' : 'LIVE'} on this phone but the file says ${v.is_test ? 'TEST' : 'LIVE'}.`);
  if (!same(have.baseline, baseline)) return bad(`Vessel ${id} is already on this phone with a different baseline.`);
  const mine = have.events;
  const n = Math.min(mine.length, events.length);
  for (let i = 0; i < n; i++) {
    if (!same(mine[i], events[i])) return bad(`Vessel ${id} already has different history: event ${i + 1} (${mine[i].event_id}) differs from the file.`);
  }
  if (events.length <= mine.length) return done('current', 0); // file is identical to, or older than, the phone
  const a = await store.append(id, events.slice(mine.length));
  return a.ok ? done('appended', a.saved) : bad(a.error);
}

// Last export per vessel, in the local settings table (not part of the official record).
const key = (id: string) => `last_export:${id}`;
export async function markExported(db: Db, id: string, at: string, count: number): Promise<void> {
  // Never lower the marker: an older file (fewer events) says nothing new about what is backed up.
  const r = (await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key(id)]))[0];
  const last = r ? (JSON.parse(r.value) as { at: string; count: number }) : null;
  if (last && count < last.count) return;
  await db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [key(id), JSON.stringify({ at, count })]);
}
export async function backupStatus(db: Db, id: string, eventCount: number): Promise<{ lastAt: string | null; unsaved: number }> {
  const r = (await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key(id)]))[0];
  const last = r ? (JSON.parse(r.value) as { at: string; count: number }) : null;
  return { lastAt: last?.at ?? null, unsaved: Math.max(0, eventCount - (last?.count ?? 0)) };
}
