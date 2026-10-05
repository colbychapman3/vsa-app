# VSA App (Virtual Stevedore Assistant)

Phone-first iOS app for supervising ro-ro auto discharge at Colonels Island. Offline-first: an append-only event log in `expo-sqlite` is the record; a plain TypeScript rules engine does all the math. Private project.

- Rules, layout, commands and builds: [CLAUDE.md](CLAUDE.md) (one source for people and agents)
- Status, timeline and plan: [ROADMAP.md](ROADMAP.md)
- Specs: `docs/specs/` (replaced ones in `docs/specs/superseded/`)

CI (`.github/workflows/ci.yml`) runs typecheck and tests on every push and pull request. Never delete the app from a phone before exporting its vessel logs.
