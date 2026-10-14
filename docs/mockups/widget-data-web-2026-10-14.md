# How the widgets connect (2026-10-14)

Read from `src/engine/ledger.ts`, `production.ts`, `eta.ts`, `src/app/view.ts`, `now.ts`, `whatif.ts`, `brief.ts`. One rule: every widget reads the
same State, so a number that moves in one place moves in all of them.

## The inputs (events), and what each one touches

| You save | Changes first | Then moves |
|---|---|---|
| An hourly count | `field`, that hour's `pace` | fieldBalance, variance / in transit, H.A., Pace + sparkline, finish rate (avg of last 2 known paces) and its anchor, "count due" clears, brand field + brand gap, break scale |
| A deck count | that deck's `rem` | vesselRemaining, progress, ring %, hero, variance / in transit, brand remaining, hull bar, steady carry (deck "as of" time), finish, pace watch, Now card |
| A deck height | `height.level` | low-deck outline on the hull, Needs a look, Decks and Plan badges, Decks alert, fit checks |
| Break / shift end | `ops.phase` | reconciliation banners, break scale, Now card goes quiet, reminders |
| An issue | `issues` | Needs a look, Plan list, banner "tracked", Closeout / Mark complete blockers |
| Setup (start, brands, breaks, sides) | `start`, `brandStart`, clear-by | every ledger above, the "stop" in the Finish line |

## The chain (engine)

```
deck.rem ──Σ──> vesselRemaining ──start−──> progress ──÷start──> ring %
                      │                          │
                      │                          └─ − field ─> variance ─> in transit (≥0)  | "field ahead" (<0)
period.count ──Σ──> field ──start−──> fieldBalance   (a different ledger: never mixed)
                      │
                      └─ ÷ counted hours ──> H.A.
period.count ÷ productive min ──> pace ──avg last 2──> eta.rate
eta.rate + vesselRemaining (or steady carry) + breaks + clear-by(side) ──> Finish
period.pace ÷ drivers ──> driverRate ──> advice (drivers needed) ──> What if
deck.rem ÷ hours to cutoff vs pace ──> pace watch ──> Now card ──> "See DK4"
Finish vs (break − clear-by) ──> "N min before the HH:MM stop"
progress vs field at break ──> scale / banners ──> Mark complete gate
```

## Widget to data (who reads what)

| Widget | Reads | Opens / links to |
|---|---|---|
| Now card | due hour, pace watch, driver advice | Log on that hour; the named deck's sheet |
| Vessel remaining | vesselRemaining, progress, gap, estimate | (i) remaining trace; (i) gap + transit trace |
| OFFICIAL field | field, last hour, in transit, vesselRemaining | flips to the field record |
| Finish (FORECAST) | steady.etaAbs, eta.rate, break + clear-by | (i) eta trace; tap = finish history (what-ifs) |
| Ship done | progress ÷ start | none yet |
| Pace | pace, per-hour paces, H.A., counted hours | (i) H.A. + pace trace |
| Ship (hull) | each deck's hatch rem, status, height | row = that deck; header = Decks; low deck outlined |
| Brands | brand remaining (hidden with one brand) | none |
| Needs a look | issues, low decks, unconfirmed heights | Plan; the low deck's sheet |
| Break scale | progress vs field | banners carry the by-brand rows |
| What if (Decks) | driverRate, vesselRemaining, breaks | none (nothing saved) |

## Found while tracing

1. **Two cutoffs.** The Finish line measures against the earlier stop (Southside 30 min), the pace watch against Northside 15 min. Both are right, but a card can say "before the 17:30 stop" while the warning counts to 11:45 on another side. Name the stop on both.
2. **Pace is not the finish rate.** The Pace tile shows the whole-shift pace (176); the Finish uses the last two hours (158). The (i) says so, the tiles don't. The needed-rate gauge (spec 3.7) is the missing bridge: needed vs pace vs finish.
3. **Two lists of "look at this".** Banners (field over start, forecast passed, reconciliation) and Needs a look hold different things. One list would be quieter.
4. **Ship done and the hero disagree when a deck has no count.** The hero falls back to Field balance, the ring shows a dash. Correct, but unlinked: the ring could say "needs a count on DK3" and open it.
5. **Not yet linked:** Ship done to Decks, brand rows to Hourly's by-brand table, Pace tile to Hourly, hero gap to Plan's discrepancy.
