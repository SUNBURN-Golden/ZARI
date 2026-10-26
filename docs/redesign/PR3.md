# PR3 FIX review notes

Fixed PR3 font blocker/major and minors: embedded renamed subsets, notices/manifest and corrected 696,876-byte total are folded into the first font commit; heading preload is relative; strong/body and all heading weights are explicit with synthesis disabled.

Fresh checks: production build, typecheck, lint, unit **427/427**, token checker **110/110** plus self-tests, release manifest: PASS. Commands: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1`, `node scripts/check-design-tokens.mjs --self-test`, `node scripts/check-release-manifest.mjs`. Offline Node 24.19.0/npm 11.17.0; locks unchanged. Raw logs: `/workspace/rd-wt/logs/zari-fix/pr3/`.

FontTools checks every subset menu/CFF name and emitted hash. Audit PASS: 16 files / 696,876 bytes, 16 built CSS font URLs are relative, heading preload is relative. See font-audit.log. No new 700 face is required; fallback remains swap. Next: PR4 home integration.

Draft screenshot checklist (Playwright Chromium, ko-KR, DPR 1, reduced motion; visually inspected, no horizontal overflow):

- [x] 390px light: `/workspace/rd-wt/logs/zari-shots/pr3/home-390-light.png`
- [x] 390px dark: `/workspace/rd-wt/logs/zari-shots/pr3/home-390-dark.png`
- [x] 1440px light: `/workspace/rd-wt/logs/zari-shots/pr3/home-1440-light.png`
- [x] 1440px dark: `/workspace/rd-wt/logs/zari-shots/pr3/home-1440-dark.png`

Capture source HEAD: `d106ffbc0347969b38239a57bf6184eb1c2ce4ee`; app/source diff digest: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; production buildId: `529fc56cff404250`. `capture.json` includes browser/version/environment. Later evidence-only commits do not change the rendered app. Captures remain draft, without app-baseline approval. No push, remote git, merge, deployment or dependency changes.
