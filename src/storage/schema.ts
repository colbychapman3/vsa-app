// Schema and migrations. PRAGMA user_version tracks the version so later phases
// can migrate without losing data. The database itself enforces append-only.
import type { Db } from './db.ts';

export const SCHEMA_VERSION = 3;

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

// V2: INSERT OR REPLACE deletes the old row without firing the delete triggers, so it could
// silently overwrite an event or a vessel. Refuse any insert that collides with a stored row.
const V2 = `
CREATE TRIGGER events_no_replace BEFORE INSERT ON events
  WHEN EXISTS (SELECT 1 FROM events WHERE operation_id = NEW.operation_id
    AND (sequence = NEW.sequence OR event_id = NEW.event_id OR idempotency_key = NEW.idempotency_key))
  BEGIN SELECT RAISE(ABORT, 'Events are append-only. Corrections are new events.'); END;
CREATE TRIGGER vessels_no_replace BEFORE INSERT ON vessels
  WHEN EXISTS (SELECT 1 FROM vessels WHERE operation_id = NEW.operation_id)
  BEGIN SELECT RAISE(ABORT, 'A vessel''s TEST/LIVE mark and baseline cannot be changed.'); END;
`;

// V3: small local settings (last export of each vessel's log). Not part of the official record.
const V3 = `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`;

// Run on every open. Each step runs once, in order: a new file gets all of them, an older file only the newer ones.
export async function migrate(db: Db): Promise<void> {
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const [{ user_version }] = await db.all<{ user_version: number }>('PRAGMA user_version');
  if (user_version > SCHEMA_VERSION) throw new Error(`Database is schema v${user_version}, newer than this app (v${SCHEMA_VERSION}). Update the app.`);
  if (user_version === SCHEMA_VERSION) return;
  await db.transaction(async (tx) => {
    if (user_version < 1) await tx.exec(V1);
    if (user_version < 2) await tx.exec(V2);
    if (user_version < 3) await tx.exec(V3);
    await tx.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
