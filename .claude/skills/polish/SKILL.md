---
name: polish
description: Final quality pass on a VSA feature or screen before it goes to Colby's phone. Checks the whole path (data honesty, every state, field-UI rules, wording, code), fixes what it finds in one batch, then verifies. Use when Colby says "polish", before a build for a phone check, or when a screen feels wordy, inconsistent or unfinished.
---

# Polish (VSA)

Adapted from the `polish` workflow in pbakaus/impeccable (Apache 2.0), rewritten for this app. It applies the rules in CLAUDE.md and the other repository skills; it never overrides them.

**One bounded pass.** Look at the whole path once, fix everything found in one batch, confirm with at most one more round, then stop. No endless tweaking, no new features. Fix the cause at the narrowest correct level.

## 1. Know the system (read before judging)
- `src/app/theme.ts` tokens (colors, `TAP`, fonts), `src/app/screens/ui.tsx` shared pieces (Card, Seg, Go, Sheet, FlipTile, BannerView…), and the `vsa-field-ui` skill.
- Classify each drift: **missing token** (add to theme), **one-off** (use the shared component), **mismatch** (a flow or wording that differs from comparable screens), **local defect** (incomplete or wrong here).

## 2. Gather evidence
- The path as Colby uses it on an iPhone, outdoors, gloves, large text, often offline. Real content lengths (long names, 30 vans, big counts), TEST and LIVE vessels, a Day 2.
- Known unfinished work, and what Colby said last (his words beat inference).

## 3. Triage (fix in this order)
1. **Data honesty and loss:** unknown shown as 0, a number that differs from its screen, a save that can lose or overwrite data, a log that could fail to replay, TEST mixed into LIVE.
2. **Missing states:** empty, loading, error with exact reason and a way out, success message, disabled, offline, permission refused.
3. **Flow and wording:** the primary action obvious; the same word for the same thing everywhere; text shortened (explanations move behind a tap, not on the main screen).
4. **Visual consistency:** colors only from the theme with 7:1 contrast, 56 pt taps with 8-12 pt gaps, no mid-word breaks, one modal at a time, FORECAST/CALCULATED tags, TEST chip.
5. **Cleanup:** debug output, dead code, duplicated helpers, comments that explain why.

## 4. Polish the whole path
Walk every step of the feature end to end, not just the screen that was changed: entry, edit, correction with history, removal, the Ask answer and reminder that mention it, the backup export, the report. Fix what the triage found.

## 5. Verify and finish
- `npm test`, `npx tsc --noEmit`, `npm run check:ios`, and `npx -y npm@10.9.8 ci --include=dev --dry-run` (EAS uses npm 10).
- An independent `agent-skills:code-reviewer` pass on the diff; fix REQUIRED items only.
- Report in a few lines: what was fixed, what was left and why, what Colby should look at on the phone.
- Do not start a build, push or publish unless Colby asked.
