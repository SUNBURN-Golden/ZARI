# PR5 FIX review notes

Fixed the six-workflow evidence gap, screenshot checklists, font ownership (all rename work in PR3), and permanent populated-list/context regressions. PR4 owns the real long-name overflow fix.

Fresh checks: production build, typecheck, lint, unit **427/427**, token checker **110/110** plus self-tests, release manifest: PASS. Commands: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1`, `node scripts/check-design-tokens.mjs --self-test`, `node scripts/check-release-manifest.mjs`. Offline Node 24.19.0/npm 11.17.0; locks unchanged. Raw logs: `/workspace/rd-wt/logs/zari-fix/pr5-final/`.

Final focused browser verification, retries=0:

- Previously flagged six workflows: **6/6 PASS** (`six.log`, 49.8s). Baseline local `origin/main` `0fd20e6`: **6/6 PASS** (5 in base-six.log plus onboarding at baseline line 166 in base-guide-corrected.log). Those tests ran once per branch, at original limits, without skips. The final ZARI job used 1 worker with no concurrent ZARI job. Shared-host load was 11.07 on 8 CPUs, recorded in six-host.txt; a globally quiet host is not claimed. Prior failures are not attributed to host load.
- Chromium home/axe/keyboard/forced-colors: **8/8 PASS** (`home-a11y.log`), including three existing a11y workflows. The modified Korean print fixture: **1/1 PASS**, assertions intact (`print.log`).
- After correcting overlap measurement, all five home tests in Chromium/Firefox/WebKit: **15/15 PASS** (`home-three-engine.log`), including populated long names at 12 widths in both themes, loaded faces and offline font bytes. WebKit retains its documented offline-navigation limitation; Chromium and Firefox revisit offline.
- Native/actual Chromium Worker-WASM parity: **2/2 PASS, 124 shared fixtures match** (`parity.log`). Production build and manifest restored afterward; 16 font assets audited again (`font-audit.log`).

The six workflow, unit, print and existing a11y results were obtained on `a63aadb`; subsequent commits change only the overlap-test measurement and notes. `git diff a63aadb -- apps/web/src apps/web/public apps/web/index.html` is empty. Updated tests/typecheck/lint and the final build were verified afterward. No fresh full Chromium workflow sweep or full Firefox/WebKit workflow sweep is claimed; the historical 145/7 run below remains historical.

Failure history retained: the new populated test first failed (1209px at 320px); PR4 now fixes flex-child wrapping. Initial PR5 unit execution terminated with status 143 and no summary; the post-fix run passed 427/427. The first cross-engine run had 8 PASS / 2 Firefox FAIL at 601px because touching block borders differed by -0.000030517578125px; the actual context text was 11.85px below the title. PR4 and PR5 now measure visible text with a DOM Range, retaining strict overlap assertions and numeric thresholds. Measurement/failed traces are preserved. A post-rebase wrapper missing the PR5 dist refresh was stopped before browser discovery, then the correct PR5 test build was produced.

All four final captures are byte-identical to the four visually inspected PR5 captures (capture-before-test-only.sha256). No screenshot baseline was promoted. Font aliases/loaded-face assertions and Canvas/CanvasText forced colors remain; no extra change was warranted for those accepted review observations.

Remaining: incorrect empty-state card reference is explicitly frozen pending Argon, as permitted by review1; see PR4 notes and /workspace/rd-wt/logs/zari-copy-todo.md. App-baseline approval, physical devices, independent exact-HEAD review and remote CI are not claimed. Next: Argon copy decision and independent review before any owner-authorized merge.

Draft screenshot checklist (Playwright Chromium, ko-KR, DPR 1, reduced motion; visually inspected, no horizontal overflow):

- [x] 390px light: `/workspace/rd-wt/logs/zari-shots/pr5/home-390-light.png`
- [x] 390px dark: `/workspace/rd-wt/logs/zari-shots/pr5/home-390-dark.png`
- [x] 1440px light: `/workspace/rd-wt/logs/zari-shots/pr5/home-1440-light.png`
- [x] 1440px dark: `/workspace/rd-wt/logs/zari-shots/pr5/home-1440-dark.png`

Capture source HEAD: `73ec8627f2b9bfccef1215097d403e1370f86143`; app/source diff digest: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; production buildId: `b4053123130579cc`. `capture.json` includes browser/version/environment. Later evidence-only commits do not change the rendered app. Captures remain draft, without app-baseline approval. No push, remote git, merge, deployment or dependency changes.
