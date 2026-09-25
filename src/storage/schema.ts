// Schema and migrations. PRAGMA user_version tracks the version so later phases
// can migrate without losing data. The database itself enforces append-only.
import type { Db } from './db.ts';

export const SCHEMA_VERSION = 1;

const V1 = `
CREATE TABLE vessels (
  operation_id  TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  is_test       INTEGER NOT NULL CHECK (is_test IN (0, 1)),
  baseline_json TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE events (
  operation_id    TEXT NOT NULL REFERENCES vessels(operation_id),
  sequence        INTEGER NOT NULL,
  event_id        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_json      TEXT NOT NULL,
  PRIMARY KEY (operation_id, sequence),
  UNIQUE (operation_id, event_id),
  UNIQUE (operation_id, idempotency_key)
);
CREATE TRIGGER events_no_update BEFORE UPDATE ON events
  BEGIN SELECT RAISE(ABORT, 'Events are append-only. Corrections are new events.'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events
  BEGIN SELECT RAISE(ABORT, 'Events are append-only. Corrections are new events.'); END;
CREATE TRIGGER vessels_locked BEFORE UPDATE OF operation_id, is_test, baseline_json, created_at ON vessels
  BEGIN SELECT RAISE(ABORT, 'A vessel''s TEST/LIVE mark and baseline cannot be changed.'); END;
CREATE TRIGGER vessels_no_delete BEFORE DELETE ON vessels
  BEGIN SELECT RAISE(ABORT, 'Vessels cannot be deleted.'); END;
`;

// Run on every open. A new file gets v1; an existing v1 file is left alone.
export async function migrate(db: Db): Promise<void> {
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const [{ user_version }] = await db.all<{ user_version: number }>('PRAGMA user_version');
  if (user_version > SCHEMA_VERSION) throw new Error(`Database is schema v${user_version}, newer than this app (v${SCHEMA_VERSION}). Update the app.`);
  if (user_version === SCHEMA_VERSION) return;
  await db.transaction(async (tx) => {
    await tx.exec(V1);
    await tx.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
