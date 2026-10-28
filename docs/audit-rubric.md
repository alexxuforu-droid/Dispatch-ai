# The re-audit rubric

This is the contract the final audits score against. It exists so the last score is comparable to
the first one instead of being a fresh opinion.

## Where this list came from

The six baseline audits ran as subagents in an earlier session and their reports were never written
to disk, so the original "18 audited features" list cannot be recovered verbatim. This rubric is
reconstructed from the two sources that are on disk:

- `PRODUCT.md` — the product's own claim sheet. Every claim in it is a feature that has to hold.
- the baseline findings recorded in the goal plan (product 5.5/10, engine 6.5/10, verification
  3/10; the worst-scoring features were artifacts/export 3, task board 5, verification/CI 2).

Reconstructing the list against the claim sheet produced twenty entries: eighteen audited features,
plus two compound claims in `PRODUCT.md` that had to be split to be scored honestly (artifacts and
automatic review; apply/undo and the evidence workspace). Every feature the baseline audits named is
in this list. A feature is not scored from `PRODUCT.md` — it is scored from the code that implements
it, and `PRODUCT.md` is corrected when the code and the claim disagree.

## The features

| # | Feature | The claim being scored |
|---|---------|-------------------------|
| F01 | Dispatch composer and run start | A person writes a task, attaches context, picks a team and review policy, and starts a run. |
| F02 | Plan proposal, inspection and approval | The coordinator proposes typed work items and dependencies; the person inspects the plan, edits step titles, and explicitly approves or stops it before execution. |
| F03 | Plan assignment and dependency editing | The person can change which agent owns a work item and edit the dependency edges, and the change is validated (no cycles, no dangling ids) and persisted. |
| F04 | Shared run timeline and team messaging | Handoffs, questions, findings, progress and artifact links are published to an append-only event stream; messages can target a teammate or the whole team; each agent receives team messages, its own history and messages addressed to it. |
| F05 | Dependency-aware execution, checkpoints and cancellation | Independent work runs concurrently, dependent work becomes ready after its prerequisites pass, approval checkpoints can pause between waves, and cancelling stops the provider requests while keeping completed work. |
| F06 | Artifacts and the artifact gallery | Code, image and file outputs are stored as run artifacts, linked to their work item, listed in the gallery, and can be accepted or declined. |
| F07 | Automatic code and image review | Code review reads the structured file proposal; image review reads the actual rendered pixels; a failed check returns bounded feedback for up to two revisions; unsupported review fails closed to a human gate. |
| F08 | Human apply and undo of changes | Changes are staged with before/after contents, eligibility is decided in one place, apply is atomic across a proposal, undo reverses it, and a qualified senior peer can approve and apply under the stated rank rules. |
| F09 | Export of deliverables | A generated image, a proposed change and a review report can be written to a place the person picks, through the native Save dialog, without a truncated file ever appearing under the final name. |
| F10 | Run comparison | Two saved runs can be compared side by side — status, ordering, work-item statuses, changed files with line counts, artifacts, findings — and every difference is labelled, not only coloured. |
| F11 | Provider connection and credential storage | The endpoint and model are stored locally, the secret lives in Windows Credential Manager and never in app storage, the model catalogue refreshes and shows its own staleness, and a provider error body reaches the person. |
| F12 | Teams, agents, hierarchy and permissions | Named teams can be created and switched, custom agents carry instructions, capabilities, model ids, avatars, ranks and per-agent project tool permissions, the hierarchy groups by rank, and the team chat filters by all/handoff/review. |
| F13 | Workflows, playbooks, memory and debate | A run can be saved as a reusable workflow and launched against a team, playbooks and approved agent memory are injected as constrained guidance, and an optional debate asks up to three teammates to critique the plan and logs the notes. |
| F14 | Plugin capability catalogue | A local built-in catalogue gates workspace tools, image generation, code review and visual review in the execution path, individual workspace permissions are still enforced separately, and no third-party code is loaded. |
| F15 | Design Studio | Six starting points, nine design skills, a draggable canvas with reference notes and text-only 3D prompt recipes, exact change/keep brief fields, output format selection, active team context, accessible move controls, and a return trip to the newest finished output. |
| F16 | Task board | The board summarises work items across saved runs with owners, dependencies and current statuses. |
| F17 | Usage and token ledger | Every planner, builder and reviewer call is recorded to a dedicated ledger, exact and estimated totals are shown separately and never added together, the ledger is retained and summarised, and it can be discarded. |
| F18 | Workspace project tools and permission gating | A folder can be selected, listed, read, grepped and written; every tool request is checked at execution time against the per-agent permission and the selected project; the native writer rejects traversal, reparse points and stale content. |
| F19 | Run persistence, recovery and history repair | Up to 30 resumable run snapshots are stored with their event log, an interrupted run is recovered on relaunch, work can be resumed, corrupt storage is quarantined instead of overwritten, and history can be repaired or discarded without losing a copy. |
| F20 | Evidence workspace | The results surface shows the diff, the review evidence, the artifacts, the comparison, the export actions, and it confirms the destructive ones. |

## The code layers

| Layer | What is scored |
|-------|----------------|
| Orchestration | The provider-independent run core: parsing, planning, execution waves, review gating, timeout and cancellation, event emission, and the separation between the model runner and the coordinator. |
| Persistence and native bridge | Storage safety, retention and bounds, atomic apply, and the two C++ TurboModules: credential storage and the workspace writer. |
| App shell | `App.tsx` and `src/app/`: composition root, settings state, run session, controllers, policy rules and the wiring between them. |
| UI and design system | The view tree, the token discipline, notices, confirmations, hit targets, keyboard access, responsive behaviour, and the icon system. |
| Tests and CI | One command that proves the project, what the suite actually covers, whether a test can fail for the right reason, and whether CI runs the same command. |

## How a score is earned

1. A score comes from the code and from execution, never from a claim. Read the implementation; run
   the tests; run the build. A feature whose implementation is missing scores what is there.
2. Every finding needs `file:line` evidence for both the defect and the fix.
3. A dimension that cannot be executed on this machine — the native app window, a live provider
   call, the Windows Save dialog — is reported as **unverified**, with the reason. It is never
   scored up, and it is never quietly counted as passed.
4. The orchestrator's own `npm run verify` run and the native build output are evidence for the
   whole project; a feature claim that only a reviewer could confirm is marked as such.
5. Any Critical or High finding from the baseline audits must be closed, or reclassified with the
   evidence that justifies the reclassification.
