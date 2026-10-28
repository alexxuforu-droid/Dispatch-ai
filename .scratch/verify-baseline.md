# Verify baseline

Date: 2026-10-26
Directory: `Z:\Projects\Dispatch AI\native`
Node: v22.17.1

The baseline was taken with the working tree as it stood before this phase: the uncommitted
work in `App.tsx`, `src/ui.tsx`, `src/Reveal.tsx`, `src/RunWorkspace.tsx`,
`__tests__/App.render.test.tsx` and `__tests__/RunWorkspace.test.tsx` was already in place
and was not touched.

## Commands and observed results

### `npx tsc --noEmit`

Exit code 0. No output: no type errors.

### `npx eslint .`

Exit code 0, but 38 warnings, so `eslint . --max-warnings=0` would have failed:

```
✖ 38 problems (0 errors, 38 warnings)
```

Breakdown by rule:

- `react-native/no-inline-styles` — 27 (App.tsx 21, src/DesignStudio.tsx 5,
  src/DispatchIcon.tsx 1)
- `no-void` — 9 (App.tsx 7, src/RunWorkspace.tsx 2)
- `@typescript-eslint/no-shadow` — 1 (src/DesignStudio.tsx:71, `'change'` shadowed by the
  `change` state variable)
- `no-control-regex` — 1 (src/orchestration/model-runner.ts:316, the intentional
  `[\u0000-\u001f]` control-character check)

Exact warning list:

```
App.tsx
  230:5    no-void
  246:35   no-void
  254:5    no-void
  301:286  no-void
  351:22   react-native/no-inline-styles  Inline style: { flex: 1 }
  412:297  react-native/no-inline-styles  Inline style: { flex: 1 }
  414:79   react-native/no-inline-styles  Inline style: { flex: 1 }
  418:168  react-native/no-inline-styles  Inline style: { flex: 1 }
  444:56   react-native/no-inline-styles  Inline style: { flex: 1 }
  521:2982 react-native/no-inline-styles  Inline style: { flex: 1 }
  644:59   react-native/no-inline-styles  Inline style: { flex: 1 }
  648:80   react-native/no-inline-styles  Inline style: { flex: 1 }
  649:1956 react-native/no-inline-styles  Inline style: { flex: 1 }
  650:306  react-native/no-inline-styles  Inline style: { flex: 1 }
  651:110  react-native/no-inline-styles  Inline style: { flex: 1 }
  656:142  react-native/no-inline-styles  Inline style: { flex: 1 }
  673:159  react-native/no-inline-styles  Inline style: { flex: 1 }
  674:205  react-native/no-inline-styles  Inline style: { flex: 1 }
  695:205  react-native/no-inline-styles  Inline style: { flex: 1 }
  711:50   react-native/no-inline-styles  Inline style: { marginTop: 22 }
  747:60   react-native/no-inline-styles  Inline style: { flex: 1 }
  750:284  no-void
  751:241  no-void
  751:283  no-void
  851:56   react-native/no-inline-styles  Inline style: { flex: 1 }
  862:56   react-native/no-inline-styles  Inline style: { flex: 1 }
  892:24   react-native/no-inline-styles  Inline style: { flex: 1 }
  905:125  react-native/no-inline-styles  Inline style: { borderWidth: 1 }
src/DesignStudio.tsx
  71:64    @typescript-eslint/no-shadow
  99:45    react-native/no-inline-styles  Inline style: { flex: 1 }
  106:280  react-native/no-inline-styles  Inline style: { flex: 1 }
  121:715  react-native/no-inline-styles  Inline style: { flex: 1 }
  123:509  react-native/no-inline-styles  Inline style: { flex: 1 }
  149:55   react-native/no-inline-styles  Inline style: { flex: 1 }
src/DispatchIcon.tsx
  102:67   react-native/no-inline-styles  Inline style: { opacity: 'quiet ? 0.72 : 1' }
src/RunWorkspace.tsx
  186:34   no-void
  193:74   no-void
src/orchestration/model-runner.ts
  316:37   no-control-regex
```

### `npx jest --ci`

Exit code 0.

```
Test Suites: 17 passed, 17 total
Tests:       281 passed, 281 total
Snapshots:   0 total
Time:        12.53 s
Ran all test suites.
```

Failing tests: **none**.

The two cases named in the task brief were already green at baseline, because the
uncommitted work already in the tree had addressed them:

- `__tests__/App.render.test.tsx` — the `throw new Error('no apply control is rendered for
  the change')` guard was not reached; the apply control is rendered for every run state the
  test covers.
- `__tests__/snapshot.tree.test.tsx` — the 900px row passes: the inspector is in the tree at
  900 as well as at 1040 and 1440. The trailing comment in that test still describes the old
  failure ("The 900 row is the one that fails today"), so the comment, not the expectation,
  was the stale part.

## Other command state at baseline

- `npm run test:windows` failed before it ran a single test:
  `Error: 'windows' was not found among available platforms: android, ios` from
  `@rnx-kit/jest-preset`. The React Native Windows platform was not registered with the
  community CLI, so there was no `windows` platform to resolve.
- `npm run windows` could not run either: `npx @react-native-community/cli run-windows`
  reported an unknown command, for the same reason.
