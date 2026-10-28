# Dispatch AI Native — New-Session Handoff

Use this as the brief for a **new OpenCode session**. The prior session hit the goal's
60M-token safety limit. The app work is in `Z:\Projects\Dispatch AI\native`; the handoff,
plan and reports are under `native/.scratch/native-ui-mastery/`.

## Goal to start in the new session

> Finish the Dispatch AI React Native Windows UI in `Z:\Projects\Dispatch AI\native` to
> enterprise-grade interaction and responsive-layout quality. Continue from the current
> committed tree; preserve all existing work. The owner dislikes the former mint/white
> palette; keep the chosen indigo-on-near-black palette unless fresh visual evidence shows
> a concrete problem. The owner says the live window still feels “weird and wack”: make
> every screen adapt cleanly to the actual window size, including continuous resize, not
> just the three captured presets. Simplify clutter and fix real defects, but do not invent
> unrelated product features just to make the interface feel full.
>
> Work end-to-end: inspect the existing design plan and the four completed short subagent
> reviews; trace important user flows; form at least five distinct attack vectors and a
> ranked fallback queue; debate consequential design/architecture choices with fresh NIM
> agents; implement in small reviewed slices; test every slice; run bounded stress tests
> in isolated, deterministic sandboxes; capture the running Windows app at multiple sizes;
> and use fresh, independent code, interaction/accessibility, visual and test judges for
> unlimited fix-and-rejudge rounds. Dispatch the judges one at a time per slot and show
> screenshot inputs one image per tool call. Do not claim success from static review alone.
>
> Acceptance: (1) live resizing is visually stable and usable across the supported window
> range; (2) compose/start, setup, plan approval, apply/undo, run history, settings and
> usage continue to work and persist on this machine; (3) keyboard focus, pointer hover,
> pressed, disabled, loading, empty, error and recovery states are visible, consistent and
> accessible; (4) no crashes, data loss or unbounded resource use in the agreed bounded
> stress suite; (5) tests, typecheck, lint at or under the frozen 45-warning baseline, strict
> slop check and native build pass; (6) current screenshots exist for every screen at 900,
> 1024, 1240, 1500 and 1920 widths, plus an actual continuous-resize check; (7) every
> deliberate checker warning has a reason; (8) fresh judge scores average at least 9.5/10
> with zero load-bearing findings; (9) a concise ship report records evidence and residual
> risks.
>
> Constraints: use fresh NIM `stepfun-ai/step-5-preview` subagents, rotating `nvidia`,
> `nvidia-r2` … `nvidia-r6`, at most five asks per slot per rolling minute. Keep work
> independent and file ownership explicit; no overlapping edits. Never commit to the
> parent `Z:\Projects\Dispatch AI` repository. Never read or modify `.vault/`, `state.json`,
> `.env*`, credential files or saved browser sessions. No real provider calls in stress
> tests and no unbounded load on the user's PC: use mocks/local deterministic fixtures,
> cap concurrency and iterations, use only one native app instance, monitor process
> resource use, and stop if the machine becomes unstable. Never run shutdown commands.
>
> Before closing the goal, audit current evidence, not the prior report. If the 9.5 judge
> bar is not reached, say so and leave the goal open.

## Current repo and verified state

- Last known HEAD: `8cb31ed docs(ship): the palette is indigo on near-black`. Recent
  implementation commits include `64bf073` (indigo palette), `2c8a2fc`/`ac75b74`
  (animated hover), `7a77c17` (four-review fixes), `a4322fd` (honest flow tests), and
  `418c7d6` (last capitals removed). Run `git log --oneline -12` on entry; this is a
  handoff, not the source of truth for HEAD.
- Working tree was clean when the handoff was requested; verify before editing.
- Latest recorded verification before the final interaction and screen-review edits: `tsc
  --noEmit` clean; Jest 17 suites, 271 tests passing; ESLint 0 errors / 38 warnings; strict
  slop checker passed with deliberate findings individually accepted and reasoned. Some of
  those files changed afterwards. **Re-run all gates on the actual current HEAD.** The native
  build succeeded earlier; rebuild after current changes.
- Current palette is indigo: lead `#8E8FF0`, support `#2A2A55`, pop `#C9C9FF` on the
  unchanged neutral near-black ladder. The owner explicitly chose “Indigo on near-black”
  because they disliked the green and white. A first palette pass missed hand-rolled white
  fills; `no-white-fills.mjs` converted them, and the app was checked in a later screenshot.
- Hover: `src/Reveal.tsx` wraps controls in an animated pressable with a 120ms fill
  interpolation, and converts hex colours to RGBA. `src/ui.tsx` supplies per-variant hover
  endpoints. One intermediate capture showed broken outlines because React Native cannot
  interpolate hex colours; conversion to RGBA fixed it. Inspect the **current** file and
  verify hover in the live app before changing this again.
- Current palette screenshots were captured at 1500 in
  `C:\Users\Admin\AppData\Local\Temp\opencode\snapshots\judge\ind2w1500-*`;
  they predate the later review fixes and are not final. Capture a fresh complete set after
  reviewing current code. `capture-set.ps1` and `click-capture.ps1` in the scratch folder
  are the harness. It was corrected to use window coordinates directly. Check that the
  captured page title matches the filename; the earlier harness silently mislabelled views.
- App startup/native fixes already made: WinAppSDK auto-init in
  `windows/DispatchNative/DispatchNative.vcxproj`, AsyncStorage database path in
  `windows/DispatchNative/DispatchNative.cpp`, Metro redirect/core initialization/runtime
  bridge in `index.js`. Preserve these; do not “clean them up” without a demonstrated fix.
- `react-native-svg` was attempted and removed: this machine lacks PowerShell 7, and the
  supplied RNSVG Windows project is UWP-flavoured, incompatible with this RNW setup. This
  is a recorded deviation, not an invitation to retry blindly. Icons are Tabler SVG sources
  rasterised at build time into PNGs; the mascot mark is also a PNG rendering of its SVG.
  The mark itself is white/grey, not mint. The owner has now said they dislike green/white
  UI colours; they did not separately request a new logo.

## Design plan and current intent

Read first:

1. `native/.scratch/native-ui-mastery/DESIGN-PLAN.md` — plan of record and deviations.
2. `native/.scratch/native-ui-mastery/SHIP-REPORT.md` — prior judge rounds, implementation,
   verification and risks; update it instead of duplicating it.
3. `native/.scratch/native-ui-mastery/MASTERPIECE.md` if present — frozen lint baseline.
4. `C:\Users\Admin\.agents\skills\oxfords\SKILL.md`,
   `references/app-ui.md`, `references/states-forms-copy.md`, `references/palettes.md`,
   `references/slop-floor.md`, `references/motion.md`.

The original detailed goal wanted: one content-first neutral ladder plus three palette
roles; one type/radius scale; shared controls; grouped labelled navigation; one measured
content frame; one toast slot; helpful empty states; inline run setup on wide windows and a
modal below the breakpoint; responsive behavior; consistent icons; durable core flows. The
design debate deliberately kept a grouped six-destination navigation rather than forcing
five top-level entries, and kept the tested run setup inline above 1040px. Revisit these
only with concrete evidence and update the plan/report with the decision.

The entire screen must respond to the **measured app frame**, not only the native window
dimensions: RNW dimensions did not track resizing. `App.tsx` measures its frame and passes
the width to `DesignStudio`; the 1240/900 main-pane clipping bug was fixed with
`minWidth: 0, flexShrink: 1`. Audit every screen for remaining hard-coded widths, heights,
columns and breakpoints. The current design studio has its own responsive threshold at
1280 while the shell/run-setup floor is 1040 and the native minimum is 900; prove that
these breakpoints work together or simplify them.

## Review findings already gathered — verify before acting

Four short subagent reviews were completed in the prior session. Their findings are
evidence to check, not instructions to apply blindly.

### Interaction layer

- The destructive (`critical`) button's base and hover fill were identical, so it gave no
  visible hover response.
- IconButton used a generic hover wash; a dead hover style remained. Its tooltip was hover-
  only, no focus equivalent/delay, and positioning needed a local containing box.
- Focus was only visible where a border existed. Toggle, simple rows, text actions and canvas
  move buttons may still lack a keyboard-visible focus state. Team picker role rows were
  fixed with transparent borders, but re-audit all controls.
- Text inputs had no focus treatment. Radio options lacked arrow-key navigation/grouping.
- Press could remain stuck if pointer left during a press. Verify current fix.
- Toggle thumb snapped instead of sliding; errors only changed the field border and weren't
  announced; Toast mounts/unmounts immediately and had no auto-dismiss/live region.
- No busy state component, no animated modal entrance, no reduced-motion-safe state transition
  coverage. Reveal entrances replay for historical messages; decide whether to remove them.
- `toRgba` needed 3/4/6/8-digit support (scrim is `#0009`); verify current converter and tests.
- `theme.motion` had unused values. Verify whether the new hover animation consumes the shared
  motion token and whether every animation stops on unmount.

### Screen-level trimming and defects

- Dispatch stacked a hero paragraph, six 3-line presets, three starter chips that only fill
  the composer, task, plan and message cards. Flatten only where it improves scan speed;
  preserve actionable information and test flows.
- `YOU` / `Your task` duplicated labels; composer hints/status prose may be redundant.
- The run thread staggered entrance animations on existing messages. It could move while being
  read; verify policy.
- Library run/artifact cards carried redundant icon tiles, counts and repeated open actions;
  artifact URI was raw visible text. Inspect current state.
- WorkflowHome reused a preset-card grid; Task board repeated run briefs and duplicated Run
  room/Runs; summary counters previously omitted cancelled items (fixed, verify).
- Results had repeated messages in “Review findings” and “Run receipt”; a “Resume run” link
  could show before results existed. Inspect current implementation.
- DesignStudio review: hard-coded spacing rather than tokens; raw `Cascadia Code`; arbitrary
  field heights; 11px heavy text; presets/recipes/cards too bordered; nudge controls duplicate
  drag; “Bring forward” only affects generated brief ordering; callout remove affordance was
  a muted 11px text row; “What agents receive” card and nine skill notes repeat form/preset
  state (the summary card and unreachable recipe cutoff were already removed/fixed).
- DesignStudio defects already fixed: image opacity `.9` removed; vertical drag uses measured
  stage height, all recipes are reachable, title scales from measured frame, preset shelf
  wraps, radii moved onto the shared scale. Verify these remain correct.
- One exact copy issue: “Browse files” navigated to settings, not a file picker. It was renamed
  to “Project files”. Verify current behavior/copy.

### Missing product states / explanations

- Provider status previously showed “Provider not set” before async check completed; now has a
  checking state. Verify.
- No artifact export/open-folder action; no run comparison UI despite `PRODUCT.md` mention;
  no approval badge on nav; no per-step cancel; no rename/delete for runs; no in-run search;
  no explicit age notice for the 30-run history cap; no auto-scroll in a live run.
- Provider request timeout/retry/offline treatment, model vision support, project access
  permission denials and user cost/call volume were not explained. Consider which are essential
  for the stated goal and address them with plain states, but do not add paid provider calls.
- First-run needs provider/team/project setup cues and actionable recovery. A provider failure
  should be inline or near the composer, not a confusing redirect/toast only.
- These observations were static reviews, not runtime-verified. Do not assume a finding is
  current until reproduced or proved in the current tree.

## Safe stress-test policy

“Stress test” means bounded tests in isolated fixtures, not saturating the user's PC:

- Never run multiple native app instances concurrently. For live UI, one instance only.
- No uncontrolled infinite loops, OS-wide CPU/memory burners, giant screenshot floods, or
  real provider/network calls. No real credentials in tests; never read `.env`, key files or
  Credential Manager contents.
- Prefer deterministic tests with mocked providers and temporary project fixtures. Bound
  generated items (e.g. 0/1/100/1,000; only test 10,000 in a fast in-memory unit test if it
  does not allocate large images or native controls). Bound parallel work to 2 jobs unless
  measurement shows headroom.
- Watch the app/process while testing. Abort if memory/CPU rises uncontrollably, the machine
  becomes sluggish, or the native app stops responding. Test recovery after the test, and
  confirm no duplicate process remains.
- Exercise window resize on one app instance with a deterministic sweep: 900, 920, 1024,
  1039, 1040, 1100, 1240, 1280, 1500, 1920; add a live drag across the 1040 and 1280
  thresholds. For each screen assert visible page title, no clipped/overlapping primary
  action, no content off the right edge, minimum touch/desktop hit target, and usable scroll.
  Capture a smaller screenshot matrix for every screen after that sweep.

## Mandatory new-session workflow

1. Start with `/goal resume` only if OpenCode still reports the old goal as budget-limited;
   otherwise create a **new goal** from the Goal to start text above in the new session. Do
   not assume the old session budget resets. If it remains budget-limited, use the fresh
   session's budget and persist its plan before work.
2. Confirm `git status`, current HEAD and `node`, npm, RNW, MSBuild versions. Read only the
   files named in the plan/review scope; do not reopen secrets.
3. Put a short intent lock and at least five distinct attack vectors in the goal plan. Example
   vectors: measured live resize; layout/overflow static audit; per-screen screenshot review;
   interaction/accessibility keyboard sweep; bounded mocked-data stress; test contracts for
   flow/persistence; responsive integration test. Rank and keep fallbacks.
4. Keep the review subagents on NIM `stepfun-ai/step-5-preview`, rotating `nvidia`,
   `nvidia-r2` … `nvidia-r6`, no more than five per slot per rolling minute. One agent owns
   one bounded review/slice. Review prompts should be short and concrete, with exact files,
   line references, output format and no broad instructions to “fix everything.” Judges read
   the current tree only; do not self-judge. For screenshot judges, pass one image per tool
   call because multi-image calls caused errors/compaction.
5. Use this review sequence: (a) independent reviewers return findings; (b) reconcile evidence
   and remove false positives; (c) owner-authorized small fixes; (d) focused tests and live
   verification; (e) fresh judges on the updated screenshot/code; repeat until the acceptance
   bar is actually met.
6. After every slice run focused tests, `tsc`, lint and the strict slop checker. At integration
   run the full commands below, native build, one-process live smoke and screenshot audit.
7. No commits to parent `Z:\Projects\Dispatch AI`; feature commits inside `native` are allowed
   by the standing project instructions, but preserve unrelated changes and inspect staged
   paths before each commit.
8. Final report must include real final screenshots, all judge scores and mean, the load-bearing
   count, exact verification outputs, known deviations and any unmet requirements. Do not call
   it “perfect” by assertion: acceptance is evidence-based.

## Verification commands (run on the current tree)

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js --runInBand
node node_modules/eslint/bin/eslint.js src __tests__ App.tsx
node scripts/check-rn.mjs --strict
```

Native build (from `Z:\Projects\Dispatch AI\native`, use the already-proven command in the
latest `SHIP-REPORT.md` or `Z:\Projects\AGENTS.md`). End with a single live app instance for
the user's manual play-test; never use a shutdown command.

## Explicit known deviations and boundaries

- Runtime SVG via `react-native-svg` was tried and removed after Windows autolink failed on
  absent PowerShell 7 and the supplied project was UWP-flavoured. Do not claim the logo/icons
  are runtime SVG. Existing SVG assets are rasterised to PNG. Any future retry must first
  prove a compatible RNW path in a throwaway build before touching the app.
- The palette is indigo because the owner explicitly said they disliked the green and white.
  Don't revert to mint or white without asking.
- Do not add monetization, account/network features, analytics or unrelated product scope.
  Judge suggested missing features; those are review inputs, not automatic authorization.
- Current checker accepts certain deliberate accent rules with style-specific reasons; keep
  the reasons exact and truthful. Do not make broad file-level allowlists.
- The latest screenshots known at handoff are `ind2w1500-*`, which already show the indigo
  palette but predate some later interaction and review fixes. The next session must generate
  a new complete capture set from the current build before judging.

## Goal completion bar

Complete only when all acceptance criteria in the goal are met by current artifacts and
command output. In particular, the responsive claim requires live resizing across thresholds,
not just three fixed-size images; stability requires bounded stress evidence and a clean
post-test app process; visual quality requires the fresh final judge mean ≥9.5 with zero
load-bearing issues. If independent judges score lower, keep fixing and re-judging. If the
environment prevents reaching the bar, report the blocker honestly and leave the goal unmet,
not “perfect.”
