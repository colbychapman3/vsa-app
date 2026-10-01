# Spec: scan (Phase 6c)

## Objective
Read VINs with the camera instead of typing them, and read document photos into plain text for setup-import and Plan Notes. Success: a VIN plate or label photographed in sun gives the right 17 characters, or an honest "no VIN found"; nothing goes in without Colby's confirm.

## Flow
- **VIN:** the evidence VIN field gets a **Scan** button. Photo → on-device text recognition (no AI needed) → every 17-character run that passes `checkVin` (existing, `src/engine/evidence.ts`) is listed; Colby taps the right one(s). Check-digit failures show the existing warning. Zero candidates = "No VIN found. Type it or rescan." Typing stays available.
- **Document:** photo(s) → recognized text, shown as text Colby can read and edit. Used by setup-import and Plan Notes ("From photo"). The image is optional to keep (decision 2): default **discard** after the text is confirmed.

## Rules
- Candidate extraction is a pure function (`src/engine/scan.ts`): split on whitespace/punctuation, uppercase, keep 17-char runs; I/O/Q runs are listed as "unreadable, check" (never swapped to 1/0). No auto-correction, no guess.
- OCR works with AI off. Fully offline.
- A scanned VIN is saved exactly like a typed one (same event, same validation).

## Testing
`scan.ts`: VIN found in noisy text; two VINs both listed; 16/18-char runs ignored; I/O/Q run flagged not corrected; duplicates collapsed; empty text = none. Phone: VIN label in sun, windshield VIN through glass, gloves, airplane mode.

## Boundaries
- Never: correct a character, pick a VIN for Colby, or keep a document photo unless asked.
