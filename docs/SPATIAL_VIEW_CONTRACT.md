# ZARI 공통 공간 투영·선택 계약 — 제안 v1

상태: [설계 후보](SPATIAL_INTERACTION_PLAN.md). 소유 태스크 SP-001; 채택 후 wire/coordinate 계약. 아래 Rust/TS는 설계 예시이며 실행 코드가 아니다. 기존 스냅샷 schema=1/canonical hash를 바꾸지 않는다.

## 1. source와 freshness

projection source는 (a) Rust-normalized ProjectInput + inputDigest, (b) 완전한 PlanSnapshot 중 하나다. 둘 다 외부 JSON과 같은 경계 검증을 통과한다. input은 정규화·참조 무결성·canonical digest를 확인하고 snapshot은 기존 verifyRecord에 준하는 구조/embedded input/catalog digest/planSnapshotId 확인을 한다. label·size만 신뢰해 그리지 않는다. 계산 검색, 재가격 산정, snapshot 재작성, 저장은 하지 않는다.

snapshot에 포함된 과거 검사값은 과거 기록이다. 현재 draft/catalog와 불일치하면 UI가 stale/historical 표시한다. 투영 가능과 물리 확정은 별개다. 이전 지원 schema/rule의 좌표를 표시할 수 있어도 현재성이나 접근 pass로 승격하지 않는다. 지원되지 않는 historical transform은 부분 표시/명시적 unavailable로 처리한다.

source key는 input=`input:<inputDigest>` 또는 plan=`plan:<planSnapshotId>`이다. cache key는 `(sourceKey, projectionVersion=1)`. workerSession/component generation을 포함한 UI lease를 별도로 둔다. cache는 프로젝트 session 내 최대 4개/합계 8 MiB의 LRU, dispose 시 비운다. IndexedDB/export/BOM/hash에 projection을 넣지 않는다. 카메라·selection·step focus·layer·gesture도 volatile이다.

## 2. 좌표와 drawable 사실

- domain: mm 정수, x=오른쪽, y=입구에서 뒤쪽, z=바닥에서 위쪽. front y=0, staging y<0. `PositionMm`의 기존 입력 범위 유지.
- projector: 넓은 i64 intermediate로 checked arithmetic. drawable 경계는 최종 i32 `ViewMm`, ±100000mm; derived 값이라고 overflow를 wrap/clamp하지 않는다. 범위 밖은 `projection_range_exceeded`와 source fields를 반환한다. 이 범위는 저장·배치 가능 범위를 늘리지 않는다.
- top: `(screenX,screenY)=(x,-y)`를 viewport affine transform으로 표시. front는 `(x,-z)`. screen point→mm은 정확히 같은 CTM의 inverse. SVG text는 뒤집지 않는다. top/front에 별도 padding을 두되 placement 크기를 바꾸지 않는다.
- 3D: `(X,Y,Z)=(x/1000,z/1000,-y/1000)` meters. global axis-aligned box의 center와 extent로 mesh를 만든다. yaw가 적용된 global box에 다시 yaw를 적용하지 않는다.
- parent yaw0: global min=(px+ox+lx, py+oy+ly, pz+oz+lz), extent=(a,b,c).
- parent yaw90: u=ox+lx, v=oy+ly, w=oz+lz, original outer depth=D; global min=(px+D-v-b,py+u,pz+w), extent=(b,a,c). child 자체 orientation을 먼저 적용한다. `geometry::child_global_box`와 같은 수학 계약이다.
- offset unknown: cavity-local 그림은 허용하지만 world child box는 unavailable. 외형 중앙/0 offset/outer−inner의 절반으로 보정하지 않는다. cavity-local view에는 `외형 안의 실제 위치 미확인 · 별도 좌표계` 표시.
- nominal geometry는 nominal 측정만으로 표시할 수 있다. bounded uncertainty가 있어야 conservative region을 표시한다. uncertainty=unknown은 nominal 값이 known이어도 conservative geometry unavailable이며 그 사실을 표시한다.
- known zero offset/clearance와 unknown을 구분한다. NotApplicable인 geometry는 이유만 표시한다. shape의 부재를 empty/fit/pass로 해석하지 않는다.

## 3. serialized DTO

모든 이름은 Rust→Schemars→현재 TS/Ajv 생성 경로에서 생성한다. private helper 이름은 빌더 재량이지만 아래 태그·필드·의미는 고정한다. arrays는 stable typed-key 순서; unordered sets는 sort/dedup. ActionStep의 실제 순서와 priority는 기존 순서를 유지한다. 모든 Option은 required nullable로 생성한다. unknown field/enum은 기존 경계 규칙처럼 거절한다.

```rust
// Serde: tagged kind / camelCase; all records deny_unknown_fields.
pub enum SpatialViewSource {
    NormalizedInput { input: ProjectInput, input_digest: Digest },
    Plan { snapshot: PlanSnapshot },
}
pub enum SpatialSourceStamp {
    Input { input_digest: Digest },
    Plan { plan_snapshot_id: Digest, input_digest: Digest, catalog_digest: Digest },
}
pub enum SpatialTarget {
    Space { space_id: Id },
    Opening { space_id: Id },
    Obstacle { obstacle_id: Id },
    Support { support_id: Id },
    Placement { placement_id: Id },
    Item { item_id: Id }, // 입력 측정용 envelope; 물리 인스턴스를 만들지 않음
    ItemInstance { item_id: Id, unit_ordinal: u32 },
}
pub struct ViewBoxMm { pub min: [i32; 3], pub max: [i32; 3] }
pub struct ViewRectMm { pub min: [i32; 2], pub max: [i32; 2] }
pub struct ViewSegmentMm { pub from: [i32; 3], pub to: [i32; 3] }
pub enum ProjectionGeometry<T> {
    Available { value: T, basis: CheckBasis, field_refs: Vec<FieldRef> },
    Unavailable { reason_code: String, field_refs: Vec<FieldRef> },
    NotApplicable { reason_code: String },
}
pub enum SpatialRole {
    CompartmentBoundary, Aperture, PhysicalObstacle, AccessExclusion,
    SupportSurface, ItemEnvelope, DirectItem, OwnedContainer, NewContainer,
    ContainedItem, InnerCavity,
}
pub struct SpatialElement {
    pub target: SpatialTarget,
    pub role: SpatialRole,
    pub parent_placement_id: Option<Id>,
    pub world_box: ProjectionGeometry<ViewBoxMm>,
    pub top_rect: ProjectionGeometry<ViewRectMm>,
    pub front_rect: ProjectionGeometry<ViewRectMm>,
    pub cavity_local_box: ProjectionGeometry<ViewBoxMm>,
    pub measurement_box: ProjectionGeometry<ViewBoxMm>, // ItemEnvelope만의 별도 측정 frame
    pub check_ids: Vec<Id>,
    pub field_refs: Vec<FieldRef>,
}
pub enum SpatialOverlayRole {
    NominalOuter, ConservativeOuter, NominalInner, ConservativeInner,
    InstallationSweep, OperationalSweep, Staging, SupportFootprint,
}
pub enum SpatialMotionPhase { Insert, ExtractDirect, ExtractContainer, LiftContents }
pub struct SpatialOverlay {
    pub overlay_id: Id,
    pub target: SpatialTarget,
    pub role: SpatialOverlayRole,
    pub motion_phase: Option<SpatialMotionPhase>, // 非motion은 null; motion은 명시된 phase
    pub geometry: ProjectionGeometry<ViewBoxMm>,
    pub check_ids: Vec<Id>,
    pub field_refs: Vec<FieldRef>,
}
pub struct DimensionGuide {
    pub guide_id: Id,
    pub target: SpatialTarget,
    pub field_path: String,
    pub label_key: String,
    pub measurement: Measurement,
    pub segment: ProjectionGeometry<ViewSegmentMm>,
    pub frame: DimensionFrame,
    pub preferred_view: DimensionView, // top | front | cavityLocal
}
pub enum DimensionView { Top, Front, CavityLocal }
pub enum DimensionFrame {
    World { space_id: Id },
    ItemMeasurement { item_id: Id },
    ContainerCavity { placement_id: Id },
}
pub enum SpatialLinkSource {
    Check { check_id: Id },
    Bom { bom_line_id: Id },
    Action { step_id: Id },
}
pub enum LinkResolution { Resolved, Partial, Unavailable }
pub struct SpatialLink {
    pub source: SpatialLinkSource, // check{checkId} | bom{bomLineId} | action{stepId}
    pub targets: Vec<SpatialTarget>,
    pub resolution: LinkResolution, // resolved | partial | unavailable
    pub unresolved_subject_ids: Vec<Id>,
    pub reason_code: Option<String>,
}
pub struct SpatialProjection {
    pub projection_version: u32, // exactly 1
    pub source: SpatialSourceStamp,
    pub interior: Dimensions,
    pub elements: Vec<SpatialElement>,
    pub overlays: Vec<SpatialOverlay>,
    pub dimensions: Vec<DimensionGuide>,
    pub links: Vec<SpatialLink>,
    pub diagnostics: Vec<Diagnostic>,
}
```

`ViewBoxMm` max>min on each drawable axis; rectangles likewise. A plane projects to a rectangle only when its two projected axes have positive extents; an edge/point belongs to a dimension guide, not a fake rectangle. Aperture/support are zero-thickness conceptual planes: export box only if enclosing nonzero evidence exists; otherwise use top/front rectangles and unavailable world box, never fabricate a wall/slab thickness. Rectangles are **domain-plane** coordinates `[x,y]` / `[x,z]`, without screen inversion. Available does not mean physically valid. `basis` can be nominal/conservative only for drawable geometric data; no fake nonGeometric volume. Dimensions retain original Fact/uncertainty/provenance. Labels are UI translations from snapshot/source IDs; projector contains no retailer HTML.

Derived geometry field_refs must cover exactly the dimension/offset/orientation/handling facts used. UI inspector dereferences original facts/evidence, preserving estimated/unverified/confirmed. Geometry failure produces an explicit unavailable element/diagnostic; the object stays in the textual list. A known two-axis region can still produce top/front rectangles when its third axis is unknown. No partial 3D box with a guessed third extent.

`world_box`, `top_rect`, `front_rect` always refer to the world compartment frame. `cavity_local_box` is only a container's explicitly separate unrotated cavity frame. `measurement_box` is only an unplaced ItemEnvelope's local measuring frame, beginning at that diagram's origin; it is never placed at the compartment origin. Input source produces no physical item instances/placements. A measurement diagram may use known dimensions to scale its **separate** silhouette; incomplete axes use an unscaled guide. DimensionFrame makes the frame explicit so view code cannot silently overlay a measurement silhouette or cavity-local child on the world scene. Nonapplicable local-box fields contain NotApplicable with a reason, not zero boxes.

Snapshot counts remain existing caps (20 containers, 200 expanded item instances, etc.). Projection caps: elements<=512, overlays<=2048, dimension guides<=2048, links<=8192, serialized response<=5MiB, each array bounded before allocation. Reject excess with `projection_limit_exceeded`; no silent truncation. Existing input/snapshot validation limits still apply first. Link generation uses indexed lookups, never a Cartesian expansion of the catalog.

## 4. overlays and validator independence

The projector shares deterministic physical **shape construction** helpers with geometry/validator; it never shares a solver validity flag. Extract the existing `moving_envelope` formula into a pure geometry helper byte-for-byte before reuse. New helper tests and old validator fixtures must prove no check outcome changed. Validator must not call `spatial_view` or trust its output.

Installation sweep is the currently supported straight front insertion envelope including the existing side/top/pull margins. Operational sweeps cover only DirectFrontExtraction and PullContainerThenRetrieve, using the exact occupied/conservative dimensions and parent frame the validator uses. Export each implemented motion phase as a separately identified overlay. Lift/retrieval visualization may be shown only when that phase's geometry is implemented and its input facts resolve. It is not a universal human-motion simulation.

Status is read from linked `snapshot.content.validation.checks`, with original kind/basis/reason/evidence. Multiple linked checks remain separate; overlay color cannot pick the best one. Global insertion order `io:order` and blocker/temporary-location unknowns are not erased by a drawn straight sweep. Price/inventory/shipping/load do not get fake geometric overlays; show textual evidence. Missing geometry may coexist with a check Unknown/Pass/Fail, and that distinction is retained. A conservative geometry is emitted only when every required uncertainty bound and offset transform can produce the full worst-case envelope; do not reuse nominal child offsets as a conservative proof. If a phase has only footprint/headroom evidence, emit those supported overlays and mark the full sweep unavailable rather than fabricate a continuous trajectory.

No geometric blocker IDs are extracted from translated messages or string suffixes. Check links resolve structured subject/evidence refs under their declared kind; if a reference is ambiguous, emit partial/unavailable with an explicit diagnostic. At most the selected target/check's overlays are shown by default. Showing a conditional sweep includes `동작 범위 설명 · 조건 미확인`; no animated completion claim.

## 5. BOM, actions and identity

- BOM links use existing `BOMLine.placementIds` verbatim. A line with several placements highlights the set; it does not create a fake representative placement. Quantity/pack/surplus/price always come from BOM.
- Actions use current `ActionKind`, `subjectIds`, prerequisites and requiredConfirmations. `install` maps its placement; acquire/arrival map declared placements and offer text; resolve maps relevant structured subjects; verifyUnassigned maps item list with no fake box.
- Exact transfer item instances require a shared **opaque ID-generation utility** used by the current action producer and the Rust projector: for each actual contained assignment derive the producer's existing bounded transfer step ID and verify that action kind/item/container subjects match. Do not parse a step ID in TypeScript. Extracting the utility must preserve every existing ActionStep byte/ID and snapshot hash. It does not rerun the solver/finalizer to build a second guide.
- A historical rule/action-ID scheme without an approved mapping yields `action_target_unavailable`; show its text/subjects and container link if unambiguous, never highlight a guessed unit. A check/action that legitimately has no spatial target is resolved to an empty set with a reason, not Unknown quantity.
- Element keys serialize `(role, typed target namespace, canonical fields)` so a container body and its inner cavity can share a selection target without a render-key collision. Overlay keys additionally include role/phase and must use bounded deterministic IDs, never labels or array indices. Same raw ID in different namespaces cannot collide; itemOrdinal is zero-based u32. Selection of contained item retains its item instance target and derives its parent placement for editing. Children are inspectable but cannot be individually dragged in this phase. Input `ItemEnvelope` is a measuring diagram for a type, not a placed instance or a quantity claim; it has no world box until represented by an actual placement/assignment.

## 6. Worker extension

One additive command and event:

```text
command: { kind: "projectSpatialView", source: <SpatialViewSource> }
event:   { kind: "spatialViewProjected", projection: <SpatialProjection> }
error:   existing operationFailed {code, affectedFields, affectedIds, retryable, reasonParameters}
```

Use current coarse JSON and RequestMeta. This stateless command is allowed under the existing **system identity**, like verifyRecord, so input normalization before activation and historical snapshots can be displayed. It does not mutate/replace active project/context/search or advance budget counters. Native and actual browser execute identical source payloads through `handle_json`.

`protocolVersion=1`, persisted `schemaVersion=1`, canonicalVersion/ruleVersion/solverVersion and existing PlanSnapshot format remain unchanged because this is an additive ephemeral read model. Advertise capability `projectSpatialView`; increment BUILD_ID from `zari-domain-3` to `zari-domain-4` and update client/entry/harness handshake lists atomically. Current client checks exact capabilities length, so updating only Rust is forbidden. Old Worker/new page or new Worker/old page fails the build/capability handshake and uses the existing explicit recovery; do not silently attempt the command on an old runtime. ProjectionVersion=1 versions this DTO independently. A semantic physical-check change discovered while extracting helpers requires a separate architecture decision/rule version, not this version policy.

Extend Rust DomainOperation/expected projection oracle and fixture contract via the existing generated-schema path, preserving fixtureSchemaVersion=1 and old variants. The new operation's input is a source payload; its expected state includes exact canonical projection fields/diagnostics, not a second TS oracle. Legacy fixtures keep their expected outputs, snapshot digests, IDs, BOM and actions byte-identical; only their `engineContext.buildId` is re-pinned to the new BUILD_ID (`crates/core/src/protocol.rs` rejects a fixture whose build_id differs), as the domain-2 to domain-3 bump did. Register `fixtures/spatial/*.json` in the manifest and parity; the fixture runner must recurse through the existing fixture set.

Cache one immutable projection per source key. Focus/hover/layers/step navigation/pointermove issue **zero** projection requests. One source change causes at most one pending projection; coalesce identical sources. Concurrent late requests are dropped, not interpreted as failures. Because system replies survive editorEpoch changes at transport level, a consumer must additionally check lease `(projectId, sourceKey, mountedGeneration, worker instance, captured raw-editor generation)` before applying. Input change clears scaled current geometry until a matching normalized input arrives; old plan stays explicitly stale. Do not display old projection under a new snapshot heading. Cancellation means ignoring a bounded read reply; it is not synchronous WASM interruption. Worker trap clears ephemeral caches/gesture; persisted inputs and snapshots survive.

## 7. frontend ownership

Proposed modules: `features/workspace/model.ts`, `projection.ts`, `selection.ts`, `viewport.ts`, `drag.ts`, `Workspace.tsx`, `MeasurementDiagram.tsx`, `PlanDiagram.tsx`, `InspectorLayers.tsx`, `StepFocus.tsx`; `features/spatial3d/SpatialView.tsx`, `scene.ts`, `camera.ts`, `resources.ts`. They earn their existence as each task implements behavior; no empty scaffold packages.

```ts
type DisplayBinding = {
  projectId: string; sourceKey: string;
  planSnapshotId: string | null; inputDigest: string;
};
type WorkspaceState = {
  binding: DisplayBinding;
  selection: SpatialTarget | null;
  hover: SpatialTarget | null;
  focus: {kind:'none'} | {kind:'measurement'; fieldPath:string}
    | {kind:'check'; checkId:string} | {kind:'bom'; bomLineId:string}
    | {kind:'action'; stepId:string};
  view: 'top' | 'front' | 'spatial';
  layers: {dimensions:boolean; contents:boolean; checks:boolean};
  projectionState: 'loading' | 'ready' | 'failed';
};
```

This is a TS interaction model, not a domain DTO. View/pan/zoom/layers/camera/selection/focus never call session.edit/bump epoch or write projectRevision. Existing ProjectSession owns authoritative snapshot/edit/history/persistence. `selectedPlacementId` remains its compatibility adapter from typed selection; do not create a competing solver or snapshot store. Workspace state is mounted once per project/display binding. Clear selection/focus/gesture on snapshot switch; same placement string in a different snapshot is not the same valid selection. Changing only view retains selection/focus and individual viewport/camera within that binding. Layer-off does not clear selection or hide warning text.

The drag/edit ingress captures a read-only WorkspaceLease containing projectId, displayedPlanSnapshotId, editorEpoch (decimal string), inputRevision/inputDigest/catalogDigest, projectRevision, projectActivationId, workerSessionId and workspace generation. Capture compares the same fields before sending and before applying a reply. A view switch alone retains the source lease, but a gesture CTM change cancels the gesture. ProjectSession/client may expose an immutable identity accessor; never persist or restore its runtime UUIDs. Presentation changes do not bump the Rust editor epoch. Switching the displayed snapshot while an edit is pending invalidates that edit's presentation lease before it can add history or persist as the active working result. A save transaction still uses existing repository CAS and cannot resurrect an invalidated source.

Two independent highlight channels: explicit selected target and current step/check/BOM target set. Clicking a step activates focus; it does not silently replace user's selected item. A visible legend names both. All derived targets come from projection links of the same binding. Hover never changes step or inspector selection. Canvas clicks do not scroll a user into the BOM automatically; explicit `목록에서 보기` performs that action.

Projection transport/backend types, source lease, selection semantics and coordinate conversion are frozen before renderer work. Local React helper layout/naming, memoization and indexing within these rules remain builder judgment.
