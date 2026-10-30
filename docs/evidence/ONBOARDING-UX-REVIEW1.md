# First-time onboarding UX — review1 fixes (draft)

Task: apply `/workspace/zari-onboard-run/review1.md` against the existing onboarding implementation on `feat/first-time-onboarding-ux` (`44fe8ec`). The external design plan remains the task input. These captures and Korean copy are review drafts, with no approved baseline.

## Changes

1. Journey input coverage retains unchanged, Rust-confirmed measurements when another field is edited. An ephemeral raw-form reference is paired with successful Rust normalization; changed text, units and diagnosed fields never borrow the old fact. A filled but unconfirmed step focuses the explicit save control. Unknown and unconfirmed values remain separate from fit validation.
2. The journey's plan action activates the existing route link in one press. Its test ID, text and keyboard position remain unchanged.
3. Plan guidance checks the actual selected snapshot, input digest and accepted ID. Missing, historical and already accepted candidates target the real compute control rather than a missing accept button. Busy/disabled targets stay fenced.
4. Home's `aria-describedby` resolves to the real `create-project` ID.
5. Escape inside view options closes that workspace's disclosure and returns focus to its own toggle. Escape outside the disclosure retains its existing behavior.
6. The catalog test again opens a fresh tab while genuinely offline on every engine. The WebKit online substitute/cache-only branch is removed. Its host failure is retained as a failure, not qualified as a pass.

Additional simplification: home keeps two start choices, removes duplicate titles/decorative sketches, and groups import/navigation under `다른 작업`. Loading and saved-project states keep those tools expanded; loading disables import and preserves a link as the first keyboard stop. Mobile shows all three step names. Measurement help, next facts and detailed facts follow basic inputs and the save row. Error focus waits for completed confirmation so a stale diagnostic cannot steal storage-recovery focus.

All existing data-testid values, asserted strings, input/unit and save/sample keyboard adjacency remain. New Korean placeholders and their locations are inventoried in `/workspace/shots/zari-onboarding/copy-candidates.md`. Rust, generated contracts, storage formats, preserved prompts and approved baselines are unchanged.

## Actual captures and metrics

Directory: `/workspace/shots/zari-onboarding/`. Manifest: `metrics.json`. All 16 screenshots are viewport captures, not full-page or approved baselines. For each of home, empty measurement, computed sample plan and forced first-visit coaching, the set includes **1440×900 and 390×844, light and dark**.

Captured app-source SHA-256: `7e8a613d80827ba2dc864cc6b82dc5d68b7be3d1e8f4a3e3ded848b4f0b0c12c`. The script hashes tracked `apps/web/src` paths and their working-tree bytes. This identifies the captured application independently of the later evidence/documentation commit.

| Screen | Viewport | First-fold CTAs | First-fold inputs | Default toolbar buttons | Overflow px |
| --- | --- | ---: | ---: | ---: | ---: |
| Home | 1440×900 | 3 | 0 | 0 | 0 |
| Home | 390×844 | 3 | 0 | 0 | 0 |
| Empty measurement | 1440×900 | 8 | 3 | 0 | 0 |
| Empty measurement | 390×844 | 3 | 3 | 0 | 0 |
| Computed sample plan | 1440×900 | 13 | 0 | 4 | 0 |
| Computed sample plan | 390×844 | 13 | 0 | 4 | 0 |
| First-visit coaching | 1440×900 | 2 | 0 | 0 | 0 |
| First-visit coaching | 390×844 | 2 | 0 | 0 | 0 |

Counts are identical in light and dark. CTA counts include visible links, all buttons, and disclosure summaries, including utility/candidate controls and disabled controls. Closed-disclosure descendants and coachmark-occluded background controls are excluded. Home's three are the two start buttons plus the secondary-tools summary. Input counts are text/number fields; unit selects and strategy radios are listed separately in the JSON. Overflow is measured on both document and body. The result-stage count includes six candidate controls and preserves existing tested actions; it is not a claim of a two-button result screen.

Reproduce after `npm run test:build`, with a local preview on a free non-4173 port:

```sh
npm run preview -- --host 127.0.0.1 --port 4290 --strictPort
node scripts/capture-onboarding.mjs http://127.0.0.1:4290
```

Visual inspection included actual desktop/light measurement, desktop/dark home, mobile/light measurement and mobile/dark home/plan. The capture script asserts zero horizontal overflow for every capture and four visible default plan-toolbar buttons. Browser coverage separately checks axe, disclosure keyboard behavior, focus visibility, forced colors, reduced motion and 200% zoom.

## Verification

Final typecheck/lint and token checks passed; the clean final unit invocation passed **52 files / 443 tests**. The complete browser matrix executed **462 cases: 456 passed / 6 failed**. Five interrupted-calculation/click paths then passed isolated rechecks with unchanged source/assertions/timeouts (Chromium 1, Firefox 3, WebKit 1). This gives **461 distinct passing cases across executions, with 1 remaining offline WebKit failure**; it is not one clean full-matrix invocation and does not establish the cause of the intermittent failures. All 18 first-run cases passed across the complete run and the Firefox recheck. `npm run test:parity` passed 2 browser tests and matched all **124** native Rust / actual Chromium Worker-WASM fixtures, including malformed-payload structural rejection.

Detailed command results are recorded in `docs/IMPLEMENTATION_STATUS.md`; logs are under `/workspace/zari-onboard-run/revision-*`. The final browser matrix uses `ZARI_PREVIEW_PORT=4280`, one worker, Node 24.19.0 and npm 11.9.0. No automatic retries, assertion weakening, existing-suite timeout increases, skips or approved-baseline replacement were introduced. The complete-run failure traces are retained in `/workspace/zari-onboard-run/revision-browser-node24-artifacts/`.

The restored WebKit offline path reproducibly reports `page.goto: WebKit encountered an internal error`. Separate probes with the blank tab created before and after going offline reproduce it; both still navigate with the context offline. This is an unresolved host/browser limitation, not evidence that offline rendering works. Real mobile/GPU, user copy review and baseline acceptance remain outstanding.
