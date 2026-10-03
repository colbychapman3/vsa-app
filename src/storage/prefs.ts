// Small app-wide choices from Settings (appearance, reminder quiet hours, keep import photos).
// Local settings table; never part of a vessel's official record.
import type { Db } from './db.ts';

const key = (k: string) => `pref:${k}`;
export const getPref = async (db: Db, k: string): Promise<string | null> =>
  (await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key(k)]))[0]?.value ?? null;
export const setPref = (db: Db, k: string, value: string) => db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [key(k), value]);
