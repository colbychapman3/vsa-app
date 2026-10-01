# Spec: assistant (Phase 6d)

## Objective
A round **Ask** button on every main screen. Colby types (or taps a quick question) and gets an answer that comes only from the engine, the terminal directory or the knowledge pack, each with its source shown. It can propose a few actions on a confirm card, and it reminds him every 25 minutes while a Plan alert is unresolved. Success: every answer can be traced to a screen value or a cited passage; with AI off everything still works through quick questions and keyword matching.

## The head
- Round 56 pt button, bottom-left (the Log button is bottom-right), same height. Hidden while any sheet is open (one modal at a time); tapping it opens the **Ask** sheet.
- Quick questions (taps): **Vessel remaining**, **This hour / pace**, **ETA**, **Decks left**, **Open alerts**, **Distance to a zone**.

## Answers (read-only)
1. **Route the question to one fixed intent.** Keyword rules first (pure, tested): remaining, hourly/H.A./pace, ETA/finish, deck `<label>`, distance/miles to `<zone>`, clear-by/cutoff, alerts. If no rule matches and AI is `ready`, the model may only pick an intent and its parameters from the same fixed list (schema; a deck or zone it names must exist). It never writes the answer.
2. **Fill the answer from the engine/view model** (`snapshot`, `hourlyView`, `decksView`, `planView`, `terminalInfo`): the same numbers and labels as the screens. FORECAST and CALCULATED tags carried over; unknown shown as unknown with its reason; H.A. and pace both shown with denominators.
3. **Distance:** "Zone 3: 1.00 mi from Berth 2 (measured; one-way or round trip not stated)". No travel time is invented.
4. **Anything else → knowledge search.** Up to 3 passages shown as written, each with its citation ("SOP Ver. 2024 Ch. 6 …"). None → "Not found in the loaded documents." AI does not reword or summarize passages in 6d.
5. Each answer has a **Show me** link to the screen it came from (closes the sheet, opens that tab).

## Actions (confirm card)
Only three, each prefilled and saved through the existing builders (`entries.ts` via `App.save`), so every existing check applies:
- **Hourly count** ("log 140 at 10:00"): opens the Log sheet's hourly form prefilled; Colby taps Save there.
- **Plan note** ("note: Zone 3 closes at 14:00"): confirm card shows the text; Add saves a typed note.
- **New vessel**: opens Vessels › New.
A number, time or deck is prefilled only if it was in what Colby typed; never filled silently.

## Reminders (25 min)
- Plan alerts = deck heights waiting for confirmation (soft warnings) + open discrepancies (`planView`).
- While any is unresolved on the open vessel: a local notification every 25 minutes ("2 Plan alerts open: Deck 9 height, Kia count"). Resolving the last one cancels it. Opening the app or tapping the notification goes to Plan.
- Off during the 12:00 and 18:00 breaks and after shift end; resumes when work resumes. TEST vessels say TEST in the notification.
- Local only (no server, no account). Needs the notification permission; if refused, the Plan tab shows the alerts as today and the Ask sheet says reminders are off.

## Structure
- `src/app/assistant.ts` (pure: intent rules, answer building from view-model output, action parsing), tests in `tests/assistant.test.ts`.
- `src/app/screens/Ask.tsx` (sheet), head button in `Chrome.tsx`, reminder scheduling in `src/app/reminders.ts` (thin wrapper; the "what to remind" text is pure and tested).
- New native dependency: `expo-notifications` (local notifications). One new build.

## Testing
Intents: each keyword family routes correctly; unknown → knowledge; deck/zone not on the vessel → "not on this vessel". Answers equal the view-model values for the Glovis Condor 101 TEST fixture scenarios (remaining, H.A./pace denominators, ETA labeled FORECAST, unknown when a deck has no count). Distance never adds a trip direction. Actions: number/time only from the typed text; hourly action goes through the existing hourly builder (overage refused with the exact amount). Reminders: text lists open alerts; none → nothing scheduled; break/shift-end → paused.

## Boundaries
- Never: AI writes numbers, decides facts, or saves; assume one-way or round trip; mix TEST into LIVE.
- The app passes every test and phone check with AI off.

## Defaults (Colby: correct any, or approve as is)
1. Reminders are **phone notifications** (they reach you with the app closed or the phone locked). Needs `expo-notifications` and one permission prompt.
2. Reminders **pause during breaks and after shift end**.
3. The head sits **bottom-left**, opposite the Log button.
4. Actions in 6d are only the three above; more later on request.
