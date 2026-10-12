// "Let information in the way it arrives" (assistant step 2, Colby 2026-10-12): the chief clerk's count, pasted from a text or
// dictated ("10-11 245", "245 for 10 to 11"). Read by fixed rules, never guessed: each hour found is only proposed, filled into
// the Log form, and saved by Colby's own Save. Anything not read cleanly is listed as not read.
export type ClerkHour = { start: string; count: number; read: string; note: string | null };
export type ClerkRead = { found: ClerkHour[]; notRead: string[] };

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
const HOUR = String.raw`(\d{1,2})(?::?00)?`;
const SEP = String.raw`\s*(?:-|–|—|to|til|till)\s*`;
const A = new RegExp(String.raw`^${HOUR}${SEP}${HOUR}\s*(?:hour|hr)?\s*[:=,]?\s*(?:count\s*)?(\d{1,4})\s*(?:cars|autos|units)?$`, 'i'); // 10-11 245
const B = new RegExp(String.raw`^(\d{1,4})\s*(?:cars|autos|units)?\s*(?:for|in|at|during)?\s*(?:the\s*)?${HOUR}${SEP}${HOUR}(?:\s*hour)?$`, 'i'); // 245 for 10-11

// hours: the working clock hours of the day the Log offers. "1-2" may be 01-02 or 13-14, "8-9" may be 08-09 or 20-21. Only
// working hours count; then only hours already started (a count comes after its hour); then, if two are left, the one not yet
// logged. Still two, or none: not read, with the reason.
export type DayHour = { start: string; logged: boolean };
export function readClerkText(text: string, hours: DayHour[], nowMin: number): ClerkRead {
  const found: ClerkHour[] = [], notRead: string[] = [];
  const parts = text.split(/[\n;]+|,(?=\s*\d{1,2}\s*(?:-|–|—|to)\s*\d)/i).map((x) => x.trim().replace(/[.!]+$/, '')).filter(Boolean);
  for (const p of parts) {
    const a = A.exec(p), bb = a ? null : B.exec(p);
    const m = a ? { s: +a[1], e: +a[2], c: +a[3] } : bb ? { s: +bb[2], e: +bb[3], c: +bb[1] } : null;
    if (!m) { notRead.push(p); continue; }
    if (m.s > 23 || m.e > 24 || (m.e - m.s + 24) % 24 !== 1 && (m.e - m.s + 24) % 12 !== 1) { notRead.push(`${p} (not a one-hour period)`); continue; }
    const work = [...new Set([m.s, m.s + 12])].filter((h) => h < 24 && hours.some((x) => x.start === pad(h)));
    const started = work.filter((h) => h * 60 <= nowMin);
    const open = started.length > 1 ? started.filter((h) => !hours.find((x) => x.start === pad(h))!.logged) : started;
    const span = (h: number) => `${pad(h).slice(0, 2)}-${pad((h + 1) % 24).slice(0, 2)}`;
    if (open.length !== 1) {
      notRead.push(`${p} (${!work.length ? 'not a working hour today' : !started.length ? 'that hour has not started yet' : `could be ${open.length ? open.map(span).join(' or ') : started.map(span).join(' or ')}`})`);
      continue;
    }
    const h = open[0];
    found.push({ start: pad(h), count: m.c, read: p, note: h !== m.s ? `read as ${pad(h).slice(0, 2)}-${pad((h + 1) % 24).slice(0, 2)}` : null });
  }
  return { found, notRead };
}
