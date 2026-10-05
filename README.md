# VSA App (Virtual Stevedore Assistant)

Phone-first iOS app for supervising ro-ro auto discharge at Colonels Island. Offline-first: an append-only event log in `expo-sqlite` is the record; a plain TypeScript rules engine does all the math. Private project.

Rules, domain constraints and working agreement: [CLAUDE.md](CLAUDE.md). Plan and status: [ROADMAP.md](ROADMAP.md). Specs: `docs/specs/`.

## Layout
- `src/engine/` pure rules engine (no UI, no storage)
- `src/storage/` SQLite store, schema, migrations
- `src/app/` view model, entry builders, screens
- `modules/vsa-text/` local Expo module (Apple Vision text with word positions; Swift in `ios/`)
- `scripts/` generators for the knowledge pack and the terminal map
- `tests/` node:test suite (kit validation tests, Glovis Condor 101 replay, tracker parity, real game plan fixtures)
- `docs/` migration kit, protocol, reference tracker, specs (`docs/specs/`, replaced ones in `docs/specs/superseded/`)

## Commands
```
npm ci                          # install (Node 22, see .nvmrc)
npm test                        # unit tests
npm run typecheck               # tsc --noEmit
npm run check:ios               # confirm the iOS bundle builds
npx expo start --dev-client     # run against the dev build on the phone
```

## Build for the phone
EAS cloud builds (no Mac needed). Phone checks use TestFlight store builds:
```
eas build --platform ios --profile production --non-interactive
eas submit --platform ios --profile production --latest --non-interactive
```
`eas build --profile development --platform ios` makes a dev-client build for native debugging. EAS skips gitignored files, so commit native source (`modules/*/ios/`) before building. Never delete the app from the phone before exporting the vessel log.

CI (`.github/workflows/ci.yml`) runs typecheck and tests on every push and pull request.
