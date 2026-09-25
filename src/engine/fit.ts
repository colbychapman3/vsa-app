// Height fit check for passenger cars against the cited SOP rule.
// Needs Stow H (never Stow W), the deck clear height, and the rule. Otherwise: not verified.
import type { Reject } from './time.ts';

export const SOP_P28 = 'K-Line SOP Ver. 2024, PDF p.28, C2 §2, item 06';

type FitInput = { cargo: 'passenger_car' | 'hh'; stowH_cm: number | null; deck_cm: number | null; route_cm?: number | null };
export type FitResult =
  | { result: 'not_verified'; missing: string[]; note: string }
  | { result: 'pass' | 'fail'; required_cm: number; available_cm: number; margin_cm: number; rule: string; note: string };

const bad = (x: number | null | undefined) => x != null && !(Number.isFinite(x) && x > 0);

export function heightFit(input: FitInput): FitResult | Reject {
  const { cargo, stowH_cm, deck_cm, route_cm } = input;
  if (bad(deck_cm)) return { ok: false, error: 'Deck height must be a positive number of cm.' };
  if (bad(stowH_cm)) return { ok: false, error: 'Stow H must be a positive number of cm.' };
  if (bad(route_cm)) return { ok: false, error: 'Route clear height must be a positive number of cm.' };
  if (cargo !== 'passenger_car') {
    return { result: 'not_verified', missing: ['applicable H&H clearance rule'], note: `${SOP_P28} applies to passenger cars only. H&H needs its own rule; route checks are separate.` };
  }
  const missing = [stowH_cm == null && 'Stow H', deck_cm == null && 'deck height', route_cm == null && 'route clear height'].filter((x): x is string => !!x);
  if (stowH_cm == null || deck_cm == null) return { result: 'not_verified', missing, note: 'Fit not verified: provide the missing heights.' };

  const required_cm = deck_cm <= 220 ? 8 : 10;
  const available_cm = Math.min(deck_cm, route_cm ?? deck_cm) - stowH_cm;
  const margin_cm = available_cm - required_cm;
  const note = route_cm == null
    ? 'Deck height constraint only. Route clear height not checked.'
    : 'Deck and route height constraints only; other loading requirements are separate.';
  return { result: margin_cm >= 0 ? 'pass' : 'fail', required_cm, available_cm, margin_cm, rule: SOP_P28, note };
}

// A partial manifest verifies only the units inspected.
export function manifestCoverage(m: { authoritative: number; inspected: number; inspectedFit: number }) {
  const { authoritative, inspected, inspectedFit } = m;
  if (inspected > authoritative) return { ok: false as const, error: `Inspected (${inspected}) exceeds the authoritative load (${authoritative}) by ${inspected - authoritative}. Check the count.` };
  if (inspectedFit > inspected) return { ok: false as const, error: `Fit count (${inspectedFit}) exceeds inspected (${inspected}) by ${inspectedFit - inspected}. Check the count.` };
  const uninspected = authoritative - inspected;
  const failed = inspected - inspectedFit;
  return {
    verified: inspectedFit,
    failed,
    uninspected,
    fullyVerified: uninspected === 0 && failed === 0,
    message: `${inspectedFit} of ${authoritative} verified by height` + (failed ? `; ${failed} failed` : '') + (uninspected ? `; ${uninspected} not inspected.` : '.'),
  };
}
