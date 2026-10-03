# Spec: sidebar (Phase 7)

## Objective
A left-side menu, like Claude desktop's: a **New vessel** button on top, the **list of vessels** under it, **Settings** at the bottom. It replaces the Vessels sheet's list as the way to switch vessels. Success: from any tab, one tap on the menu button shows every vessel; one tap opens it or starts a new one; no sheet is stacked on another.

## Behavior
- Opened by a menu button at the left of the header (56 pt hit area) and by tapping the vessel name (today that opens the Vessels sheet). Closed by the scrim, the close button, or choosing an item.
- Slides in from the left over the current screen, about 85% of the screen width, capped at 340 pt. With Reduce Motion on, it appears without animation.
- No edge-swipe: it conflicts with the iOS back gesture and is unreliable with gloves.
- **Not a `Modal`.** It is an overlay view in `App.tsx`. Choosing New vessel or Settings closes the drawer first, then opens the existing sheet (same swap pattern as `onNewVessel` today), so only one modal is ever open.
- Contents, top to bottom:
  1. **New vessel**: opens the existing Setup sheet (Manual / Upload photos / Paste baseline, unchanged).
  2. **Vessels**: LIVE vessels, the open one first and marked "Open now", the rest by date, newest first. TEST vessels sit under their own "Test vessels" heading and always show the TEST chip. Archived vessels are hidden. Each row: name (one line, shrinks), chip, date, and remaining/field if known, shown as unknown when not.
  3. **Settings** (pinned to the bottom, above the safe area).
- Tapping a vessel row opens it (existing `switchTo`, lands on Snapshot).

## Settings (v1: only what really exists)
A sheet with app-wide items, no invented options:
- **Appearance**: Light (default, the sun-readable hi-vis theme) / Night / Auto (follows the iPhone). Night is a dark palette for night shifts, with the same 7:1 text contrast rule. The choice is remembered on the phone.
- **Archived vessels**: the existing list with Archive / Unarchive, moved here from the old Vessels sheet unchanged.
- **On-device AI**: read-only status (ready / not available) and the line "The app works fully without it."
- **About**: app version and build number. (No "copy scan text" item: Setup already has "Show paperwork text", which is selectable.)
The plan step inventories any other app-wide setting that already exists (reminders) and lists it here read-only or with its existing control. Per-vessel items stay where they are (Plan: Backup, Reports, Labor, Break log).

## Appearance: how Night is built
- Today `color` in `theme.ts` is fixed values captured by `StyleSheet.create` in about 16 files, so a runtime swap would mean rewriting every screen's styles.
- Instead: each token becomes `DynamicColorIOS({ light, dark })` (iOS-first app) and the Appearance setting calls `Appearance.setColorScheme('light' | 'dark' | null)`. Screens keep reading `color.ink` etc. unchanged. `app.json` `userInterfaceStyle` changes from `"light"` to `"automatic"`, which is a native setting, so it ships in the next store build (it cannot be tried in a quick update).
- Risk to verify first (plan step 5a): `react-native-svg` (tab icons, deck/map shapes) may not accept `DynamicColorIOS`. Fallback: a small `useColors()` hook used only by SVG components. Status bar style follows the scheme.
- Night palette tokens live next to the light ones in `theme.ts`; `tests/theme.test.ts` checks every text-on-background pair meets 7:1 in both palettes (pure contrast math). Status colors keep their meaning (green match, orange warning, red field-ahead) in both.
- Light stays the default so the sun-readable look is never changed by accident.

## More settings (decided 2026-10-03)
- **Keep import photos after save**: a switch, off by default (6c decision: photos are discarded unless kept). This is new storage, not a toggle on something existing: today the photo reader works from the picker's temporary copy and the app never stores it. When on, the photos are copied into the app's own storage under that vessel (same place and cleanup rules as evidence photos) and listed in Plan as "Paperwork photos". Like evidence photos, they are not in the backup export (stated on screen). Built last in 7c; if listing them needs more than a simple list, the switch ships later rather than half-built.
- **Back up vessels**: pick which vessels to export, with a Select all option. Export today is the iOS share sheet with the log as text, and import is paste, so a combined file would be a huge paste. Instead the app walks through the selected vessels one at a time, one share sheet each ("Vessel 2 of 3", Skip / Stop at any time), using the existing export and its checksum. A vessel counts as backed up only if its share sheet was used, as today. Per-vessel export in Plan stays.
- **Plan reminders**: on/off and quiet hours (the existing 25-minute reminders from 6d).
- **No new-vessel defaults.** The app never preloads start time, drivers or berth. Setup values come only from the paperwork or from Colby typing them.
- **Later, not now:** keep screen on, haptic tick on save (each needs a new library).

## Rules
- Nothing is deleted; Archive only hides, as today.
- One vessel = one record; the list never merges or relabels vessels. TEST is never mixed into LIVE.
- Unknown is shown as unknown (`—` with reason), never 0.
- No new numbers or math in screen code: ordering and visibility come from a pure function.
- **A broken vessel never locks the app.** Today `App.tsx` opens the last vessel at startup and, if it cannot open, shows one error screen for the whole app. Instead: try the last vessel, then the others in list order; open the first that works and say which one failed; the drawer lists the broken one with its problem (the list rows already carry `problem`). Test: a vessel whose log fails to replay is skipped and the next opens.
- Appearance is applied at startup before the first screen shows, so a Night user never sees a light flash.
- The drawer is announced to VoiceOver as a modal region, focus moves into it on open and back to the menu button on close.

## Structure
- `src/app/view.ts` (existing view models): add pure `sidebarVessels(rows, currentId, showArchived)` → `{ live, test }` ordered and filtered. No new file.
- `src/app/screens/Sidebar.tsx` (new): drawer layout. `src/app/screens/Settings.tsx` (new): settings sheet.
- `Chrome.tsx` Header: menu button and vessel-name tap call `onMenu`; `onVessels` goes away.
- `Vessels.tsx`: list mode removed; it keeps New vessel (the Setup sheet). `List` moves into Settings → Archived vessels.
- `App.tsx`: `drawer` state; `sheet` gains `'settings'`; Ask's `onNewVessel` unchanged.

## Commands
```
Test:      npm test
Typecheck: npm run typecheck
iOS check: npm run check:ios
```

## Code style
Same as `Chrome.tsx` and `Vessels.tsx`: layout only, colors from `theme.ts`, fonts from `useType()`, no hard-coded hex, `Pressable` with pressed opacity, `TAP` minimum height, `accessibilityRole` and labels.

## Testing
`tests/theme.test.ts`: both palettes meet 7:1 for every text/background pair; status colors stay distinct. `tests/sidebar.test.ts`: open vessel first; LIVE ordered by date newest first (both `M/D/YYYY` and `YYYY-MM-DD`); TEST vessels only in `test`, never in `live`; archived hidden unless it is the open vessel; `showArchived` reveals them; a vessel with unknown remaining stays listed with `null`. UI checked by hand on the phone: normal and largest text size, with gloves, Reduce Motion on, TEST vessel present.

## Boundaries
- Always: one modal at a time; 56 pt taps; text that shrinks instead of breaking mid-word.
- Ask first: adding a dependency (gesture or drawer library); any new setting that changes behavior.
- Never: delete a vessel; stack two modals; show TEST under LIVE; invent a setting.

## Success criteria
1. Menu button on every tab opens the drawer; scrim and close button dismiss it.
2. New vessel and Settings each open their sheet with the drawer already closed.
3. Switching vessel lands on Snapshot for that vessel; the TEST chip shows for TEST vessels everywhere.
4. Archived vessels are reachable from Settings and restore correctly.
5. Tests, typecheck and `check:ios` pass; phone check at large text size.
