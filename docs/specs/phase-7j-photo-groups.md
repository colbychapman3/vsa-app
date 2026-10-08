# Spec: Photos by deck and type (Phase 7j)

Status: **DRAFT**, Colby's answers of 2026-10-09 applied; waiting on approval of this write-up.

## Objective
Photos are found the way Colby thinks about them: **deck → photo type → incidents → photos**. The deck overview shows which photo types a deck holds and how many photos each has, not a bare "3 photos". Success: on the Decks tab the GAR row shows "Pre-stow damage · 12 photos" and "Pre-stow · 4 photos"; tapping the deck, then Pre-stow damage, shows every pre-stow damage incident on GAR with all its photos; photos can be added there with deck and type already filled in, and one or several photos can be removed or an incident moved, each with a reason.

## Decided (Colby, 2026-10-09)
1. **Unit under a type: one incident holds many photos** (one damaged car = one entry with its VIN, notes and photos). This is the record the app already has; a record keeps its first photo plus added ones.
2. **Hatch stays a detail on each incident**, not a level.
3. **Today's rules per type:** accident needs a VIN and a reason; pre-stow damage needs a reason; poor stowage and pre-stow need neither.
4. **Existing photos: start from scratch.** The log is append-only, so nothing is erased: Colby removes the current Glovis Countess 107 photo records on the phone (Remove, or the new select-and-remove), they stay in the log marked removed, and the screens start empty. No data migration and no code that deletes records.
5. **Fixing mistakes:** remove one or several photos from an incident; move an incident to another type or deck. Both with a reason; both keep history.
6. **Add photos inside a deck's type page** (deck and type filled in); Log › Photo stays for quick starts.
7. **Deck overview:** chips per type with photo counts ("Pre-stow damage · 12 photos"), each type its own color.
8. **Report:** grouped by type, then deck, every photo shown (as now).

## Screens (vsa-field-ui; one sheet at a time, content swaps inside it)
- **Decks tab row:** one chip per photo type present on that deck, with its photo count, in the type's color. Hatch chips lose their photo counts (the type chips carry them).
- **Deck sheet › Photos:** a row per type present (type name, photo count, incidents count) → tap → **type page**.
- **Type page:** "Add photos" (camera or camera roll, one or many; deck and type set), then each incident: hatch, time, reason, VINs, notes, and a grid of all its photos. Tap a photo: full size. "Select photos" turns on checkboxes on the grid; "Remove selected" asks a reason. "Edit" on an incident opens today's form, with **Move to** another deck or type.
- **Removing every photo of an incident** removes the incident (same as today's Remove).

## Data (vsa-event-ledger; no new event type)
- An incident stays one `evidence` record: `photo` (its first file, named for its first event) plus `more` (added files).
- **Remove some photos:** an `evidence.corrected` event whose `more` no longer lists them; if the first photo is removed, the next one becomes the incident's first photo. The engine allows the first photo to change only to one of the record's own earlier files (never a file from elsewhere). Removed files stay on the phone, as removed records' files do today.
- **Move:** an `evidence.corrected` event with the new deck/hatch/type (the type's own rules checked again).
- Old logs replay unchanged; replay-equivalence must not move.

## Tests (written first)
- Overview counts per type and deck (photos, not records); types absent from a deck don't show.
- Type page lists only that deck and type; removed incidents not listed.
- Remove one, several, and the first photo (the next becomes first); remove all = incident removed; reason required; history kept; a first photo from outside the record refused by the engine.
- Move to another deck or type: rules of the new type enforced (an accident without a VIN refused), reason required, history kept.
- Report unchanged for the existing cases.

## Boundaries
- Never: delete an event, erase a file a record still points at, change a count, or show a photo of a removed incident as current.
