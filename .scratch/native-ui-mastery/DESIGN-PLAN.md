# Dispatch AI native: the design

Design method: **oxfords** (installed from `arhamhi/oxfords@oxfords`). Oxfords decides what
goes on a screen, where, how visible, how it responds, and what must not be there. It does
not pick a brand, so the Dispatch logo keeps owning the colour, and oxfords decides the
roles that colour plays.

Slop checker: `node scripts/check-rn.mjs` (in the app repo) runs oxfords' own checker and
adds the React Native equivalents of the same rules, because the oxfords checker is
written for web CSS and reads a React Native stylesheet almost blind.

Current state of the app against the checker: **290 fail, 32 warn**. That number is the
work list. It goes to zero.

Status: proposed, not started. Evidence is real screenshots of the running app.

---

## 0.1 Amendment log (after debate round 1)

Three NIM agents argued the plan: one for, one against, one as the owner's advocate. The
changes below are what survived. Each one names the evidence that forced it.

| Plan said | Now | Why |
|---|---|---|
| sidebar 240px, labelled down to the 900 floor | sidebar stays 228px, compact stays 68px, groups added, labels at 1040 and up | The floor leaves 672px of content; a 240px rail starves it. The existing width is fine, the labelling is the fix. |
| thirteen destinations become five | six top level: Dispatch, Runs, Results, Teams, Studio, Settings, with the rest as tabs inside the page that owns them | Both debaters agreed on grouping and disagreed only on how far to collapse. The grouping keeps every destination one click away. |
| run setup becomes a modal everywhere | the inline inspector stays at 1040 and up, the modal stays below it | `__tests__/snapshot.tree.test.tsx` pins the inline inspector at the floor with a stated reason. The container is a tested contract; the content inside it is what gets redesigned. |
| the composer is the mint lead block | decided by screenshot, not by argument | One debater called a mint composer the highest cost and lowest evidence part of the plan; the other wanted colour on content. Both screenshots get built and the squint test decides. |
| type scale 12 to 28 | 11 to 28, and every 10px literal in the app raised to 11 | The floor is 11 because Windows text scaling runs to 2.25x. 146 declarations sat below it. |
| the primary button is white | white fill with near-black ink, declared as a pair | A white button without its own ink is a grey button on a grey page. |
| lead colour used on one block per screen | lead is the focus ring, the active indicator, and one content block per screen | "Lead on every screen" is the rule that produced twenty-one mint buttons. The usage set is now closed and the checker enforces it. |

Two defects the debate found in the plan's own inventory, now corrected: the app had 146
ten-pixel declarations, not 134, and the checker reported 267 failures, not 290. Both
numbers are measured, not estimated.

### 0.2 Deviations from this plan, and why

| Plan said | Shipped | Reason |
|---|---|---|
| install react-native-svg and render the logo and icons as vectors at runtime | the icons are rasterised from their SVG source at build time and tinted by tone | React Native Windows cannot autolink the library here: the Windows autolink needs PowerShell 7, which this machine does not have, and the shipped project is UWP flavoured, which is the known failure mode with React Native Windows 0.79 and later. The visible result is the same: real vector shapes, one family, one weight. The brand mark stays a raster of the same SVG source, now rendered on the page colour. |
| the composer is the mint lead block | decided by screenshot, in the Dispatch phase | One debater called it the highest cost and lowest evidence part of the plan. Both readings get built and the squint test picks. |
| the run setup becomes a modal | the panel stays at 1040 and up, the modal below it | The test contract pins it, with a stated reason: the window floor shows the panel. The panel's content is redesigned; its container is not. |
| a labelled sidebar down to the 900 floor | the rail keeps its 228 and 68 widths, gains groups and a full row fill | At the floor a wider rail starves the page, and the change the owner can see is the grouping and the labels, not the width. |
| the results surface uses tabs | one page, with sections | A tab would hide the decision behind a click, which is the one thing the screen exists for. |
| one radius per tier and one spacing scale, everywhere | the radius scale holds everywhere, including the design studio; the studio's own spacing values (1, 2, 3, 5, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19) do not | The studio was built before the token system and its canvas is laid out in its own increments. Rounding every one of them to a multiple of four moves the canvas, and the canvas is the one screen where a moved control is a broken tool. The corners were moved onto the scale, because a corner is a corner, and the spacing is left as it is and recorded here. |

---

## 0.4 Amendment log (after the judge wave)

The judge wave is part of the method, not a report card bolted on at the end. Each round's
findings changed the work, and the change is recorded here the same way the debate's are.

| Round | Judge | What it found | What changed because of it |
|---|---|---|---|
| 1 | code | Six load-bearing defects: an invisible toast, a primary button that turned black on hover, a selected preset that filled with a string, a backdrop hex outside the token file, a ghost button on the lead block at 1.7:1, and a focus ring that vanished on a white button and on the lead block | All six fixed at the source in `a06d010`. The two guardrails that let them through were widened to 3, 4, 6 and 8 digit hex values, a rule against a colour written as a string was added to both the checker and the test, and the contrast pairs the interface actually uses are now held by a test. |
| 1 | test | Three flows nothing in the suite ever pressed: start a run, undo an applied change, open a run from the history. No test at all for the persistence layer | All three are pressed now (`__tests__/App.render.test.tsx`), the persistence layer has a test (`__tests__/workspaceProject.test.ts`), and a rail destination is pressed too, so a dead navigation item fails a test. |
| 1 | visual | The slot returned an internal error four times on the screenshot brief | The wave was re-run on other slots and the captures were taken again; no finding from that round is claimed. |
| 2 | test | The two flow tests stopped at a `jest.fn()` boundary, so the destructive handlers were never driven | `__tests__/applyUndo.test.tsx` now applies a proposal through the app's own handler, reads the file in the project, presses the undo in the notice, and reads the file again. The start control's gate and the run history's navigation are held too. |
| 2 | code and visual | See the ship report | |

Two rules the code judge's round made permanent, because both are things a person cannot
check by eye:

- A colour is either the token or it is a bug. A token name in quotes renders as no colour
  at all, and the app looked fine in a test.
- The contrast floors that matter are the ones on the surfaces the app actually uses. The
  toast title on the raised surface and the focus ring on a white button were both below
  1.4:1 and neither had a test.

---

## 0.3 Sign off checklist

Written for the owner, checkable from a screenshot or one click:

1. On Dispatch at full window size, the first thing your eye lands on is the box where you
   type the task.
2. Count the green on Dispatch: one block, the task box, and nothing else.
3. Every button looks like one of three friends: white, dark grey, or outline. "Start run" is
   the white one.
4. The task box, the preset cards and the starter prompts all begin at the same left edge.
5. The strip that sat on top of the task box is gone; messages appear bottom right.
6. The sidebar shows grouped items, the mark at the top, and no little dots.
7. The mark stays sharp at any window size.
8. Every icon comes from the same set: same thickness, same corners.
9. On Settings the endpoint and model boxes sit side by side, and "Save and test" is not
   green.
10. Every screen with nothing in it says one sentence and gives exactly one button.
11. Give it one real run: the single green block on Results is the approve decision.
12. Narrow the window to its floor and back: nothing runs off the right edge.

---

## 0. Evidence

Screens captured from the running app at 1500x1000 with
`.scratch/native-ui-mastery/click-capture.ps1`:

| File | Screen | What it shows |
|---|---|---|
| `x-dispatch.png` | Dispatch | content floating in the middle of a wide pane, preset text clipped, a notice sitting on top of the content |
| `x-design.png` | Design studio | six full-height empty columns where a filmstrip belongs |
| `x-results.png` | Results | a heading and 900px of nothing |
| `x-teams.png` | Teams | a dashed empty box on 60% empty page |
| `x-agents.png` | Agents | |
| `x-plugins.png` | Plugins | |
| `s-settings.png` | Settings | a 760px column in a 1500px window, a tall stack of full-width inputs |

Oxfords' four tests against the current Dispatch screen:

- **Squint.** The mint "Start run" button lands first, then the headline. The right thing
  to land first is the task composer, because that is what the person came to use.
- **Subtract.** Remove the eyebrow, the 4px nav dot, the status pips, the account circle,
  the "SET" tag, the output chips and the mint on every button. Nothing gets worse. All
  of it goes.
- **Swap.** Put another agent tool's logo on it and it still fits. The content is generic.
- **Defend.** Most values cannot be defended today. The 43px hero, the 10px caps labels,
  the four near-black surfaces and the mint buttons are all defaults.

---

## 1. Intent

Dispatch is a work tool for someone coordinating a team of agents. They arrive with one
question: **what should the team do next, and what did it produce?**

Two jobs, and only two:

1. **Start work.** Say what should happen, pick the team, start the run.
2. **Review what came back.** Read the plan, inspect code proposals, approve or reject.

Everything else in the app (plugins, workflows, usage, hierarchy) is reference or
configuration. It must be reachable in one step from where the work happens, and it must
never compete with the two jobs above.

The control that does the job comes first: the composer on Dispatch, the decision row on
Results.

---

## 2. Content first

Every label in the app, written before any layout. Oxfords rule: one surface does one job,
and the copy is the plain sentence a colleague would say.

**Navigation (5 items plus settings at the bottom)**

| Item | Goes to |
|---|---|
| Dispatch | compose and start a run |
| Runs | past runs, their plans, reviews and proposals (tabs inside) |
| Team | teams and agents (tabs inside) |
| Studio | the design canvas |
| Templates | saved workflows and capabilities (tabs inside) |
| Settings | provider, project, review policy, usage (tabs inside) |

Thirteen sidebar items become five. The rest become tabs inside the page that owns them,
which is where oxfords puts views that belong to one subject.

**Dispatch screen**

- Title: "Dispatch"
- Headline (the one hero figure in the app): "What should the team do?"
- Body: "Say what should happen. The team plans it, does it, and hands the result back to
  you for review."
- Primary action: "Start run" (neutral button, not mint, because chrome stays neutral)
- Composer placeholder: "Describe the work."
- Composer hint: "Enter to run, Shift + Enter for a new line"
- Run setup summary line: "No team selected. Reviews off." with a "Run setup" control
- Mission presets (6): Polish a screen, Investigate a bug, Build a feature, Explore visual
  directions, Review code, Polish a 3D render. Each with one line of what it produces and
  a plain label for what it needs.
- Starter prompts (3): Plan a project, Review a change, Make an image concept

**Run thread**

- "Team plan" (title)
- Step rows: number, title, agent, model, state
- Decision row: "Review before work starts" plus "Approve plan and start"
- Agent messages: agent name, kind, body

**Results and review**

- "Runs" (title), "Review" (tab), "Proposals" (tab), "Images" (tab)
- Proposal card: file path, state, summary, diff, one action ("Apply to project")

**Empty states** (one sentence and the one action that fills it)

| Screen | Sentence | Action |
|---|---|---|
| Runs | "No runs yet. A run keeps its plan, its handoffs and its review together." | Start a run |
| Proposals | "No code proposals yet." | Start a run |
| Images | "No images yet." | Start a run |
| Team, teams | "No teams yet. A team is a set of agents with a chain of review." | Create a team |
| Team, agents | "No agents yet. A planner writes the plan, a builder does the work, a reviewer checks it." | Add an agent |
| Templates, workflows | "No saved workflows yet." | Save this run as a workflow |
| Templates, capabilities | "All capabilities are off." | (no action, this is a setting) |
| Studio | "No reference image. Drop one here or browse for a file." | Browse for a file |
| Settings, usage | "No provider calls recorded yet." | (none, it fills itself) |

---

## 3. Layout on edges

Oxfords: everything locks to an edge and creates the edge for the next. Fill empty space
by moving content onto edges, not by adding content.

### 3.1 The frame

One frame for every screen. The current app has four different content caps (690, 750,
760, 940) each centred on its own, which is why nothing lines up.

- Sidebar 240 wide, fixed. `240 + 24 + content` leaves the page itself.
- Page padding 24 left and right, 20 top, 32 bottom.
- Content area: full width of the page, no cap. The app has real wide content (diff
  blocks, tables, image galleries) and a cap throws it away. Where a block must not run
  full width (a form, a prose block, the composer), it takes a measure of 720 and sits on
  the left edge, not centred.
- Four left edges in the app, no more: sidebar edge, page edge, measure edge, and the
  gutter inside a card.

### 3.2 Shell

- **Sidebar**: neutral, 240 wide, groups in relevance order. Workspace name at the top
  with the logo. "New run" sits at the top as a neutral button (it starts the work, but it
  is chrome, so it stays neutral and the composer owns the real primary action).
  Items are an icon plus a short label, grouped: **Work** (Dispatch, Runs, Team, Studio,
  Templates) and **Workspace** (Settings) at the bottom.
- **Active item**: a full-row fill behind it, no coloured edge bar (the slop floor bans
  the edge bar, and the current app has both the bar and a 4px dot).
- **Top bar**: 56 high, holds the page title and the page's one primary action on the
  right, plus the provider state as a word. No breadcrumb: the sidebar already says where
  the user is, and "Dispatch AI / Dispatch" is the app's name twice.
- **Account**: a row with the workspace name and a chevron that opens a menu. The current
  initial-in-a-circle avatar is on the slop floor.
- **Toasts**: one slot, bottom right, for results of actions, errors and undo. The current
  notice banner sits on top of the content in the composer, which is neither a toast nor
  an inline message.

### 3.3 Breakpoints

The window floor is 900 (native floor, asserted by `__tests__/layout-floor.test.ts`).

| Width | Layout |
|---|---|
| 900 to 1039 | One column. The run setup opens as a modal. Sidebar keeps labels down to 900. |
| 1040 to 1439 | Two columns where the content needs them (results list plus review). |
| 1440 and up | Three columns for card grids and galleries. |

No horizontal scrolling at any width. Text truncates with an ellipsis and the full value
is available on hover and focus.

---

## 4. Colour

The Dispatch logo owns mint. Oxfords decides what it is for.

**Neutrals do 75 to 85 percent of the screen.**

| Token | Value | Use |
|---|---|---|
| `page` | `#0A0B0C` | app background |
| `surface` | `#141516` | panels, cards, the composer |
| `surfaceRaised` | `#1C1E20` | inputs, hovered rows, menus |
| `surfaceActive` | `#26292B` | selected row, selected tab |
| `line` | `#2A2D2F` | hairline between rows and sections |
| `lineStrong` | `#6B7074` | input border (3:1 against the input fill) |
| `text` | `#F5F5F5` | primary text |
| `textQuiet` | `#A3A3A3` | secondary text |
| `textMuted` | `#7E8287` | metadata, placeholders |

Surfaces get lighter as they rise and no shadow is used anywhere.

**Palette (the brand mint, given oxfords roles)**

| Role | Value | Job | Share |
|---|---|---|---|
| Lead | `#9AE2D2` | one solid block of content per screen, and the key figure | 10 to 15 percent |
| Support | `#1F3B35` | a second block, or a second series | 5 to 10 percent |
| Pop | `#E4FBF4` | one small mark: the badge that needs attention | 1 to 3 percent |

Written reason: "The Dispatch mark is mint, so mint is the lead; the app is a dark
desktop tool, so the mint lands on content, never on chrome."

Where the lead goes, once per screen:

- **Dispatch**: the composer. The composer is the surface the person came for, so it
  carries the one lead block: mint fill with near-black text, 12px radius, the input
  inside it in the same near-black. This is the single largest area of colour in the app
  and it is on the thing that matters.
- **Results**: the decision row for a proposal that needs a human. Mint fill, near-black
  text, one action.
- **Runs**: the key figure (tokens spent, plans complete) in the ruled strip.
- **Team**: nothing. It is reference material, so it stays neutral.

**State colours stay separate from the palette, each paired with a word.**

| State | Colour | Word |
|---|---|---|
| attention | `#E9BD79` | "Needs review" |
| critical | `#F49090` | "Failed" |
| neutral | `#7E8287` | "Blocked", "Cancelled" |

**Rules that replace what the app does now**

- Buttons, tabs, inputs, the sidebar and the top bar are neutral. The primary button is
  white (`#F5F5F5` fill, `#0A0B0C` text), not mint. The current app has four mint
  controls; none of them survives.
- The lead colour is never small text. Today the eyebrow, the preset meta, the link text
  and the section label are all mint at 10 or 11px.
- Chips are quiet by default: plain text or a neutral outline. Only a state that needs
  attention gets a tint, and only one per screen.
- One palette, three roles, each doing one job.

---

## 5. Type

The system stack is the right answer on Windows. Segoe UI Variable for the interface,
Cascadia Code for figures, paths, identifiers and diffs. Two families, each with a job.

| Token | Size/Line | Weight | Use |
|---|---|---|---|
| `hero` | 28/34 | 600 | the one figure outside the scale, on Dispatch only |
| `title` | 20/26 | 600 | page title |
| `section` | 16/22 | 600 | section title, card title |
| `body` | 14/20 | 400 | default text |
| `bodySmall` | 13/18 | 400 | secondary text, table cells |
| `label` | 12/16 | 600 | field label, button label, table header |
| `meta` | 11/15 | 500 | metadata, timestamps, paths |

- Nothing under 11px, anywhere, including diff gutters. The current app has 10px in
  134 places.
- Body leading 1.43, display leading 1.2, tracking -2 percent on the hero only.
- Monospace for every number a person compares: token counts, times, file paths, step
  numbers, diff line numbers. Right-aligned in tables.
- No display face on labels, buttons or data. Segoe UI Variable Display is used for the
  hero and the page title only.

---

## 6. Components

One set, in `src/ui.tsx`. Every screen uses these and nothing else.

**Button**

| Variant | Fill | Text | Border | Height | Radius |
|---|---|---|---|---|---|
| primary | `#F5F5F5` | `#0A0B0C` | none | 36 | 8 |
| secondary | `#1C1E20` | `#F5F5F5` | `#2A2D2F` | 36 | 8 |
| ghost | transparent | `#A3A3A3` | none | 36 | 8 |
| critical | transparent | `#F49090` | `#4A2A2A` | 36 | 8 |

One primary per screen region. Horizontal padding 14, label 12/16 weight 600, icon 16
with a 8px gap. Disabled keeps the shape and says why next to it. Pressed is opacity
0.82. Focus is a 2px ring in `#9AE2D2` at 2px offset, drawn as a ring.

**Input**: height 36, radius 8, fill `#1C1E20`, border `#6B7074`, label above in `label`
size, error below the field saying how to fix it, the value kept after an error.

**Toggle**: track 36x20, thumb 16, off `#26292B`, on `#F5F5F5`. The current switch is a
second green (`#5E9D8D`) that matches nothing else in the app.

**Chip**: quiet. 11/15 in `#A3A3A3`, neutral outline or no fill. A state that needs
attention gets the attention colour and a word.

**Row**: height 36, hairline below, text left, value right in monospace with tabular
figures, one visible action per row. Never a line and a fill and a border together.

**Section**: title 16/22, optional supporting line 13/18, optional action on the right,
one hairline under it. No uppercase label above it (the slop floor bans the eyebrow).

**Empty state**: 40px icon, title 16/22, one sentence 13/18, one action.

**Toast**: bottom right, 360 wide, radius 8, fill `#1C1E20`, border `#2A2D2F`, title
13/18, one action where undo exists. Replaces the banner that sits on the content now.

**Icons**: one set, one weight, 16 and 18 and 20 sizes, stroke matched to the text.
Vendored SVG, not drawn.

---

## 7. Iconography and the logo

**Why the logo is a PNG today.** `assets/dispatch-mark.svg` is the source of truth:
8.6KB, `viewBox 0 0 256 256`. `scripts/render-logo.mjs` rasterises it with
`@resvg/resvg-js` into `assets/dispatch-mark.png` (768x768, 116KB) and `App.tsx:296`
loads the bitmap. The 199 agent marks are the same trick, 1.17MB of PNG.

The reason is that React Native and React Native Windows have no SVG renderer. The fix is
`react-native-svg@15.16.0`, whose published package ships a Windows implementation
(`windows/RNSVG.sln`, `windows/RNSVG/`), so it autolinks into this app the way
`@react-native-async-storage/async-storage` already does.

With it:

1. The logo renders from the real SVG file, tinted with `currentColor`, so it can follow
   the active or disabled state.
2. The 199 avatar PNGs and the logo PNG are deleted. The SVG source is the asset.
3. `src/DispatchIcon.tsx` is deleted. It builds every glyph from `View` rectangles, which
   is why the controls look cheap: the play icon is a CSS triangle, the sliders icon is
   three bars with square knobs.
4. Icons come from one existing set, vendored as SVG source and rendered with
   `react-native-svg`'s `SvgXml`, so no extra build step is needed. Tabler Icons (MIT) or
   Phosphor (MIT), one family, one stroke weight. The skill is explicit: do not invent
   icon shapes, use the set.

Icons needed: dispatch, team, runs, review, artifact, template, settings, plus, send,
close, check, search, folder, file, chevron, warning, shield, play, stop.

---

## 8. The screens

### 8.1 Dispatch

- Sidebar, top bar with the title "Dispatch" and no primary action (the composer has it).
- Page: the hero (28/34), one body line (14/20, measure 720).
- Mission presets: a 3-column grid at 1440, 2 at 1040, 1 below. Card: radius 12, border
  `line`, fill `surface`, padding 16. Title 13/18 weight 600, one line 12/17, and a quiet
  meta line 11/15 saying what the preset needs. The current cards clip their text; they
  wrap to two lines with an ellipsis on the third, and the full text is on hover.
- Starter prompts: three chips on one line, neutral outline.
- Composer: the one lead block. Mint fill, near-black text, radius 12, padding 16, input
  14/21 in near-black on the mint? No: the input sits on a near-black field inside the
  mint block, so the text is `#F5F5F5` on `#0A0B0C`. Row of controls at the bottom:
  "Browse files" ghost on the left, the keyboard hint in the middle, "Start run" primary
  on the right.
- Run setup: no side panel. One line under the composer with the current setup and a
  "Run setup" control that opens a modal: two columns of fields, advanced options
  collapsed, one action "Save setup". A modal is used because the setup is complex and
  belongs to the page behind it, and it is followed by a toast.
- Provider not set: one inline line under the composer, in the attention colour with the
  word "Provider not set" and a link to Settings. Not a banner over the page.

### 8.2 Runs

- Title "Runs", with a segmented control for List and Board.
- List: a row per run. Left: the brief, 13/18, one line, ellipsis. Right: the state chip
  and the updated time in monospace. One action per row: open.
- Board: four columns (Ready, Working, Blocked, Done), each 280 wide, cards radius 8,
  title 13/18, owner avatar 20, dependencies in meta.
- Run detail (a run opens in place, not on a new page): the plan, the thread, the
  proposals and the images as tabs. Oxfords: tabs add views without growing the shell.

### 8.3 Results and review

This is the surface the product earns its keep on, so it gets the width.

- Two columns: a runs list 300 wide on the left, the selected run's review on the right.
  At 1040 the list collapses into a select.
- The run review is tabs: Plan, Proposals, Images, Notes.
- A proposal card: the path in Cascadia Code 12/17, the state chip, the summary, then the
  diff in a bordered block with a 1px gutter column and monospace line numbers. The
  current diff rows have no container.
- The decision row is the one lead block on this screen: mint fill, near-black text, one
  action "Apply to project", and "Undo" as a ghost where it applies.
- "Show complete contents" is a ghost button that expands the block in place.
- No runs: the empty state from the table in section 2, with "Start a run".

### 8.4 Team

- Title "Team", tabs: Teams, Agents.
- Teams tab: a 2-column grid of team cards. Card: title 16/22, member avatars 24 in a row
  with names in meta, state chip, one action.
- Agents tab: a 3-column grid of agent cards. Avatar 40, name 13/18 weight 600, rank and
  model in meta, then the permission toggles.
- The current "CHANGE AVATAR" caps label under every avatar becomes a small ghost icon
  button on hover and focus, always reachable by keyboard.

### 8.5 Studio

- Title "Studio".
- Left: the canvas, the reference image at its natural ratio inside a 1px border with a
  12px radius, centred in the area with empty space around it.
- Right: a 320 panel with the callout list, the note composer and "Send to agent chat".
- The frame history is a horizontal filmstrip of 120x80 thumbnails at the top of the
  canvas, scrollable, selected frame outlined in `lineStrong`. The current screen is six
  full-height empty columns.

### 8.6 Templates

- Title "Templates", tabs: Workflows, Capabilities.
- Workflows: the same card component as the mission presets, so the app reads as one
  system. An editor opens as a modal with two columns.
- Capabilities: a list of the four capabilities, one row each, name, what it does, and a
  toggle on the right. Not a grid of cards, because a capability is a setting, not an
  object.

### 8.7 Settings

- Title "Settings", tabs: Provider, Project, Review, Usage.
- Provider: two-column field grid at 1240 (endpoint and model side by side), API key full
  width, then a status row with a word, then "Save and test" primary and "Remove key"
  critical ghost.
- Project: the folder picker, the file list, the preview. A file list is a list, not a
  table of boxes.
- Review: the review policy toggles, the checkpoint choice as a segmented control, the
  concurrency cap as a segmented control (not nine chips).
- Usage: the figures strip. At most four figures, in one ruled strip, each with a
  comparison. Exact and estimated counts stay separate, and the estimated ones keep their
  tilde. Then a table of calls: model, agent, time, tokens. Numbers right-aligned in
  monospace.

---

## 9. The invisible layer

Oxfords: a finished product has as much interface hidden as visible. Listed before it is
built.

| Surface | Hidden layer |
|---|---|
| Run rows | row menu (rename, duplicate, delete), relative time with the absolute value on hover |
| Proposal card | copy path, copy diff, open in editor |
| Agent cards | change avatar, edit memory, set rank |
| File list | file actions on hover |
| Tables | sort and filter, column widths remembered |
| Team chips | remove a member without opening the editor |
| Toast | undo for every destructive action |

Every one of these is reachable by keyboard and has a visible equivalent on touch.

---

## 10. Done gate

Oxfords requires an answer for every line, per screen.

**Buttons**: default, hover, focus-visible, pressed, disabled with the reason beside it.
Loading only where the person waits (the run start). **Inputs**: label above, focus ring,
error below that says how to fix it, value kept. **Every action**: a response within
100ms where the person is looking, or a toast with undo. **Destructive**: undo where
possible, otherwise a confirm that names the object and labels the button with the
action. **Icon-only**: accessible name and tooltip, and a text label for anything not
universally known. **Empty**: first run with one sentence and one action, and no results
that quote what was searched. **Loading and failure**: a skeleton shaped like the result
after 300ms, an error that says what failed and how to recover. **Messy content**: long
names truncate with the full value available, 0, 1 and 10,000 rows all work, a missing
image has a fallback. **Tables**: search, filter or sort, numbers right-aligned, one
primary action per row. **Navigation**: current location shown as a full-row fill, items
named for their contents, grouped, rare items last, five top-level items. **Keyboard**:
everything reachable by Tab with a visible focus ring, Esc closes overlays, text 4.5:1,
icons and focus rings 3:1, state never by colour alone. **Touch**: 24px floor on desktop,
44px for anything used with a finger. **Motion**: feedback under 250ms, never blocking, a
reduced-motion version that keeps the feedback. **Colour**: neutral base covering most of
the screen, a named palette with a reason, all three colours used, each for one job.
**Consistency**: one type family, one palette, one icon set at one weight, one radius per
tier. **Slop floor**: the checker passes, or every warning has a one line reason.

---

## 11. Slop floor work list

From `node scripts/check-rn.mjs` on the current tree: 290 fail, 32 warn.

| Rule | Count | Fix |
|---|---|---|
| text under 11px | 148 | the type scale in section 5. The diff gutter moves to 11px too. |
| raw hex outside `src/theme.ts` | 121 | every literal becomes a token. The token file is the only place a colour is written. |
| eyebrow, letter-spaced label | 23 | the eyebrow goes. Section titles carry themselves. |
| lead colour fills a control | 21 | mint stops filling buttons, chips and pills. It becomes one block per screen. |
| status dot | 9 | the word is the signal. The dot goes. |
| drawn icon | 1 file | `src/DispatchIcon.tsx` is deleted and replaced with a vendored set. |
| em dash in copy | 3 | fixed in this pass (`App.tsx`, `src/DesignStudio.tsx`, `src/RunWorkspace.tsx`). |
| buzzword, vague button, emoji | 0 | nothing to do. |

Two more rules the checker cannot see, found by looking:

- A side panel holding three fields (the Run setup inspector). It becomes a modal.
- The same figures repeated on several pages. Usage figures appear once, in Settings.

---

## 12. Sequencing

Each phase ends with the app running, the tests green, the checker count down, and a
fresh screenshot set.

**Phase 0. Harness.** Done. Real screenshots, reproducible with `click-capture.ps1`.
The oxfords checker and the React Native wrapper are in place.

**Phase 1. Foundations.** `src/theme.ts` rewritten with the neutral ladder, the palette
roles, the type scale and the radius scale. `src/ui.tsx` with Button, IconButton, Input,
Toggle, Chip, Row, Section, EmptyState, Toast. Tests: contrast for every token pair, the
type scale conformance, no raw hex outside the token file, the radius scale.

**Phase 2. Vectors.** `react-native-svg` installed and built. The logo renders from SVG.
The icon set is vendored and `src/DispatchIcon.tsx` is deleted. The PNGs are deleted.

**Phase 3. Shell.** Sidebar with five items and groups, top bar with the page title and
its one action, the content frame, the toast slot, the breakpoints.

**Phase 4. Dispatch.** Hero, presets, starter prompts, the composer as the one lead
block, run setup as a modal, the thread, the plan rows, agent messages.

**Phase 5. Results.** Runs list plus review, proposal cards, the diff block, the decision
row as the one lead block, images, notes.

**Phase 6. The rest.** Team, Studio, Templates, Settings with their tabs, Usage.

**Phase 7. The invisible layer.** Row menus, hover actions, tooltips, sort and filter,
undo, skeletons, error states, reduced motion.

**Phase 8. Verification.** Screenshot set at 900, 1240 and 1500. The checker at zero
fails. `tsc`, ESLint, jest. A judge wave on the real pixels.

---

## 13. Verification

- `node scripts/check-rn.mjs` reports 0 fail. Warnings each carry a one line reason.
- `npm test -- --runInBand` green, `tsc --noEmit` clean, ESLint at or below the frozen
  warning baseline.
- Screenshots regenerated at three widths and reviewed by the four oxfords tests.
- Judge subagents score the real screenshots, not descriptions.
- Every "fixed" claim names the file and the line.

---

## 14. Decisions taken and open

**Taken**

- The brand mint stays, but it moves from chrome to content. Chrome is neutral.
- The sidebar keeps labels. A 240px rail with five items is affordable at the 900 floor.
- The run setup becomes a modal, not a side panel.
- The primary button is white, not mint.
- The eyebrow pattern goes.

**Open, with the recommended default**

1. **Icon set.** Tabler Icons (MIT, 24px grid, 2px stroke) is the recommendation. Its
   stroke is heavier than the app's text at 12px, so it needs a 1.75px variant to match.
2. **Composer as the lead block.** Mint fill for the composer is the recommendation, since
   the composer is the thing the person came for. The alternative is a neutral composer
   and the lead on the Results decision row only, which is calmer but leaves Dispatch
   monochrome.
3. **Runs detail as tabs inside Runs.** The alternative is Results as its own top-level
   item and five items becomes six.
