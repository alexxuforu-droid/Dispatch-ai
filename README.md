# Dispatch AI (native rebuild)

A standalone React Native Windows app. It is a rebuild, not a port: it does not use Dispatch AI v1 source code. Product scope lives in [PRODUCT.md](./PRODUCT.md), verification gates in [GATES.md](./GATES.md).

## Requirements

- Node.js 22.11 or later
- Visual Studio 2022 with Desktop development with C++, Universal Windows Platform development, and a Windows 10/11 SDK
- .NET SDK and NuGet
- PowerShell 7 (`pwsh.exe`), which the React Native Windows CLI requires

## Start

```powershell
npm install
npm start
```

In a second terminal, run the native Windows target:

```powershell
npm run windows
```

The logo raster asset is generated from the copied SVG brand asset with:

```powershell
npm run assets:build
```

## Verify

```powershell
npm ci
npm run verify
```

`npm run verify` is the one gate. It runs five checks in order and stops at the first failure:

- `tsc --noEmit` — type checks every `.ts` and `.tsx` file in the project.
- `npm run codegen:check` — regenerates the TurboModule spec headers from the TypeScript
  specs and fails if the committed C++ headers differ. The native module and its TypeScript
  contract cannot drift apart without the gate noticing.
- `eslint . --max-warnings=0` — lints the project; a warning fails the run.
- `jest --ci` — runs the suite in `__tests__` in CI mode.
- `npm run test:windows` — runs the same suite against the React Native Windows runtime preset.

`npm run typecheck` runs the type check alone. `npm run codegen` rewrites the spec headers;
`npm run codegen:check` only reports.

The codegen check runs on plain Node and does not need `pwsh.exe`, so it works here even
though the React Native Windows CLI does.

CI runs `npm ci` and `npm run verify` on `windows-latest`, and a second job builds the native
app with the spec regenerated (`/p:RunCodegenWindows=true`). That build is a hard gate when the
runner has the pinned `v145` toolset; when it does not, the job writes the reason into the run
summary instead of hiding it (`.github/workflows/verify.yml`).

The same build, verified on this machine with Visual Studio 18 (`v145`) and SDK 10.0.26100.0:

```powershell
msbuild windows\DispatchNative.sln /restore /m:1 /nodeReuse:false /p:Configuration=Debug `
  /p:Platform=x64 /p:WindowsTargetPlatformVersion=10.0.26100.0 /p:RunCodegenWindows=true `
  /p:CodegenCommand=npm /p:CodegenCommandArgs="run codegen" /p:PlatformToolset=v145
```

## State of the app

Last reviewed 2026-11-13. This section says what has been observed in a running build and what
has not. Nothing here is aspirational.

### Implemented and seen working

- **Window.** Frameless: no caption bar, no window buttons, rounded corners, content starts at
  the top edge. Border and title bar are disabled in `windows/DispatchNative/DispatchNative.cpp`
  and re-applied when the presenter changes, so it survives resize.
- **Shell.** Logo sidebar with Work / Team / Library groups and a bottom status strip. No top bar.
  Every one of the app's screens opens and renders: Home, Dashboard, Dispatch, Design studio,
  Computer use, Conversation, Runs, Results, Task board, Teams, Agents, Review findings,
  Artifacts, Usage, Workflows, Capabilities, Advanced settings.
- **Provider wiring.** The provider profile holds an OpenAI-compatible endpoint and model; the
  key itself is written only through the Windows Credential Manager TurboModule and never stored
  in the repo or in Async Storage. With a key configured the status strip reports
  "Provider configured", and a direct request to the configured endpoint returned HTTP 200.
- **Credentials per agent.** Workspace and per-agent keys are separate Credential Manager
  targets, so four agents can each run on a different key.
- **Agents.** Four wired roles (Planner, Builder, Code reviewer, Visual reviewer), each with its
  own model, endpoint override, key, folder, always-on idle task, rank, tool permissions and
  memory. Card and editor both render.
- **Design studio.** Attach a screenshot, describe the change, send it to Dispatch. The screenshot
  travels with the brief and appears in the plan. No presets, no recipes, no canvas.
- **Copy.** The app states no explanations: screens are labels, fields and controls, with empty
  state sentences where a list is empty.
- **Machine verification.** `npm run verify` passes: TypeScript, TurboModule codegen check,
  zero-warning ESLint, and the Jest suite in both the default and Windows configurations.

### Implemented but not verified end to end

- **A full coordinated run.** A brief has not been carried through planner → builder → reviewer →
  completed in a running build during this review. Plan review, approval, parallel agents,
  handoffs, code proposals, image artifacts, visual review, cancellation and history all have
  unit and rendering coverage, and the surrounding wiring (endpoint, keys, models, project
  folder) is verified — but the full path with a live model has not been observed completing.
  Treat the core promise as unproven until it is.
- **Computer use.** The capture/vision loop is implemented and contract-tested; a live
  frame-to-action loop with a real model has not been observed.
- **Live review quality.** Reviewers, revision limits and human gating are exercised in tests; the
  quality of a real model's plan or review has not been judged.

### Known defects

1. **Accessibility activation is dead on buttons.** Assistive technology and automation that
   invoke a control's default action (`DoDefaultAction`) do not press it; only a physical pointer
   click or a keyboard activation does. Screen readers and scripted UI testing cannot drive the
   app. This is the highest-priority defect in the codebase.
2. **`Ctrl+1..9` is inconsistent.** The sidebar shortcuts fire when a nav item has focus and are
   ignored from some screens (for example Agents). Keyboard navigation is therefore not
   dependable on its own.
3. **Tab focus walking is unstable.** Focus sometimes cycles and sometimes stops with nothing
   focused, which makes keyboard-only use unreliable.
4. **Sidebar items below the fold.** The nav list scrolls, and scrolled rows report accessibility
   bounds offset from where they are drawn, so scripted clicks on lower items land on the wrong
   row. Tab + Enter selects them correctly.

### Not built

- No arbitrary third-party plugin loading. The plugin catalog exposes reviewed built-in
  capabilities only.
- No telemetry of any kind. Run history, provider configuration and workspace settings stay on
  this machine.

## Keys and secrets

Provider keys live in Windows Credential Manager under `Dispatch AI provider:<slotId>`. They are
not in this repository, not in Async Storage, and not in build output. What is stored locally in
Async Storage (`%LOCALAPPDATA%\Dispatch AI\AsyncStorage.db`) is non-secret: endpoint, model IDs,
roles, review preferences, run history, project folder.

Before any release, confirm the tree is still clean:

```powershell
git grep -I -n -E "nvapi-|sk-[A-Za-z0-9]{20}|ghp_|github_pat_|xox[bpa]-|AIza|PRIVATE KEY"
```

A hit is either a placeholder in a test or a leak. There are no placeholders that look like this
today except the redaction tests in `__tests__/`, which use deliberately fake values.
