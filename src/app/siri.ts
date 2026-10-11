// Siri hand-off (Colby, 2026-10-11: "2. say it instead of typing it"). "Hey Siri, log a count in VSA" → "252": the app opens
// the Log on the hour that's due with 252 filled in. Nothing is saved until Save is tapped, and the count is checked like
// any typed count. A count said more than 10 minutes ago is dropped: the hour it meant may have passed. Pure and tested.
export type SiriPending = { count: number; atMs: number };
export const SIRI_FRESH_MS = 10 * 60 * 1000;

export function siriPrefill(p: SiriPending | null, nowMs: number): { count: number; start: null } | null {
  if (!p || !Number.isInteger(p.count) || p.count < 0) return null;
  const age = nowMs - p.atMs;
  if (!(age >= 0 && age <= SIRI_FRESH_MS)) return null;
  return { count: p.count, start: null }; // start null: the Log picks the hour that's due, as for a count typed in Ask
}
