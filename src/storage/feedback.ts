// "Not useful" taps (assistant step 4): local settings table, never part of a vessel's official record.
import type { Db } from './db.ts';
import type { Feedback } from '../app/feedback.ts';

export async function addFeedback(db: Db, f: Feedback): Promise<void> {
  await db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [f.key, JSON.stringify(f)]);
}
export async function setFeedbackReason(db: Db, key: string, reason: string): Promise<void> {
  const row = (await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]))[0];
  if (!row) return;
  await db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [key, JSON.stringify({ ...JSON.parse(row.value), reason })]);
}
export async function listFeedback(db: Db): Promise<Feedback[]> {
  const rows = await db.all<{ value: string }>("SELECT value FROM settings WHERE key LIKE 'feedback:%'", []);
  return rows.flatMap((r) => { try { return [JSON.parse(r.value) as Feedback]; } catch { return []; } });
}
