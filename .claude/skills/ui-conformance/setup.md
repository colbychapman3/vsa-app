# One-time setup (read only when `tools/render/manifest.json` is missing)

## Phase gate: one message to Colby, then build without asking

Check what's still true, then ask once, with a default for each item:
1. **No web target.** Default: add `react-native-web`, `react-dom` and `@expo/metro-runtime` as dev deps, add `"web": "expo start --web"`, and give native-only modules (`modules/vsa-text`, `modules/vsa-intents`, `@react-native-ai/apple`, the document picker) a `.web.ts` stub that reports "not available". Keep `expo-sqlite` if its web build works; otherwise use an in-memory store behind the same `store` API (STORAGE-BOUNDARY still holds). It must still pass `npm run verify:release`.
2. **Boards render without `support.js`** (checked 2026-10-17): replace `{{mode}}` with `''`, `'night'` or `'xv'`, drop the `support.js` script tag, and open the file. Fonts load from Google, so the one-time board render needs the network. Boards are 393 px wide and full scroll height (Decks is 1789 px), so render boards and the app at **393 px wide, full page**, not 402×874. The sample vessel is Hera Highway 13A, 1,352 autos, Berth 2 (made up); a copy of the artifact is in `C:Userscolbysa-mockups-archive-2026-10-14`.
3. **Web is not iOS.** Pass means a reviewer's verdict, not a pixel score. Optional final check on real iOS: the EAS cloud simulator (`mcp__plugin_expo_expo__simulator_*`) is billed, needs a development build, and takes screenshots at 0.3 scale, so use it only to spot-check fonts and safe areas on 3 or 4 boards, never in the loop.
4. **Cost.** Default: a pilot on 3 boards (one Snapshot, one sheet, Night), report the tokens per board, then at most 3 rounds over the rest.

## Harness (`tools/render/`, the render harness ROADMAP deferred to Phase B)

Node scripts with `playwright-core` with the installed Edge (`channel: "msedge"`; never run `playwright install`), plus `pixelmatch` and `pngjs` as dev deps. Gitignore `shots/`, `diff/`, `boards/`, `boards-src/`.

- Every capture: viewport 393 wide, full-page screenshots, deviceScaleFactor 1, `reducedMotion: "reduce"`, CSS that turns off animations, transitions and the caret, `page.clock` fixed per state, then `document.fonts.ready`.
- `render-boards.mjs`: renders each board once to `boards/<id>.png`. Open one board first and look at it: crop to the phone frame by selector if a board holds notes or several phones. Light, Night (`903`) and sun are separate ids.
- `states.mjs`: one entry per board: `{screen, tab, sheet, theme, clock, fixture}`. Reach it through a dev-only `?state=<id>` hook (the app has no router); `npm run check:ios` output must not contain it.
- **Fixtures reproduce the board's numbers.** Build each fixture as an event log that, replayed through `store.append` (as backup import does), shows the board's own counts, times and brands. Then copy and digits are real checks, not noise. When no valid log can produce a board's numbers (field above starting cargo, H.A. that doesn't divide), that's a DESIGN QUESTION: the board shows impossible data. Never a LIVE vessel, never preloaded defaults.
- `capture.mjs <id|all>` → `shots/<id>.png`. `diff.mjs <id|all>`: pixelmatch threshold 0.1 → `diff/<id>.png` = `[board | app | overlay]`, at most 1200 px wide, printing one JSON line per id: `{"id","mismatchPct","regions":[[x,y,w,h] ... up to 6]}`. `zoom.mjs <id> x y w h`: board and app crops side by side.
- `hash.mjs`: per screen, a hash of its own files plus the shared ones (theme/tokens, shared components, `App.tsx`).
- **Noise check:** capture every state twice and diff app against app. Anything above 0 means the harness isn't deterministic (clock, fonts, random ids): fix it before the loop starts. Record each state's noise floor in the manifest.
- `manifest.json`: `{boards:[{id, screen, state, status: todo|pass|fail|design-q, mismatchPct, passBaselinePct, noisePct, round, srcHash, open:[]}], screens:{<screen>:{files:[], boards:[]}}, designQ:[]}`. Build `files[]` once by tracing imports from each screen in `src/app/screens/`.
- Dev server: `preview_start` with a `.claude/launch.json` entry. The shell is PowerShell: trim output with `| Select-Object -Last 20`.
- Copy `agents/screen-reviewer.md` and `agents/screen-fixer.md` from this skill into `.claude/agents/` if they're missing.
- Check the harness on one board and look at its composite yourself before the pilot.
