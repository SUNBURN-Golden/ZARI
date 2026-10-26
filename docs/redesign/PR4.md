# PR4 FIX review notes

Fixed structured example identity/front-view constants, sheet-context overlap coverage in the hero test, re-pinned copy pointers, and long saved-name wrapping (overflow-wrap: anywhere on the shrinking flex item).

Fresh checks: production build, typecheck, lint, unit **427/427**, token checker **110/110** plus self-tests, release manifest: PASS. Commands: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=1`, `node scripts/check-design-tokens.mjs --self-test`, `node scripts/check-release-manifest.mjs`. Offline Node 24.19.0/npm 11.17.0; locks unchanged. Raw logs: `/workspace/rd-wt/logs/zari-fix/pr4-wrap/`.

Chromium hero/onboarding/portable/lifecycle/local-delivery: **31/31 PASS** (pr4/browser.log), including 22 context overlap theme/width combinations. The new PR5 populated-name test exposed 1209px document width at a 320px viewport for an unbroken Korean name; its layout fix belongs here in PR4. After the fix, the same test (temporarily copied into PR4, then removed) passes both themes at all 12 widths: **1/1 PASS**, pr4-wrap/overflow.log. Build/typecheck/lint/unit **427/427**/tokens/manifest were rerun after the CSS change. Permanent populated-row coverage remains in PR5.

Copy disposition: DECLINED editing the empty-state text pending Argon. The current sentence still directs people to removed studio cards; it is user-visible and incorrect. This is the explicit Korean-copy freeze allowed by review1, not a claim that the wording is fixed. Proposal and exact pointer: /workspace/rd-wt/logs/zari-copy-todo.md. Decorative-dot changes are already logged there; no further wording was invented. Structured identity preserves the original words.

DECLINED removing .local-dot/.app-header .local-note: live use in ProjectScreen.tsx, ProbeScreen.tsx and DataScreen.tsx. No .header-context .local-note selector exists.

Next: PR5 permanent regressions and six-workflow comparison.

Draft screenshot checklist (Playwright Chromium, ko-KR, DPR 1, reduced motion; visually inspected, no horizontal overflow):

- [x] 390px light: `/workspace/rd-wt/logs/zari-shots/pr4/home-390-light.png`
- [x] 390px dark: `/workspace/rd-wt/logs/zari-shots/pr4/home-390-dark.png`
- [x] 1440px light: `/workspace/rd-wt/logs/zari-shots/pr4/home-1440-light.png`
- [x] 1440px dark: `/workspace/rd-wt/logs/zari-shots/pr4/home-1440-dark.png`

Capture source HEAD: `47ed940c1d12cf618eba92bf24abbaabe950248f`; app/source diff digest: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; production buildId: `332582caea72d3a4`. `capture.json` includes browser/version/environment. Later evidence-only commits do not change the rendered app. Captures remain draft, without app-baseline approval. No push, remote git, merge, deployment or dependency changes.

Firefox follow-up: at 601px, adjacent title/context block edges differ by -0.000030517578125px, while the visible context text starts 11.85px below the title. The overlap assertion now uses the context text Range instead of its padded border box, keeping strict zero-overlap assertions. This changes test measurement only. Measured evidence: zari-fix/pr5-final/context-measurement.json.

Follow-up validation: production build/typecheck/lint PASS; the revised overlap test PASS **3/3** across Chromium/Firefox/WebKit (66 width/theme combinations), logs pr4-wrap/range-*.log. The app source and captured appearance are unchanged. Unit 427/427 and the 31-case workflow run above remain the latest results for their unchanged source.
