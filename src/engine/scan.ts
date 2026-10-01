// Scan (Phase 6c): recognized text → VIN candidates. Pure; the camera and text recognition live in the app layer.
// Nothing is corrected: a run with I, O or Q is listed as unreadable for Colby to check, never swapped to 1/0.
import { checkVin } from './evidence.ts';

export type VinCandidate = { vin: string; warning: string | null } | { vin: string; unreadable: string };

export function vinCandidates(text: string): VinCandidate[] {
  const seen = new Set<string>();
  const out: VinCandidate[] = [];
  for (const run of text.toUpperCase().split(/[^A-Z0-9]+/)) {
    if (run.length !== 17 || !/\d/.test(run) || seen.has(run)) continue; // a VIN always has digits; plain words are skipped
    seen.add(run);
    const r = checkVin(run);
    out.push(r.ok ? { vin: r.vin, warning: r.warning } : { vin: run, unreadable: r.error });
  }
  return out;
}
