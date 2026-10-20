# Gates: Dispatch AI native UI

OWNS: App.tsx, __tests__/snapshot.tree.test.tsx, __tests__/App.render.test.tsx, .scratch/native-ui-mastery/**

Scope: Keep the Dispatch run inspector accessible in compact layouts and make code proposals reviewable without losing full-file visibility.

- [ ] G1: Mounted Dispatch trees prove inline inspector visibility at 900, 1040, and 1440px, plus a labeled route to the inspector at 320px.
  CHECK: node node_modules/jest/bin/jest.js --runInBand __tests__/snapshot.tree.test.tsx
  EXPECT: PASS __tests__/snapshot.tree.test.tsx
  EVIDENCE: 2026-10-19 focused snapshot suite passed 1 suite / 9 tests, including inline inspector and compact-open assertions.

- [ ] G2: Dispatch and Results & review proposal tests prove diff rows, full-content disclosure, and guarded actions.
  CHECK: node node_modules/jest/bin/jest.js --runInBand __tests__/App.render.test.tsx __tests__/RunWorkspace.test.tsx
  EXPECT: PASS __tests__/RunWorkspace.test.tsx
  EVIDENCE: 2026-10-19 focused render suites passed 2 suites / 57 tests, including approval routing, diff numbering per file axis, full-content disclosure, refusal notices, dismiss, focus ring, and guarded actions.

- [ ] G3: Full test suite has no failing tests.
  CHECK: npm test -- --runInBand
  EXPECT: Test Suites: 14 passed, 14 total
  EVIDENCE: 2026-10-20 full suite passed 14 suites / 242 tests.

- [ ] G4: TypeScript reports no type errors.
  CHECK: node -e "const r=require('node:child_process').spawnSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);console.log('TSC NO EMIT OK')"
  EXPECT: TSC NO EMIT OK
  EVIDENCE: 2026-10-19 tsc --noEmit exited 0 with no output.

- [ ] G5: ESLint adds no warnings or errors beyond the frozen baseline.
  CHECK: node node_modules/eslint/bin/eslint.js src __tests__ App.tsx
  EXPECT: 0 errors, 45 warnings
  EVIDENCE: 2026-10-19 ESLint exited 0 with exactly 45 pre-existing warnings and no new errors.

- [ ] G6: Human visual inspection confirms the real component-tree captures communicate the compact inspector and proposal review states; native compositor fidelity remains explicitly unverified.
  EVIDENCE: 2026-10-20 inspected `ui-900.png`, `ui-1040.png`, `ui-1440.png`, `ui-320-open.png`, `proposal-900.png`, `results-diff.png`, `results-full-content.png`, plus the v2/v3/v4 re-renders after the type-scale, gutter, label, focus-ring and motion passes. The captures show copy, hierarchy, gutter, and compact/result states; nested flex/modal positions are approximate and no native runtime screenshot or launch was used.
