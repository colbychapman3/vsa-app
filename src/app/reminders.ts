// Plan reminders (Phase 6d): the only file that touches expo-notifications. Local notifications only; no server, no account.
// What to say and when is decided by reminderPlan() in assistant.ts (pure, tested). If the module is missing from the build
// or the permission is refused, callers get a status and the app works as before (the Plan tab still shows every alert).
import type { ReminderPlan } from './assistant.ts';

type N = typeof import('expo-notifications');
let mod: N | null | undefined;
const load = () => { if (mod === undefined) { try { mod = require('expo-notifications'); } catch { mod = null; } } return mod; };

export type ReminderStatus = 'on' | 'ask' | 'off' | 'missing';
export const REMINDER_STATUS_TEXT: Record<ReminderStatus, string> = {
  on: 'Plan reminders are on: every 25 minutes while an alert is open.',
  ask: 'Plan reminders are not turned on yet.',
  off: 'Reminders are off (notifications are blocked). Turn them on in Settings › VSA. The Plan tab still shows every alert.',
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

// Notifications shown while the app is open are fine (they are the same alerts as the Plan tab).
export function installHandlers(onOpenPlan: () => void): () => void {
  const n = load();
  if (!n) return () => {};
  try {
    n.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
    const sub = n.addNotificationResponseReceivedListener(onOpenPlan);
    if (n.getLastNotificationResponse()) onOpenPlan(); // the app was opened by tapping one
    return () => sub.remove();
  } catch { return () => {}; }
}

// Replace everything scheduled with this plan (null = cancel all). Quietly does nothing without permission.
export async function syncReminders(plan: ReminderPlan | null): Promise<void> {
  const n = load();
  if (!n) return;
  try {
    await n.cancelAllScheduledNotificationsAsync();
    if (!plan || !(await n.getPermissionsAsync()).granted) return;
    for (const m of plan.atMin) {
      await n.scheduleNotificationAsync({
        content: { title: 'VSA', body: plan.text, data: { tab: 'plan' } },
        trigger: { type: n.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: m * 60 },
      });
    }
  } catch { /* a scheduling error must never stop work; the Plan tab still shows the alerts */ }
}
