# PR1 FIX review notes

- Fixed D003: its retained body now explicitly starts SUPERSEDED.
- Baseline comparison: `origin/main` at `0fd20e6` passes 427/427 unit tests, including the formerly failing worker-crash test. No reproduced baseline failure; historical cause remains unknown.
- Fresh PR1 build, typecheck, lint, unit (427/427), token self-test and release manifest: PASS. Commands and raw logs: `/workspace/rd-wt/logs/zari-fix/pr1/` (`verify.sh` in its parent). No app code changed.
- Baseline six workflow cases: 6/6 PASS (5 in base-six.log, onboarding in base-guide-corrected.log). The original line selector missed baseline onboarding (166 rather than 169); a name selector also matched no tests, then line 166 ran once. No retries.

Draft screenshot checklist (Playwright Chromium, ko-KR, DPR 1, reduced motion; visually inspected, no horizontal overflow):

- [x] 390px light: `/workspace/rd-wt/logs/zari-shots/pr1/home-390-light.png`
- [x] 390px dark: `/workspace/rd-wt/logs/zari-shots/pr1/home-390-dark.png`
- [x] 1440px light: `/workspace/rd-wt/logs/zari-shots/pr1/home-1440-light.png`
- [x] 1440px dark: `/workspace/rd-wt/logs/zari-shots/pr1/home-1440-dark.png`

`capture.json` records source/build and browser environment. PR1 intentionally still renders the pre-token home. These captures do not approve an app baseline. Next: PR2 tokens. No remote operations.
