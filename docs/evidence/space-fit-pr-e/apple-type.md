# Apple typography — measured (측정함) 2026-11-11 08:20 KST

Playwright computed styles (Chromium, Linux; the SF Pro names are only in Apple's stack — not installed here, so the rendered face is a fallback, but size/line-height/tracking/weight are Apple's CSS values). Pages: apple.com/kr/, apple.com/, apple.com/kr/iphone/. Viewports 1440 and 390. The hidden `h1` ("Apple (대한민국)") was ignored.

| Role | Page | 1440: size / weight / line-height (ratio) / tracking | 390 |
|---|---|---|---|
| Display headline | /kr/iphone h1 | 80px / 600 / 92px (1.15) / normal (0) | 48px / 600 / 57px (1.19) / 0 |
| Section headline | /kr/ h3 (tile) | 40px / 600 / 44px (1.10) / 0 | 32px / 600 / 36px (1.125) / +0.002em |
| Section headline | / (US) h3 | 40px / 600 / 44px (1.10) / 0 | 32px / 600 / 36px / +0.002em |
| Tile subhead (body-large) | /kr/ p | 28px / 400 / 35px (1.25) / +0.007em | 19px / 400 / 25px (1.32) / +0.012em |
| Tile subhead | / (US) p | 28px / 400 / 32px (1.14) / +0.007em | 19px / 400 / 23px (1.21) / +0.012em |
| Card title | /kr/iphone h3 | 19.89px / 600 / 31.59px (1.59) / 0 | same |
| Eyebrow / badge | /kr/iphone | 12px / 600 / 16px (1.33) / 0 | same |
| Body (Korean) | /kr/iphone p | 14px / 400 / 22px (1.57) / 0 | same |
| Body link (Korean) | /kr/ a.link | 17px / 400 / 27px (1.59) / 0 | same |
| Body link (Latin) | / a.link | 17px / 400 / 25px (1.47) / -0.374px (-0.022em) | same |
| Button | /kr/ a.button | 17px / 400 / 20px (1.18) / 0 | 14px / 400 / 18px (1.29) / 0 |
| Button (Latin) | / | 17px / 400 / 20px / -0.022em | 14px / 400 / 18px / -0.016em |
| Footnote | /kr/iphone .footnote | 17px / 400 / 23px (1.35) / 0 | 14px / 400 / 20px (1.43) / 0 |
| Legal caption | /kr/ footer p | 11px / 400 / 14.7px (1.33) / 0 | same |
| Legal caption (Latin) | / footer p | 12px / 400 / 16px (1.33) / -0.01em | same |
| Global nav | all | 17px / 600 / 21px (1.24) | 19px / 600 / 23px (1.21) |

Font stacks: KR `"SF Pro KR","SF Pro Display|Text","SF Pro Icons","Apple Gothic","HY Gulim","MalgunGothic","HY Dotum","Lexi Gulim","Helvetica Neue","Helvetica","Arial",sans-serif`; US `"SF Pro Display|Text","SF Pro Icons","Helvetica Neue","Helvetica","Arial",sans-serif`. Display face from ~20px up, Text face below.

## Findings that drive ZARI tokens
1. **Korean pages drop the negative tracking**: every /kr/ role measured letter-spacing `normal`, while the US page uses -0.022em at 17px and -0.011em at 34px. Hangul is set at 0 (tiny positive +0.002..+0.012em on large Display-face subheads).
2. **Korean body leading is generous**: 1.57–1.59 (14px/22, 17px/27) vs Latin 1.47.
3. **Display sizes are tight**: 1.10–1.19 for 32–80px, weight 600.
4. **Small text keeps 1.33–1.43**; eyebrow/badge is 12px/600.
5. Hierarchy is carried by size + weight 600, not color; secondary text is a lighter gray.
