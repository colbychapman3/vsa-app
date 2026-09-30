// Photo evidence (Phase 6b): pure checks for the four photo types, VINs and place.
// Evidence never changes a count, ledger or forecast; it only records what was seen, where and when.
export const EVIDENCE_TYPES = ['pre-stow-damage', 'poor-stowage', 'accident', 'pre-stow'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const TYPE_LABEL: Record<EvidenceType, string> = { 'pre-stow-damage': 'Pre-stow damage', 'poor-stowage': 'Poor stowage', accident: 'Accident', 'pre-stow': 'Pre-stow' };

// Quick picks from SOP Ver. 2024 Ch. 6 causes and Ch. 2 §5 conditions (approved by Colby 2026-09-30), plus "Other…" (free text) in the UI.
export const EVIDENCE_REASONS = [
  'Latch/lashing contact', 'Pillar or blind spot', 'Slippery deck', 'Driving too fast', 'Poor stowage against pillar/wall',
  'Defective vehicle: dead battery', 'Defective vehicle: flat tire', 'Defective vehicle: oil leak', 'Defective vehicle: gear failure', 'Defective vehicle: door lock',
] as const;

// What an evidence event carries (payload.evidence). `photo` is the app-folder path evidence/<vesselId>/<eventId>.jpg,
// stored relative to the document folder because the folder's full path can change when the app is updated.
export type EvidenceData = { type: EvidenceType; deck: string; hatch: string; reason: string; vins: string[]; notes: string | null; photo: string };

export const evidencePath = (vesselId: string, eventId: string) => `evidence/${vesselId}/${eventId}.jpg`;

// ---------- VIN ----------

const TRANSLIT: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// 17 letters/digits, no I, O or Q. Only trimming and capital letters are applied; a VIN is never corrected or guessed.
// The check digit (position 9) is tested too, but a failure only warns: some import VINs don't validate.
export function checkVin(raw: string): { ok: true; vin: string; warning: string | null } | { ok: false; error: string } {
  const vin = raw.trim().toUpperCase();
  if (vin.length !== 17) return { ok: false, error: `VIN ${vin || '(empty)'} has ${vin.length} characters; a VIN has exactly 17.` };
  if (!/^[A-Z0-9]{17}$/.test(vin)) return { ok: false, error: `VIN ${vin} may only contain letters and digits.` };
  const bad = vin.match(/[IOQ]/);
  if (bad) return { ok: false, error: `VIN ${vin} contains ${bad[0]}. VINs never use I, O or Q; check the characters.` };
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (/\d/.test(vin[i]) ? Number(vin[i]) : TRANSLIT[vin[i]]) * WEIGHTS[i];
  const digit = sum % 11 === 10 ? 'X' : String(sum % 11);
  return { ok: true, vin, warning: vin[8] === digit ? null : `VIN ${vin} does not pass the check digit; confirm it.` };
}

// A photo's VIN list: every VIN valid, no duplicates. Warnings come back per VIN (check digit only).
export function checkVins(list: string[]): { ok: true; vins: string[]; warnings: string[] } | { ok: false; error: string } {
  const vins: string[] = [], warnings: string[] = [];
  for (const raw of list) {
    const r = checkVin(raw);
    if (!r.ok) return r;
    if (vins.includes(r.vin)) return { ok: false, error: `VIN ${r.vin} is listed twice on this photo.` };
    vins.push(r.vin);
    if (r.warning) warnings.push(r.warning);
  }
  return { ok: true, vins, warnings };
}

// ---------- Whole entry ----------

// Returns the first problem in plain words (naming the field), or null. Time is checked by the form (it lives on the event).
// Place must exist on the vessel's baseline; accidents need at least one VIN.
export function checkEvidence(d: Partial<EvidenceData> | null | undefined, decks: { id: string; label: string; hatches: { h: string }[] }[]): string | null {
  if (!d || !d.type || !EVIDENCE_TYPES.includes(d.type)) return 'Pick the photo type.';
  if (!d.photo?.trim()) return 'Take the photo first.';
  if (!d.deck?.trim()) return 'Pick the deck.';
  const deck = decks.find((x) => x.id === d.deck);
  if (!deck) return `Deck ${d.deck} is not on this vessel.`;
  if (!d.hatch?.trim()) return 'Pick the hatch.';
  if (!deck.hatches.some((h) => h.h === d.hatch)) return `Hatch ${d.hatch} is not on deck ${deck.label}.`;
  if (!d.reason?.trim()) return 'Pick a reason.';
  if (d.notes != null && typeof d.notes !== 'string') return 'Notes must be text.';
  if (!Array.isArray(d.vins)) return 'VINs must be a list.';
  if (d.type === 'accident' && d.vins.length === 0) return 'An accident photo needs at least one VIN.';
  const v = checkVins(d.vins);
  return v.ok ? null : v.error;
}
