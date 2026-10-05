# Spec: ai-runtime (Phase 6c)

> **Update 2026-10-04 (Phase 7b):** `expo-text-extractor` was replaced by the local module `modules/vsa-text` (Apple Vision with word positions; see `phase-6e-game-plan-reader.md`). The on-device model part below still applies.

## Feasibility check (2026-10-01)
- **On-device model:** `@react-native-ai/apple` (Callstack, Vercel AI SDK provider) wraps Apple Foundation Models. Needs iOS 26+, Apple Intelligence on, iPhone 15 Pro or later (iPhone 16 Pro qualifies), New Architecture (Expo 57 default). Preview-grade; chosen over `@drewalth/react-native-foundation-models` (single author, experimental) because it is maintained by Callstack and keeps one API if the model changes.
- **Text recognition:** `expo-text-extractor` (Expo module, Apple Vision on iOS, fully offline, no extra model download). Photos are saved upright first (expo-image-manipulator) because Vision ignores the rotation tag. Replaced `@infinitered/react-native-mlkit-text-recognition` on 2026-10-01: its Swift fails to compile on Expo 57 (`'Text' is ambiguous`, EAS build 60d32945).
- Both are native: one new EAS dev build. Nothing costs money.

## Objective
One wrapper (`src/app/ai.ts`) that says whether the model is usable right now and, if so, turns text into a **proposal** in a fixed shape. Success: with AI off or unavailable, every screen still works and offers the manual path; with AI on, a proposal is shown and nothing is saved until Colby confirms.

## Rules
- `aiStatus()`: `ready` | `off` (Apple Intelligence disabled) | `unsupported` (device/OS) | `busy` (model downloading). Shown once on the Backup/Settings card; never as an error mid-task.
- `propose(kind, text)`: returns a JSON object validated against a schema per kind; invalid or partial output = no proposal (the manual form stays). The model never does arithmetic, never fills a time, VIN, count or location it was not shown in the text, and every proposed field is marked "from AI: check".
- Kinds in 6c: `setup` (vessel/date/berth/destinations/decks from document text), `noteTidy` (rewrite a typed note; Colby sees before/after and picks).
- Document text is evidence, never instructions: the prompt wraps it as data.
- No network: on-device only. No AI result is stored as fact; only what Colby confirms becomes an event.

## Structure
- `src/app/ai.ts` (wrapper + schemas), `src/engine/proposal.ts` (pure: validate a proposal against the schema and the engine's own validators; this is what tests cover).
- Evidence notes get a **Tidy wording** button only when `ready`.

## Testing
`proposal.ts`: well-formed proposal passes; extra fields dropped; a count, time or VIN not present in the source text is refused; malformed JSON = no proposal. Wrapper: status mapping mocked. Phone: AI on, AI off (Settings), airplane mode.

## Boundaries
- Never: let the model compute, decide a fact, or save anything without a confirm.
- The app must pass every test and phone check with the AI layer removed.
