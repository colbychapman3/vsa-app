// Reminders: the only file that touches expo-notifications. Local notifications only; no server, no account.
// What to say and when (absolute fire times) is decided by reminderPlan() in assistant.ts (pure, tested). If the module is missing from the build
// or the permission is refused, callers get a status and the app works as before (the Plan tab still shows every alert).
import type { PlannedReminder, ReminderTab } from './assistant.ts';

type N = typeof import('expo-notifications');
let mod: N | null | undefined;
const load = () => { if (mod === undefined) { try { mod = require('expo-notifications'); } catch { mod = null; } } return mod; };

export type ReminderStatus = 'on' | 'ask' | 'off' | 'missing';
export const REMINDER_STATUS_TEXT: Record<ReminderStatus, string> = {
  on: 'Notifications are allowed. Each reminder below can be turned on or off.',
  ask: 'Notifications are not turned on yet. Nothing is sent until you allow them.',
  off: 'Notifications are blocked for VSA. Allow them in the iPhone Settings app, under VSA. The Plan tab still shows every alert.',
  missing: 'This build cannot send reminders. The Plan tab still shows every alert.',
};

export async function reminderStatus(): Promise<ReminderStatus> {
  const n = load();
  if (!n) return 'missing';
  try {
    const p = await n.getPermissionsAsync();
    return p.granted ? 'on' : p.canAskAgain ? 'ask' : 'off';
  } catch { return 'missing'; }
}

export async function enableReminders(): Promise<ReminderStatus> {
  const n = load();
  if (!n) return 'missing';
  try { return (await n.requestPermissionsAsync()).granted ? 'on' : 'off'; } catch { return 'missing'; }
}

// Notifications shown while the app is open are fine (they say what the Plan and Log already show). A tap opens the place it names.
const isTab = (x: unknown): x is ReminderTab => x === 'log' || x === 'plan' || x === 'snap';
export function installHandlers(onOpen: (tab: ReminderTab) => void): () => void {
  const n = load();
  if (!n) return () => {};
  const tabOf = (r: { notification: { request: { content: { data?: Record<string, unknown> } } } } | null) => { const t = r?.notification.request.content.data?.tab; return isTab(t) ? t : 'plan'; };
  try {
    n.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
    const sub = n.addNotificationResponseReceivedListener((r) => onOpen(tabOf(r)));
    const last = n.getLastNotificationResponse();
    if (last) onOpen(tabOf(last)); // the app was opened by tapping one
    return () => sub.remove();
  } catch { return () => {}; }
}

// Replace everything scheduled with this plan (empty = cancel all). Quietly does nothing without permission.
// Calls run one after another: an older, slower call must never finish scheduling after a newer cancel.
let queue: Promise<void> = Promise.resolve();
export function syncReminders(plan: PlannedReminder[]): Promise<void> {
  queue = queue.then(() => run(plan));
  return queue;
}

async function run(plan: PlannedReminder[]): Promise<void> {
  const n = load();
  if (!n) return;
  try {
    await n.cancelAllScheduledNotificationsAsync();
    if (!plan.length || !(await n.getPermissionsAsync()).granted) return;
    for (const r of plan) {
      await n.scheduleNotificationAsync({
        content: { title: r.title, body: r.body, data: { tab: r.tab, kind: r.kind } },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: new Date(r.at) },
      });
    }
  } catch { /* a scheduling error must never stop work; the Plan tab still shows the alerts */ }
}
