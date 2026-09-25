// node:sqlite behind the store's Db interface, so storage tests run on this PC
// against a real SQLite file with the same SQL the phone uses.
import { DatabaseSync } from 'node:sqlite';
import type { Db, Param } from '../src/storage/db.ts';

export function openNodeDb(path: string): Db {
  const raw = new DatabaseSync(path);
  const db: Db = {
    exec: async (sql) => { raw.exec(sql); },
    run: async (sql, params: Param[] = []) => { raw.prepare(sql).run(...params); },
    all: async <T>(sql: string, params: Param[] = []) => raw.prepare(sql).all(...params).map((r) => ({ ...r })) as T[], // plain objects, like expo-sqlite
    transaction: async (fn) => {
      raw.exec('BEGIN IMMEDIATE');
      try { await fn(db); raw.exec('COMMIT'); }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
    close: async () => { raw.close(); },
  };
  return db;
}
