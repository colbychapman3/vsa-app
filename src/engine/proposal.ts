// AI proposals. The on-device model only proposes; this file decides what of a proposal may be shown.
// Pure, no AI dependency. A value the model could not have read from the source text is dropped, with the reason:
// every number and every name in a proposal must appear in the text it was given. Nothing here computes a total.

export type Checked<T> = { value: T; dropped: string[] } | null; // null = no proposal: the manual form stays as is

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
// Every digit run, thousands separators removed: "1,969" → "1969", "D9" → "9". Used to spot facts a rewording adds or drops.
const numbersIn = (s: string) => new Set((s.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));

// A reworded note must keep every number and VIN-like code of the original, and bring in none.
export function checkNoteTidy(raw: unknown, original: string): Checked<string> {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const tidy = raw.trim();
  const nums = numbersIn(original);
  const codes = new Set(norm(original).split(' '));
  const newNums = [...numbersIn(tidy)].filter((n) => !nums.has(n));
  const tidyCodes = new Set(norm(tidy).split(' '));
  const tidyNums = numbersIn(tidy);
  const isCode = (w: string) => /\d/.test(w) && /[A-Z]/.test(w);
  const newCodes = [...tidyCodes].filter((w) => isCode(w) && !codes.has(w));
  const lost = [...nums].some((n) => !tidyNums.has(n)) || [...codes].some((w) => isCode(w) && w.length >= 5 && !tidyCodes.has(w)); // VIN-like codes kept whole; D9 → "Deck 9" is fine (its 9 is kept)
  if (newNums.length || newCodes.length || lost) return null; // the model added or dropped a number or code: no proposal
  return { value: tidy, dropped: [] };
}
