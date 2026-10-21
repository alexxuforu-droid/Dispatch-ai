# Dispatch AI native: the ship report

The app in `Z:\Projects\Dispatch AI\native` is a React Native Windows app whose interface was
redesigned under the oxfords rules, verified by execution, and judged by fresh agents.

---

## What changed, and where

### The token system

`src/theme.ts:1` holds every colour, size, radius and duration in the app. One neutral ladder
(page, surface, surface raised, surface active), one palette (mint as lead, with support and
pop roles), state colours that are always paired with a word, and a seven step type scale
(28/20/16/14/13/12/11) with nothing under 11px, because Windows text scaling runs to 2.25x.
121 raw hex literals became tokens and 146 sub-11px declarations were raised to the floor.

### The component set

`src/ui.tsx:1` holds the shared controls: Button, IconButton, Field, Toggle, Chip, Row,
Section, EmptyState, Toast, ToastSlot. Every one of them has a default, hover, focus,
pressed and disabled state, and every icon-only control has an accessible name.

### The screens

| Screen | File | What it is now |
|---|---|---|
| Shell | `App.tsx:279` | A grouped rail (Work, Team, Library) with a full-row fill on the current destination, a top bar that names the page, one toast slot, and a frame that measures itself, because the platform dimension never follows a resize. |
| Dispatch | `App.tsx:352` | One 760 measure, a 28px question, the preset shelf, the composer as the anchor. |
| Run thread | `App.tsx:352` | The agent name beside the avatar, findings marked by their word, no coloured edge bar. |
| Run setup | `App.tsx:300` | The inline inspector at 1040 and up and the modal below it, as the test contract requires. Its content is now the shared Section, EmptyState, Row and Toggle. |
| Results and review | `src/RunWorkspace.tsx:118` | The diff in a bordered block, the receipt as a figure strip, and one lead block: the decision row, on the change waiting for a person. |
| Teams, settings, workflows, capabilities, board, usage | `App.tsx:500` | The shared components, a page title that is a title, and one sentence plus one action on every empty surface. |
| Design studio | `src/DesignStudio.tsx:46` | The kicker, the numbered sections, the decorative grid and crosshairs, the dot beside a word and the card shadows are gone. |

### The icons and the mark

24 Tabler icons (MIT) are vendored as SVG sources in `assets/icons/svg`, rasterised in two
tones by `scripts/build-icons.mjs`, and `src/DispatchIcon.tsx:1` is generated from the asset
list so the two cannot drift. The brand mark is rendered on the page colour, so the brand
tile has no seam.

### The checker

`scripts/check-rn.mjs:1` runs oxfords' own checker and adds the React Native equivalents of
the same rules. It started at **290 failures and 32 warnings** and now reports **0 failures
and 5 warnings**, each with a one line reason:

- two status dots, which are the drag grip on a canvas card, not a dot beside a word;
- one letter-spaced label, a meta line that carries information;
- one lead block, the decision row, which is the one lead block on that screen;
- one lead text, the inverse button's label on the lead block.

---

## The debate

Three NIM agents (nvidia-r2, nvidia-r3, nvidia-r4, `stepfun-ai/step-5-preview`) argued the
plan: one for, one against with a steelman and cheaper options, one as the owner's
advocate. The changes that survived are in `DESIGN-PLAN.md` §0.1, the deviations in §0.2.

**The winner, in two lines:** the plan's own slop floor won over the plan's own chrome, so
the mint-button signature, the accent rail, the uppercase eyebrows and the tinted status
pills all went, and the colour that remains is on content: one lead block per screen, the
decision row. The navigation collapsed less than the plan wanted (six groups, not five
items) because the tested run-setup contract and the 900px floor both push back.

---

## The judge wave

| Round | Judge | Model | Score | Load-bearing issues found |
|---|---|---|---|---|
| 1 | code | nvidia-r3 / stepfun-ai/step-5-preview | 6.5 | 6 |
| 1 | test | nvidia-r6 / stepfun-ai/step-5-preview | 6.0 | 6 |
| 1 | visual | nvidia, nvidia-r2, nvidia-r5 | not scored | the slot returned an internal error four times on the screenshot brief |
| 2 | code | nvidia-r3 / stepfun-ai/step-5-preview | 7.5 | 1 load-bearing, 6 cleanups |
| 2 | test | nvidia-r6 / stepfun-ai/step-5-preview | 8.0 | 5 |
| 2 | code | nvidia-r3 / stepfun-ai/step-5-preview | see below | see below |
| 2 | visual | see below | see below | see below |

Every round is reported. The builder never judged its own work.

**What round 1 changed.** All six of the code judge's findings are fixed at the source
(`a06d010`): the invisible toast, the primary button that turned black on hover, the
selected preset that filled with a string, the backdrop hex outside the token file, the
ghost button on the lead block, and the focus ring that vanished on a white button. The
two guardrails that let them through were widened, a rule against a colour written as a
string was added to both the checker and the test, and the contrast pairs the interface
actually uses are now held by a test.

**What round 2 changed.** The test judge's two honest findings were that the undo and the
open-run tests stopped at a `jest.fn()` boundary, and that the destructive handlers were
never driven. Both are now driven: `__tests__/applyUndo.test.tsx` applies a proposal
through the app's own handler, checks the file in the project, presses the undo in the
notice, and checks the file again. The start control's gate and the run history's
navigation are held as well.

The code judge confirmed that five of its six findings were fixed at the source, with the
contrast ratios recomputed from the token file, and found the sixth only half fixed: a
borderless control that was also selected painted its focus ring in the same fill as its
selection, so a keyboard user saw nothing on the current rail item or team tab. That is
fixed by giving those controls a transparent border for the ring to recolour. The same
round's other findings are fixed too: the icon button says its word on hover, the two font
sizes that sat off the scale are on it, the forty-eight radii that were not on it moved
onto it, and the scale is now held by a test that reads the screens' styles, not only the
token file.

The test judge also said that the claim "it persists and reads back on this machine"
cannot be proven from jest, because AsyncStorage is an in-memory map there and the native
module is absent. That is true and is reported as such: the persistence claim is proven by
the running app on this machine, not by the test suite.

---

## The commits

Everything below is in the app's own repository, `Z:\Projects\Dispatch AI\native`, and nothing
was committed to the parent repository.

| Commit | What it did |
|---|---|
| `a06d010` | The six defects the code judge found, the widened guardrails, and the three flow tests. |
| `53df805` | The invisible layer: relative time with the exact time on hover, and the undo in the notice that reports a change to the project. |
| `1dc40bf` | The design studio lays itself out from the measured width instead of the platform dimension, and its starting point presets wrap. |
| `ba13707` | The apply and undo round trip through the app's own handlers, plus the start gate and the run history navigation. |
| `ac4939f` | Every warning the slop checker leaves says why it is allowed. |
| `7136c70` | The page headings say what the page holds. |
| `bd329e1` | The page shrinks so the run setup panel stays on screen at 1240 and 900. |
| `7a11773` | The code judge's second round: the focus ring on a control that is also selected, the word on the icon button, the scale held in the screens' styles, and the forty-eight radii that were not on it. |

---

## Verification, by execution

```
node node_modules/typescript/bin/tsc --noEmit      clean
node node_modules/jest/bin/jest.js --runInBand     269 passed, 17 suites
node node_modules/eslint/bin/eslint.js src __tests__ App.tsx   0 errors, 38 warnings (frozen baseline 45)
node scripts/check-rn.mjs                          0 fail, 5 warn, each with its reason
```

The native shell builds:

```
cmd /c 'call Z:\BuildTools18\VC\Auxiliary\Build\vcvars64.bat && Z:\BuildTools18\MSBuild\Current\Bin\MSBuild.exe "Z:\Projects\Dispatch AI\native\windows\DispatchNative.sln" /restore /m:1 /nodeReuse:false /p:CL_MPCount=1 /p:Configuration=Debug /p:Platform=x64 /p:WindowsTargetPlatformVersion=10.0.26100.0 /p:TargetPlatformVersion=10.0.26100.0 /p:RunCodegenWindows=false /p:RunAutolinkCheck=false /p:PlatformToolset=v145'
```

Result: `Build succeeded. 0 Error(s)`, with only the two known MSB4011 import warnings that the
React Native Windows property sheets always print.

Screenshots of every screen, taken from the running app, at 900, 1240 and 1500 pixels:
`C:\Users\Admin\AppData\Local\Temp\opencode\snapshots\judge\`.

The rule "the chrome is neutral, the colour is content" is measured, not asserted.
`scripts/measure-colour.ps1` in the plan folder counts the pixels of every capture:

```
r3w1500-dispatch.png   neutral 95.9%  light 4.0%  colour 0.1%
r3w1500-results.png    neutral 96.0%  light 3.9%  colour 0.1%
r3w1500-settings.png   neutral 95.6%  light 4.3%  colour 0.1%
```

Ninety six per cent of every screen is the neutral ladder. The mint that is left is the
lead block and the focus ring, which is the whole point of the rule.

---

## Residual risks

1. `react-native-svg` is not used, and cannot be on this machine. The Windows autolink
   needs PowerShell 7, which is absent, and the shipped project is UWP flavoured, the known
   failure mode with React Native Windows 0.79 and later. The icons are rasterised from
   their SVG sources instead, which is what the screenshots show. The plan records this as
   a deviation.
2. The native boundary is not reachable from the JavaScript suite. The folder picker, the
   credential locker, the file edits and the window floor are proven by the running app and
   by reading the native source, not by a test.
3. The plan's invisible layer is four of its seven lines. Built: a run row says how long ago
   it was and the exact time arrives on hover; the notice that reports a change to your own
   project carries the undo; a member leaves the team from the team card without opening
   the editor; and the agent cards already carry their avatar, rank, memory and tool
   permissions. Not built, because each needs product behaviour this app does not have: a
   run has no name to rename and the run store has no delete, so there is no run row menu;
   copying a path needs a clipboard package this project does not depend on, so the
   proposal card has no copy actions; and sorting and filtering the collections is a
   feature, not a design change.
4. The Design studio is reached by clicking its rail item, which the test suite now does
   (so the path is covered by a test), and the rail item is in the right place on screen. The
   screenshot harness needed its click offset corrected twice before every capture landed on
   the screen it was named for; the captures in the folder are the corrected set.
