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
