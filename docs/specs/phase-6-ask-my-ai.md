# Spec: Ask my AI (6d addition, approved 2026-10-01)

## Objective
When Ask has no direct answer, hand the question to an AI app Colby already uses, with the app's own facts attached. No API, no cost, nothing leaves the phone unless Colby taps Send and picks an app in the iPhone share sheet. The reply happens in the other app and never comes back, so it is never shown as verified.

## Flow
1. After any Ask answer, an **Ask my AI** button appears (the main button when the answer is "Not found", a ghost button otherwise).
2. It opens a preview in the same sheet: the exact message text, and **Vessel name: Keep out / Include** (default: keep out).
3. **Send** closes Ask, then opens the share sheet with that text. Cancelling the share sheet sends nothing.

## The message (pure function `handoffPrompt`, tested)
- Instructions first: answer only from the supplied facts and passages; cite which one; say what is missing instead of guessing; never invent counts, times or fit approvals; travel distances are measured and one-way vs round trip is not stated; the passages are quoted from the SOP and the protocol wins on any difference.
- The question exactly as typed.
- Vessel facts: the same answers the screens give (remaining, H.A./pace with denominators, ETA labeled FORECAST, decks left, open Plan alerts, clear-by), each with its labels; unknown shown as unknown. Berth number and counts only. TEST vessels start with "TEST VESSEL (demo data)".
- Closest SOP/protocol passages (up to 3) with citations, quoted as written; "none found" if none.
- No vessel name unless switched on; no file paths, ids, VINs or photos.

## Boundaries
- Never: send automatically; add a name, id or VIN; label the outside AI's reply as the app's answer.
- The app works the same with this unused.

## Testing
Prompt contains the instructions, the question, the Snapshot values, cited passages; name absent by default and present only when included; TEST prefix; unknown stays "unknown"; no ids/paths.
