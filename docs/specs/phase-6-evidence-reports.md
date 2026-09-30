# Spec: evidence-reports (Phase 6b)

## Objective
Four PDF reports built from labeled photos: an **accident report**, a **poor-stowage report**, a **pre-stow damage report**, and a **stowage report**. A report exists only when photos of its type exist. Success: Plan › Reports shows a button per report that has photos; none appear otherwise.

## Scope
- **Accident report:** one entry per accident photo: photo, time, deck, hatch, reason, VIN(s), notes; sorted by time; photos without a time listed last under "time not provided". The hourly count for that hour is shown beside it as **context only**, labeled "hourly count (no cause claimed)". Causation is never stated (protocol §6.3: "consistent with", never "caused by").
- **Poor-stowage report:** same layout, without the VIN requirement; VINs shown if entered.
- **Pre-stow damage report:** its own report (Colby's decision): pre-stow damage photos with time, deck, hatch, reason, VIN(s) if entered, notes.
- **Stowage report:** the plain **Pre-stow** photos only, grouped by deck then hatch.
- Every report carries the same header as the existing PDFs (vessel, date, berth, TEST mark, generated time as phone time, **INTERIM** until the vessel is complete) and lists removed photos as "removed" with their reasons.
- Built in `src/app/evidenceReport.ts` (pure content, like `report.ts`), rendered by the existing expo-print/expo-sharing path.

## Tech / structure
- Photos embedded at reduced size for the PDF only; the stored originals stay full size. If reducing needs a new dependency (`expo-image-manipulator`), it is an approval item; otherwise the image is scaled in the HTML.
- Button visibility comes from the view-model (`photoTypesPresent`), not the screen.

## Commands
- Test: `node --test --experimental-strip-types --no-warnings=ExperimentalWarning tests/evidenceReport.test.ts`
- Typecheck: `npx tsc --noEmit`

## Testing
No photos of a type = no report offered; accident report lists VINs and never states a cause; photos without a time are last; removed photos shown as removed; edited entries marked; TEST mark present; HTML escapes text; one photo of each type builds all four.

## Boundaries
- Always: separate from the break/completion reports; unknown stays unknown; INTERIM label until complete.
- Ask first: new dependencies for image scaling.
- Never: claim a cause; include a photo that has been removed as if current; mix TEST and LIVE.

## Success criteria
1. Buttons show only for types with photos (four reports).
2. Each report opens the share sheet offline.
3. The accident report includes the VIN(s), time, deck, hatch, reason and the hourly count beside it.
4. All tests pass.

## Decisions (Colby, 2026-09-30)
1. Pre-stow damage gets its own report.
2. Open: file size; photos are reduced inside the PDF only, originals stay full size (default).
