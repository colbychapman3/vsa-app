// Operation clock, destination sides (Protocol Appendix C) and pre-break clear-by.
// Times are terminal wall-clock "HH:MM" on an operation day (Day 1, Day 2, ...).

export type Side = 'Northside' | 'Southside';
export type OpTime = { day: number; hm: string };
export type Reject = { ok: false; error: string };

const DAY = 1440;

export function parseHM(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function formatHM(min: number): string {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Minutes since 00:00 on Day 1.
export function toAbs(t: OpTime): number | null {
  const m = parseHM(t.hm);
  return m == null || !Number.isInteger(t.day) || t.day < 1 ? null : (t.day - 1) * DAY + m;
}

export function fromAbs(abs: number): OpTime {
  return { day: Math.floor(abs / DAY) + 1, hm: formatHM(abs) };
}

// ISO timestamp with offset → operation time. The wall-clock part of the string is
// the terminal's local time; operationDate is Day 1 as YYYY-MM-DD.
export function fromIso(iso: string, operationDate: string): OpTime | Reject {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (!m) return { ok: false, error: `Timestamp ${iso} needs a date, time and UTC offset.` };
  const day = Math.round((Date.parse(m[1]) - Date.parse(operationDate)) / 86_400_000) + 1;
  if (!(day >= 1)) return { ok: false, error: `Timestamp ${iso} is before the operation date ${operationDate}.` };
  return { day, hm: m[2] };
}

// Protocol v1.1 Appendix C (user-confirmed), plus the §7.1 aliases.
const SIDES: Record<string, [string, Side]> = {};
const add = (side: Side, names: string[]) => names.forEach((n) => (SIDES[n.toLowerCase()] = [n, side]));
add('Northside', ['Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8', 'Zone 9', 'BMW Field',
  'Site 2', 'Site 3', 'Site 4', 'Yard 1', 'Yard 2', 'Yard 3', 'AVP Yard', 'Gate 1']);
add('Southside', ['Zone 1 (MB Field)', 'MBZ (Mercedes)', 'Zone T', 'Zone V', 'Zone X', 'Zone B', 'Site 5', 'Site 6', 'Gate 2']);
const ALIASES: Record<string, string> = {
  'zone 1': 'zone 1 (mb field)',
  'mb field': 'mbz (mercedes)', // "MB Field" alone means MBZ, not Zone 1
  'mbz': 'mbz (mercedes)',
  'mercedes': 'mbz (mercedes)',
};
const SIDE_WORDS: Record<string, Side> = {
  'northside': 'Northside', 'this side': 'Northside',
  'southside': 'Southside', 'across the street': 'Southside',
};

export function destination(name: string): { name: string; side: Side } | null {
  const k = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (SIDE_WORDS[k]) return { name: SIDE_WORDS[k], side: SIDE_WORDS[k] };
  const hit = SIDES[ALIASES[k] ?? k];
  return hit ? { name: hit[0], side: hit[1] } : null;
}

export const CLEAR_BY_MIN: Record<Side, number> = { Northside: 15, Southside: 30 };

// Clear-by applies to a scheduled break start, any time of day.
export function clearBy(breakHM: string, side: Side): string | null {
  const b = parseHM(breakHM);
  return b == null ? null : formatHM(b - CLEAR_BY_MIN[side]);
}

// When production ends before a break. A stop time Colby gives already includes any
// cutoff, so it is used as-is (never subtract the cutoff twice).
export function productionEnd(breakHM: string, side: Side, userStopHM?: string): { hm: string; basis: 'user_stop' | 'clear_by' } | null {
  if (userStopHM != null) return parseHM(userStopHM) == null ? null : { hm: userStopHM, basis: 'user_stop' };
  const hm = clearBy(breakHM, side);
  return hm == null ? null : { hm, basis: 'clear_by' };
}

// Never invent an event time. A device clock read is labeled as processing time.
export function eventTimeLabel(occurred: OpTime | null, logged?: { hm: string; tz: string } | null): string {
  if (occurred) return occurred.day > 1 ? `Day ${occurred.day} ${occurred.hm}` : occurred.hm;
  if (logged) return `Logged at ${logged.hm} ${logged.tz} (processing time, not event time)`;
  return 'time not provided';
}
