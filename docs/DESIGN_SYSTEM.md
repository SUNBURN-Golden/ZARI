# ZARI design system specification v1

Status: proposed implementation refinement, documentation only. [DESIGN.md](../DESIGN.md) remains the approved design-direction contract; its CSS values are an unapproved visual seed. No CSS, baseline image or application code is changed by this document. Current approved screen count remains zero until the baseline manifest records explicit approval.

## Contents

1. Product identity and design authority
2. Typography, spacing and working density
3. Color and state semantics
4. Shape, physical geometry and elevation
5. Motion and iconography
6. Component contracts
7. Responsive and accessible behavior
8. Tool choices and dependency policy
9. Visual evidence and adoption gates

## 1. Product identity

ZARI is a workspace for organizing real objects in a measured space. Its visual identity comes from measurement-to-diagram, placement-to-evidence and plan-to-execution connections. Apple informs hierarchy, restraint and interaction clarity; IKEA and Elfa inform planning-to-purchase continuity. None supplies ZARI's visual assets, proprietary engine or implied functionality.

Preserve warm neutral surfaces, dark readable text, restrained green brand actions, systematic alignment and thin meaningful physical outlines. Improve precision through relationships, not through smaller text, excessive empty space or decoration. A dense enough working viewport and a clearly labeled unknown are more valuable than an elaborate hero or perfect-looking room image.

The defining interactions are:

- Focus a measurement and reveal the corresponding dimension line and textual cue.
- Select a container and reveal its contents, physical option and separate checks.
- Move a physical object while preserving its actual size; provisional state is visibly provisional.
- Compare real alternatives at one physical scale.
- Edit input and immediately see that the previous plan is historical until reconciled.
- Inspect a BOM quantity and trace it to placement IDs in the same snapshot.

The product must not default to KPI-card rows, nested cards, pills around every status, giant gradient titles, generic purple/blue AI decoration, sparkle badges, glass panels, fake productivity metrics, oversized empty margins, shrunken desktop layouts on mobile or entrance animation on every element. A domain-relevant numeric summary is allowed when it helps a decision; it must have a defined source and meaning.

## 2. Typography and spacing

### Typography

Use the existing system stack from `apps/web/src/styles/tokens.css`. Do not add webfont downloads or bundle a font merely to make the app appear more designed. Test Korean on the target OS/browser combinations; a system stack is a deliberate initial choice, not a claim that every OS renders identically.

| Role | Existing token / size | Usage |
|---|---|---|
| Main title | `--zari-text-title`, 2 rem | Project/start title when hierarchy requires; not a hero |
| Page/section title | `--zari-text-xl`, 1.5 rem | Workflow step or primary region |
| Group heading | `--zari-text-lg`, 1.125 rem | Inspector/BOM subsections |
| Body and editable value | `--zari-text-base`, 1 rem | Korean text, inputs, actionable errors and primary prices |
| Label | `--zari-text-sm`, 0.875 rem | Persistent field labels and secondary row labels |
| Metadata | `--zari-text-xs`, 0.8125 rem | Optional provenance/time; never the sole warning or essential quantity |

Use existing 400/500/600 weights. Body line-height is 1.55, labels 1.4, short headings 1.2; allow wrapping rather than clipping a heading to a fixed height. Keep normal Korean tracking. Do not apply broad negative letter-spacing to Korean UI.

Apply tabular lining numerals to editable measurements, coordinates, quantities and financial columns. Keep units visually linked and consistently spaced, for example `600 mm` and `12,000 원`; unit text is not a placeholder. Format Rust's exact values, never recalculate them while formatting. Long Korean option names wrap or expand; ellipsis alone cannot hide the product size or an unknown condition.

Warnings use readable sentence text: `내경 높이 확인 필요`, `입력한 외경 기준 배치 가능`, `상품 소계 확인 · 배송비 미확인`. Avoid vague praise, physical guarantees, invented AI analysis and an unqualified `완벽한 배치` success message.

### Spacing and density

Use the existing 4/8/12/16/24/32/48/64 px-equivalent rem scale. One-off values require a concrete interaction/layout reason in the design change. Prefer:

| Relationship | Initial spacing |
|---|---|
| Icon and adjacent label | 4 or 8 px equivalent |
| Label, input and helper text within a field | 8 px |
| Closely related fields/row groups | 12 or 16 px |
| Distinct inspector sections | 24 px |
| Main workflow regions | 24 or 32 px |
| Page outer margins on wide screens | 24 or 32 px, constrained by useful canvas size |

Control minimum block size remains 44 px equivalent, 48 px for coarse pointers. These are product targets, not proof of full WCAG conformance. Use minimum rather than fixed heights; enlarged text must not be cut off. A compact-looking row may have a larger unobtrusive hit target without making every control pill-shaped.

Keep one structural background per pane, not a card around each field. Use alignment, headings and whitespace to group content; add a divider only where it communicates a meaningful boundary. The viewport receives the remaining working area. Inspector details can progressively disclose provenance, but missing information counts and failed checks remain visible when collapsed.

## 3. Color and state semantics

### Existing seed assessment

The seed defines coherent warm surfaces, readable text, border/focus colors and a restrained accent. It also correctly distinguishes decorative grid/divider colors from meaningful control outlines. Its recorded token-pair tests cover declared opaque pairs only; no app rendering or complete accessibility claim follows.

Two gaps require a future token task: unknown/stale/disabled semantics are absent, and selection currently aliases the green accent while success is another green. Different variable names alone do not prevent a selected item being read as valid. Keep green accent for primary brand actions; move selection to the existing blue family and add non-color distinctions.

### Exact proposed token changes for implementation

These are proposed CSS aliases to implement and test in the relevant UI task; they are not edits to the current token file. They deliberately reuse the existing palette rather than create a new design identity.

```css
--zari-selection-ring: var(--zari-info);
--zari-selection-text: var(--zari-info);
--zari-selection-soft: var(--zari-info-soft);

--zari-unknown: var(--zari-text-secondary);
--zari-unknown-soft: var(--zari-surface-subtle);
--zari-unknown-outline: var(--zari-border-control);

--zari-stale: var(--zari-warning);
--zari-stale-soft: var(--zari-warning-soft);
--zari-stale-outline: var(--zari-warning);

--zari-disabled-text: var(--zari-text-muted);
--zari-disabled-surface: var(--zari-surface-subtle);
--zari-disabled-border: var(--zari-border-control);

--zari-preview-outline: var(--zari-text-secondary);
```

The existing values behind these aliases are blue `#295C77`, blue-soft `#EAF2F8`, secondary text `#525C53`, subtle surface `#ECEDE7`, control border `#788276`, warning `#79520E`, warning-soft `#FFF2D8`, and muted text `#626B62`. Retain green success `#2F623F` and its soft surface. Explicit aliases allow later tuning without code treating unknown as disabled or stale as physical warning.

Reusing a base color does not merge semantics: warning is a condition requiring attention; stale is a relationship to newer input/context; unknown is missing evidence; disabled is an unavailable action. Each has distinct text/shape and independent state. Selection/focus may share blue because they are both interaction cues, but focus uses an external offset outline and selection marks the selected object/row. A selected object can simultaneously fail a check.

| Meaning | Visual encoding | Example / invariant |
|---|---|---|
| Selection | Blue outline plus selected label/inspector linkage | `선택됨`; never a green validity fill |
| Focus | Existing offset focus ring, independent of selection | Keyboard location stays visible on an unselected or invalid item |
| Success/pass | Green status icon and exact check scope | `외경 배치 확인`; does not certify contents |
| Warning | Amber icon plus actionable condition | Required confirmation or tradeoff, not an invented numerical score |
| Failure | Red marker/outline and failed constraint text | `입구 폭이 부족합니다`; preserves affected entity |
| Unknown | Neutral outlined question indicator and visible text | `내경 미확인`; no zero/free/pass substitution |
| Stale | Amber banner, dashed context outline and explicit relation | `입력 변경 · 재계산 필요`; old checks remain readable |
| Information | Blue information marker and neutral content | Measurement help or provenance, not a pass |
| Disabled | Neutral surface/border, readable explanation, unavailable behavior | `허용 방향 미확인`; no hover-only reason |
| Provisional | Dashed ghost plus `검사 전` | No authoritative BOM or saved-status update |

Color alone never communicates state. No global opacity reduction on stale plans or disabled explanatory text: it would hide information users need to recover. Product material/color is content data and never selects a validation token. A green product is not a green pass indicator.

### Contrast work required when aliases are implemented

Add explicit cases to `design/token-contrast-cases.json` for selection text/soft, selection ring/canvas, unknown text/subtle, unknown outline/panel and canvas, stale text/soft and panel, stale outline/canvas, disabled text/surface, disabled border/surface, and preview outline/canvas. Use at least 4.5:1 for normal text and 3:1 for necessary non-text cues. Run the existing checker and inspect actual SVG strokes, focus rings and composite controls in the browser.

These are design targets derived from W3C guidance; token arithmetic alone cannot assess actual adjacent colors, image content, font rendering or interaction. [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

## 4. Shape, physical geometry and elevation

| Element | Shape contract |
|---|---|
| Text input, select and normal button | Existing 0.5 rem control radius; rectangular proportions |
| Standalone bounded panel | Existing 0.75 rem panel radius where it is actually a bounded surface |
| Dialog/popover/mobile sheet | Existing 1 rem overlay radius; sheet may have square bottom corners against viewport edge |
| Structural desktop pane | Square edge/divider permitted; no unnecessary surrounding rounded card |
| Status row | Icon + text; not a pill by default |
| Physical product geometry | Exact measured bounding shape/coordinates; UI radius must not shrink or round away physical extent |

Actual products may be rounded or tapered, but the supported model is a conservative rectangular envelope. Do not draw a softened diagram that implies collision clearance the model does not have. If a decorative product illustration is ever shown, distinguish it from the measured footprint used for validation.

Use almost no elevation. Normal app regions, fields, BOM rows, check rows and cards have no shadow. A popover/dialog/sheet may use the existing overlay shadow because it overlaps another working layer. A drag ghost needs its dashed provisional outline, not a floating shadow that implies it cleared physical support checks. No glass backdrop on measurement, evidence, pricing or errors.

Layer order follows the existing z-index tokens: canvas, header, popover, modal, toast. Avoid arbitrary z-index escalation to fix focus/stacking defects. Toasts cannot cover the active field's error or become the sole place for persistence failure.

## 5. Motion and iconography

### Motion

Use CSS transitions initially. The existing 120/180/240 ms tokens are limits for functional transitions, not an instruction to animate everything.

| Interaction | Allowed behavior |
|---|---|
| Focus/selection emphasis | Immediate outline; optional ≤120 ms color/opacity transition |
| Inspector appearance/change | ≤180 ms opacity/context transition if it helps continuity |
| Explicit compact sheet | Up to 240 ms bounded transition; focus/interaction state is correct immediately |
| Pointer drag | Ghost follows pointer directly; no spring lag or overshoot |
| Plan replacement | Atomic authoritative update; an optional clearly labeled before/after comparison is separate |
| Dimension/BOM/check updates | Immediate accurate values; no counting animation or interpolated physical facts |
| Loading/search | Text/progress from actual events; never a fabricated progress percentage |

Never animate collision geometry between snapshots and present intermediate positions as validated. Never wait for `transitionend`/animation completion to mark normalization, validation, saving or step completion. Business state is driven by computation/transaction evidence.

Under reduced motion, use immediate spatial changes. The existing zero-duration token override remains; any later JavaScript animation must obey the same policy. Avoid parallax, bounce, elastic easing, auto-playing room scenes and automatic entrance choreography. A static or restrained loading indicator must still communicate a stalled/failed operation through text.

### Icons

Do not install an icon package for Task 001. A small set of locally authored, consistent 20/24 px SVG line icons is sufficient for close, arrow, view, info, question, warning and check. Use one stroke system and a larger button hit area where needed. Accessible names belong to controls; decorative icons have no duplicate announcement.

A status icon supplements text; a check never appears without the scope of what passed. No sparkle icon signifies external AI when no external AI ran. If repeated icon needs later justify a library, choose one licensed source, pin it and import only used icons; do not combine unrelated visual languages.

## 6. Component contracts

The component list is a responsibility map, not permission to scaffold a large design-system package. Implement the minimal parts required by a real user flow, and keep them token-bound.

| Component | Required behavior and state |
|---|---|
| ProjectHeader | Project context, current step, undo/redo when implemented, separate dirty/saving/saved/error/conflict |
| DimensionField | Raw string, explicit unit, visible label, help/error, focus-to-dimension linkage, unknown/read-only/invalid states |
| StrategyOption | Inspectable facts/rule reasons, actual tradeoff, selected/unavailable state without product-first framing |
| ViewSwitcher | Top/front state, keyboard control, selected label; selection does not mean fit |
| SpaceViewport | Physical coordinates, supported boundaries, provisional/evaluated/historical states, text alternative |
| PlacementInspector | Option, outer/inner dimensions, evidence, contents, separate checks, permitted changes |
| CheckResultRow | Scope, pass/fail/unknown/not-applicable, evidence and next action; not-applicable includes reason |
| BOMRow / PriceSummary | Rust quantities/packs/surplus, exact option, completeness and observation time, links to placements |
| ActionChecklist | Snapshot binding, prerequisites, incomplete/complete, save failure without lost check intent |
| InlineError / RecoveryPanel | Specific cause, preserved work and next action; no universal `문제가 발생했습니다` |
| Dialog / MobileInspector | Focus management, meaningful heading, explicit close and focus return |

Do not make every component a card. Dimension fields are a form; validation is a list of check rows; a BOM is a table/list; the physical viewport is a workspace. Keep those native information structures recognizable.

For disclosure, show essential failures/unknown counts in the collapsed summary, then source details on expansion. Price/quantity errors and unassigned items cannot disappear under a decorative success summary. Selection in the diagram and its linked row/inspector share one placement ID.

Korean copy examples are contract examples, not evidence of implemented behavior:

- Empty: `수납장 안쪽 폭을 입력해 주세요.`
- Unknown: `아직 재지 않았어요` as an explicit data choice.
- Conditional: `외경은 맞지만, 내경 높이를 확인해야 합니다.`
- Stale: `치수가 바뀌었습니다. 이전 계획을 보고 있어요.`
- Search scope: `현재 탐색 범위에서 배치안을 찾지 못했습니다.`
- Saved: `이 기기에 저장됨` only after successful commit.
- Save failure: `저장하지 못했습니다. 입력은 이 화면에 남아 있습니다.`
- No purchase: `새로 살 물건이 없습니다. 가진 수납함으로 정리할 수 있어요.` only when the evaluated result supports it.

## 7. Responsive and accessible behavior

Preserve the layout contract: wide has a primary canvas with task panel and inspector; medium shows one auxiliary panel; compact offers one workflow step, a full-width viewport and an explicitly opened selected-item sheet. Desktop UI is not scaled down wholesale. FRONTEND.md owns modal/nonmodal behavior and focus semantics.

Use semantic headings/landmarks and visible labels. A keyboard user can measure, choose strategy, inspect a plan, edit positions numerically and reach the BOM without dragging. Single-pointer move controls complement drag; keyboard support alone does not satisfy the drag-alternative requirement. [W3C dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

General forms/panels must reflow at narrow widths and zoom. A bounded spatial viewport can pan/zoom, but that exception cannot justify horizontal scrolling of unrelated labels, warnings or purchase rows. [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

Inspect 320/390/768/1280/1440 CSS px, 200% zoom, long Korean product names, large quantities and large exact-money strings. On compact screens test the real virtual keyboard and safe area, not only a resized desktop screenshot. Primary action and field errors remain reachable without closing the keyboard unnecessarily.

Forced-colors mode preserves system focus outlines and state text/icons. Reduced-motion mode preserves all information without movement. Hover is never the only route to help, error, unavailable reason or external-link identification. Screen-reader announcements use meaningful completed transitions rather than repeated progress chatter.

## 8. UI foundation and optional tools

### React Aria, Base UI and native HTML

Choose React Aria Components as the sole composite-control foundation. Its style-free components supply interaction/focus semantics while ZARI supplies tokens, exact data rules and physical-editor behavior. Native headings, links, lists, tables and straightforward controls remain appropriate. This combination is one deliberate foundation with native semantics, not two competing design systems. [React Aria official overview](https://react-aria.adobe.com/)

Base UI is a credible unstyled, composable MIT alternative, with tree-shakable component imports. No current requirement establishes that replacing the existing React Aria direction improves ZARI enough to justify a different foundation. Do not install both or use a pre-styled starter as a substitute for ZARI's design contract. [Base UI official overview](https://base-ui.com/), [Base UI setup](https://base-ui.com/react/overview/quick-start)

React Aria covers common form/composite/overlay behavior. It does not define the physical workspace, movement semantics, immutable snapshot model, exact decimal normalization, coordinate system or validation. Keep DimensionField on a raw-string TextField; do not pass physical measurement authority to a NumberField parser. FRONTEND.md specifies that boundary.

### Motion

Defer the Motion package. CSS is sufficient for the initial functional transitions. If later comparison/overlay behavior establishes a concrete need, document the animation, payload cost, reduced-motion behavior and removal path before adoption. Motion's documented user-reduced-motion mode disables transform/layout animations while preserving some other animations, so adopting it does not automatically implement ZARI's complete policy. [Motion accessibility documentation](https://motion.dev/docs/react-accessibility)

### Storybook

Defer Storybook until reusable components have a meaningful state matrix. It becomes useful for DimensionField, check rows, BOM rows and dialogs in empty/focus/error/unknown/long-Korean/compact/forced-colors/reduced-motion states. Those stories remain synthetic and do not demonstrate actual Worker/WASM calculations. The first browser integration test precedes Storybook adoption.

If introduced, keep it local/CI-only initially, disable optional telemetry, and use no paid visual service as a gate. Its accessibility addon checks rendered DOM heuristics and can flag incomplete checks needing manual examination; a green story does not prove the domain editor is usable. [Storybook accessibility documentation](https://storybook.js.org/docs/writing-tests/accessibility-testing)

### Impeccable and other design-agent guidance

Impeccable can provide optional critique after a manual review workflow proves useful. It is not a runtime dependency, architecture authority or mandatory gate. Its current README includes preferences against system-default fonts, while ZARI explicitly chooses a Korean system stack. Such preferences do not override this contract.

The current project also describes an engine/launcher download and source-writing initialization/live workflows. Therefore no default global installation, automatic updates, init-generated product/design rewrite or source-mutating live mode is part of v1. A later use must pin/review the tool, respect repository contracts, and distinguish suggestions from approved decisions. No Impeccable code or tool is installed in this phase. [Impeccable source repository](https://github.com/pbakaus/impeccable)

Other design-agent skills follow the same rule: useful bounded critique can inform a decision; their generic aesthetic preferences cannot silently change fonts, identity, privacy, dependency policy or interaction semantics. Tool popularity is not evidence of benefit.

## 9. Evidence, adoption and review

Adopting architecture does not approve unseen screens. The design direction is established; current token values and newly proposed aliases are implementation proposals requiring actual rendering checks. Preserve `design/baselines/manifest.json` as empty until screenshots exist; do not create placeholder approval records.

For a visual change:

1. Read DESIGN.md and the affected screen/component contract; identify the precise interaction being changed.
2. Implement real states driven by the real contract. Do not fill empty UI with invented catalog facts or success results.
3. Run `node scripts/check-design-tokens.mjs --self-test` and `node scripts/check-design-tokens.mjs`; add new declared contrast pairs.
4. Run the app and capture normal, unknown, failure, stale, compact and relevant keyboard/focus states from synthetic or consented data.
5. Record source SHA, fixture, route/story, viewport, DPR, browser/OS/font environment, locale, theme, reduced-motion mode and capture command.
6. Keep captures draft until the user or explicitly delegated approver accepts them. Technical review and visual approval are separate.
7. For later changes, provide before/after/diff and reason. Never replace an approved baseline solely to turn a test green.

Do not use personal home photos or inventory in design evidence without explicit consent. Generated concept images are not application screenshots. Passing a color checker is not equivalent to browser/keyboard/screen-reader verification, and none of those alone establishes product usefulness.

The UX Interaction Gate checks measurement-to-diagram linkage, provisional vs authoritative moves, distinct unknown/stale/selection states, consistent snapshot rendering, keyboard/single-pointer equivalents, compact layout and truthful saving/error recovery. Stop progression for a hidden hard failure, misleading green status, stale result presented as current, inaccessible primary flow or an unapproved baseline replacement. Notes about visual polish cannot excuse a broken invariant.
