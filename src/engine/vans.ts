// Shuttle van list (Plan tab): pure checks, status, change history and tallies for one vessel's vans.
// A van row is one slot on the TICO check in/out sheet. It is its own ledger: nothing here touches a count, ledger or forecast.
// Unknown stays unknown: a blank time, gas level or gassing status is "not recorded", never a default.
import { toAbs, type OpTime } from './time.ts';

export const GAS_LEVELS = ['Full', '¾', '½', '¼', 'Empty'] as const;
export type Gas = (typeof GAS_LEVELS)[number];
export type Gassed = 'gassed' | 'not_gassed';

// What a van event carries (payload.van). Every field is the row's value after that event.
export type VanData = {
  number: string | null; driver: string | null; lasher: boolean;
  out: OpTime | null; in: OpTime | null; gas: Gas | null;
  gassed: Gassed | null; gassedAt: OpTime | null; gassedNote: string | null; remarks: string | null;
};
export const BLANK_VAN: VanData = { number: null, driver: null, lasher: false, out: null, in: null, gas: null, gassed: null, gassedAt: null, gassedNote: null, remarks: null };

export const MAX_VANS = 30;
const fmt = (t: OpTime) => `Day ${t.day} ${t.hm}`;
const isTime = (t: unknown): t is OpTime => !!t && typeof t === 'object' && toAbs(t as OpTime) != null;
const text = (v: unknown, max: number) => v == null || (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max);

// First problem with a van row, in plain words, or null.
export function checkVan(d: Partial<VanData> | null | undefined): string | null {
  if (!d || typeof d !== 'object') return 'A van row is missing its details.';
  if (!text(d.number, 12) || (d.number != null && !/^[A-Za-z0-9-]+$/.test(d.number.trim()))) return 'A van number is 1 to 12 letters, digits or dashes.';
  if (!text(d.driver, 60)) return 'A driver name is 1 to 60 characters, or blank.';
  if (typeof d.lasher !== 'boolean') return 'Lasher van must be yes or no.';
  for (const [k, label] of [['out', 'Checked out'], ['in', 'Checked in'], ['gassedAt', 'Gassed time']] as const) {
    const t = d[k];
    if (t != null && !isTime(t)) return `${label} must be a day and a time like 09:15.`;
  }
  if (d.gas != null && !GAS_LEVELS.includes(d.gas)) return 'Gas must be Full, ¾, ½, ¼ or Empty.';
  if (d.gassed != null && d.gassed !== 'gassed' && d.gassed !== 'not_gassed') return 'Gassed status must be Gassed or Not gassed, or not recorded.';
  if (d.gassedAt != null && d.gassed !== 'gassed') return 'A gassed time only goes with the status Gassed.';
  if (!text(d.gassedNote, 200)) return 'The gassing note is 1 to 200 characters, or blank.';
  if (!text(d.remarks, 300)) return 'Remarks are 1 to 300 characters, or blank.';
  if (d.number == null && (d.out || d.in || d.gas || d.gassed)) return 'Enter the van number before check-out, check-in, gas or gassing.';
  if (d.out && d.in && toAbs(d.in)! < toAbs(d.out)!) return `Checked in ${fmt(d.in)} is before checked out ${fmt(d.out)}.`;
  return null;
}

export const trimVan = (d: VanData): VanData => ({
  ...d, number: d.number?.trim() || null, driver: d.driver?.trim() || null, gassedNote: d.gassedNote?.trim() || null, remarks: d.remarks?.trim() || null,
});

export type VanStatus = 'unassigned' | 'notout' | 'out' | 'back';
export const vanStatus = (d: VanData): VanStatus => (d.number == null ? 'unassigned' : d.in ? 'back' : d.out ? 'out' : 'notout');
export const STATUS_LABEL: Record<VanStatus, string> = { unassigned: 'Not assigned', notout: 'Not out yet', out: 'Out', back: 'Back' };

export type VanField = 'number' | 'driver' | 'lasher' | 'out' | 'in' | 'gas' | 'gassed' | 'gassedAt' | 'gassedNote' | 'remarks';
export type VanChange = { field: VanField; from: string; to: string; assignment: boolean; text: string; at: string; note: string | null };

const show = (f: VanField, v: VanData[VanField]): string => {
  if (v == null) return f === 'gassed' ? 'not recorded' : f === 'number' || f === 'driver' ? 'none' : '—';
  if (f === 'lasher') return v ? 'yes' : 'no';
  if (f === 'gassed') return v === 'gassed' ? 'Gassed' : 'Not gassed';
  if (typeof v === 'object') return fmt(v as OpTime);
  return String(v);
};
const FIELDS: VanField[] = ['number', 'driver', 'lasher', 'out', 'in', 'gas', 'gassed', 'gassedAt', 'gassedNote', 'remarks'];
const WORDS: Record<VanField, string> = { number: 'Van', driver: 'Driver', lasher: 'Lasher van', out: 'Checked out', in: 'Checked in', gas: 'Gas', gassed: 'Gassed at end of vessel', gassedAt: 'Gassed time', gassedNote: 'Gassing note', remarks: 'Remarks' };

// Every field that differs between two versions of a row, in words. Putting a row's first number or driver into an empty slot
// is an assignment, not a change (no history line); everything after that, including re-filling a cleared one, is a change.
// `had` says which of number/driver the row held in any earlier version.
export function diffVan(prev: VanData, next: VanData, at: string, note: string | null, had: { number?: boolean; driver?: boolean } = {}): VanChange[] {
  const out: VanChange[] = [];
  for (const f of FIELDS) {
    const a = prev[f], b = next[f];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    const assignment = (f === 'number' || f === 'driver') && a == null && !had[f]; // a field that held a value before and was cleared is re-filled, not first-filled
    out.push({ field: f, from: show(f, a), to: show(f, b), assignment, text: `${WORDS[f]} ${show(f, a)} → ${show(f, b)}`, at, note });
  }
  return out;
}

// One row on the vessel's list. History is oldest first; the first version's values are the starting point.
export type VanSlot = VanData & {
  id: string; headId: string; slot: number; status: VanStatus;
  removed: boolean; removedReason: string | null; removedAt: string | null; createdAt: string;
  changes: VanChange[]; // oldest to newest, every field
};

export type VanTally = { total: number; assigned: number; out: number; back: number; notOut: number; lashers: number; gassed: number; notGassed: number; notRecorded: number };
// Removed rows and unassigned slots are not counted as vans on the ship.
export function vanTally(slots: readonly VanSlot[]): VanTally {
  const live = slots.filter((s) => !s.removed);
  const a = live.filter((s) => s.status !== 'unassigned');
  return {
    total: live.length, assigned: a.length,
    out: a.filter((s) => s.status === 'out').length, back: a.filter((s) => s.status === 'back').length, notOut: a.filter((s) => s.status === 'notout').length,
    lashers: a.filter((s) => s.lasher).length,
    gassed: a.filter((s) => s.gassed === 'gassed').length, notGassed: a.filter((s) => s.gassed === 'not_gassed').length, notRecorded: a.filter((s) => s.gassed == null).length,
  };
}

// Vans still not marked either way, once the vessel is finished (remaining confirmed 0). Null = no alert.
export function gassingAlert(slots: readonly VanSlot[], vesselRemaining: number | null): string | null {
  if (vesselRemaining !== 0) return null;
  const n = vanTally(slots).notRecorded;
  return n > 0 ? `${n} van${n === 1 ? '' : 's'} not marked gassed` : null;
}

// Back vans only: the shortcut never touches a van that is Out, unassigned, removed or already marked either way.
export const backNotMarked = (slots: readonly VanSlot[]) => slots.filter((s) => !s.removed && s.status === 'back' && s.gassed == null);

// The row that already holds a van number (compared as typed, ignoring case), or null.
export function numberHeldBy(slots: readonly VanSlot[], number: string, exceptId?: string): VanSlot | null {
  const n = number.trim().toLowerCase();
  return slots.find((s) => !s.removed && s.id !== exceptId && s.number?.toLowerCase() === n) ?? null;
}

// Parse text read from the TICO sheet into proposed rows: a line with a 3-4 digit van number, and a name only if it is on the
// same line. Row numbers (1-20), dates and gas marks are skipped; nothing is guessed, and duplicates are dropped.
export function parseVanSheet(textIn: string): { number: string; driver: string | null }[] {
  const seen = new Set<string>(), out: { number: string; driver: string | null }[] = [];
  for (const line of textIn.split(/\r?\n/)) {
    const m = line.trim().match(/^(?:\d{1,2}[.)]?\s+)?([1-9]\d{2,3})(?![\d\-/:.])\b\s*(.*)$/); // not a date or time, no leading zero
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const name = m[2].replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ number: m[1], driver: name.length >= 2 && !/^(full|empty|half|quarter|gas)$/i.test(name) ? name : null });
  }
  return out;
}

