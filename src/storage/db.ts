// The small database interface the store uses. expo-sqlite backs it on the phone
// (openExpoDb below); tests back it with node:sqlite (tests/nodeDb.ts). Same SQL.
import * as SQLite from 'expo-sqlite';

export type Param = string | number | null;

export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: Param[]): Promise<void>;
  all<T>(sql: string, params?: Param[]): Promise<T[]>;
  // Exclusive transaction: only queries made through `tx` are inside it. Throws → rolled back.
  transaction(fn: (tx: Db) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

type Queryable = Pick<SQLite.SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync'>;

function wrap(q: Queryable, db: SQLite.SQLiteDatabase): Db {
  return {
    exec: (sql) => q.execAsync(sql),
    run: async (sql, params = []) => { await q.runAsync(sql, params); },
    all: (sql, params = []) => q.getAllAsync(sql, params),
    transaction: (fn) => db.withExclusiveTransactionAsync((txn) => fn(wrap(txn, db))),
    close: () => db.closeAsync(),
  };
}

export async function openExpoDb(name = 'vsa.db'): Promise<Db> {
  const db = await SQLite.openDatabaseAsync(name);
  return wrap(db, db);
}
