// Which vessels are on the phone and which is open. Archive hides a vessel from the list; nothing is
// ever deleted. Both marks live in the local settings table, not the official record.
import type { Db } from './db.ts';
import type { Store } from './store.ts';

const ARCHIVED = (id: string) => `archived:${id}`;
const LAST = 'last_vessel';
const get = async (db: Db, key: string) => (await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]))[0]?.value ?? null;

export async function setArchived(db: Db, id: string, archived: boolean): Promise<void> {
  if (archived) await db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [ARCHIVED(id), '1']);
  else await db.run('DELETE FROM settings WHERE key = ?', [ARCHIVED(id)]);
}
export const setLastOpened = (db: Db, id: string) => db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [LAST, id]);
export const lastOpened = (db: Db) => get(db, LAST);

export type VesselRow = {
  operationId: string; name: string; isTest: boolean; date: string; archived: boolean;
  remaining: number | null; // vessel remaining; null = unknown (never shown as 0)
  start: number | null; field: number | null; problem: string | null;
};

export async function listRows(db: Db, store: Store): Promise<VesselRow[]> {
  const rows: VesselRow[] = [];
  for (const v of await store.listVessels()) {
    const r = await store.load(v.operationId);
    const archived = (await get(db, ARCHIVED(v.operationId))) != null;
    const base = { operationId: v.operationId, name: v.name, isTest: v.isTest, archived };
    if (!r.ok) { rows.push({ ...base, date: '', remaining: null, start: null, field: null, problem: r.error }); continue; }
    const s = r.state;
    rows.push(s.ok
      ? { ...base, date: r.baseline.date, remaining: s.vesselRemaining, start: s.start, field: s.field, problem: null }
      : { ...base, date: r.baseline.date, remaining: null, start: null, field: null, problem: s.error });
  }
  return rows.reverse(); // newest first
}

// Colby's typed notes for the completion report's analysis sections (local, not the official record).
const NOTE = (id: string, section: string) => `report_note:${id}:${section}`;
export async function setNote(db: Db, id: string, section: string, text: string): Promise<void> {
  if (text.trim()) await db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [NOTE(id, section), text]);
  else await db.run('DELETE FROM settings WHERE key = ?', [NOTE(id, section)]);
}
export async function getNotes(db: Db, id: string): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings WHERE key LIKE ?', [`report_note:${id}:%`]);
  return Object.fromEntries(rows.map((r) => [r.key.slice(`report_note:${id}:`.length), r.value]));
}
