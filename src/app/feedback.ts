// "Is it an assistant?" asked in the moment (assistant step 4, Colby 2026-10-12): one tap says a card, line or reminder was not
// useful; an optional reason follows. Kept on this phone (settings table), never in a vessel's record, and read in Lessons.
export type FeedbackWhere = 'answer' | 'now' | 'reminder';
export type Feedback = { key: string; at: string; vesselId: string; isTest: boolean; where: FeedbackWhere; text: string; reason: string | null };
export const FEEDBACK_REASONS = ['Wrong number', 'Already knew', 'Wrong time', 'Not now', 'Unclear'] as const;
export const WHERE_LABEL: Record<FeedbackWhere, string> = { answer: 'Answer after Save', now: 'Now line', reminder: 'Reminder' };

export const feedbackKey = (vesselId: string, atIso: string) => `feedback:${vesselId}:${atIso}`;

export function feedbackSummary(all: Feedback[], isTest: boolean): { total: number; byWhere: { where: FeedbackWhere; count: number }[]; byReason: { reason: string; count: number }[]; recent: Feedback[] } {
  const fs = all.filter((f) => f.isTest === isTest).sort((a, b) => b.at.localeCompare(a.at));
  const tally = <K extends string>(keys: K[]) => [...keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<K, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    total: fs.length,
    byWhere: tally(fs.map((f) => f.where)).map(([where, count]) => ({ where, count })),
    byReason: tally(fs.map((f) => f.reason ?? 'No reason given')).map(([reason, count]) => ({ reason, count })),
    recent: fs.slice(0, 20),
  };
}
