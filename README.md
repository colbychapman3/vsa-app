# VSA App (Virtual Stevedore Assistant)

Phone-first iOS app for supervising ro-ro auto discharge at Colonels Island. Offline-first: an append-only event log in `expo-sqlite` is the record; a plain TypeScript rules engine does all the math. Private project.

Rules, domain constraints and working agreement: [CLAUDE.md](CLAUDE.md). Plan and status: [ROADMAP.md](ROADMAP.md). Specs: `docs/specs/`.

## Layout
- `src/engine/` pure rules engine (no UI, no storage)
- `src/storage/` SQLite store, schema, migrations
- `src/app/` view model, entry builders, screens
- `tests/` node:test suite (kit validation tests, Glovis Condor 101 replay, tracker parity)
- `docs/` migration kit, protocol, reference tracker

## Commands
```
npm ci                          # install (Node 22, see .nvmrc)
npm test                        # unit tests
npm run typecheck               # tsc --noEmit
npm run check:ios               # confirm the iOS bundle builds
npx expo start --dev-client     # run against the dev build on the phone
```

## Build for the phone
EAS cloud builds (no Mac needed): `eas build --profile development --platform ios`, then install on the registered iPhone. Never delete the app from the phone before exporting the vessel log.

CI (`.github/workflows/ci.yml`) runs typecheck and tests on every push and pull request.
