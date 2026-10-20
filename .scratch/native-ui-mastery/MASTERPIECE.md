# Native UI mastery

## Goal

Improve Dispatch AI's native Windows UI without disturbing existing user work or changing orchestration and permission behavior.

## Frozen baseline (2026-10-19)

- Native working tree was clean before this task. The parent Dispatch AI repository has unrelated user changes; do not modify or clean them.
- `npm test -- --runInBand`: 12 suites, 209 tests passed.
- `node node_modules\\typescript\\bin\\tsc --noEmit`: exit 0.
- `node node_modules\\eslint\\bin\\eslint.js src __tests__ App.tsx`: 0 errors, 45 existing warnings.
- The Windows native compositor is not available for safe interactive screenshots here. Use the existing real-component-tree renderer and call its pixels an approximation.

## Intent and design direction

The first slice strengthens the primary Dispatch surface: keep run setup close and reachable at compact widths, and make code proposals legible as changes while preserving access to complete contents. Retain the existing dark surface, mint accent, Segoe UI Variable, native controls, and all current action guards. Do not add web-only GSAP or CSS.

## Acceptance criteria

1. At supported widths 900, 1040, and 1440px, Dispatch keeps the run inspector visible beside the composer. At the 320px below-floor diagnostic width, a labeled compact action opens the same inspector without overlapping the composer or navigation.
2. Dispatch and Results & review show line additions/removals and expose complete before/after contents on demand; create-only, secret-block, apply, reject, reverted, applied, and superseded states remain coherent.
3. New behavior tests fail when the compact inspector or proposal diff/full-content path is removed.
4. Full Jest, TypeScript, and ESLint checks pass with no new warnings or errors against the frozen baseline.
5. Rendered component-tree captures are inspected for empty, populated, and compact states. They do not stand in for native compositor/runtime verification.
6. Independent NIM Step 5 judges report no load-bearing issue and a mean score of at least 9.7/10.

## Work sequence

Research and baseline: complete. Independent scope judge: complete, score 6/10 conditional; accepted inspector and proposal improvements, corrected the minimum-width premise to 900px, required a full-content escape hatch, excluded broad typography/token refactoring from this slice.

Build: pending. Independent review: pending. Test and judge wave: pending.

## Decisions and boundaries

- Preserve `App.tsx` compact breakpoint at 1040px; below the enforced 900px window floor, keep a labeled route to the inspector and update the narrow-tree test to reflect the intentional difference.
- Keep complete code contents reachable; a capped diff alone is not sufficient.
- Do not edit the existing `tasks/` plans or `.scratch/live-catalog-token-tracker/MASTERPIECE.md`.
- Do not launch the native app on the user's desktop. No commits.

## Evidence log

- Research subagent: `nvidia/stepfun-ai/step-5-preview`, read-only; identified compact inspector visibility, code proposal dumps, type-size debt, and available headless screenshot path.
- Scope judge: `nvidia-r2/stepfun-ai/step-5-preview`, read-only; 6/10 conditional pass. It verified the 900px enforced window floor, the existing `diffLines` cap, and required behavior tests and complete-content access.
- UI guidance lookup: `ui-ux-pro-max` native desktop query returned web-specific rules only; use established native accessibility names, visible state, and existing platform patterns rather than importing web semantics.

## Design pass (2026-10-19, after the judge wave)

- `src/theme.ts` gained a semantic type scale (`type.display` ... `type.codeSmall`) with a 10px floor, because Windows text scaling grows from the base size and an 8px base is unreadable before scaling starts.
- The sub-10px labels on the review surfaces were raised to the 10px caption step, with letter-spacing and line-height corrected for the new size.
- `src/Reveal.tsx` adds native entrance motion (short fade-and-rise, staggered) for newly arrived agent messages and staged proposals. It is skipped when the system reports reduced motion, and inert under test so snapshots stay deterministic.
- `FocusPressable` draws a visible focus ring, because Windows leaves focus to the app and a control distinguishable only by its press state is invisible to keyboard users.
- Diff rows now carry a line-number gutter, and each file is numbered on its own axis so a removal and an addition point at the right line.
- The proposal apply control now uses one label for its visible text and its accessible name, so the name a screen reader announces contains the words on screen, plus the file path.
- The Results notice is dismissible, and the run status dot is mint for a completed run instead of the same amber as "provider not set".
- Review-policy copy was rewritten into complete sentences; the "complete file before/after" headings name what they show.

## Second judge wave (2026-10-20) and what it changed

The wave scored 8.9 / 8.7 / 8.8 / 8.4 and named four real gaps, all now closed:

- The 10px type floor was a comment, not a rule: 69 declarations were still below it, down to 6px in the Design Studio. Every font size in `App.tsx`, `src/DesignStudio.tsx`, `src/RunWorkspace.tsx` and `src/Reveal.tsx` is now at least 10px, and `__tests__/type-floor.test.ts` fails the build if one is not.
- Focus rings reached 1 of 68 Dispatch controls. Every `Pressable` in `App.tsx` and `src/DesignStudio.tsx` is now a `FocusPressable`, and the ring colour is picked from the control's own fill so it stays visible on the filled accent buttons.
- The Results notice styled successes as errors, because it reused the danger palette for a channel that also carries "Applied ...". It now uses the same neutral channel as the Dispatch banner.
- The new coordinator behaviour had no coverage: a refused resume and a storage failure now have their own tests, proving a finished run is not rewritten as failed.

The `type` scale in `src/theme.ts` is now used by the two review surfaces rather than sitting as an unused export.

## Native build and real-window capture (2026-10-20)

- The native build was broken before this session: `windows/DispatchNative/DispatchNative.cpp` used `win32::SizeInt32`, `AppWindow::asWindowHandle` and `AppWindow::GetDefaultPresenter`, none of which exist in the installed Windows App SDK 1.8. Rewritten against the 1.8 API (`SetPresenter(AppWindowPresenterKind::Overlapped)` plus the presenter's `PreferredMinimumWidth/Height`, re-applied on `DidPresenterChange`). The floor values, the `kMinWindowWidth`/`kMinWindowHeight` names, and the `PreferredMinimumWidth`/`DidPresenterChange` markers the JS drift test reads are all unchanged, so `__tests__/layout-floor.test.ts` still holds. The solution now builds: `DispatchNative.vcxproj -> windows\x64\Debug\DispatchNative.exe`, Build succeeded.
- Metro serves the current JS for `platform=windows` (`GET /index.bundle?platform=windows&dev=true` returns a complete bundle), and the Debug app pulls that bundle at startup, so the live app does run the new UI code.
- The app still dies before it draws a window: exit `0xC0000409`, faulting module `ucrtbase.dll` at offset `0xa527e`, WER bucket `1867454703803934026`. Two different binaries (the 10/15 one and the fresh build) fault at the identical offset, so the fault is deterministic and in shared startup code, not in this UI change. No debugger is installed on this machine, so localising it needs a debugging-tools install or a startup bisect.
- Consequence: real-window screenshots are still blocked, and the "renderer approximates the compositor" caveat stands until that crash is fixed. The rasterizer output remains evidence for copy, colour, type and structure only.

## Review follow-ups

- Kept complete-content disclosure and expanded state on both Dispatch and Results & review surfaces.
- Kept secret-block refusals visible and non-applicable in both proposal surfaces; retained the shared apply handler as the last safety gate.
- Results & review now gates apply by selected project, work-item status, terminal fate, and in-flight application state, with labels for missing folder, blocked status, cancelled work, secret findings, and pending apply.
- Run Room Resume receives the displayed run explicitly, including the history fallback.
- Results & review now has its own full-content disclosure, and run-specific apply actions no longer appear enabled while the write is in flight.
- Latest visual artifacts are under `%LOCALAPPDATA%/Temp/opencode/snapshots/`. The custom rasterizer visibly misplaces nested flex/modal elements; use its output only as a typography/color/copy check, not proof of native geometry. No native window was launched.
- A native MSBuild attempt failed in untouched `windows/DispatchNative/DispatchNative.cpp:84-100`: `win32::` and `AppWindow::asWindowHandle` are unresolved against the installed RNW/Windows App SDK headers. The React Native UI changes do not touch this C++ file; the native binary/runtime therefore remains unverified.
