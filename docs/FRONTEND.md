# ZARI frontend and interaction architecture

Screen-by-screen layout and task-linked browser acceptance are specified in [WORKSPACE_BLUEPRINT.md](../design/WORKSPACE_BLUEPRINT.md). This document retains authority over state ownership. Direct item position is read only from its referenced Placement; contained item coordinates come from its ItemLocation. Offer selection uses Rust validateEdit/SelectOffer and never updates only the visible price in React.

Status: proposed implementation contract; documentation only. The audited repository contains a token seed, not a running React application. [ARCHITECTURE.md](ARCHITECTURE.md) owns dependency direction; [WASM_PROTOCOL.md](WASM_PROTOCOL.md) owns exact wire envelopes; [PERSISTENCE.md](PERSISTENCE.md) owns durable revisions and transactions. This document specifies UI ownership and observable behavior without duplicating those authorities.

## Contents

1. Runtime responsibilities and frontend structure
2. Routes and project activation
3. State ownership and representations
4. Editing, normalization and revision handling
5. Worker integration and error recovery
6. Immutable plans, alternatives and purchase presentation
7. Physical editor and undo/redo
8. Component foundation and accessibility
9. Responsive interaction
10. Persistence integration
11. Implementation boundaries and verification

## 1. Runtime responsibilities

React and TypeScript own input strings, interaction, navigation, screen transforms, accessible presentation, Worker scheduling, and browser persistence adapters. Rust owns measurement normalization, physical dimensions, quantity, package arithmetic, strategy decisions, geometry, search, independent validation, BOM and PlanSnapshot construction. A UI convenience must not become a second authoritative implementation.

Examples of allowed TypeScript work: retaining `"60."` while a person edits; identifying that a field has not been touched; rendering a Rust-provided quantity with Korean labels; converting a pointer position through an SVG viewport transform to a provisional move request; changing zoom without changing the physical model.

Examples of forbidden TypeScript authority: accepting `parseFloat(raw) * 10` as normalized millimeters; recomputing required packs with `Math.ceil`; granting a fit badge because SVG rectangles do not visibly overlap; replacing missing price with zero; deriving BOM quantity from mounted React nodes. A provisional move can be rounded visually to a displayed step, but Rust validates and canonicalizes the requested physical position before it becomes a plan.

Use React reducer/context initially. No general state library, server-state cache, form framework, drag-and-drop framework or animation engine is required. Separate state/effect ownership is required even without those dependencies. Avoid one broad context that causes every pointer movement to rerender all forms and BOM rows: transient viewport interaction remains local to the editor; durable input/plan state changes through the project controller.

The target structure follows ARCHITECTURE.md:

```text
src/app/                  bootstrap, hash routes, providers, project lifecycle
src/features/             measurement, objects, strategies, planner, purchase, execution
src/editor/               viewport transforms, provisional moves, command history
src/view-models/          pure display projections from one immutable snapshot
src/worker/               controller, request registry, Worker entry and scheduler
src/persistence/          Dexie repository, CAS queue, migrations, import/export
src/contracts/generated/  Rust-derived DTO declarations and shape validators
src/ui/                   token-bound React Aria wrappers and native semantics
src/styles/               existing tokens and minimal application styles
```

Create a directory only when a task implements that responsibility. Components import application commands and selectors, not arbitrary Dexie tables or WASM exports. The Worker adapter is the only browser computation gateway. Persistence returns durable values and errors; it never mutates a rendered snapshot. View-model selectors cannot import solver helpers or storage repositories.

## 2. Routing and project activation

Use a small typed hash-route table initially. This permits deep links and browser back on static hosting without assuming a server fallback route. Parse only supported routes and bounded IDs; an unknown route displays an actionable not-found state. Do not create a routing framework abstraction for hypothetical server rendering.

| Route | Purpose | Activation behavior |
|---|---|---|
| `#/projects` | New project, marked sample, existing projects | No active compile context needed |
| `#/projects/:projectId/space` | Internal dimensions and detailed measurements | Load/activate project when identity changes |
| `#/projects/:projectId/objects` | Items, groups, owned storage | Same project activation; preserve draft |
| `#/projects/:projectId/strategy` | Strategy then functional/style preferences | Same project activation; no silent strategy change |
| `#/projects/:projectId/plan` | Alternatives, top/front view, evidence and edit | Render current or explicitly historical snapshot |
| `#/projects/:projectId/purchase` | BOM, reuse and outstanding confirmations | Same snapshot binding as plan |
| `#/projects/:projectId/execute` | Snapshot-bound action progress | Same snapshot binding as plan |
| `#/catalog` | Manual/import catalog management when implemented | Suspend active search; preserve project draft |

Implement only routes with working behavior. Task 001 may use the space route for its clearly labeled architecture proof; it does not show a fake completed planner. Future steps do not appear as functioning links before their implementation. If a user opens a later route without required input, show what is missing with a link to the correct step, retaining the intended destination.

Opening a project creates a new `projectActivationId`, including reopening the same ID and A→B→A navigation. Changing only the workflow step inside an already active project keeps the activation. Worker recreation changes `workerSessionId`; project reactivation and Worker restart are different events. Dispose/supersede prior work before activating the next context. A response for project A from its previous activation cannot update project A after reopening.

Browser back changes routes without destroying the active editing document unnecessarily. On project switch, request a draft save through the same serialized persistence queue. If that fails, retain the unsaved draft in memory and present retry/export/explicit discard; do not silently replace it with another project's state. No routine confirmation for successfully saved navigation is necessary. Irreversible discard is an explicit user action.

## 3. State ownership and representations

The following states are distinct even when implemented in one project-level reducer. Use discriminated statuses and explicit effect results rather than loosely related booleans such as `loading`, `saved`, `valid` and `success` that can contradict one another.

| Layer | Owns | Authorized writers | Excludes |
|---|---|---|---|
| Project session | Project ID, activation, loaded durable revision, route, lifecycle | Project controller | Geometry or quantity decisions |
| Editing document | Raw fields, units, explicit unknowns, user-selected strategy/constraints, `editorEpoch`, semantic dirty state | User commands, explicit undo/redo, confirmed restore/import | Authoritative normalized dimensions |
| Normalized input | Immutable Rust DTO, semantic digest, `inputRevision`, diagnostics, editor epoch acknowledged by Rust | Matching normalization response, validated load | Raw DOM/event objects |
| Editor view | Selection, focused dimension, top/front view, pan/zoom, open inspector, provisional ghost | Editor events | Accepted geometry, BOM |
| Search state | Active request/context, progress counters, stop reason, evaluated candidate references | Worker controller | User acceptance or save completion |
| Plan state | Evaluated candidates, selected candidate, last accepted immutable snapshot binding | Matching Rust result; explicit user choice/acceptance | Independent widget calculations |
| Persistence state | Expected/saved `projectRevision`, pending generation, dirty/saving/saved/error/conflict | Persistence effect results | Physical facts or successful-save assumptions |
| Error state | Typed field/operation failure, associated entity, recovery action, occurrence context | Relevant effect/controller | Generic replacement for all error semantics |
| View model | Read-only labels, formatting, selected rows, presentation grouping | Pure selectors | Physical normalization, totals or validation |

### 3.1 Raw form representation

The following is UI state, not a second domain schema:

```ts
type DimensionEdit = {
  raw: string;
  unit: "mm" | "cm";
  explicitlyUnknown: boolean;
  touched: boolean;
  composing: boolean;
  diagnostic: { code: string; messageKey: string } | null;
};
```

`raw` preserves what the person typed, including an incomplete decimal. A blank field can normalize to explicit unknown according to the domain contract; it never becomes zero. Zero is acceptable for a coordinate but invalid for positive physical extent. The UI can provide immediate lexical guidance, but only Rust returns the authoritative normalized value or domain error.

`composing`, focus, hover and open menus are transient. Persist the raw draft and selected units through the explicitly defined raw-form DTO; do not persist a component instance or blindly JSON-stringify its state. Restoring a draft resets live session identities and reconciles it with Rust before calling an old plan current.

### 3.2 Rust DTO representation

Rust Serde DTOs are the contract source. Schemars emits draft-07 JSON Schema; json-schema-to-typescript emits TypeScript declarations; Ajv standalone code supplies runtime shape validation. These outputs live under `contracts/generated/`, carry a generation/version header and are not edited by hand. Do not add an independently maintained Zod model for the same domain.

Worker messages and wasm-bindgen calls carry JSON strings. Parse/validate once at each declared trust boundary. Parse errors and unsupported schema versions become structured failures. The bridge never performs a permissive type assertion from `unknown` to PlanSnapshot. Runtime schema validation establishes shape; Rust still checks geometry, bounds, conservation and semantic relationships.

Bounded integer dimensions and quantities use generated number fields as defined in DOMAIN_MODEL.md; decimal-string revision/large-integer fields remain strings. Formatting must not convert a large integer through JavaScript `Number`. A money formatter may format an exact decimal/BigInt representation without performing new purchase arithmetic.

### 3.3 View-model representation

A view model references source IDs and its exact snapshot binding. For example, a BOM display row may contain `lineId`, `placementIds`, Rust-provided required quantity/packs/surplus, formatted strings, and the original separate price/shipping/inventory checks. It does not derive required quantity by counting visible placements or multiply packs by a newly fetched price.

UI grouping is not semantic aggregation. An inspector section called `설치·접근` contains separate installation-path and operational-access rows. `가격·재고` contains separate price, shipping and inventory rows. A group header may say that confirmation is needed, but cannot erase a failure or upgrade an unknown.

## 4. Editing and normalization lifecycle

`editorEpoch` increments immediately for any raw edit that may affect a plan, including an invalid/incomplete value, explicit unknown, strategy change, item change or provisional edit committed for evaluation. The first such edit makes current results visibly stale before any Worker response. Merely focusing a field, panning or changing selection does not invalidate a plan.

`inputRevision` is a canonical decimal `u64` string and advances only when Rust-normalized semantics change. `projectRevision` is the durable CAS counter and advances for any successful project save, including raw-invalid drafts and action progress. The protocol also encodes `editorEpoch` as a canonical decimal `u64` string; use checked exact counter handling rather than JavaScript Number coercion, and never wrap a counter. These are not interchangeable. Never use `editorEpoch` as a persisted cross-tab revision or revive a saved epoch as a live request identity.

The normative sequence is:

1. Capture raw input in the editing document, increment `editorEpoch`, mark semantic reconciliation pending and supersede affected requests.
2. On blur, explicit confirmation or a deliberate form submission, capture the editing document and its epoch. Do not normalize during Korean IME composition.
3. Send the captured raw DTO for Rust normalization with the required envelope/context. A debounced preview may use the same contract, but cannot override an outstanding explicit edit.
4. Accept normalization only when the entire response identity still matches. Field errors attach to the matching raw state; the last valid normalized input is retained as historical working data.
5. Rust returns a normalized DTO and semantic digest. The controller/repository uses that digest to retain or advance `inputRevision` following PERSISTENCE.md. Equal `60 cm` and `600 mm` do not force different semantic input revisions.
6. Clear the unreconciled-raw-edit condition only after the latest epoch is acknowledged. A late response for an earlier epoch cannot clear it.
7. Begin compilation with a frozen normalized input/catalog/rules/search context. Persist a matching normalized revision before accepting a plan binding.

No JavaScript float normalization occurs during unit switching. For valid input, request exact Rust reformatting into the chosen unit and update raw text only for the matching epoch. For invalid/incomplete text, preserve the raw value and current unit, explain `단위를 바꾸기 전에 값을 확인해 주세요`, and leave conversion pending until correction or explicit unknown. The unit label never silently reinterprets an invalid raw number.

A nominal+bounds group is one editor epoch. React does not parse the group with `parseFloat`, fill a missing bound with zero, or treat `Evidence.note` as a number, a geometry, a conflict, or a confirmation. `UserMeasured` stays unverified until a separate confirmation exists. Catalogue and owned-container physical paths are read-only in the project draft. The field kind comes from the Rust route grammar, not from a sample id such as `item-a`. The future next-fact query is not a client call in this contract.

Switching display units can alter raw state and durable project revision without altering physical semantics. During asynchronous conversion, use an explicit converting state and the same epoch guard. Do not mark a conversion complete because a CSS transition ended.

On explicit form submission, collect current matching diagnostics, show an error summary, and focus the first invalid field. During typing, avoid repeating alerts. Unknown measurement is a data state with guidance, not necessarily a malformed form value; whether compilation can proceed is a Rust/product-scope decision.

## 5. Worker controller and recovery

One application-owned Worker controller exists per active browser tab. React components do not create private solver Workers or call the WASM module directly. Mount/unmount and development Strict Mode effects must not create duplicate active controllers, leak subscriptions, or send duplicate authoritative requests. Construct/dispose the controller through a single app lifecycle owner and make cleanup idempotent.

WASM_PROTOCOL.md is the only definition of message tags and exact envelopes. The frontend acceptance guard compares the current expected values for at least:

- `workerSessionId` and `projectActivationId`;
- `projectId`, active `requestId`, `contextId` and context digest;
- `editorEpoch`, `inputRevision`, input digest, and the catalog identity/digest;
- applicable schema/rule/solver/search context fields required by that message.

Every epoch/revision field declared by the protocol must match the relevant operation, including a captured project revision where required. A rename/save CAS counter is not itself a new physical truth; coordinate persistence races through the repository rather than dropping version fields from the protocol. Do not create a weaker UI-only acceptance rule. A comparison passes only after shape validation and exact identity equality; matching just the project ID is insufficient.

Worker states are `uninitialized`, `initializing`, `ready`, `running`, `canceling`, `failed`, and `recovering`, with the exact protocol state machine governing transitions. Project loading and persistence have separate statuses; Worker-ready does not mean project-loaded or saved.

Cancellation is cooperative between bounded Rust search steps. Immediately mark the request superseded in the frontend so any later result cannot publish, then send cancellation. The UI shows cancellation requested until acknowledgement/disposal or hard restart resolves the operation. A cancel button alone is not proof of cancellation; a synchronous WASM call can still occupy the Worker until its current bounded unit returns. No promises or microtask loops should starve cancellation messages.

On Worker error, message deserialization failure or WASM trap:

1. Discard the affected Worker instance and all its search handles.
2. Preserve the editing document and last accepted immutable snapshot.
3. Show the failed operation and `계산 다시 시작` action; saving/exporting retained input remains available if storage works.
4. Create a fresh `workerSessionId`, initialize the module, reload the pinned catalog/normalized input and install a fresh context.
5. Do not replay a pending placement commit or accept a previously running search automatically. User retry starts a new request against current state.

Known invalid input is an ordinary Rust error, not a panic/restart. Repeated initialization failures offer diagnostic information without logging home inventory or raw images. Recovery does not claim the failed request finished.

## 6. Plans, alternatives and purchase presentation

Use the distinction in PRODUCT_SPEC.md:

- **Evaluated:** the independent validator ran and produced a report.
- **Conditional:** some applicable requirements remain unknown; the report accurately exposes them.
- **Physically confirmed within the model:** all required physical checks pass under supported geometry and bounded evidence/uncertainty. This is not an unlimited safety guarantee.
- **Accepted:** the user pinned a plan; acceptance does not change facts.
- **Saved:** the transaction committing the binding completed.
- **Current/historical:** relationship to active input/catalog/engine context, separate from all the above.

Do not implement one `verified: boolean` that compresses these dimensions. A conditional accepted plan can be saved and historical. A current evaluated result can still be unaccepted and unsaved. The UI must be able to describe either without turning unknown into pass.

Publish a complete snapshot reference atomically. Diagram, placement list, BOM, warnings and action guide receive that same reference/binding. They cannot independently request current catalog prices or recalculate their quantities. Historical quotes retain their observation times. An explicit catalog update creates a new pin/context and recomputation; it never modifies the accepted old snapshot.

Candidate selection and plan acceptance are different actions. Selecting an alternative changes which complete evaluated snapshot is being inspected. Accepting it requires the persistence binding/checks in PERSISTENCE.md. Unknown essential physical conditions remain visible; known hard-invalid layouts are diagnostics, not recommended executable plans.

Alternatives use one shared viewport extent, axis convention and scale. Show real differences supported by the snapshot: purchases and price completeness, owned storage use, unassigned objects, access steps and unresolved checks. Do not manufacture three choices or fake access percentages. Equivalent layouts are deduplicated in Rust, not by changing titles in React.

For stale plans, retain a clear banner `입력 변경 · 재계산 필요` and identify which plan is shown. Do not overlay a new space outline around old placements and imply a coherent current result. The previous plan may remain inspectable as history; editing/pinning it as a current result requires reconciliation. Exporting a historical plan preserves its historical label, context and unknowns.

The purchase screen displays Rust BOM fields for physical need, reuse, packs to buy, supplied quantity and surplus. A confirmed zero-purchase plan is normal. `가격 미확인`, `배송비 미확인` and `재고 미확인` remain distinct. External links identify exact option and seller when known. `판매처에서 보기` opens a reference link; it is not order placement. Link eligibility and URL validation come from the security contract; an enabled link does not imply physical suitability or inventory availability.

Action progress keys use the full binding `{projectId, inputRevision, planSnapshotId, stepId}`. Completing a step changes user progress, not snapshot content. A new binding starts incomplete; v1 has no automatic carry-forward. Arrival/verification prerequisites cannot be satisfied merely by clicking accept on a plan.

## 7. Physical editor and history

### 7.1 Viewport

Render top and front views from Rust placement data. Model origin is internal front-left-bottom; x is width left→right, y depth front→back, z height bottom→top. Screen axes may require an SVG transform; that transform never changes persisted coordinates. Keep a visible front indicator and view label.

Bounds, obstacles, openings, placements and required access areas use distinct layers. Optional decorative grid spacing has no physical authority. Use stable placement IDs for selection, inspector and text list. A selected container exposes its contents and relevant inner-capacity evidence, not just product metadata.

Focusing width highlights its dimension line; focusing height switches/reveals the relevant front dimension; focusing depth reveals its top-view dimension. Do not unpredictably change the editing route or discard selection. Text describes the same association for a user who cannot see the highlight.

Product shapes cannot be resized to force a fit. An unsupported orientation control is unavailable with a visible reason. Selection state is independent of failure: an invalid proposed placement can remain selected and red-marked with a separate selection ring.

### 7.2 Provisional movement and commit

1. Start a move from an identified current snapshot and placement.
2. Store pointer/pixel changes locally and render a ghost with `검사 전`. Keep authoritative geometry and BOM unchanged.
3. On pointer release or numeric confirmation, submit one move/rotate/replace command bound to base snapshot and current input/context.
4. Rust validates the command and independently evaluates its resulting layout. An accepted result returns a new immutable evaluated snapshot; the UI publishes it atomically after full identity matching.
5. A rejection leaves the prior authoritative snapshot intact and displays the attempted ghost plus specific diagnostics. Provide `원래 위치로` and correction options. Escape cancels the provisional operation without changing input.

Selection, zoom and pointer previews remain responsive without a Worker round-trip per frame. Never send the entire catalog with each move. Immediate UI preview is not an optimistic authoritative update. A worker failure during a move cannot leave an unvalidated position appearing accepted.

Numeric position entry, move buttons and keyboard movement use the same command pathway. Arrow shortcuts apply only when the viewport/placement control has explicit focus, not in text inputs or general page navigation. Display the step (1 mm default; explicit 10 mm modifier). A key-repeat group can coalesce into one user transaction, with final Rust evaluation; an asynchronous response from an earlier key group cannot override a later one.

### 7.3 Undo/redo

Undo/redo operates on semantic editing transactions: confirmed field edits, group/strategy changes, and completed placement commands. Persist bounded raw-form history as PERSISTENCE.md specifies: at most 100 committed commands or 1 MiB, whichever comes first. Use serializable data records, not closures or DOM events.

Coalesce uninterrupted typing within one field until blur/confirmation; a drag is one transaction regardless of pointer-event count. An invalid edit can be undone as raw text without inventing a normalized value. A new edit clears the redo branch. Pan, zoom, selection, open panels, search progress, saving, catalog downloads and action completion are outside plan-edit undo. Action completion has its own explicit toggle.

Undo is a new edit and advances editorEpoch. Input-edit undo increments inputRevision only when normalized input changes; layout-only undo retains inputRevision and uses validateEdit/RestoreLayout to create an evaluated snapshot, advancing projectRevision on durable acceptance. It never decrements a revision, revives an old request, or directly mutates a snapshot. Recomputing an earlier meaning may produce the same content hash, but its binding/currentness still follows the revision contract. Undoing a failed provisional move merely clears that uncommitted ghost; it does not undo the previous accepted plan accidentally.

If applying an inverse command requires a now-unavailable catalog or contract, stop that undo operation with an explanation; do not substitute a different product. Imported/project-switched contexts invalidate in-flight history commands. History is not a general cross-project event log.

## 8. UI foundation and accessibility

React Aria Components is the primary composite-control foundation; native HTML provides semantic content and simple controls. Do not combine React Aria, Base UI and another headless library for equivalent primitives. The choice preserves a style-free foundation with keyboard, touch and focus behavior while leaving the product's identity in ZARI tokens. Base UI is also a viable unstyled library, but no demonstrated need justifies a second foundation. [React Aria overview](https://react-aria.adobe.com/), [Base UI overview](https://base-ui.com/)

| Surface | Foundation | ZARI-specific responsibility |
|---|---|---|
| DimensionField | React Aria TextField/Input/Label/description/error composition | Exact raw string, explicit unit, Rust normalization, IME and epoch guard |
| Strategy choice | RadioGroup/Radio | Reasons, constraints and real differences from Rust |
| View switch | Tabs or ToggleButtonGroup with correct semantics | Physical top/front transform; preserve selection |
| Buttons/checkboxes | React Aria wrappers or native semantics, one consistent pattern | Domain eligibility, pending state and visible unavailable reason |
| Select/ComboBox | React Aria when richer interaction is needed | Exact IDs, synthetic labeling and allowed choices |
| Dialog/popover | React Aria Modal/Dialog/Popover | Context, focus return, recovery content and mobile sheet sizing |
| BOM/data | Native table/list/definition list | Same snapshot data, responsive labeling, unknown completeness |
| Physical workspace | Custom SVG for editing; optional read-only Three.js 0.186.1 cutaway under [D007](../design/DECISIONS.md#d007--읽기-전용-3d-절개-보기에-threejs-도입--채택) (`@types/three` 0.186.0) | Coordinates, ghost, commands, domain validation and accessible equivalent. SVG and the text list remain the fallback when WebGL, the chunk, or the context fails. The 3D view does not edit. |

Use TextField instead of NumberField for physical measurement entry. TextField gives a string interface; numeric controls introduce number formatting/stepping behavior that is not ZARI's exact-decimal normalization. Neither React Aria nor Base UI NumberField is a replacement for the Rust contract. [React Aria TextField](https://react-aria.adobe.com/TextField), [React Aria NumberField](https://react-aria.adobe.com/NumberField), [Base UI Number Field](https://base-ui.com/react/components/number-field)

Library adoption does not prove application accessibility. Every field needs a persistent visible label and associated help/error. Use `button` for actions and a real link for navigation; do not make an entire row containing nested buttons into another button. Unavailable-action reasons remain visible without hover. A tooltip is supplementary, never the only measurement instruction or error explanation.

SVG-only manipulation is insufficient. Provide a placement list exposing each object's position, orientation, dimensions, contents and checks; allow selection and numeric editing through it. Do not label the whole workspace `role="application"` merely to capture keys. Use ordinary document navigation and focused controls, testing the actual screen-reader path.

Announce stable result changes politely, such as `배치안 1개를 찾았습니다. 확인이 필요한 항목이 2개 있습니다.` Announce important save failures without waiting for navigation. Do not announce every pointer frame, work-unit progress increment or keystroke. Modal opening/closing must manage focus and return it to a still-existing trigger or sensible fallback.

## 9. Responsive interaction

Use existing contract breakpoints as initial constraints: compact <48 rem, medium 48–75 rem, wide ≥75 rem. They describe available width, not device identity. Adjust only through measured layout evidence and a documented design decision.

- **Wide:** project header, left workflow panel, central viewport, right nonmodal inspector. Collapse a low-priority panel before the canvas becomes too small to manipulate. BOM/guide use a separate route or explicit region, not nested cards around every row.
- **Medium:** viewport plus one auxiliary panel. Switch between input and inspector explicitly; do not keep three narrow columns.
- **Compact:** one workflow step at a time, full-width viewport, explicit text/list alternative and selected-item sheet. The sheet is modal when open: close it before selecting another viewport object, preserve its placement context, and restore focus. A draggable dismissal gesture is optional, never the only close action.

The sheet contains numeric edit controls so its modal nature does not trap the user away from all editing. A permanently visible compact property panel may instead be an inline nonmodal region; do not mix that with modal ARIA/focus behavior. The first implementation uses the explicitly opened modal-sheet pattern above.

Keep the primary next action reachable above safe-area insets and the on-screen keyboard. Avoid an always-fixed footer that covers field errors. At narrow widths, preserve option names and unknown warnings through wrapping; ellipsis is only a summary with a reliable expansion path. General content reflows without horizontal page scroll; a bounded 2D viewport may pan/zoom and has its text alternative.

Alternative plans share scale even when displayed one at a time on mobile. Do not resize each alternative independently to make it look equally full. Reduced motion removes spatial interpolation while preserving immediate selection and state cues. Forced-colors behavior retains boundaries, focus and non-color status indicators.

## 10. Persistence integration

All writes use the repository's serialized queue and CAS transactions. A component invokes `saveDraft`, `commitNormalizedInput`, `acceptSnapshot` or `updateActionProgress` through application commands; it never performs independent table updates. A save request captures its project activation/generation so a response cannot mark a newer draft or another project as saved.

Use separate meanings:

| Presentation | Required evidence |
|---|---|
| `저장되지 않은 변경` | Current draft differs from last committed raw state |
| `저장 중` | A matching transaction is pending |
| `이 기기에 저장됨` | Latest required transaction committed |
| `저장하지 못했습니다` | Transaction failed; dirty draft retained |
| `다른 탭에서 변경됨` | CAS conflict or remote invalidation requiring reconciliation |

Do not mark an entire draft saved when an older queued generation finishes. If edits occurred during the transaction, retain dirty state and enqueue the next save. A normalization failure does not prevent preserving the raw draft. A persistence failure does not prevent examining a computed candidate, but the candidate remains unsaved.

On load, validate storage envelopes, reconcile raw draft and normalized input, verify snapshot references and hashes through Rust, and restore a plan as current only if the currentness rules hold. No stale Worker sessions/epochs survive reload. A different active catalog pointer makes the old accepted snapshot historical, even when it remains readable.

Revision conflict UX offers loading the latest durable version, saving current edits as a new project, or exporting them. No automatic field merge and no silent last-write-wins. Explicit destructive discard requires an intentional user action. Browser persistence is described as local saving, never backup; export/import is provided by its implementation milestone.

## 11. Task boundaries and verification

The detailed execution plan owns exact commands and review gates. This table constrains frontend claims at each step:

| Task | Frontend outcome | Must not claim |
|---|---|---|
| 001 | Editable normalization + width-boundary + pack arithmetic through actual Worker/WASM; exact native/browser fixture evidence | A generated/validated organization plan, persistence or complete solver |
| 002 | Frozen generated full domain DTO contract available for integration | Runtime behavior proved by types alone |
| 003 | Independent validator outputs available for evidence UI | Solver success establishes validation |
| 004 | Deterministic strategy/solver results available | Arbitrary 3D/global optimum |
| 005 | Real measurement flow, raw-invalid save/reload and revision behavior | Full compile/render/BOM loop |
| 006 | First complete organization compile → evaluated snapshot → diagram/BOM/guide → accept/save/reload | Real commercial catalog or polished editor |
| 007 | Numeric/drag editor, alternatives and undo using the same command boundary | Ghost means verified geometry |
| 008 | Real catalog import/manual data and accurate purchase presentation | Unknown inventory or shipping confirmed |
| 009 | Recovery/privacy, local photo attachment and export/import behaviors | Local persistence is permanent backup or photos are measured automatically |
| 010 | Measured accessibility, responsiveness and performance evidence | Green automation equals visual approval or full accessibility certification |

Relevant browser verification is mandatory for user-facing tasks. Start the app, load actual WASM, exercise the affected route, inspect console errors, and correct failures in the same author session. A fully mocked Worker test is useful for race injection but does not prove integration.

Minimum interaction cases:

1. Keyboard-only width/depth/height flow, decimal cm and exact mm conversion, explicit unknown, zero coordinate vs zero extent, invalid paste and incomplete decimal.
2. A late normalization/search response arriving after a raw-invalid edit; a project A→B→A switch; a Worker restart returning an old response; and a same-project reopen.
3. Stale plan presentation immediately on edit; exact same snapshot reference for diagram/BOM/warnings/guide; historical quote preserved after catalog update.
4. Allowed and rejected moves, text/numeric alternatives, Escape cancellation, selection deletion focus recovery, undo/redo producing fresh revisions.
5. Save/reload of valid and invalid drafts, delayed save completion after another edit, persistence failure, two-tab conflict and retained local state.
6. 320/390/768/1280/1440 CSS px; 200% zoom; mobile keyboard/safe-area coverage; reduced motion; forced colors; long Korean names and large exact monetary strings.

Use approved baselines only for approval-sensitive visual regression. New captures are draft evidence until user/delegated approval; record source SHA, fixture, route, viewport and environment. Storybook, if later introduced, covers reusable component states; it does not replace this app/Worker/browser matrix. [TEST_STRATEGY.md](TEST_STRATEGY.md) owns detailed fixture and verification gates.

## 12. SP-012 guide presentation

Adopted by [D012](../design/DECISIONS.md). This delivery adds no screen and no client command.

The guide, diagram, and BOM keep one snapshot's subject refs. A step checkbox records `done` or `todo` for that full binding only. It does not parse a step id, invent an ordinal, mark a check passed, or set Confirmed. `clearSpace` and `resolveCondition` explain the user assertion and the blocking check; completing them does not clear staging, load, handling, or parking unknowns. Fixed obstacles are not listed as items the checkbox removes.

Price and shipping unknowns stay on the purchase steps of that variant. They are not shown as blockers of an unrelated direct install. A null progress map stays unknown, not an all-todo list. A historical rule or a stale stamp disables completion and offers recompute. Old done rows stay on their binding.

SP-013 sends `queryActionEligibility` before a progress write. The checkbox follows that reply's `executable` flag. It does not infer a blocker from check text. A missing or ineligible reply disables completion. Clear space is a user assertion that the compartment was cleared. Acquire is a purchase-intent assertion, not an order. Transfer loads the unit outside the compartment. Marking a step done does not change the check. The capability list includes `queryActionEligibility` immediately before `disposeProject`, and `BUILD_ID` is `zari-domain-7`.

SP-014 shows search `interrupted` with the existing session note. That state is a hard stop, a watchdog, a worker trap, or a source change during the search. It is not `scopeComplete` or `budgetExhausted`. The accepted plan and the committed input stay. A late Worker reply is not applied. No new color token.

SP-015 keeps the same notes and recovery panel. A copy says progress was cleared, photos were not copied, and owned stock is not reserved. A save failure offers retry, copy, and export, and says the on-screen input and the previous done rows stayed. Offer choices are the offers recorded on that plan. After a cancel timeout, a stall, or a required new activation, the note says the previous plan and input remain and the next calculation starts only after the calculator connects again. An empty catalogue is labeled as a catalogue with no products. No new color token.
