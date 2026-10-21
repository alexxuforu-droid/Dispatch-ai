# Dispatch AI native: design plan

Status: proposed, not started.
Evidence base: real screens captured from the running app at 1500x1000, plus the source.
Scope: visual and interaction design only. Behaviour contracts stay as they are.

---

## 0. How this plan was made

### 0.1 Screenshots (real app, not mockups)

Captured with `.scratch/native-ui-mastery/click-capture.ps1`, which moves the real window,
clicks a real control and copies the window rectangle off the screen:

| File | Screen |
|---|---|
| `x-dispatch.png` | Dispatch home |
| `x-design.png` | Design studio |
| `x-results.png` | Results and review (no runs yet) |
| `x-teams.png` | Teams (no teams yet) |
| `x-agents.png` | Agents |
| `x-plugins.png` | Plugins |
| `s-settings.png` | Advanced settings |

### 0.2 What the pixels show

The problem is not "the taste is wrong". The taste in `src/theme.ts` is defensible: dark
charcoal, one mint accent, Segoe UI Variable, Cascadia Code. What is wrong is that the
system was never finished, and the app drifted away from its own tokens while the screens
were built. Every complaint below traces to that.

Four things are true across all seven screens:

1. **The content floats in a hole.** `maxWidth: 690` (hero, presets), `750` (composer),
   `760` (collections), `940` (teams) are four different caps, each centred inside a pane
   that is 1128px wide at 1500px. On a 1500px monitor the right half of Dispatch, Teams,
   Settings and Results is empty. `App.tsx:914`, `App.tsx:926-928`, `App.tsx:932`.
2. **There is no shape language.** Button radii are 7, 8, 9 and 13. Heights are 30, 33,
   34, 37, 38, 40, 42 and 49. Three different "primary" mint buttons exist with three
   different geometries. `App.tsx:914`, `App.tsx:921`, `App.tsx:928`, `App.tsx:930`,
   `App.tsx:933`.
3. **There is no colour language.** 20+ hard-coded hex values sit outside `src/theme.ts`:
   `#1C302D`, `#1E2526`, `#253631`, `#1B1F25`, `#181B20`, `#24231F`, `#554932`, `#E9CEA2`,
   `#382522`, `#E6B7A8`, `#2B2B25`, `#1F302D`, `#29252D`, `#342A23`, `#18231F`, `#34483E`,
   `#1D2827`, `#313A3B`, `#D7D8DB`, `#CCD0D3`, `#D3D6D9`, `#F1F4F3`. Four near-black
   surfaces sit within 16 points of each other (`#14161B`, `#101216`, `#171A20`, `#1D2128`),
   so surfaces do not separate and the borders carry the whole design.
4. **The icons are drawings, not icons.** `src/DispatchIcon.tsx` builds every glyph from
   `View` rectangles: the play icon is a CSS triangle, the sliders icon is three bars with
   square knobs, the team icon is six rounded squares. At 19px they read as blobs. This is
   the single biggest reason the controls look cheap.

---

## 1. Direction

```
TASTE CONTRACT - Dispatch AI (native Windows)
Map:       Instrument (dense-technical, precise, calm). Not a cockpit, not editorial.
Stack:     React Native Windows 0.84, StyleSheet tokens, react-native-svg for vectors.
Type:      Segoe UI Variable Display (display) / Segoe UI Variable Text (body)
           Cascadia Code (paths, ids, timestamps, diffs)
Ground:    dark only. One canvas, four surface steps, hairline borders, no shadows.
Accent:    mint #86E0C8. Used for primary actions, focus rings and selection only.
           Never for body copy, never a second hue (the old #5E9D8D switch green dies).
Density:   compact. 4px base unit, 8/12/16/24/32 rhythm, 12px card padding.
Shape:     4 tag / 6 chip / 8 button+input / 12 card+panel. One scale, no exceptions.
Motion:    120ms ease-out on state change (hover, press, focus, selection).
           No entrance animation except run messages, which already use Reveal.
Signature: a 2px accent rail on the active nav item, hairline rules instead of card
           soup in lists, and monospace for every identifier and timestamp.
Never:     gradients, glows, emoji, drop shadows, uppercase eyebrow labels on every
           section, more than one accent hue, hand-drawn View icons, text clipped by
           a card edge.
Copy:      plain, second person, present tense, quiet. No em dashes. No sparkle words.
```

Dials:

- `DESIGN_VARIANCE: 4` (offset, not arty). A work tool earns its layout from the work.
- `MOTION_INTENSITY: 3` (state feedback only). Nothing moves that is not telling you
  something changed.
- `VISUAL_DENSITY: 6` (daily app, dense but breathable). The current 10px floor is denser
  than this and reads as noise.

---

## 2. Foundations

Everything below lives in `src/theme.ts` and is enforced by tests, not by discipline.

### 2.1 Colour ladder (replaces `colors`)

Surfaces, cool near-black, each a real step so panels separate without shadows:

| Token | Value | Use |
|---|---|---|
| `canvas` | `#0F1114` | app background, behind everything |
| `surface` | `#14171B` | cards, panels, composer |
| `surfaceRaised` | `#191D22` | inputs, hovered rows, chips |
| `surfaceActive` | `#1F242A` | selected row, selected chip, pressed state |
| `border` | `#23282F` | hairline separator, card edge |
| `borderStrong` | `#2F363F` | input border, hover border |

Text:

| Token | Value | Measured contrast |
|---|---|---|
| `ink` | `#F2F4F6` | 16.31:1 on `surface`, 17.15:1 on `canvas` |
| `inkSecondary` | `#B9C0C9` | 9.80:1 on `surface` |
| `inkMuted` | `#8A929C` | 5.71:1 on `surface`, 6.01:1 on `canvas` |

Accent and status:

| Token | Value | Use |
|---|---|---|
| `accent` | `#86E0C8` | primary button fill, focus ring, selection. 11.57:1 on `surface` |
| `accentInk` | `#0B1512` | text on the accent fill (11.95:1) |
| `accentSubtle` | `#123028` | selected chip fill, selected row tint (accent on it 9.13:1) |
| `accentFocus` | `#B6EFE1` | focus ring on an accent fill |
| `danger` | `#F18D92` | destructive text and icon (7.31:1 on `dangerSubtle`) |
| `dangerSubtle` | `#2A1618` | destructive surface |
| `warning` | `#E9BD79` | warning text and icon (9.63:1 on `warningSubtle`) |
| `warningSubtle` | `#241C10` | warning surface |

Measured with `.scratch/native-ui-mastery/contrast.mjs`, and re-measured by a test in
`__tests__/theme.test.ts` so a token change cannot quietly break contrast.

Border note: `border` and `borderStrong` are decorative separators, 1.2:1 and 1.5:1
against `surface`. That matches Fluent, the system this app sits on, where the resting
control border is subtle and identification comes from the fill plus the focus ring. The
focus ring is the 3:1 element and it is `accentFocus` on every surface. If WCAG 1.4.11 is
required for the resting input border as well, `borderStrong` becomes `#5E6875`, which is
visibly heavier and is the one token worth arguing about.


Rules:

- No hex literal anywhere outside `src/theme.ts`. A test greps the source for
  `#[0-9A-Fa-f]{6}` outside the token file and fails the build. This is the single
  highest-value change in the plan: it stops the drift that produced this mess.
- The accent is never used for body copy. Today `heroEyebrow`, `promptCardMeta`,
  `savedTeamActionText` and `textAction` are all accent-coloured 10-11px text. They become
  `inkSecondary`, and the accent stays on the action itself.
- One green only. `#5E9D8D` (the hand-rolled switch) is replaced by `accent`.

### 2.2 Type scale (replaces `type`)

The existing scale is 30/20/15/13/12/11/10, but the screens also use 43, 34, 17, 14 and 9.
New scale, and every screen uses only these:

| Token | Size/Line | Weight | Use |
|---|---|---|---|
| `display` | 30/38 | 600 | page title |
| `title` | 20/26 | 600 | section heading, hero headline |
| `heading` | 15/21 | 600 | card title, dialog title |
| `bodyLarge` | 14/21 | 400 | hero body, composer input |
| `body` | 13/19 | 400 | default body, list text |
| `label` | 12/16 | 600 | button label, field label, table header |
| `meta` | 11/15 | 500 | section label, secondary line, timestamp |
| `code` | 12/17 | 400 | Cascadia Code, paths, ids, diffs |
| `codeSmall` | 11/15 | 400 | diff gutter only |

- The floor stays 10px, but only the diff gutter uses it. Everything that is content is
  11px or larger. `__tests__/type-floor.test.ts` gains a scale check: a font size outside
  the table is a failure, not a suggestion.
- The hero headline drops from 43px to 40px and the page title from 34px to 30px so the two
  are one family instead of two.
- Line height is always at least 1.4x the size. The floor test already holds this.

### 2.3 Eyebrow rule

Eleven uppercase micro-labels compete today (`collectionPath`, `promptHeading`, `navLabel`,
`threadKicker`, `planBlockTitle`, `codeProposalLabel`, `fieldLabel`, `agentPermissionFoot`,
`hierarchyRankTitle`, `pluginCategory`, `boardKind`). They stop being decoration:

- At most one eyebrow per screen section. Section headings stand on their own.
- The eyebrow becomes `meta` size (11px), letter spacing 0.8, weight 600, colour
  `inkMuted`. Not 10px/1.5 spacing.
- The path breadcrumb (`WORKSPACE / TEAMS`) survives as the one eyebrow per page.

### 2.4 Space, radius, elevation, motion

- Space: 4, 8, 12, 16, 20, 24, 32, 48. Every padding in the app maps to one of these.
- Radius: 4 (tag), 6 (chip), 8 (button, input), 12 (card, panel), pill (switch, status).
  No 7, 9, 10, 11 or 13 anywhere.
- Elevation: no shadows. Dark UIs read better with one border and a surface step.
- Motion: 120ms, ease-out, opacity and transform only. Hover changes surface or border.
  Pressed state is `opacity 0.82` on the control, never a layout change.

---

## 3. Iconography and brand (the SVG question)

### 3.1 Why the logo is a PNG today

`assets/dispatch-mark.svg` exists and is the source of truth: 8.6KB, `viewBox 0 0 256 256`.
The app does not read it. `scripts/render-logo.mjs` rasterises it with `@resvg/resvg-js`
into `assets/dispatch-mark.png` (768x768, 116KB), and `App.tsx:296` loads the PNG.
`scripts/build-agent-avatars.mjs` does the same for 199 agent marks (1.17MB of PNG).

The reason is real: React Native has no SVG renderer and React Native Windows does not
ship one either. `Image` takes bitmaps.

### 3.2 The fix

`react-native-svg@15.16.0` ships a Windows implementation (the published package contains
`windows/RNSVG.sln` and `windows/RNSVG/`), so it autolinks into this app the way
`@react-native-async-storage/async-storage` already does.

1. Add `react-native-svg@15.16.0`. Rebuild, confirm the native module registers (the same
   `nativeModuleProxy` path that now carries AsyncStorage carries this).
2. Render the real brand mark as SVG, tinted with `currentColor` so it can follow the
   active/disabled state instead of being a fixed bitmap.
3. Delete `assets/dispatch-mark.png` and the 199 avatar PNGs. Ship the SVGs (or a small
   subset) and rasterise nothing at build time.
4. Replace `src/DispatchIcon.tsx` entirely with a vector icon set. One family, one stroke
   weight, 24px grid, 1.6px stroke, round caps. Icons needed:
   `dispatch`, `team`, `run`, `review`, `artifacts`, `settings`, `plus`, `send`, `close`,
   `check`, `spark`, `search`, `folder`, `file`, `chevron`, `warning`, `shield`.
   Draw them as SVG paths in one file so the set stays consistent.
5. Icon sizes: 16 for inline, 18 for nav and buttons, 20 for section headers, 24 for
   empty states. Never 15 or 19 (today's values).

If `react-native-svg` cannot be built in this environment, the fallback is to keep the PNG
route but render at 2x the largest use size (88px for the 44px mark) and cut the file from
116KB to about 12KB. That fixes weight, not crispness. The SVG route is the real fix.

### 3.3 Icon rules

- One family, one stroke width. Icons are drawn, not assembled from rectangles.
- An icon never carries meaning alone: every icon-only button has an accessibility label
  and a tooltip.
- Active state changes colour, never size or position.

---

## 4. Component specs

New file `src/ui.tsx` holds the primitives so every screen uses the same ones.

### 4.1 Button

| Variant | Fill | Text | Border | Radius | Height |
|---|---|---|---|---|---|
| primary | `accent` | `accentInk` | none | 8 | 36 |
| secondary | `surfaceRaised` | `ink` | `borderStrong` | 8 | 36 |
| ghost | transparent | `inkSecondary` | none | 8 | 36 |
| danger | `dangerSubtle` | `danger` | none | 8 | 36 |

- Horizontal padding 14, gap 8 between icon and label, label 12/16 weight 600.
- One primary action per screen region. `Start run`, `Approve plan and start`, `Save and
  test`, `Create team` are all primary, and no screen shows two primaries at once.
- Disabled: `surfaceRaised` fill, `border` border, `inkMuted` text, cursor default, and
  the accessibility state says disabled. A disabled primary must still read as a button.
- Pressed: opacity 0.82. Hover: border step up one. Focus: 2px `accentFocus` ring with
  2px offset, drawn as a ring, never as a background change.
- Today: three mint buttons with three geometries, a grey send button that turns mint,
  and a `planApproveButton` used for five different intents.

### 4.2 Icon button

32x32 hit area, 16px icon, transparent fill, `border` on hover, `accentFocus` ring on
focus. Used for close, dismiss, change avatar. Every one has an accessibility label that
matches what it does ("Dismiss notice", "Close team editor").

### 4.3 Text input

- Height 36, radius 8, fill `surfaceRaised`, border `borderStrong`, padding 12.
- Label above the field in `label` size, 6px gap, `inkSecondary`.
- Placeholder `inkMuted`, value `ink`, caret `accent`.
- Focus: border `accent`, ring `accentFocus` at 30% opacity.
- Error: border `danger`, message under the field in `danger`.
- Today the inputs are 10px labels with 11px values and no focus treatment worth the name.

### 4.4 Toggle

Track 36x20, thumb 16, radius pill. Off: track `surfaceActive`, thumb `inkMuted`. On: track
`accent`, thumb `accentInk` (the current `#5E9D8D` thumb is a second green). Label 12/16,
supporting line 11/15 `inkMuted`. Whole row is the target (min 44px tall).

### 4.5 Tag and status chip

One component, two intents:

- `status` (state): radius 4, padding 2/6, 11/15 weight 600, uppercase.
  Colours by meaning: `accent` text on `accentSubtle` for good, `warning` on
  `warningSubtle`, `danger` on `dangerSubtle`, `inkMuted` on `surfaceRaised` for neutral.
- `meta` (label): radius 6, padding 3/8, 11/15, `inkSecondary` on `surfaceRaised`.

Today there are six unrelated tag systems: `SET`, `CUSTOM`/`DEFAULT`/`SETUP`, `ACTIVE`,
`PROPOSAL`/`APPLIED`/`REJECTED`/`REVERTED`/`SUPERSEDED`, `NEW FILE`/`DIFF`, `READY`/
`WORKING`/`BLOCKED`/`DONE`/`FAILED`/`CANCELLED`/`REVIEW`, plus `PROJECT SCOPED`,
`LOCAL`, `TEAMS`, `NATIVE COORDINATOR`.

### 4.6 Card

Radius 12, border `border`, fill `surface`, padding 16. A card is used only when the
content is a unit the user can act on. Lists of similar things use a hairline row list
instead of a grid of cards.

### 4.7 Section header

Title 15/21 weight 600 in `ink`, optional supporting line 11/15 in `inkMuted`, optional
action on the right. A 1px `border` rule under it. No eyebrow unless the section is a
subsection of a page (one per page).

### 4.8 Empty state

Every collection screen needs one. It is a composition, not a dashed box:

- 40px icon in a 56px `surfaceRaised` circle.
- Title 15/21 `ink`.
- One line 12/17 `inkMuted` saying what will appear here.
- One action button when the user can create the thing.

Today Results and review is a heading and 900px of void (`x-results.png`), and Teams uses
a dashed-border rectangle with no icon and no action.

### 4.9 Notice

- Inline, inside the region that owns the message, not floating over the scroll content.
- Radius 8, border 1, padding 10/12, text 12/17.
- One accent per severity: warning text `warning` on `warningSubtle`, danger text
  `danger` on `dangerSubtle`, info text `inkSecondary` on `surfaceRaised`.
- Dismiss is a 24px icon button on the right.
- Today the notice is a warm amber card (#24231F / #554932 / #E9CEA2) that sits on top of
  the scroll view and covers the row above it (`App.tsx:344`, `App.tsx:928`).

---

## 5. Shell layout

### 5.1 Sidebar

- Width 236 (from 228), padding 16, background `canvas`, right border `border`.
- Brand block: 32px SVG mark plus "Dispatch" 15/21 weight 600 and "AI workspace" 11/15
  `inkMuted` in caps, letter spacing 0.8. The 18px name and 10px caption become one size
  pair with the rest of the app.
- "New run" is a primary button, full width minus padding, height 36, radius 8.
- Navigation: **labels, not glyphs**. Icon 18 plus label 13/19 in `inkSecondary`, active
  item `ink` weight 600 with a 2px `accent` rail on the left edge of the row.
- Groups, in this order, each with a 11px `inkMuted` label:
  - Work: Dispatch, Run room, Results and review, Task board, Usage
  - Team: Teams, Agents
  - Library: Runs, Reviews, Artifacts, Workflows, Plugins
  - Bottom: Advanced settings, then the local workspace card.
- All 13 destinations are reachable without scrolling. Today the rail is 68px of glyphs
  with a scrollbar and six destinations below the fold.
- The rail keeps a 48px compact mode under 1040px, but that mode shows tooltips.

### 5.2 Topbar

- Height 56, border bottom `border`.
- Left: page title 13/19 weight 600. The "Dispatch AI / Page" breadcrumb is dropped; the
  sidebar already says what app this is.
- Right: provider status as a dot plus 12/16 text, a 1px divider, and the account avatar
  (28px, radius 14).
- The stop-run control appears only while a run is active, styled as `danger` ghost, and
  sits left of the status so it is not mistaken for a permanent control.

### 5.3 Content frame (the biggest single fix)

- One frame for every screen: padding 24 horizontal, 20 vertical, `maxWidth: 1180`,
  `alignSelf: 'center'`.
- Inside it, a 12-column grid with a 20px gutter, so a card grid, a two-column list and a
  form line up with each other across screens.
- Left-aligned content inside the frame, not centred: the frame is centred, the content
  inside it is not. Today every block is centred separately, so nothing shares an edge.
- Breakpoints: 900 (window floor, single column, run setup becomes a modal), 1040
  (inspector becomes a modal), 1240 (two column grids), 1500 (three column grids).
- The composer sits in the frame, 760 wide, left aligned, with the preset cards above it
  at the same left edge and the same 760 measure.

---

## 6. Screen by screen

### 6.1 Dispatch home (`x-dispatch.png`)

Current problems: the hero column floats in the middle of a wide pane; preset card text
is cut mid-word ("preserving i..."); the "Start with a real task" pills overflow the column
and are clipped by the pane edge; the notice overlaps that row; the inspector is a
separate-looking 304px slab.

Changes:

- Left-align the hero inside the frame. Hero: 40/46 display, body 14/21, max 54ch.
- The eyebrow becomes one 11px mint line above the headline, or goes away. It is
  currently three times louder than the headline.
- Presets become a 3-column grid of cards at 12/16 gap, each card 320 wide, detail text
  wrapped to 2 lines and never clipped. Card: title 12/16 weight 600, detail 11/15,
  meta 11/15 in `inkSecondary` with the accent reserved for the first word only.
- The three starter prompts become a single row of three chips on one line, so they stop
  competing with the preset cards above them.
- The composer becomes the anchor of the screen: 760 wide, left aligned with the presets,
  radius 12, fill `surface`, border `borderStrong`, input 14/21, actions row with
  "Browse files" as a ghost button on the left and "Start run" as the primary on the right.
  The "Enter to run, Shift + Enter for a line break" hint moves to 11/15 `inkMuted` and
  disappears when the input is empty.
- The notice renders inside the composer area, above the input, never over the scroll
  content.
- The inspector becomes a right rail in the frame at 320 wide, separated by a 1px rule,
  fill `canvas` (not a different grey), with sections: Agent team, Review policy, Review
  outputs, and the approval note at the bottom. Section titles 12/16 weight 600.

### 6.2 Run room and the run thread

- The thread keeps a 760 measure, left aligned.
- Plan steps become a table: index 20px, title 13/19 editable, agent and model 11/15
  `inkMuted`, state as a status tag. Rows separated by hairlines, no card.
- Agent messages: avatar 24, name 12/16 weight 600, kind as a tag, body 13/19. The
  message block has no card, only a 1px left rule in `border`, so the thread reads as a
  conversation rather than a stack of boxes.
- The approve bar is a full-width row inside the thread, fill `surface`, border
  `accentSubtle`, with the primary button on the right.

### 6.3 Results and review (`x-results.png`)

- With no runs: an empty state with an icon, "No runs yet", one line, and a "Start a run"
  primary button. The screen is currently a heading over 900px of nothing.
- With runs: a left column of runs (300 wide, selected row tinted `surfaceActive`) and a
  right column with the review content, so the screen uses its width instead of floating
  a 760 column in the middle.
- Code proposal cards: path in Cascadia Code 12/17, status as a tag, summary as meta,
  and the diff in a bordered block with a 1px gutter column. Today the diff rows have no
  container and the "+/-" markers sit inline.
- The apply button is the only primary on the card. "Show complete contents" is a ghost
  button. "Undo applied change" is secondary and disabled when no project folder is set.

### 6.4 Design studio (`x-design.png`)

- The six full-height empty columns become a horizontal filmstrip of 120x80 thumbnails at
  the top, scrollable horizontally, with the selected frame outlined in `accent`.
- The canvas area below is the reference image at its natural aspect ratio, centred, with
  a 1px border and a 12px radius, not an empty column.
- The right side becomes a 320 panel with the callout list, the annotation composer and
  the "Send to agent chat" primary. Today the screen is one row of empty bars.
- Empty state when no image is loaded: an icon, "Drop a reference image", and a browse
  button.

### 6.5 Teams (`x-teams.png`)

- Tab bar becomes a real segmented control: 36px height, radius 8, selected pill
  `surfaceActive` with `ink` text, unselected `inkSecondary`.
- The page keeps the left-aligned frame; the "Create team" primary moves into the section
  header row on the right.
- The empty state replaces the dashed box: icon, "No teams yet", one line, "Create team".
- Team cards become a 2-column grid at 1240+, cards 320 wide.

### 6.6 Agents

- Agent cards become a 3-column grid, each 260 wide: avatar 40, name 15/21, rank as a
  tag, model as meta, then the permission rows with toggles.
- The "CHANGE AVATAR" label under the avatar becomes a small ghost icon button on hover
  and focus, not permanent 10px caps text.

### 6.7 Runs, Reviews, Artifacts

- One collection header pattern: title 30/38, one line of body, one primary action.
- Run rows: hairline separated list, status tag, brief as 13/19, meta as 11/15 mono.
- Artifacts: a real gallery, 3 columns, images at 4:3 with a caption, not full-bleed
  stacked cards.

### 6.8 Task board

- Columns for Ready, Working, Blocked, Done, each 280 wide, with a count in the header.
  Today it is a flat list with a three-item summary line.
- Cards show kind as a tag, title 13/19, owner avatar 20, dependencies as meta.

### 6.9 Usage

- The two totals become two large figures: 30/38 mono for the number, 11/15 label above.
  Estimated counts keep their tilde and are visually separated from exact counts, which
  the current design already does and must keep.
- The call list becomes a table: model, agent, time, tokens. Hairline rows, mono numbers.

### 6.10 Workflows and Plugins

- Workflow cards match the preset cards from Dispatch (same component, so the app reads as
  one system).
- Plugin cards become a 2-column grid with the enable toggle on the right of the header,
  and the category line demoted to 11/15 `inkMuted`.

### 6.11 Advanced settings (`s-settings.png`)

- The page currently floats a 760 column in the middle of a 1500px window with a huge
  empty right side, and the provider card is a tall stack of full-width inputs.
- New layout: left column 2fr (provider form, review policy), right column 1fr (project
  files, agent permissions, workspace data). At 1040 it becomes one column.
- The provider form becomes a two-column field grid (endpoint and model side by side at
  1240+) with the API key full width.
- Field labels are 12/16 weight 600 `inkSecondary`, not 10px caps.
- The status line under the form is a status row with an icon, not a bare sentence.
- Buttons: "Save and test" primary, "Remove key" danger ghost, "Refresh list" secondary.

---

## 7. States, motion, emptiness

- Every interactive element gets: default, hover, focus-visible, pressed, disabled,
  loading, error. The current app has default and pressed only.
- Loading: skeletons that match the final layout (cards, rows), not a spinner.
- Empty: section 4.8, on every collection screen.
- Error: inline where it happened (a field, a file list) and in the notice channel
  otherwise. Never a modal.
- Motion: 120ms. The existing `Reveal` entrance for run messages stays, reduced-motion
  aware. Nothing else animates in.
- Focus: one focus ring style across the app, 2px `accentFocus`, 2px offset, drawn as a
  ring. `FocusPressable` currently paints a fill, which is how the Design Studio callout
  overlay ended up occluding the reference image.

---

## 8. Accessibility floor

- Body text 4.5:1, large text and icons 3:1, focus ring 3:1 against both adjacent
  surfaces. A contrast test in `__tests__/theme.test.ts` checks every token pair used
  together.
- Every icon-only control has an accessible name that matches the visible text elsewhere.
- Hit targets: 32px minimum for icon buttons in a desktop app, 44px for anything used
  with a finger.
- No information by colour alone: every status colour is paired with a word.
- Windows text scaling to 2.25x is supported by the layout: no fixed heights on text
  containers, no clipped text, no horizontal scroll at any width.

---

## 9. Sequencing

Each phase ends with the app running, the tests green, and a fresh screenshot set.

**Phase 0. Harness (done).** Real screenshots exist and are reproducible:
`.scratch/native-ui-mastery/click-capture.ps1`.

**Phase 1. Foundations.** `src/theme.ts` rewritten with the new ladder, scale and radii.
`src/ui.tsx` created with Button, IconButton, TextField, Toggle, Tag, Card, SectionHeader,
EmptyState, Notice. Tests: token contrast, scale conformance, no raw hex outside the
token file.

**Phase 2. Vector assets.** `react-native-svg` added and built. Brand mark rendered as
SVG. `src/DispatchIcon.tsx` replaced with the vector set. Avatar PNGs replaced by SVG or
dropped.

**Phase 3. Shell.** Sidebar with labels and groups, topbar rewrite, content frame and
grid, breakpoints. Every screen drops its own `maxWidth` caps.

**Phase 4. Dispatch and the thread.** Home screen, composer, presets, run thread, plan
table, agent messages, approve bar, inspector.

**Phase 5. Review surfaces.** Results and review, code proposal cards and diff block,
artifacts, usage.

**Phase 6. Remaining screens.** Design studio, teams, agents, runs, reviews, artifacts,
task board, workflows, plugins, settings.

**Phase 7. States and motion.** Skeletons, empty states, error states, hover and focus
rings, reduced motion.

**Phase 8. Verification.** Full screenshot set at 900, 1240 and 1500 wide. Judge wave on
the real pixels. Contrast and size tests. `tsc`, ESLint, jest.

---

## 10. Verification per phase

- `npm test -- --runInBand` green, `tsc --noEmit` clean, ESLint at or below the frozen
  warning baseline.
- Screenshot set regenerated with `click-capture.ps1` and compared against the previous
  set by eye, side by side.
- Judge subagents score the real screenshots, not descriptions.
- Every "fixed" claim names the file and line.

---

## 11. Explicitly not doing

- No new colour hue. Mint stays the only accent.
- No gradients, glows, glass, or drop shadows.
- No new navigation pattern. The sidebar stays a sidebar.
- No emoji. Icons come from the vector set.
- No light theme. The app is a dark desktop tool.
- No change to what the screens do. This plan is appearance and interaction, not
  behaviour. Where a label is wrong (five vocabularies for run states), the fix is one
  shared vocabulary, picked once and applied everywhere.
- No Tailwind, no web CSS, no GSAP. React Native Windows keeps its own layout model.

---

## 12. Open questions for the owner

1. **Icon family.** The vector set in 3.2 is drawn from scratch in the app's own stroke
   style. If a licensed family (Tabler, Phosphor, Lucide) is preferred, it must ship a
   Windows build or be vendored as SVG paths.
2. **Sidebar labels.** Labels are recommended over a glyph rail. A labelled 236px rail
   eats width on a 900px window; the compact glyph rail with tooltips is the alternative.
3. **Results layout.** The two-column run list plus review column is recommended. A
   single centred column is the alternative and keeps more width for diffs.
4. **Mission presets.** Six presets as cards is the current shape. Three larger cards
   plus a "More presets" link is the alternative.
