# Spec: Phase 7, TestFlight (App Store later)

## Objective
Colby and coworkers install VSA from TestFlight on their own iPhones with no QR code, no computer and no device registration, and get new builds by tapping Update. Success: a store build of the current app is in App Store Connect, installs from TestFlight on Colby's iPhone, opens his existing vessels, and a coworker can install it from an invite.

## What exists
- Apple Developer membership (Colby has it). EAS project @colbychapman3/vsa-app, bundle id `com.vsaops.vsa`, version 1.0.0, 1024×1024 icon, `ITSAppUsesNonExemptEncryption: false` (no export-compliance prompt), camera/photo permission texts, `appVersionSource: remote` and `production` build profile with `autoIncrement` (build numbers).
- Preview builds are **ad-hoc** (only registered phones). TestFlight needs a **store** build (`production` profile).

## Steps
1. **App Store Connect record (Colby, once, ~5 min; Apple login can't be done by Claude):** appstoreconnect.apple.com → Apps → New App: iOS, name **"Virtual Stevedore Assistant"** (27 characters; fallback "VSA Stevedore Assistant" if Apple says it is taken), subtitle "Track ship discharge offline" (28 of 30; public App Store only), bundle id `com.vsaops.vsa`, SKU `vsa-app`, language English (US). Send me the numeric **Apple ID** of the app (App Information → General).
2. **Claude:** add `submit.production.ios.ascAppId` to `eas.json`; run `eas build --platform ios --profile production`, then `eas submit --platform ios --profile production --latest`. EAS asks for Colby's Apple ID sign-in or an App Store Connect API key **once, interactively**; if it can't run headless, Claude gives Colby the one command to run in PowerShell.
3. **Colby:** in App Store Connect → TestFlight, the build appears after processing (10-30 min). Add yourself under **Internal Testing** (needs an App Store Connect user; no Apple review). Install the TestFlight app, accept the invite, install VSA.
4. **Coworkers:** either add them as App Store Connect users (Internal Testing, up to 100, no review) or use **External Testing** (public link or email invite, up to 10,000; Apple's first Beta App Review takes about a day and needs a short "what to test" note and contact info).
5. **Updates:** Claude runs build + submit; testers get the new build in TestFlight. Builds expire after 90 days, so a build is submitted at least that often.

## Risks and rules
- **Data stays on each phone** (SQLite and photos are in the app's own storage). Moving from the ad-hoc app to the TestFlight app is a different install of the same bundle id: Colby should **export a backup** from Plan › Backup first and import it after, and keep the ad-hoc app until his vessels are confirmed in the TestFlight one. Photos are not in the backup export (stated on the card), so TEST/real photo evidence stays only in the old install.
- Store builds ignore `expo-dev-client`'s launcher; no behavior change expected. Notification permission, camera and photo prompts are unchanged.
- Never: submit anything to the **App Store review** (public release) without Colby's explicit go; TestFlight internal builds need no review.
- App Store later needs: privacy policy URL (the app collects nothing and sends nothing off the phone unless Colby taps Ask my AI), screenshots, age rating, review notes. Not part of this phase.

## Testing
Store build installs from TestFlight on Colby's iPhone; vessels import from a backup; camera, photo import, notifications and share sheet work; airplane mode works.

## Decisions needed from Colby (defaults in bold)
1. Name (decided 2026-10-01): **Virtual Stevedore Assistant**; subtitle **Track ship discharge offline**; the home-screen label stays **VSA** (app.json `name`).
2. Coworkers: **Internal Testing (App Store Connect users)** if they're few; External if many.
3. Do step 1 now and send me the Apple ID number.
