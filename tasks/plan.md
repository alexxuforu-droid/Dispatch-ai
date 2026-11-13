# Implementation Plan: Dispatch AI native rebuild

## Overview
Build Dispatch AI (native Windows workspace for agent teams) in thin verified slices.
Standing decisions: **native-only** (no web target; Playwright holstered until a browser
surface ships), **max 3 languages** (TypeScript + existing C++ + existing JS scripts —
no new language introduced), headless-first testing (jest runs without the native
toolchain), deterministic mock collaborators for repeatability.

## Architecture Decisions
- Orchestration core (`src/orchestration/`) stays provider/model independent; review
  and approval gates stay injected (`coordinator.ts:11-12`). No new abstractions.
- Reviewer selection is pure functions in `review.ts` (testable headless); the
  fallback reviewer can never resolve to the work author (self-approval closed).
- `replayRun` is event-sourced: seed gives identity/baseline, events rebuild
  messages/artifacts/changes with id dedupe; `code-change.proposed`,
  `review.finding`, `approval.required` are all applied (previously dropped).
- `plan-only` checkpoint stays unenforced until M1 (Coordinator never reads it);
  `each-wave` checkpoint is the working gate. Recorded, not silently fixed.
- Native C++ guards (traversal/symlink/CAS) remain authoritative; no second
  implementation anywhere.

## Task List

### M0 — Trustworthy core slice (this session)
- [x] Recon: status report (works / incomplete / broken / constraints)
- [x] Debate: web-first vs native-only → native-only per standing decision
- [ ] Headless jest suite for coordinator / review selectors / replay / event store
- [ ] Fix: replay lossiness + message duplication
- [ ] Fix: self-approval fallback hole in code-reviewer selection
- [ ] Docs: correct stale PRODUCT.md claims (SDK blocker, replay, provenance)
- [ ] Judge wave ≥9.5/10, then ship report

### Checkpoint: M0
- [ ] `npx jest __tests__/orchestration.test.ts` green + existing smoke green
- [ ] `npx tsc --noEmit` clean, eslint clean on touched files
- [ ] App still runnable (no UI/behavior change except closed holes)

### M1 — First-run + provider/model discovery
- Plan approval before execution already exists; add: guided setup, connection test
  that reads `/models`, live model catalog with refresh/staleness, free-text model
  validation, starter team + sample tasks. Acceptance: clean profile → approved plan
  on seeded sample in <10 min.

### M2 — Task lifecycle hardening
- Enforce `plan-only` checkpoint, concurrency cap per wave, defer (not throw) on
  cross-agent staged-file conflict, line-level diffs, static checks/test evidence
  hooks, export/backup, apply/undo surviving restart.

### M3 — Ranks + review authority (8–10 configurable levels)
- Rank-based eligibility by specialty/work type, visual-reviewer rank selection,
  reviewer identity/authority/evidence records, visible auto-approval policies.

### M4 — Team comms, debate, idea gates
- Directed/team messages, handoffs, filters, quick-brainstorm / devil's-advocate /
  practical-review modes, decision log, idea library.

### M5 — Bounded Experiment Mode + sandbox + showcase
- Sandbox root, keep/discard, time+call+cost budgets, autonomy levels, stop-controls
  preserving work, showcase with best/alternatives/diffs/reviewer findings.

### M6 — Design Studio output/version flow
- Reference/callout round-trip already exists; add version compare, accept/revise/
  export, newest-output preview hardening.

### M7 — Workflows + permission-aware plugins
- Reusable briefs, triggers/steps/retries/approval checkpoints, plugin catalog with
  inspect/enable/disable/revoke recorded in run history.

### M8 — Board, integrations, packaging, release
- Task board, run queue/concurrency controls, usage/cost estimates, model routing
  policies, templates, compare/replay UI, native e2e (WinAppDriver/FlaUI) on msix,
  signing/updates, a11y pass.

### Immediate release triage — target 2026-11-08

**Must pass before calling the native app release-ready:**
- **Evidence snapshot — 2026-11-07:** `npm run verify` passed with 35 suites / 451 tests in both Jest configurations; `npm run windows` compiled, deployed, and started PID 21604. G4 remains blocked (see `GATES.md`): provider setup/navigation and app-level capture/action/MP4 playback are unverified. NVIDIA NIM model-list authentication succeeded, but the completion-content check did not, so it is not live-inference evidence. A direct full-solution MSBuild reached packaging but failed on the missing `Microsoft.UniversalCRT.Debug, Version=10.0.22621.0`; use the successful RNW build as the verified build/deploy path. G5 review returned no blockers; its bounded low risks are listed in `GATES.md`. R1–R7 below remain open.
- [ ] **R1 — Release identity and package:** replace the development publisher identity, confirm the product/package name and version, and build the intended Release MSIX. Acceptance: the artifact installs on a clean supported Windows machine without a development-only certificate.
- [ ] **R2 — Signed release path:** add a tag-triggered GitHub release workflow that builds and attaches the MSIX plus checksum and notes. Keep signing material in protected CI secrets; never put it in the repo or logs. If signing is not available, explicitly decide and document the supported install path before release.
- [ ] **R3 — Clean install and upgrade smoke test:** install, first launch, configure a provider through the app, confirm the secret stays in Windows Credential Manager, restart, upgrade, and uninstall on a clean Windows profile. Record the exact tested OS and architecture.
- [ ] **R4 — Native end-to-end gate:** finish G4 in `GATES.md`: verify first-frame time, observed FPS/drops, action latency and selected-window confinement, then record and play back an MP4. Use a configured provider without reading or copying its credential; document that repeated still-frame vision updates are not continuous video ingestion.
- [ ] **R5 — Release documentation:** publish concise setup/prerequisite steps, release notes, screenshots, known limitations, and a rollback/reinstall path. Disclose any non-fatal build warnings and unverified flows.
- [ ] **R6 — Release CI must fail closed:** require the native Release build and package job on release tags. The existing verification workflow may skip its native build when v145 is unavailable, so that skip is not release evidence.
- [ ] **R7 — Human-facing UI pass:** simplify the high-traffic Dispatch and Computer use screens, check keyboard/focus and supported window sizes, and capture OCU evidence after the page is reachable. Keep behavior and existing product identity intact.

**Separate post-release features (not release blockers unless advertised):**
- [ ] **T1 — More safe project tools:** add a permissioned, read-only Git status/diff view and an allow-listed test runner in the existing isolated harness. Keep arbitrary shell/network access disabled; record tool inputs, outputs, timeouts, and approvals.
- [ ] **T2 — Fast browser control:** do a small capability spike first, then choose a persistent browser-control connection (WebView2 DevTools Protocol or another supported browser API) with DOM-backed state and actions. Acceptance: same-tab state/action correlation, origin scoping, explicit approval for external effects, bounded queues/timeouts, and measured first-state/action latency. Keep this separate from desktop frame capture; do not claim video streaming from screenshots.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Whole tree uncommitted (HEAD = empty template) | High | Commit prompt to user; until then no `git clean` |
| Snapshot-per-event O(n²) on large proposals | Med | M2: append-only event log + lazy snapshot |
| Image pixels lost on restart (in-memory Map) | Med | M2: persist URIs + rehydrate or fail-open review |
| WinAppDriver flakiness on RN XAML views | Med | M8 spike first; FlaUI fallback |
| `plan-only` confusion (set but unread) | Low | Documented here; M2 enforces |

## Open Questions (recorded, not asked — standing order is don't ask)
- Commit cadence: user commits on request only; done = verified, uncommitted.
- Visual-reviewer rank selection deferred to M3 (code path fixed now).
- `review`/`plan` work kinds bypass review gates by design; revisit in M3 policy work.
