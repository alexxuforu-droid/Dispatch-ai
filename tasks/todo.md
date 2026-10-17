# Todo: M0 — Trustworthy core slice (research → JUDGE → build ↔ review until green)

## Loop law (standing)
Research proposes. JUDGE strikes down bad features BEFORE code. Build ↔ review
iterate until the gate passes. No feature is coded unkilled-features-listed first.

## Round 1: researcher output → feature kill-judgment (done, no code on killed items)
- [x] Judge 1: F1 BUILD · F2 KILL (salvage blessed: catalog picker + free-text override kept, never gates saved values) · F3 KILL (salvage blessed: pure secret-scan over run.changes only)
- [x] Judge 2: F4 BUILD · F5 BUILD · F6 KILL · cuts C1/C2/C3 AGREE
- [x] Killed: F2/F3/F6 as proposed — never to be built in killed form

## Round 3: build judged-approved only (built, ground truth 61/61 + tsc + lint clean)
- [x] Builder-1 F4: cap slices in coordinator, settings field, 3 tests; model-runner threading left as documented 3-line follow-up
- [x] Builder-2 F2-salvage: catalog parse/cache + chips + override kept, 9 tests
- [x] Builder-3 F5+F3-salvage+F1: image selector + secret scan + pixel seam, 8 tests
- [ ] Review full diff → judge wave → build↔review until ≥9.5

## Round 2: code-judge FAIL items from last wave (coders A/B/C done, verify + re-judge)
- [x] A: event-log completeness (supersede/apply/checkpoint events + replay consumption)
- [x] B: reviewCode toggle gate + docs overclaim + allowChanges dead block
- [x] C: duplicate-event pins + artifact assertions + test rename
- [x] Tree verify: 41/41 green, tsc clean, eslint 0 new (2 pre-existing App.tsx errors)
- [ ] Re-judge code + tests vs 9.5 gate

## Checkpoint: M0 — GATE CLEARED (code 9.5 PASS, tests 9.5 PASS, 69/69 + tsc + lint)
- [x] F4 cap user-reachable: settings chips → save → RunInput → Coordinator; stale spec comment removed
- [x] Ship state: review.ts selectors, replay event-sourced, toggle gate, secret scan, pixel seam, catalog, cap

## Next iteration (loop runs until stopped)
- [x] Research: next build set ranked (5 items + corrections + 3 new gaps)
- [x] Judge: R1 BUILD · R2 BUILD · R3 BUILD · R4 BUILD delete-only · R5 KILLED (claims false in native)
- [x] Build R3+R1 (gates + scan placement, 75 green) · R2+R4 (copy + App.test retired, full jest EXIT=0)
- [x] Wire codeApplySecretBlock into App applyCodeChange (~3 lines) → review → judge
- [x] Review: PASS TO JUDGE, no blocking · Code judge 9.6 PASS · Test judge 9.2 (verdict PASS, below number — fixing 4 small follow-ups + label hedge, then test re-judge)
- [x] Test follow-ups: mock-router marker, passwd/secret gate cases, uncovered branches, fresh closure + todo checkbox + apply-anyway label (78 green, tsc clean, eslint 0 new) → test re-judge 9.5 PASS
- [x] ROUND GATE 2 CLEARED: code 9.6 · tests 9.5 · 78/78
- [x] Research 3: leftovers + M1/M2 status + newly-cheap + 5 fresh gaps
- [x] Judge 3: B1 BUILD · B2 BUILD · B3 KILL (already implemented) · B4 DEFER (no caller yet) · B5 KILL (native enforcement unverified, wrong seam)
- [x] Build B1+B2 (appliedAt mirror + image-capable fallback, 79→80 green) → review → judge
- [x] Review: PASS TO JUDGE (1 explicit decision: drop unreachable !revertedAt token at :115) · Code 9.3 (PASS verdict, 1 follow-up: :324 omits !appliedAt) · Tests 9.5 PASS
- [x] Micro-fix: drop token, :324 guard + test → code re-judge 9.5 PASS
- [x] ROUND GATE 3 CLEARED: code 9.5 · tests 9.5 · 80/80 · tsc · lint clean

## Round 4 (final round, user-declared)
- [x] Research 4: G2/G3/replay-note/B4-caller/M2 + fresh gaps (a,b,c)
- [x] Judge 4: C1 KILL (duplicates snapshots) · C2 BUILD · C3 KILL moot · C4 BUILD · C5 DEFER M8
- [x] Build C2 (checkpointPolicy live at approve: App.tsx:170, model-runner.ts:504, tests :1016-1073) · C4 (diffLines.ts pure helper, RunWorkspace.tsx:163-178 line view, diffLines.test.ts 11 tests) — 94/94 green, tsc exit 0, lint zero new (mutation-checked both)
- [x] Review C2+C4 → PASS TO JUDGE (3 notes, no blocking)
- [x] Code judge 9.0 FAIL (1 BLOCKING: App.tsx:524 dead CollectionHome props) → fixed at root (signature + call site, TeamsHome wiring untouched) → code re-judge 9.7 PASS
- [x] Test judge: PASS 9.5 conditional on the lint fix (now verified green)
- [x] GATE CLEARED: code 9.7 · tests 9.5 · 94/94 · tsc exit 0 · eslint 0 errors (45 pre-existing warnings)
- [x] Final ship report delivered

