# Dispatch AI (native rebuild)

This directory is a standalone React Native Windows app. It is being rebuilt from a clean project and does not use Dispatch AI v1 source code. Product scope and architecture are described in [PRODUCT.md](./PRODUCT.md).

## Requirements

- Node.js 22.11 or later
- Visual Studio 2022 with Desktop development with C++, Universal Windows Platform development, and a Windows 10/11 SDK
- .NET SDK and NuGet

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

## Current implementation state

The native UI shell, persistent local team-role selection, per-role chat model overrides, review preferences, provider profile form, Windows Credential Manager integration, provider-backed task planner, saved plan review with editable step titles and explicit start approval, parallel agents with directed handoffs, code proposal review, generated PNG artifacts, model-based visual review, run cancellation, run history, and interrupted-run snapshot recovery are in place. Each role's model ID uses the configured OpenAI-compatible endpoint, and a plan snapshots those choices. Code and image reviews can request up to two revisions before a result is held for the person. Cancelled, failed, and human-gated runs can resume unfinished steps. Image generation requires an image model configured for the selected compatible endpoint; automatic visual review requires the chat model to accept image input. Either unsupported path remains human-gated. The native project browser can preview UTF-8 text and attach a bounded excerpt to a task. Each agent has independently configurable read, grep, create-file, and exact-edit permissions, all off by default. Tool requests are checked at execution time and constrained to the selected project. Code agents can propose file changes; changes remain staged for the user unless a qualified higher-ranked reviewer approves and applies them. Qualified reviewers must have both code and review capabilities, rank 4 or 5, and outrank the author. The native writer enforces project-relative paths, size limits, create-only new files, and stale-content checks. Windows build/runtime validation is still required. Shell execution, test/build evidence, line-level diffs, and export remain future work.

Teams can include custom agents with their own instructions and plan/code/image/review capabilities. Create multiple named teams from existing agent profiles, choose the active team for new runs, configure rank and project-tool access in Teams → Hierarchy, and review team-specific run messages in Teams → Team chat. The chat composer sends a task to Dispatch for plan review before it runs. Advanced settings groups provider, project-folder, and review controls. Assign a per-agent model ID and choose an avatar from 199 native-rendered marks in the Dispatch logo pack. Choices persist locally and each run keeps a snapshot of the agent profiles that performed the work. Rebuild the gallery assets from the source pack with `npm run avatars:build`.

The workspace also includes reusable task workflows, a dependency-aware task board, built-in plugin controls for file tools/image generation/code and vision review, team playbooks, approved per-agent memory, optional multi-agent plan debate, and optional approval checkpoints between dependency waves. Debate notes and workspace tool decisions are recorded in the run conversation. Senior-agent auto-apply can be disabled in Advanced settings. The plugin catalog currently exposes reviewed built-in capabilities; it does not load arbitrary third-party code.

The Design Studio provides six design presets, nine selectable design skills, a draggable reference/prompt board with accessible movement controls, text-only 3D prompt recipes, exact change/keep instructions, and an agent brief that includes canvas positions and selected team. Image output and code proposals appear in a live latest-output panel; a design run returns to the studio automatically when it finishes. The recipe library supplies prompts and does not create 3D assets.

Provider keys are written only through the Windows native Credential Manager module. Endpoint/model configuration and non-secret workspace preferences use React Native Async Storage.
