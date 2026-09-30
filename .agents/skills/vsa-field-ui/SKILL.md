---
name: vsa-field-ui
description: Rules for VSA screen code in src/app/screens and App.tsx — glove-size tap targets, sun-readable contrast, text that never breaks mid-word at large iOS text sizes, and one modal at a time. Use when adding or changing any screen, sheet, tile, label or button.
---

# VSA field UI

Colby uses the app on an iPhone 16 Pro, outdoors in Georgia sun, often with gloves and often with large iOS text sizes. Screens are layout only: every value comes from `src/app/view.ts`, every save from `src/app/entries.ts` through `App.save()`. No math in screen code.

## Taps (gloves)
- Anything tappable is at least `TAP` (56 pt, `src/app/theme.ts`) tall; icon-only buttons are 56 × 56.
- Leave at least 8–12 pt between neighbouring targets.
- Give pressed feedback (`opacity` ~0.6–0.7) on `Pressable`. Use `Pressable`, not `TouchableOpacity`.
- Prefer making a whole card or row pressable over a small link inside it.

## Sun and type
- Colors come only from `color` in `theme.ts` (the VSA Live tracker's light hi-vis theme). Don't add new hex values in screens; add a token to `theme.ts` if one is truly needed, and keep text contrast at 7:1 or better against its background.
- Fonts come from `useType()`: `display` (Barlow Condensed) for big numbers and headings, `body*` (IBM Plex Sans) for text. They can be `undefined` if fonts failed to load; the app must still work with system fonts.

## Text never breaks mid-word
Field feedback 2026-09-27: "COMPLETIO/N", "CALCULATE/D", "Brea/ks" at large text sizes. iOS splits a word when a single word is wider than its box, so:
- **Numbers** (`Big`): one line, shrink to fit (`numberOfLines={1} adjustsFontSizeToFit`). Already built into `Big`.
- **Short caps labels and tags** (`Label`, `Tag`): one line, shrink to fit. Already built into both. Keep label text short enough to read when shrunk.
- **Key–value rows** (`kv` pattern): the label gets a bounded width (`maxWidth: '45%'`), the value takes the rest (`flex: 1`), so neither can squeeze the other below one word.
- **Sentences** (`Body`, `Note`) may wrap, but only in a container that can grow in height; never put a sentence in a fixed-width box.
- Never set a fixed `width` on a text container that holds a word. Use `flex`, `flexShrink: 1`, or `maxWidth`.
- Check new layouts at the largest standard Dynamic Type size on the phone before calling a screen done.

## One modal at a time
- Every form uses the shared `Sheet` in `ui.tsx` (one React Native `Modal`, page sheet, 56 pt close button).
- Never open a second `Modal` while one is open (iOS freezes on stacked modals). To go deeper, swap the content inside the same sheet, as `LogSheet` does for the deck sheet (`‹ All decks`).
- Sheets are opened from the main screen only (Log button, deck rows, Plan actions).

## Honesty on screen
- Unknown is shown as unknown (`—` plus a reason), never as 0.
- Forecasts carry the `FORECAST` tag; calculated values the `CALCULATED` tag.
- TEST vessels always show the TEST chip, including inside sheets.

## Done means
`npm test`, `npm run typecheck`, `npm run check:ios` pass, and the screen was looked at on the phone (dev build) at normal and large text sizes.
