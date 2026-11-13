# Gates: native live computer use

Scope: verify the native Windows app, live frame-to-vision loop, target-scoped actions, and requested UI changes.

- [x] G1: focused capture, reply-parser, loop, screen, navigation, button, and skeleton contracts pass
  CHECK: npx jest --runInBand __tests__/capture-protocol.test.ts __tests__/computer-use-reply.test.ts __tests__/live-capture-loop.test.ts __tests__/computer-use-navigation.test.ts __tests__/computer-use-home.test.tsx __tests__/ui-button-skeleton.test.tsx
  EXPECT: Test Suites: 6 passed
  CWD: .
  EVIDENCE: 2026-11-07 — 6 suites / 31 tests passed.

- [x] G2: the full native verification gate passes
  CHECK: npm run verify
  EXPECT: Test Suites:.*passed
  CWD: .
  EVIDENCE: 2026-11-07 — `npm run verify` passed: TypeScript, RNW codegen check, zero-warning ESLint, and 35 suites / 451 tests in both the default and Windows Jest configurations.

- [x] G3: RNW builds, deploys, and starts the Windows app
  CHECK: npm run windows
  EXPECT: Build succeeded
  CWD: .
  EVIDENCE: 2026-11-07 — `npm run windows` compiled, deployed, and started PID 21604. Non-fatal RNW duplicate-import and file-not-found warnings remain. A direct full-solution MSBuild also compiled the native target but failed during packaging because `Microsoft.UniversalCRT.Debug, Version=10.0.22621.0` is missing; this does not replace the successful RNW build/deploy check.

- [ ] G4: live UI and performance are verified in the running app
  EVIDENCE: still open (2026-11-13). Progress since the first attempt: the running build now
  reports "Provider configured" with a NIM endpoint and per-agent keys in Credential Manager
  (the endpoint answered HTTP 200); the frameless window renders with rounded corners and no
  caption bar; all 16 screens open and render; agents, settings and the new three-control
  Design studio were read back from the accessibility tree. Still unverified: a full coordinated
  run (brief -> plan -> approve -> agents -> completed) has never been watched completing with a
  live model, and no live computer-use frame-to-action loop, performance metrics or playable MP4
  have been observed. Two app defects block scripted verification: assistive-technology
  default-action activation does not press any control (physical clicks only), and the sidebar's
  scrolled accessibility bounds do not match the drawn rows. No credential values or local state
  files were read.

- [x] G5: adversarial judge review findings are resolved or reported as bounded risks
  EVIDENCE: 2026-11-07 — read-only review on `nvidia-r2/mistralai/mistral-large-4-1t-a52b` found no blockers and confirmed the shutdown drain-window race is closed, promises are settled on shutdown, recording finalization/deletion runs on the worker, startup stop rejects, and target-scoped safety remains intact. Three low risks are recorded: a stop requested during shutdown rejects promptly rather than returning the final path; `NextFrame`/`RunWorker` resolve promises while holding `m_mutex` (safe under current RN async dispatch, but sensitive to future synchronous resolution); and stopping during recording startup rejects while the start may still complete, requiring a later stop. No optional behavior changes were made.
