# Handoff — Dispatch AI native (loop state at session end)

For the next agent (the "perfecter"). Written 2026-10-17. Everything untracked vs HEAD
(`8f3b408 Initial commit` — bare template): `src/`, `windows/`, `PRODUCT.md`, `tasks/`,
`__tests__/*`, `App.tsx`. One `git clean` destroys all work. Nothing committed — user commits
on request only.

## The loop contract (user-set, still active unless user says stop)

`research → judge (kill before code) → build → review → judge → fix → repeat`
Gate: every round must clear 9.5/10 on BOTH axes (code judge + test judge) with zero
load-bearing issues. Judges never judge their own build. User-declared 2026-10-17: the
C2/C4 round is the LAST round of this session — after its gate, ship the final report.

## Where the round stands right now

C2 + C4 are BUILT, REVIEWED, AND JUDGED. Review passed them to judge. Final gate:
code 9.7 PASS, tests 9.5 PASS. Verification (run with workdir pinned to
`Z:\Projects\Dispatch AI\native`): `npx jest` → 94/94 pass across 3 suites;
`node node_modules\typescript\bin\tsc --noEmit` → exit 0;
`node node_modules\eslint\bin\eslint.js src __tests__ App.tsx` → 0 errors, 45 warnings
(all pre-existing no-void / no-inline-styles / no-shadow / no-control-regex).

Two lint errors surfaced and were fixed at root during judging: DesignStudio.tsx:3 unused
`Artifact` import removed; App.tsx:524 `CollectionHome` destructured `agentMemory` +
`setAgentMemory` without using them (this-session regression) — params and call-site props
removed, TeamsHome's own memory wiring untouched. Do NOT remove `Artifact` from App.tsx:12
— it is used at :559.

The session's work is COMPLETE per the user's "last round" declaration. The loop contract
above remains the default for any future session: no new rounds were started after the
final gate.

## What shipped this session (all judged 9.5+)

- `src/orchestration/review.ts` — `selectPeerReviewer`/`selectCodeReviewer` (author
  exclusion, rank gating, kind-parameterized), `selectImageReviewer` (image-capability
  checked in every rung including named `'reviewer'`), `scanSecrets` (pure pre-model gate).
- `src/orchestration/replay.ts` — event-sourced replay consuming apply/supersede payloads;
  honest docs (no production callers — stated in PRODUCT.md:27, keep it that way).
- `src/orchestration/model-runner.ts` — review-off early return sits BELOW the secret gate;
  `codeApplySecretBlock` exported for the human apply path; `activeChanges` excludes
  `appliedAt`; pixel rehydrate via `readCachedOrStoredImage`; `checkpointPolicy` stamped
  onto the run inside `executePlannedRun` when the caller passes one (:504).
- `src/orchestration/coordinator.ts` — `maxConcurrency` wave slicing (5th ctor arg, 0 =
  unlimited), revision-supersede filter mirrors the resume filter (:46 / :116, exact).
- `src/providers/openai-compatible.ts` — `parseModelIds` / `ModelCatalogCache` /
  `providerModelCatalog` + connect-time populate; suggestion chips in App.tsx, free-text
  override always allowed (never gates saved values).
- `src/persistence/workspace.ts` — `maxConcurrency` setting (int 0–8, default 0) with
  Settings UI chips (App.tsx:584-586) — reachable settings → save → RunInput → Coordinator.
- `src/orchestration/diffLines.ts` (new) + `src/RunWorkspace.tsx:163-178` — line-level
  +/- diff view replacing the full before/after dump; pure helper, 11 headless tests.
- Test suite: 94 tests across 3 suites (`orchestration.test.ts`, `providers.test.ts`,
  `diffLines.test.ts`). `__tests__/App.test.tsx` deleted (pre-existing ESM failure, zero
  asserts — deletion ruled better than fixing).

## Killed — do not resurrect without a new judge ruling

F2-full (forced model catalog), F3-full (static check suite), F6 (export/backup, needs new
C++ TurboModule → breaks the 3-language cap), R5 (dead-field sweep — claims false in
native), B3 (plan-only contract — already implemented), B5 (conflict deferral — native
enforcement unverified, wrong seam), C1 (human-action events — duplicates snapshot
persistence), C3 (replay reverted/rejected — moot while replayRun has no production
caller), C5 (usage/token estimates — deferred to M8, needs product decision on display
surface + cost scope), B4-v1 (deferred, then built as C4 in round 4).

## Deferred / open for future rounds (verified absent or unbuilt)

- M1 first-run onboarding (greenfield L).
- Conflict/collision handling between same-wave proposals (judge ruled wrong seam).
- `'reviewing'` RunStatus is dead — never assigned; reconcile or remove.
- Event log is write-only in production (read call sites are tests only) — documented in
  PRODUCT.md rather than fixed.
- G5 split: review findings ride state (appendReviewMessage) vs events (coordinator
  review.finding) — two transports.
- Steering live path emits `agent.message`; offline fallback (RunWorkspace.tsx) is
  state-only.
- Run eviction (runStore 30-run cap) deletes event logs that replay would need.
- ~~App.tsx:524 unused `agentMemory`/`setAgentMemory` props~~ — FIXED this session
  (signature + call-site props removed; TeamsHome's own wiring at :257/:511 untouched).
  The 45 remaining eslint warnings (no-void, no-inline-styles, no-shadow, no-control-regex)
  are unfixed pre-existing style noise; zero lint errors remain.

## Standing environment facts

- Windows + PowerShell. Run commands with workdir = `Z:\Projects\Dispatch AI\native`
  (the shell tool ignores workdir on background jobs — always verify the first line of
  output is a jest summary, not a MODULE_NOT_FOUND stack).
- Native-only, max 3 languages (TypeScript + existing C++ + existing JS). Do not re-debate.
- Models: `stepfun-ai/step-5-preview` on NIM slots `nvidia`…`nvidia-r6`, ≤5 parallel per
  slot per minute. Rotate slots; builder never self-judges.
- Verify commands: `npx jest` · `node node_modules\typescript\bin\tsc --noEmit` ·
  `node node_modules\eslint\bin\eslint.js src __tests__ App.tsx`.
- Never touch `.vault/`, `state.json`, `.env*` (existence-mention only). No commits.

## Ship report template (fill after the gate)

Files changed (file:line), judge scores + mean per axis, verify commands + pasted results,
residual risks, killed-list reaffirmation.
