# Spec: Customizable Snapshot, Field record box, ETA history (Phase 7i)

Status: **DRAFT**, waiting on approval. Colby asked on 2026-10-08: (1) customize the Snapshot page as he sees fit, removing a box or moving it to another tab; (2) a separate **Field record** box under the vessel remaining box; (3) a history of the recorded ETA behind the forecast box, tappable, with bar and line graph options and an analysis of plus or minus against production.

## Objective
The Snapshot shows what Colby wants where he wants it, the field count has its own box, and the forecast box opens a history showing how the ETA moved hour by hour and what production did around each move. Success: hide, move up/down or move to another tab for any Snapshot box; Field record box under the hero; tap the forecast box and see a chart of the ETA after each logged hour, switchable between line and bars, with a plus/minus line per hour.

## 1. Customize the Snapshot
- **Boxes:** Vessel remaining (hero), Field record (new), Est. completion, Avg hourly, Remaining by brand, Side split, and the other Snapshot boxes the page has today.
- **Per box:** Show or Hide, move up or down, and **Move to** Plan, Hourly or Decks (it then sits at the top of that tab). A box lives in one place.
- **Where:** Settings › Customize Snapshot (a list with the four controls on each row, 56 pt taps; no drag, which fails with gloves), plus a Reset to default.
- **Saved on the phone** (a local preference, like Night mode), never in a vessel's record and never in the backup export. It applies to every vessel.
- **Safety:** the Vessel remaining hero and the open-discrepancies strip can be moved but not hidden (the app must not hide a vessel balance or a warning). Hidden boxes list under "Hidden boxes" in the same Settings screen with a Show button.

## 2. Field record box
- Under the Vessel remaining box. Content, moved out of the hero's rows so the hero keeps vessel remaining only: **field count** (sum of the official hourly counts), **field balance** (starting − field, labeled), **in transit** (ship progress − field, never negative), **last hour logged**, counted hours (the H.A. denominator).
- Hourly field counts are the official record: this box says so. Unknown stays unknown, never zero.
- Autos only. H/H is never added.

## 3. ETA history (the forecast box)
- Tap the Est. completion box: it opens a History sheet. Today's tap flips the box to "how it is worked out"; that text stays as the first section of the sheet, so nothing is lost.
- **Data (no new events):** the history is recomputed from the log. For each logged hour, the forecast the app would have shown right after that hour was entered (same rules as today: break-aware, FORECAST label). Stored forecasts would duplicate and could disagree with the log; replaying cannot. It runs only when the sheet opens, and the cost is a projection per logged hour (tested for linear growth).
- **Chart:** two options, shown by a switch (Line / Bars). **Line:** the ETA clock time after each hour. **Bars:** minutes the ETA moved at each hour, later up and earlier down. A table underneath lists every point in plain numbers.
- **Plus/minus analysis, one line per hour:** "After 10:00: ETA 21:40, 18 min later than after 09:00. That hour counted 190; the forecast needed 245 per hour." An hour counted above the needed rate moved the ETA earlier, below moved it later. The wording follows the protocol's analytics rule: it states what changed and is consistent with, never because of.
- Requires a forecast at that moment: an hour with no known rate shows "no forecast yet" and is not charted. The forecast is never marked complete.
- Drawn with react-native-svg (already installed); no new library.

## Open questions (recommended default first)
1. **Move to which tabs:** Plan, Hourly, Decks (default), or also Ask?
2. **Field record contents:** the five items above (default), or different ones?
3. **Chart axis:** ETA clock time on the line chart (default), or hours-remaining?

## Tests (written first)
- Layout preference: default order; hide, show, move, move to a tab; the hero and discrepancies strip refuse to hide; reset; a missing or corrupt saved layout falls back to the default (never a blank screen).
- Field record: values for the Glovis Condor 101 replay and screens 01-03 unmoved; unknown shown as unknown; H/H never included.
- ETA history on a real day of hourly counts (Glovis Condor 101 scenario): one point per hour, each equal to a direct projection of the log up to that hour; Day 2 roll-over; an hour with no rate; plus/minus text never says "because".
- Replay stays linear (`replayScaling.test.ts`); the history cost is guarded by counting projections, not time.

## Boundaries
- Never: hide the vessel balance or a warning, store forecasts as events, mark a forecast complete, combine H/H with autos, or state a cause for an ETA change.
