# Spec: van list (Plan tab)

## Objective
A list of the ship's TICO shuttle vans, which longshoremen check out, kept per vessel in Plan. Success: Colby can see every van on the ship, who has it, when it went out and came back, and exactly how a van number or driver changed (e.g. "Van 211 switched for 216") with his note on why.

## Creating the list
- Plan › Vans starts with one question: **How many vans?** A drop-down of **1 to 30** (a scrolling list, 56 pt rows, like the destination picker). Choosing a number creates that many empty rows, "Van slot 1" to "Van slot N", in one save; nothing else is asked first.
- A slot with no van number yet shows **Not assigned**; Colby fills in the van number and driver as vans are checked out. The header reads "6 of 14 vans assigned".
- The count can be raised any time (adds empty slots at the end). It can be lowered only by removing empty, never-used slots from the end; a slot with any data is removed one at a time with a reason, and stays in the log.
- A photo read fills slots in order from the top, after Colby confirms each row.

## Each row (one slot on the TICO check in/out sheet)
- **Van #** (blank until assigned; once entered, unique among current rows on this vessel), **Driver name** (the longshoreman, optional), **Lasher van** label (yes/no, default no), **Checked out** and **Checked in** times (typed or **Now**, never filled silently; blank = "time not provided"), **Gas** (Full, ¾, ½, ¼, Empty, or blank = not recorded), **Remarks**.
- Status shown: Not assigned, Not out yet, Out, Back. Header counts: vans on the list, assigned, out, back, and out with no check-in (unknown stays unknown, never 0). Lasher vans are tagged and counted separately.

## Changes and history
- The van number and the driver name can each be changed at any time. Each change saves a history entry: what it was, what it is now, when it was changed, and an **optional note** for Colby to say why. The note is never required.
- The row shows its history, newest first, in plain words: "Van 211 → 216 · 10:42 · note: 211 would not start", "Driver Sonja Hill → Reggie Tyson · 11:05". Number history and driver history are separate lines. Lasher, gas, times and remarks changes are kept in the log the same way, shown on tap.
- The first time a number is entered into an empty slot it is an assignment, not a change (no history line). A number that was swapped out is free again; history keeps it. A number already on another current row is refused naming that row.
- A check-in earlier than the check-out is refused with both times. Removing a van needs a reason; removed rows stay in the log, greyed.
- Corrections supersede, never add; nothing is deleted (event ledger, like notes and evidence).

## Reading the sheet from a photo (same text reader as setup)
- Plan › Vans › **Read van sheet from a photo**: proposes van numbers and names; Colby checks and edits every row before saving. A name or number it cannot read stays blank, never guessed. Photos are not kept. Handwriting and crossed-out lines are unreliable, so nothing saves without confirming.

## Rules
- Separate ledger: vans never combine with autos, High & Heavy, load-back or lashing, and change no count, ledger or forecast.
- Driver names stay on the phone and are in the backup export; Ask my AI never includes them.
- Never: invent a van, name or time; mix TEST into a live vessel; hide a change.

## Tech
- New events `van.added` (one per slot, blank fields allowed, saved as one batch), `van.corrected`, `van.removed` (same pattern as `note.*`): payload carries number, driver, lasher, out, in, gas, remarks, plus the optional change note. Replay must accept every earlier log (new types only). Projection in `src/engine/index.ts` (`State.vans` with history), view model `vanView` in `src/app/view.ts`, builders in `src/app/entries.ts`, UI in `src/app/screens/Vans.tsx` (card in Plan below Notes, one sheet at a time). Backup export covers the new events automatically.

## Testing
Unique number among current rows and freed after a swap; check-in before check-out refused; history lists every change in order with notes; driver and number histories separate; lasher count; TEST isolation; correction supersedes; removed stays in log; old logs still replay; photo parse never invents values. Phone: add, swap number, swap driver with and without a note, airplane mode, large text.

## Later (not in this phase)
A printable van check in/out PDF matching the TICO sheet.
