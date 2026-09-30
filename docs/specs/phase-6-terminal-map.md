# Spec: terminal-map (Phase 6a)

## Objective
A Map screen that puts the Terminal & Yard Map (newest artifact, updated 2026-09-28) in the app, offline, for Colby on the terminal. Replaces opening the artifact on the phone. Success: pan/zoom, tap a zone/site/yard for its card, highlight chips, measure tool, all with no signal.

## Scope
- In: the Map screen, bundled satellite image, zone/site/yard/berth/road/rail geometry and labels, highlight chips (Zones, Sites, Yards, BMW/MBZ, Northside 15 min, Southside 30 min), detail card per feature, measure tool (distance between tapped points).
- Out: the artifact's edit mode and export box. Geometry changes are made by editing the artifact, then re-running the export.
- Zone sides, cutoffs and berth miles come from `src/engine/terminal.ts` (Appendix C/D), not retyped. A map card for a zone shows the directory's side and cutoff. If the map and the directory disagree, show the directory value and flag it in tests.
- Distances (protocol §7.4): lot outlines are approximate, so the measure tool is a **rough map estimate only** (labeled "map estimate, not a route distance") and never feeds any calculation or ETA. Route distances come only from the Appendix D directory mileage, never called one-way or round trip unless the source says so.

## Tech stack / structure
- `react-native-svg` (installed) over the image; gestures via the existing RN gesture stack.
- `src/app/map/data.ts` (exported geometry, generated, no logic), `src/app/map/model.ts` (pure: features, filters, measure math), `src/app/screens/MapScreen.tsx`.
- Extract script: `scripts/export-map.mjs` reads `docs/reference/terminal-map.html` (Colby's 2026-09-30 download; same base `2026-09-27-b3` as the published page, edits still not baked in) **and applies the artifact's saved edits** (`map/edits` in its database, base `2026-09-27-b3`: corrected polygons and labels for yard-1, yard-2 and mbz, saved 2026-09-30, version 20). The published HTML alone is not the newest map. It writes `data.ts` and `assets/terminal-map.jpg`. `react-native-svg` 15.15.4 is already installed (no new dependency).

## Commands
- Test: `node --test --experimental-strip-types --no-warnings=ExperimentalWarning tests/map.test.ts`
- Typecheck: `npx tsc --noEmit`
- Device: `npx eas build --platform ios --profile preview`

## Code style
Pure model in TS with no UI imports, as in `src/engine`; screens follow the `vsa-field-ui` skill (44+ pt targets, sun contrast, no mid-word wrapping, one modal at a time).

## Testing
Model tests: measure output is always labeled an estimate; every directory zone appears on the map with a matching side and cutoff; filter chips return the expected feature sets; measure math (pixel distance to metres via the map's scale) against known pairs; a feature with no directory entry is listed, not dropped. Device check: airplane mode, pinch/pan smooth, cards readable in sun.

## Boundaries
- Always: work offline; show unknown as unknown; cite the directory for cutoffs.
- Ask first: adding a native dependency (gesture/reanimated not yet checked); changing directory data.
- Never: invent a distance or cutoff; reproduce the artifact's edit tooling in the field app.

## Success criteria
1. Map opens from the header in under 2 s on the 16 Pro, offline.
2. Every directory zone is tappable and its card shows side, cutoff, and miles by berth when known.
3. Chips match the artifact's highlights.
4. Measure shows a rough distance labeled "map estimate, not a route distance"; Appendix D mileage shows separately on each zone card.
5. All tests pass.

## Open questions
- Where does the Map entry live (new tab vs. button)? Default: a **Map** button in the header next to Vessels, since the tab bar is full.
