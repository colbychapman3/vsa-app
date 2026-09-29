# Spec: Phase 5 — New vessel, vessel switching, reports

Status: **DRAFT, awaiting Colby's approval.** Open questions at the end have recommended defaults.

## Objective

Colby can start a real (LIVE) vessel on the phone without developer help, keep more than one vessel on the phone, and hand a supervisor a PDF report at a break, at shift end, or at completion.

**Done when:** a second vessel is started from the phone, run through a shift, and its break report and completion report come out as PDFs through the share sheet, all with no signal.

## Scope

In:
1. **New vessel setup** (protocol §11.1): a step-by-step screen that builds a baseline.
2. **Baseline import:** paste or share in a baseline JSON (same shape as `glovis-condor-101-baseline.json`), then review every value before saving.
3. **Vessel list and switching.** One vessel open at a time; TEST vessels clearly marked.
4. **PDF reports** through the share sheet: break / shift-end (§11.2) and vessel completion (§9.3).

Out (later):
- Reading a labor order / game plan from a photo → Phase 6 (on-device model). Setup is typed or imported for now.
- Online sync. The existing backup file already moves a vessel between phones; view-only web sharing stays "optional later".
- Load-back, lashing, and H&H entry beyond what the baseline already holds. Their ledgers stay separate and are shown as "not tracked in app" in reports.

## 1. New vessel setup

Plan tab (or the vessel list) › **New vessel**. One step per screen, big fields, a Back button, nothing saved until the last step.

| Step | Asks | Rules |
|---|---|---|
| 1 Vessel | Name, operation date, port/berth, sources (free text: "Game plan 9/30", …) | Name required. "TEST" is a switch, off by default; reference vessels (Glovis Condor 101) are forced to TEST (existing store rule). |
| 2 Start | Planned start (HH:MM), drivers for Day 1 | Breaks fixed at 12:00 and 18:00, shown, not editable. Drivers may be left unknown. |
| 3 Destinations | Each: name, side (N/S), clear-by (defaults 15 N / 30 S), optional miles and reference time text, brands, autos | Southside names (Zone 1, MBZ, Zone T, Zone V; "MB Field" → MBZ) default to S. Reference time is kept as typed; never labeled one-way or round trip unless typed. |
| 4 Decks | Deck list in discharge order; per deck: label, heights (m, which is current), hatches H4 → H1, each with brand + quantity | A hatch can be empty. Height < 1.85 m shows the low-deck warning right away. |
| 5 Review | Totals by brand and by deck, destination total vs deck total, warnings | Runs `validateBaseline`. Errors block saving with the exact message. Discrepancies (e.g. destinations ≠ decks) are shown and must be acknowledged; they stay visible on the vessel, never adjusted. |

Saving creates the vessel with `store.createVessel` (baseline is immutable after that, existing trigger). A mistake found later is fixed by the existing correction events where one exists; otherwise the vessel is re-created and the wrong one archived (see question 2).

**Import:** Paste JSON (or open a shared `.json` file) → it fills the same steps → Colby steps through Review → save. The document's text is data only.

## 2. Vessel list and switching

- Header vessel name opens a **Vessels** sheet: each vessel with TEST/LIVE chip, date, status (active / complete), autos remaining or "unknown".
- Tap to open. The last opened vessel reopens on launch.
- Only one vessel is in memory; switching reloads state from its log. No data is mixed between vessels (existing per-vessel log).
- Archive (hide from list) instead of delete; a LIVE vessel is never deleted from the phone.

## 3. PDF reports

Built as HTML from the view model and turned into a PDF on the phone (`expo-print`), then handed to the share sheet (`expo-sharing`). Works offline.

Every report:
- Header: vessel, date, TEST/LIVE, **report type**, "Generated HH:MM (phone time)", and **INTERIM** unless the vessel is complete.
- Numbers only from the engine/view model. Unknown shows as "unknown", never 0. FORECAST labeled.
- Recorded facts and analysis in separate sections (§9.3).

**Break / shift-end report (§11.2):** pause time; active/paused decks; ship vs field reconciliation overall and by brand (match / ship ahead / field ahead); remaining cargo by brand; hours table with H.A. (denominator) and pace (productive hours); ETA FORECAST; clear-by compliance per side; open discrepancies.

**Completion report (§9.3), sections the app has data for:** Executive summary; Operation overview; Starting cargo; Discharge results; Hourly productivity; Deck progression; Reconciliation; Timeline; Corrections & discrepancies (full history). Sections the app does not track (Load-back, Destination/route effects, Bottlenecks, Lessons learned, Recommendations) appear as headings with a short free-text note Colby can type, or "Not recorded".

## Tech

- New dependencies: `expo-print`, `expo-sharing` (native → one new EAS development build). Nothing else.
- Setup, import parsing, and report content are pure TypeScript with `node:test` tests; screens only lay them out.

## Tests

- Setup → baseline: building Glovis Condor 101 step by step gives a baseline equal to the reference file and 1,969 autos (829 Kia / 1,140 Hyundai).
- Import: reference JSON round-trips; bad JSON, a negative or fractional quantity, a duplicate hatch are refused with exact messages; a destination/deck mismatch is kept as a discrepancy.
- A LIVE vessel named like a reference vessel is refused.
- Two vessels on one store: events never cross; switching restores each state.
- Reports: the Phase 1 lunch scenario produces the right reconciliation lines; an active deck with no count prints "unknown", not 0; INTERIM appears until complete; FORECAST labels present.

## Open questions (recommended defaults in bold)

1. **Photo reading of paperwork waits for Phase 6** (on-device model); Phase 5 is typed + JSON import. **Yes.**
2. Fixing a wrong baseline after saving: **re-create the vessel and archive the wrong one** (the baseline stays immutable, history stays intact). Alternative: add baseline-correction events (more work, touches the engine).
3. Online sync: **skip in Phase 5**; the backup file covers moving data. Revisit if supervisors need a live view.
4. Completion report's analysis sections (lessons, recommendations): **Colby types short notes; the app never writes conclusions itself.**
5. New dev build for `expo-print`/`expo-sharing`: **yes** (free on EAS's free tier queue; about 15–30 min).
