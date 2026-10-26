# PR2 FIX review notes

Fixed all four PR2 minors: distinct accessible hover colors, system-ui fallback, navy shadows, and explicit status-on-app/subtle cases (existing panel cases retained).

Fresh checks: production build, typecheck, lint, unit **427/427**, token checker **110/110** plus self-tests, release manifest: PASS. Commands: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1`, `node scripts/check-design-tokens.mjs --self-test`, `node scripts/check-release-manifest.mjs`. Offline Node 24.19.0/npm 11.17.0; locks unchanged. Raw logs: `/workspace/rd-wt/logs/zari-fix/pr2/`.

Next: PR3 self-hosted fonts. No Korean copy change.

Draft screenshot checklist (Playwright Chromium, ko-KR, DPR 1, reduced motion; visually inspected, no horizontal overflow):

- [x] 390px light: `/workspace/rd-wt/logs/zari-shots/pr2/home-390-light.png`
- [x] 390px dark: `/workspace/rd-wt/logs/zari-shots/pr2/home-390-dark.png`
- [x] 1440px light: `/workspace/rd-wt/logs/zari-shots/pr2/home-1440-light.png`
- [x] 1440px dark: `/workspace/rd-wt/logs/zari-shots/pr2/home-1440-dark.png`

Capture source HEAD: `b6faf0311d4f50bc5239d7e398730720dec3a03f`; app/source diff digest: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; production buildId: `1a09d876e2830d25`. `capture.json` includes browser/version/environment. Later evidence-only commits do not change the rendered app. Captures remain draft, without app-baseline approval. No push, remote git, merge, deployment or dependency changes.
