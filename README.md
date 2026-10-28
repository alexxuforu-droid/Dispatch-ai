# Dispatch AI (native rebuild)

This directory is a standalone React Native Windows app. It is being rebuilt from a clean project and does not use Dispatch AI v1 source code. Product scope and architecture are described in [PRODUCT.md](./PRODUCT.md).

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

`npm run typecheck` runs the type check alone. `npm run test:windows` runs the same suite
against the React Native Windows runtime. `npm run codegen` rewrites the spec headers;
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

## Current implementation state

The native UI shell, persistent local team-role selection, per-role chat model overrides, review preferences, provider profile form, Windows Credential Manager integration, provider-backed task planner, saved plan review with editable step titles and explicit start approval, parallel agents with directed handoffs, code proposal review, generated PNG artifacts, model-based visual review, run cancellation, run history, and interrupted-run snapshot recovery are in place. Each role's model ID uses the configured OpenAI-compatible endpoint, and a plan snapshots those choices. Code and image reviews can request up to two revisions before a result is held for the person. Cancelled, failed, and human-gated runs can resume unfinished steps. Image generation requires an image model configured for the selected compatible endpoint; automatic visual review requires the chat model to accept image input. Either unsupported path remains human-gated. The native project browser can preview UTF-8 text and attach a bounded excerpt to a task. Each agent has independently configurable read, grep, create-file, and exact-edit permissions, all off by default. Tool requests are checked at execution time and constrained to the selected project. Code agents can propose file changes; changes remain staged for the user unless a qualified higher-ranked reviewer approves and applies them. Qualified reviewers must have both code and review capabilities, rank 4 or 5, and outrank the author. The native writer enforces project-relative paths, size limits, create-only new files, and stale-content checks. Changes can be written to the project in one atomic batch with rollback if any file in the batch fails, and the applied state is saved with the write rather than after it. Generated images, proposed changes and review reports can be written out through the native Save dialog. Two saved runs can be compared side by side, and every difference is labelled in words. Windows build/runtime validation is still required. Shell execution and project test/build evidence remain future work.

Teams can include custom agents with their own instructions and plan/code/image/review capabilities. Create multiple named teams from existing agent profiles, choose the active team for new runs, configure rank and project-tool access in Teams → Hierarchy, and review team-specific run messages in Teams → Team chat. The chat composer sends a task to Dispatch for plan review before it runs. Advanced settings groups provider, project-folder, and review controls. Assign a per-agent model ID and choose an avatar from 199 native-rendered marks in the Dispatch logo pack. Choices persist locally and each run keeps a snapshot of the agent profiles that performed the work. Rebuild the gallery assets from the source pack with `npm run avatars:build`.

The workspace also includes reusable task workflows, a dependency-aware task board, built-in plugin controls for file tools/image generation/code and vision review, team playbooks, approved per-agent memory, optional multi-agent plan debate, and optional approval checkpoints between dependency waves. Debate notes and workspace tool decisions are recorded in the run conversation. Senior-agent auto-apply can be disabled in Advanced settings. The plugin catalog currently exposes reviewed built-in capabilities; it does not load arbitrary third-party code.

The Design Studio provides six design presets, nine selectable design skills, a draggable reference/prompt board with accessible movement controls, text-only 3D prompt recipes, exact change/keep instructions, and an agent brief that includes canvas positions and selected team. Image output and code proposals appear in a live latest-output panel; a design run returns to the studio automatically when it finishes. The recipe library supplies prompts and does not create 3D assets.

Provider keys are written only through the Windows native Credential Manager module. Endpoint/model configuration and non-secret workspace preferences use React Native Async Storage.
