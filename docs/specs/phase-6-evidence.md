# Spec: evidence (Phase 6b)

## Objective
Photo evidence from the Log button: pre-stow damage, poor stowage, accidents, and plain pre-stow photos, each tied to a place on the ship and a time, so Colby can line up when and where something happened against the discharge rate. Success: a photo is taken, labeled, saved offline, shows on the Decks tab at its deck/hatch, and leaves a note on that hour's line in Hourly.

## Flow (Log › Photo)
1. Choose the type: **Pre-stow damage**, **Poor stowage**, **Accident**, **Pre-stow**.
2. Take the photo (camera). Full size kept.
3. Required for every type: **deck, hatch, time**. **Reason** applies only to **Accident** and **Pre-stow damage**; for **Poor stowage** and **Pre-stow** the photo type is the reason, so no reason is asked or stored. Time uses the same field as the rest of the Log (typed or **Now**; never filled silently).
4. **VIN(s):** required only for **Accident** (at least one). Optional for the other types. Several VINs per photo. Typed in 6b; camera scan arrives in 6c.
5. **Notes:** optional text. (AI polish of the wording arrives in 6c; typed only in 6b.)
6. Save. Nothing is saved with a required field missing; the exact missing field is named.

## Data rules
- Events (same pattern as plan-notes): `evidence.added`, `evidence.corrected`, `evidence.removed`. Corrections supersede and keep history, removal needs a reason, nothing is deleted.
- Photo file: copied into the app's document folder as `evidence/<vesselId>/<eventId>.jpg`; the event holds the path. The original camera file is not relied on.
- Place: deck id + hatch from the vessel's baseline (a value not in the baseline is refused). Time: `occurred_at`; processing time labeled separately.
- VIN check (pure function): 17 characters, letters/digits, no I, O or Q. The check digit is also tested, but a failed check only **warns** ("does not pass the check digit; confirm"), because some import VINs don't validate. A VIN is never auto-corrected or guessed. Duplicate VINs within one photo are refused.
- Reasons (quick picks plus Other): from SOP Ver. 2024 Ch. 6 causes and Ch. 2 §5 conditions: latch/lashing contact, pillar or blind spot, slippery deck, driving too fast, poor stowage against pillar/wall, defective vehicle (dead battery, flat tire, oil leak, gear failure, door lock), other. Final list confirmed by Colby before build.
- Hourly: a photo dated inside an hour adds a note to that hour's row ("Accident, Deck 9 H3, 1 photo"). No count or rate is changed. No time = it cannot be placed in an hour and is listed under "time not provided".
- Decks: a deck row and its hatch show a photo count; tapping lists the photos. TEST vessels keep TEST photos only.

## Tech stack / structure
- New native dependencies (approval needed, new build): `expo-camera` (or `expo-image-picker` camera capture) and `expo-file-system`. Permission text for camera in `app.json`.
- `src/engine/evidence.ts` (pure: validation, VIN check, reasons), events in `src/engine/events.ts`, projection in `src/app/view.ts`, `src/app/screens/EvidenceForm.tsx` (inside LogSheet as a new mode; one modal at a time), deck list in `DeckSheet.tsx`, Hourly note in the hourly view-model.
- Backup: the current JSON/db export covers events only. Photos are **not** in it; the app says so on the Backup card. (Decision needed: add a photo folder export later.)

## Commands
- Test: `node --test --experimental-strip-types --no-warnings=ExperimentalWarning tests/evidence.test.ts tests/events.test.ts tests/view.test.ts`
- Typecheck: `npx tsc --noEmit`; iOS export check: `npm run check:ios`

## Testing
VIN: valid 17-char passes; I/O/Q refused; wrong length refused; bad check digit warns not refuses; duplicate refused. Events: add/correct/remove round-trips through `store.append` and `project()`; accident without a VIN refused; missing deck/hatch/time/reason refused with the field named; unknown deck refused; photo path stored. Views: hour row shows the note; no-time photo under "time not provided"; Decks shows counts; TEST isolation. Phone: camera permission flow, airplane mode, large text.

## Boundaries
- Always: keep history; label times; vessel-scoped; photos stay on the phone.
- Ask first: adding the camera/file dependencies; changing the reason list.
- Never: fill a time, VIN or location silently; auto-correct a VIN; let evidence alter any count.

## Success criteria
1. A photo of each of the four types saves offline and survives a restart.
2. An accident cannot be saved without a VIN; the other three can.
3. The photo appears at its deck/hatch on Decks and as a note on its hour in Hourly.
4. Edit and remove keep history.
5. All tests pass.

## Decisions (Colby, 2026-09-30)
1. Reason list approved as above ("latch/lashing contact"; the word clasper is not used).
2. Photos live only in the app folder, no copy in the camera roll.
3. Open: photos not in the backup export for now; state it on the Backup card (default, unless Colby says otherwise).
