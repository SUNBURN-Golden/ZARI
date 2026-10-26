# PR4 FIX review notes

Fixed structured example identity/front-view constants, added sheet-context overlap coverage in accessibility-workspace.spec.ts in this hero PR, and re-pinned the copy review ledger.

Fresh checks: production build, typecheck, lint, unit **427/427**, token checker **110/110** plus self-tests, release manifest: PASS. Commands: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1`, `node scripts/check-design-tokens.mjs --self-test`, `node scripts/check-release-manifest.mjs`. Offline Node 24.19.0/npm 11.17.0; locks unchanged. Raw logs: `/workspace/rd-wt/logs/zari-fix/pr4/`.

Chromium hero/onboarding/portable/lifecycle/local-delivery: **31/31 PASS**, including 22 theme/width combinations for the context overlap check (browser.log).

Copy disposition: DECLINED the empty-state text edit pending Argon. The current sentence still directs people to removed studio cards; it is user-visible and incorrect. This is an explicit Korean-copy freeze, the alternative allowed by review1, not a claim that the wording is fixed. Proposal and exact pointer: /workspace/rd-wt/logs/zari-copy-todo.md. Decorative-dot removals are already listed there; no further wording was invented. Structured identity reuses the exact prior words.

DECLINED removing .local-dot/.app-header .local-note: grep proves live use in ProjectScreen.tsx, ProbeScreen.tsx and DataScreen.tsx; there is no .header-context .local-note selector to delete.

Next: PR5 permanent regressions and the six-workflow baseline comparison.

Draft screenshot checklist (Playwright Chromium, ko-KR, DPR 1, reduced motion; visually inspected, no horizontal overflow):

- [x] 390px light: `/workspace/rd-wt/logs/zari-shots/pr4/home-390-light.png`
- [x] 390px dark: `/workspace/rd-wt/logs/zari-shots/pr4/home-390-dark.png`
- [x] 1440px light: `/workspace/rd-wt/logs/zari-shots/pr4/home-1440-light.png`
- [x] 1440px dark: `/workspace/rd-wt/logs/zari-shots/pr4/home-1440-dark.png`

Capture source HEAD: `5e7a01f09336cc7797dbf920540e5ca1ce818f33`; app/source diff digest: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; production buildId: `69cab0a889a5bf42`. `capture.json` includes browser/version/environment. Later evidence-only commits do not change the rendered app. Captures remain draft, without app-baseline approval. No push, remote git, merge, deployment or dependency changes.
