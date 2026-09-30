# Capability Map: Phase 6 (assistant, map, photo evidence)

Status: APPROVED 2026-09-30 with Colby's answers below (map and build order as proposed). Project rule: specs live in `docs/specs/`, one per module id: `phase-6-<id>.md`.

Principle: every module works with AI off. AI (Apple on-device model, on-device text recognition) only proposes; Colby confirms; the rules engine does all math.

| Module id | Responsibility | Depends on |
|---|---|---|
| terminal-map | Own screen: the Terminal & Yard Map (newest artifact version, offline, satellite image bundled); zone/site/yard highlight, cutoff chips, measure tool. Zone data from the terminal directory. | terminal directory (exists) |
| plan-notes | New Plan-tab Notes section: ship-specific notes (typed; photo attach later). Events, corrections keep history. | event ledger (exists) |
| evidence | Log › Photo: camera capture, type (pre-stow / poor stowage / accident / pre-stow damage), required deck, hatch, time, reason; VIN(s) required only for accident, optional otherwise; notes. Attaches to the Decks tab location and adds a note on that hour's count. Photos stored on the phone. | event ledger, decks |
| evidence-reports | Accident, poor-stowage and stowage reports (PDF). A report button shows only if photos of that type exist. | evidence, report.ts (exists) |
| knowledge | Offline knowledge pack built from the Brain (SOP Ver. 2024, protocol, glossary, operations reference, terminal map PDF): chunked, searchable, every answer cited, "not found" when absent. Plain keyword search screen first. | none |
| ai-runtime | Availability check for Apple's on-device model, one wrapper, graceful fallback (search box / quick entry). Native module: new dev build. | none |
| scan | On-device text recognition: VIN (17 chars, no I/O/Q, check digit = warning only, never auto-corrected) and document photos to candidate values. Every value confirmed. | ai-runtime |
| setup-import | New vessel: Manual or Upload photos (prefills), Next through every step to check; last step uploads important notes into plan-notes. | scan, plan-notes, Setup (exists) |
| assistant | Floating head on every screen. Reads via engine tools (remaining, hourly, deck), answers from knowledge with citations, berth-to-zone distances by lookup (never one-way/round-trip assumed). Then actions with a confirm card (log count, new vessel) and local-notification reminders for Plan items. | knowledge, ai-runtime, terminal-map, evidence, setup-import |

Build order (each stage phone-checked, one approval per stage):
1. **6a:** terminal-map, plan-notes, knowledge (search only). No native AI needed.
2. **6b:** evidence, evidence-reports (camera; VIN typed).
3. **6c:** ai-runtime, scan (VIN scan), setup-import.
4. **6d:** assistant (read-only, then actions and reminders).

## Assumptions (correct me now or I proceed)
1. Photos never leave the phone; PDF reports embed them only when Colby shares.
2. The map uses the newest artifact (2026-09-28); its layout is copied, its edit mode is not.
3. The knowledge pack is a build-time export from the Brain; update by re-export. History/session notes are excluded.
4. Which Expo package exposes Apple's on-device model is unverified; 6c starts with a short feasibility check. If none is viable, the assistant ships as search plus structured quick actions.
5. Protocol/data-rule change: CLAUDE.md "AI never does math or decides facts" stays; the assistant may only read engine results and propose confirmed actions.

## Decisions (Colby, 2026-09-30)
1. Photos are kept **full size**. Stored as files in the app's document folder (not database blobs); the event holds the file path. PDF reports embed a reduced copy so shared files stay small.
2. Notes photos: the **extracted text is what matters**; the image is optional (Colby may discard it after confirming the text). Text is always confirmed before saving.
3. Plan-item reminders every **25 minutes** while any item is unresolved; none once resolved.
