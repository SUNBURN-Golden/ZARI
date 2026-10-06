# ZARI Domain Model and Version Contract v1

Status: proposed architecture, not Rust implementation. This file owns wire semantics. Rust private validated types may differ from DTO structs; that distinction must not alter serialized meaning. All shown snippets are designs, not compilation claims.

## Contents

1. Scalars and normalization
2. Facts, measurement and provenance
3. Project, physical entities and catalog
4. Strategy, layout and validation
5. Search, BOM and snapshots
6. Versions, identity and schema generation

## 1. Scalars: constructors are mandatory

| Type | Rust storage | Serialized form | Valid range / meaning |
|---|---|---|---|
| LengthMm | u32 | integer number | 1..10000; physical positive extent |
| ClearanceMm | u32 | integer number | 0..10000; known zero permitted |
| PositionMm | i32 | integer number | -20000..20000; exterior path may have negative y; final contained min must be ≥0 |
| Quantity | u32 | integer number | 0..10000; zero is known empty |
| PackQuantity | u32 | integer number | 1..10000 |
| UnitCount | u32 | integer number | 0..4294967295; checked aggregate/supplied count, not an input item quantity |
| MassGrams | u32 | integer number | 0..1000000; zero only when explicitly evidenced |
| MoneyKrw | u64 | decimal string | 0..18446744073709551615; checked intermediate u128 |
| Revision, WorkCount | u64 | decimal string | 0..18446744073709551615; overflow is structured error |
| Id | validated String | string | 1..96 ASCII letters/digits/`_:-`; no inferred identity from labels |
| Digest | [u8;32] | lowercase 64-hex string | SHA-256 of specified canonical material |

Aggregate input caps are separate from scalar validity: 1 compartment, 20 placed containers, 200 expanded item instances, 50 groups, 20 obstacles, 1000 local catalog variants, 4000 total offers, 100 eligible candidate variants per group in the reference search profile. Cap exceedance returns `input_limit_exceeded`/explicit restricted search scope, not silent truncation or auto-discarded items. Quantities above the geometric instance cap remain legal input facts but cannot be fully expanded in this profile; request a narrower problem or return unassigned remainder explicitly.

```rust
pub struct LengthMm(u32);
pub struct ClearanceMm(u32);
pub struct PositionMm(i32);
pub struct Quantity(u32);
pub struct PackQuantity(u32);
pub struct UnitCount(u32);
pub struct MoneyKrw(u64);
pub struct Revision(u64);

pub enum Unit { Mm, Cm }
pub enum RawUncertaintyDto {
    Unknown,
    Bounded { minus_text: String, plus_text: String, unit: Unit },
}
pub struct RawMeasurementDto {
    pub text: String,
    pub unit: Unit,
    pub uncertainty: RawUncertaintyDto,
    pub origin: MeasurementOrigin,
    pub evidence_ids: Vec<Id>,
}
```

Private fields and `TryFrom`/validated constructors enforce the table. Raw DTOs deserialize first, then validate; Serde derive on an unconstrained integer is not enough. Reject unknown object keys/enums/schema versions at external boundaries. Never expose usize/isize in persisted/transport contracts.

Rust trims surrounding whitespace and parses ASCII decimal strings exactly. mm accepts integers; cm accepts decimal values exactly representable in whole mm, including redundant trailing fractional zeroes. Thus `60`, cm →600; `60.1`, cm→601; `60.10`, cm→601; `60.01`, cm is rejected, never rounded. Empty/whitespace means unknown; `0` length is invalid while zero position/quantity is legal. Reject sign-minus, exponent, comma grouping, embedded unit text, NaN and Infinity; `+` is not accepted. Max raw numeric field 64 bytes, max 16 fractional digits before rejecting oversized input. UI unit choices supply meaning; no locale guessing. Display-unit conversion also uses Rust, not parseFloat.

Exact grammar after trim: mm/count `[0-9]+`; cm `[0-9]+(\.[0-9]{1,16})?`. Leading zeroes are accepted then canonicalized; `.1` and `60.` are incomplete/invalid on commit, not inferred values. RawUncertaintyDto uses `state: unknown|bounded` and camelCase `minusText`, `plusText`, `unit`; both bounds use the same exact decimal grammar but allow zero, never missing-as-zero. Raw user measurements normalize to Unverified provenance with absent observation time unless a separately evidenced explicit confirmation command supplies confirmation; selecting UserMeasured alone does not confirm. Synthetic fixtures carry Synthetic/Unverified unless the fixture explicitly declares its test-assumption evidence.

Raw position input is the explicit signed exception: integer mm grammar `-?[0-9]+`, checked PositionMm range, with `-0` canonicalized to zero; it is never accepted as a negative physical length. Whole-KRW money, mass grams and clearance mm use unsigned integer grammar and their own scalar bounds. WASM_PROTOCOL specifies the bounded catalog-field normalization and complete-record verification commands; browser import adapters do not perform these authoritative conversions.

All extent sums, interval bounds, quantities, pack counts, costs and mass aggregates use checked arithmetic with u64/i64/u128 intermediates as appropriate. Volumes are u128 internally and decimal strings if exposed. Never downcast before range-checking. `ceil(needed/pack)` is quotient + nonzero-remainder, avoiding unchecked `needed+pack-1`.

## 2. Facts, uncertainty and field-level evidence

```rust
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Fact<T> {
    Known { value: T, provenance: Provenance },
    Unknown { reason: UnknownReason },
    NotApplicable { reason_code: String },
}
pub struct Provenance {
    pub origin: MeasurementOrigin,
    pub verification: VerificationStatus,
    pub evidence_ids: Vec<Id>,
    pub rule_ids: Vec<String>,
    pub input_refs: Vec<FieldRef>,
    pub observed_at: Option<String>, // RFC3339 UTC; absence isn't 'now'
}
pub enum MeasurementOrigin {
    Synthetic, Manufacturer, Retailer, UserMeasured, UserDeclared, AiEstimated, Derived,
}
pub enum VerificationStatus { Unverified, Estimated, Confirmed }
pub enum UnknownReason { NotMeasured, NotProvided, SourceMissing, ConflictingSources }
pub enum Uncertainty {
    Unknown,
    Bounded { minus_mm: ClearanceMm, plus_mm: ClearanceMm },
}
pub struct MeasuredLength { pub nominal: LengthMm, pub uncertainty: Uncertainty }
pub type Measurement = Fact<MeasuredLength>;
pub struct MeasuredOffset { pub nominal: PositionMm, pub uncertainty: Uncertainty }
pub struct Evidence {
    pub id: Id,
    pub source_kind: MeasurementOrigin,
    pub locator: Option<String>, // safe reference URL or local reference, never auto fetched
    pub source_field: String,
    pub note: String,
    pub observed_at: Option<String>,
    pub confirmed_by: Option<String>,
}
```

Use serde camelCase for enum variants and fields, explicitly tested. Fact state uses `known`, `unknown`, `notApplicable`; ConstraintCheck statuses deliberately use `not_applicable` per source contract. Different vocabulary is explicit, not a generator default.

Derived facts (probe widths, packs, BOM totals and computed checks) use origin Derived, exact rule IDs and input field references, with no invented observation timestamp. Their verification field describes successful computation under declared inputs, not independent physical source confirmation. Raw imports cannot gain physical Confirmed status by declaring Derived.

Knowledge, evidence quality and uncertainty are orthogonal. Known nominal + estimated provenance is not unknown; confirmed provenance does not imply zero error. A user measurement is not automatically confirmed. Known zero money/quantity is meaningful. Required length fields reject NotApplicable. Price/shipping may be N/A for an entirely purchase-free plan; a vendor missing shipping information is Unknown. Every field has its own provenance: outer width and inner height can have different sources/status/times.

For bounded uncertainty, length interval is [nominal−minus, nominal+plus], inclusive, checked and positive within domain. A signed offset is the exception: the same checked subtraction and addition apply, but the nominal and both endpoints must lie in PositionMm (−20000..=20000) and both nonnegative bounds in ClearanceMm (0..=10000). Zero and a legal zero-crossing interval stay known. Positive-length validation is not applied to `abs(nominal)`, and a missing bound is not stored as zero. Missing interval information stays Unknown. Conservative capacity uses available minimum; occupied geometry uses extent maximum. Positions/obstacle boundaries use interval bounds; don't move an uncertain obstacle to its most convenient location. Apply measurement error once and a separately evidenced installation gap once. Repeated measurements preserve observations and normalize a justified guaranteed interval; do not claim a statistical confidence interval from ad hoc min/max.

## 3. Project and physical world

```rust
pub struct Project {
    pub id: Id,
    pub name: String,
    pub project_revision: Revision,
    pub input_revision: Revision,
    pub input: ProjectInput,
}
pub struct ProjectInput {
    pub catalog_pin: CatalogPin,
    pub search: SearchSelection,
    pub space: Space,
    pub items: Vec<Item>,
    pub groups: Vec<ItemGroup>,
    pub owned_containers: Vec<OwnedContainer>,
    pub strategy_choice: Strategy,
    pub constraints: UserConstraints,
    pub preferences: Preferences,
    pub evidence: Vec<Evidence>,
}
pub struct CatalogPin { pub catalog_version: String, pub catalog_digest: Digest }
pub struct SearchSelection {
    pub profile: SearchProfile,
    pub budget: SearchBudget,
    pub seed: Option<String>, // reference-v1: None
}
pub struct Dimensions { pub width: Measurement, pub depth: Measurement, pub height: Measurement }
pub struct Vec3Mm { pub x: PositionMm, pub y: PositionMm, pub z: PositionMm }
pub struct Extent3Mm { pub width: LengthMm, pub depth: LengthMm, pub height: LengthMm }
pub struct Cuboid { pub min: Vec3Mm, pub extent: Extent3Mm }
pub struct Space {
    pub id: Id,
    pub kind: SpaceKind, // only RectangularCompartment supported
    pub interior: Dimensions,
    pub opening: SpaceOpening,
    pub staging: StagingEnvelope,
    pub support: SupportSurface,
    pub obstacles: Vec<Obstacle>,
    pub clearances: ClearancePolicy,
}
pub struct SpaceOpening {
    pub plane: OpeningPlane, // FrontYZero only
    pub left: Fact<MeasuredOffset>,
    pub bottom: Fact<MeasuredOffset>,
    pub width: Measurement,
    pub height: Measurement,
}
pub struct Obstacle {
    pub id: Id,
    pub bounds: MeasuredCuboid,
    pub role: ObstacleRole, // PhysicalSolid or AccessExclusion
}
pub struct SupportSurface {
    pub id: Id,
    pub kind: SupportKind, // EstablishedFloor or ContainerCavityFloor only in v1
    pub footprint: MeasuredRectangle,
    pub elevation: Fact<MeasuredOffset>,
    pub load_limit: Fact<MassGrams>,
}
pub struct Item {
    pub id: Id,
    pub label: String,
    pub category: String,
    pub quantity: Fact<Quantity>,
    pub dimensions: ItemDimensions,
    pub mass_each: Fact<MassGrams>,
    pub requirement: StorageRequirement,
    pub frequency: Fact<Frequency>,
    pub activity_ids: Vec<Id>,
    pub stock_role: Fact<StockRole>,
}
pub struct ItemDimensions {
    pub storage_state: String, // folded/stored condition, not arbitrary compression
    pub envelope: Dimensions,
}
pub struct ItemGroup {
    pub id: Id, pub label: String, pub item_ids: Vec<Id>,
    pub split_policy: GroupSplitPolicy,
}
pub enum GroupSplitPolicy { OneTarget, AllowMultipleTargets }
pub struct StorageRequirement {
    pub allowed_orientations: Fact<Vec<Orientation>>,
    pub allowed_retrieval_modes: Vec<RetrievalMode>,
    pub handling: HandlingClearance,
    pub must_stay_together: bool,
    pub mandatory_compatibility: Vec<Id>,
}
```

`MeasuredCuboid` consists of three Fact<MeasuredOffset> min axes and Dimensions; `MeasuredRectangle` has x/y offsets and width/depth. Unknown positions do not default to zero. ClearancePolicy has independently sourced wall left/right/front/back/top and between-unit physical gaps (nonnegative mm), plus rule IDs. Motion handling margins are separate below. No manufacturer requirements silently replaced by a global 5 mm default. UserConstraints contains hard/soft KRW budget, purchase allowed, hard one-action access, safety restrictions and locked group/zone choices. Preferences contains ranked objective, material/color/visual preferences; no synthetic safety score.

CatalogPin and SearchSelection are part of normalized ProjectInput and its inputDigest. RawProjectInputDto carries them alongside raw measurements; Rust validates rather than trusting IDs/limits. CompileVersions copies these values from normalized input, never accepts conflicting duplicates. Engine-owned schema/canonical/rule/solver versions remain execution context: an engine update makes an old plan stale but is not a user input edit. An empty immutable catalog is valid for direct/owned-only work; it still has a real digest, never an invented null catalog identity.

```rust
pub struct CavityClearancePolicy {
    pub left: Fact<ClearanceMm>, pub right: Fact<ClearanceMm>,
    pub front: Fact<ClearanceMm>, pub back: Fact<ClearanceMm>,
    pub top: Fact<ClearanceMm>, pub between_items: Fact<ClearanceMm>,
}
pub struct HandlingClearance {
    pub left: Fact<ClearanceMm>, pub right: Fact<ClearanceMm>,
    pub top: Fact<ClearanceMm>, pub pull_extra_depth: Fact<ClearanceMm>,
    pub lift_above_rim: Fact<ClearanceMm>,
}
pub struct StagingEnvelope {
    pub free_volume: MeasuredCuboid,
    pub base_support: Fact<StagingSupport>,
}
pub struct StagingSupport { pub load_limit: Fact<MassGrams> }
```

Staging is a measured front free cuboid, ending at y=0, whose base is z=0 in the compartment frame; its x-span and height are measured independently. Its depth is derived from its measured bounds, not duplicated as externalStagingDepth. Known StagingSupport means the entire base footprint is supported; capacity is a separate fact. A real surface at a different height requires unsupported vertical transfer and cannot be assumed level. Missing support, span or headroom stays unknown. Static wall/item clearances and motion margins are checked separately, not added twice to the same physical gap. DirectFrontExtraction does not use liftAboveRim and reports that subcheck NotApplicable with a rule reason; it does not alter the input fact that another permitted recipe may need. Each container physical model carries cavity clearances and handling requirements; effective handling is the conservative maximum of applicable known item/recipe/model requirements with all evidence retained, and remains unknown if an applicable requirement is unknown. StorageRequirement.allowedRetrievalModes is nonempty, unique and canonically sorted. Direct assignments require DirectFrontExtraction; contained/provisional-container assignments require PullContainerThenRetrieve; a recipe cannot silently override these choices. Both may be allowed in the same input so minimum-purchase can compare direct and container options honestly.

Items are homogeneous units at a declared stored shape. Instance identity is `(itemId, ordinal:u32)` for known quantity. Group membership must be unique for the selected grouping; activity tags can overlap but do not duplicate physical inventory. Unknown quantity is not expanded into one imaginary item. An unknown-dimension item remains unassigned or provisionally associated, never a proved physical placement.

### Coordinate and nesting contract

Origin: compartment internal front-left-bottom. x right, y rear, z up; W=x,D=y,H=z. Rigid cuboids use half-open occupied intervals. Positive-volume intersection is collision; touching faces can pass collision and fail a separate clearance requirement. Renderer transforms screen y independently; stored coordinates never switch axis meaning.

```rust
pub enum Orientation { Upright0, Upright90 }
pub enum ParentRef { Space { space_id: Id }, Container { placement_id: Id } }
pub struct Placement {
    pub id: Id,
    pub subject: PlacementSubject,
    pub parent: ParentRef,
    pub position: Vec3Mm, // minimum of oriented AABB in parent frame
    pub orientation: Orientation,
    pub support_id: Id,
}
pub enum PlacementSubject {
    OwnedContainer { owned_id: Id, unit_ordinal: u32 },
    NewContainer { variant_id: Id, unit_ordinal: u32 },
    DirectItem { item_id: Id, unit_ordinal: u32 },
}
pub struct ItemPlacement {
    pub position: Vec3Mm, pub orientation: Orientation, pub support_id: Id,
}
pub struct ItemAssignment {
    pub item_id: Id,
    pub unit_ordinal: u32,
    pub location: ItemLocation,
}
pub enum ItemLocation {
    Direct { placement_id: Id },
    Contained { container_placement_id: Id, local_placement: ItemPlacement },
    ProvisionalContainer { container_placement_id: Id, reason_code: String },
}
pub struct Unassigned {
    pub item_id: Id,
    pub instances: UnassignedInstances,
    pub reason_code: String,
}
pub enum UnassignedInstances {
    Known { ranges: Vec<OrdinalRange> },
    UnknownQuantity,
}
pub struct OrdinalRange { pub start: u32, pub end_exclusive: u32 }
```

DirectItem placements are space children only; containers are space children only; contained items are represented by ItemLocation::Contained, not another Placement for the same item. Every Direct assignment references the matching DirectItem placement; its coordinates exist only there. Every direct placement has exactly one matching assignment. Known item ordinals partition exactly once across Direct/Contained/ProvisionalContainer assignments and unassigned ranges. Ranges are sorted, disjoint, nonempty, within0..quantity, and can compactly retain a remainder beyond the expansion cap; unknown quantity uses UnknownQuantity and has no invented ordinal. Provisional association counts as accounted-for inventory but not geometrically confirmed contents; assignmentCompleteness exposes that distinction.

OneTarget means all known group instances share one container, or all are directly placed in the same declared zone; it never implies one item per group. AllowMultipleTargets permits multiple containers and mixed direct/owned/new targets in that zone, with exact instance conservation. An Item's mustStayTogether additionally forbids splitting that Item's known instances across targets. Any hard together restriction is respected before a visual/strategy preference. The UI records the group split choice explicitly; imported omission is invalid, not an inferred permissive policy.

Container children use the cavity's unrotated local frame, with a separately evidenced inner offset in the original product frame. Only space→container→item nesting. Reject cycles, duplicate instance references, unknown parents, nesting depth>2, unpermitted orientation, floating support and stacking. Geometrically placed means coordinates exist; physical access/load may still be conditional.

For parent yaw90 at (px,py,pz), original outer depth D, a child box with cavity-offset-inclusive min (u,v,w) and local oriented extent (a,b,c) transforms to global min `(px+D−v−b, py+u, pz+w)` and extent `(b,a,c)`. Child orientation is applied before this parent transform. Don't infer symmetric cavity offsets from outer−inner dimension differences. Unknown offset permits a cavity-only capacity diagram but not a fabricated globally positioned child. Parent wall volume is not treated as a solid box colliding with valid contained children; validate children against cavity, siblings and applicable interior obstacles.

## 4. Catalog identity and physical facts

| Entity | Required contract fields |
|---|---|
| Product | id, brand/name/category labels, provenance; no single dimensions that override variants |
| ProductVariant | id, productId, exact option identifiers/labels, VariantDimensions, primitive, allowed orientations, material/color, mass, mounting, compatibility, stackability, evidence |
| VariantDimensions | outer envelope, inner cavity dimensions, inner offset, handles coverage, lid state/coverage, conservative-cavity status |
| Offer | id, variantId, sellerId, reference URL, packQuantity fact, packPrice KRW fact, inventory fact, shipping fact/policy, observedAt; optional declared bundle components |
| OwnedContainer | id, optional variant reference+digest, embedded physical fact copy, owned quantity, available quantity, condition/allowed-use facts, provenance |
| CatalogSnapshot | schemaVersion, catalogVersion, catalogDigest, sourceKind, products/variants/offers/evidence, ingestionVersion, source observations |

```rust
pub struct VariantDimensions {
    pub outer: Dimensions,
    pub inner: Dimensions,
    pub inner_offset: Fact<InnerOffset>,
    pub inner_support: Fact<SupportSurface>, // cavity-local floor, load limit explicit
    pub handles: Fact<HandleEnvelope>,
    pub lid_state: Fact<LidState>,
    pub cavity_model: Fact<CavityModel>,
    pub cavity_clearances: CavityClearancePolicy,
}
pub struct ProductVariant {
    pub id: Id, pub product_id: Id, pub option_label: String,
    pub dimensions: VariantDimensions,
    pub primitive: StoragePrimitive,
    pub allowed_orientations: Fact<Vec<Orientation>>,
    pub mass: Fact<MassGrams>,
    pub material: Fact<String>, pub color: Fact<String>,
    pub compatibility: Fact<Vec<Id>>,
    pub mounting: Fact<MountingRequirement>,
    pub stackability: Fact<Stackability>,
    pub handling: HandlingClearance,
}
pub struct Offer {
    pub id: Id, pub variant_id: Id, pub seller_id: Id,
    pub url: Fact<String>,
    pub pack_quantity: Fact<PackQuantity>,
    pub pack_price: Fact<MoneyKrw>,
    pub inventory: Fact<InventoryState>,
    pub shipping: Fact<ShippingRule>,
    pub observed_at: Option<String>,
}
```

InnerSupport uses SupportSurface in the cavity-local frame: footprint must cover supported children, elevation0 is the cavity floor definition, and loadLimit is an independent fact. Its id is scoped by container placement so two instances do not share a physical support identity. Unknown cavity load does not inherit the compartment floor capacity.

InnerOffset carries three measured offsets; HandleEnvelope declares included-in-outer / known extra axis extents / unknown. Unknown protrusions mean conditional outer fit. Supported mounting is none; unknown mounting is a condition, positive mounting requirement rejects v1 candidate. Stackability is modeled as data but stacking execution is unsupported regardless of a positive catalog flag. Lid products are excluded; explicitly lid-removed configurations require their own documented physical variant and retrieval geometry, not guessed removal.

A variant ID is stable within a source namespace and exact manufacturer/retailer physical option. Offer prices change by new catalog snapshot, not by minting fictitious physical variants. New physical size/option requires distinct identity. If a source corrects a dimension for the same exact variant, its ID may remain but its catalog digest changes. Names are never identity keys. User-owned id remains independent from seller inventory and is captured by value in normalized input.

Synthetic catalog IDs start `syn:` and have sourceKind `synthetic`, no real brand or purchase URL. ~20 entries form functional demo fixtures; 100 form a separate benchmark. Real entries cannot gain confirmed status merely by import. Source URL ownership, data/image licensing and physical field verification are separate. Clean boundary: bytes → bounded parse → raw DTO → Rust domain validation → field issues → user-confirmed import → immutable catalog snapshot. No scraper or implicit URL fetch.

v1 offers cover homogeneous variant packs only. If a recipe needs separately sold components, every component becomes a dependency line or the unsupported combination is rejected. Bundled heterogeneous packs and conditional discount engines remain unsupported until explicit accounting tests exist; never double-count included pieces. Fixed known shipping per seller can be evaluated; unknown/complex policy remains unknown.

## 5. Strategy and intermediate representation

```rust
pub enum StoragePrimitive { DirectPlacement, OpenBin, Tray, VerticalFile }
pub enum Strategy {
    MinimumPurchase, FrequencySeparation, ActivityGrouping,
    ActiveReserveSeparation, OneActionAccess,
}
pub struct StrategyDecision {
    pub strategy: Strategy,
    pub rule_ids: Vec<String>,
    pub fact_refs: Vec<FieldRef>,
    pub groups: Vec<ResolvedGroup>,
    pub zones: Vec<Zone>,
    pub priorities: Vec<GroupPriority>,
    pub reasons: Vec<Reason>,
    pub assumptions: Vec<Condition>,
}
pub struct Recipe {
    pub id: Id, pub strategy: Strategy, pub group_id: Id, pub zone_id: Id,
    pub primitive: StoragePrimitive,
    pub catalog_constraints: Vec<CatalogConstraint>,
    pub placement_constraints: Vec<PlacementConstraint>,
    pub retrieval: RetrievalMode,
    pub handling: HandlingClearance,
    pub reason_ids: Vec<Id>,
}
```

Zone is a preference region or hard locked region with explicit bounds; a label “front” is insufficient. Default frequency zones split depth at floor(D/2) in normalized integer mm; unknown depth cannot create zones. Hard/soft type is explicit. Facts/field references use entity ID + typed field path, not arbitrary evaluation strings. Reasons carry rule ID, fact references and message parameters, so TS translates without inventing claims. `closedBin` and other future primitives are not valid supported-enum values; imports return unsupported rather than fallback to openBin.

## 6. Checks, BOM, guide and search output

The solver/validator boundary is a complete proposal without trusted pass flags:

```rust
pub struct CandidateLayout {
    pub placements: Vec<Placement>,
    pub assignments: Vec<ItemAssignment>,
    pub unassigned: Vec<Unassigned>,
    pub purchase_selections: Vec<PurchaseSelection>,
}
pub struct PurchaseSelection {
    pub placement_id: Id,
    pub offer: OfferSelection,
}
pub enum OfferSelection {
    Selected { offer_id: Id },
    Unresolved { reason_code: String },
}
```

Exactly one PurchaseSelection is required for each NewContainer placement, none for owned/direct placements. A selected offer must exist in the pinned catalog and refer to that exact variant. An unresolved selection produces unknown procurement facts; no pack1/free/in-stock default. Reference search chooses one homogeneous offer per variant across its new placements; different sellers/pack choices are purchase alternatives, not different physical alternatives. Manual SelectOffer also updates all new placements of that variant atomically. SnapshotContent retains purchaseSelections sorted by placementId; BOM references that binding and does not query another catalog or independently select a cheaper offer. No current offer can be borrowed to complete a historical quote.

```rust
pub enum CheckStatus { Pass, Fail, Unknown, NotApplicable }
pub enum CheckKind {
    OuterGeometry, InnerCapacity, InstallationPath, OperationalAccess,
    SupportGeometry, SupportLoad, Orientation, QuantityConservation,
    Compatibility, Inventory, Price, Shipping, Budget,
}
pub struct ConstraintCheck {
    pub id: Id, pub kind: CheckKind, pub subject_ids: Vec<Id>,
    pub status: CheckStatus, pub reason_code: String,
    pub basis: CheckBasis, // Nominal or Conservative or NonGeometric
    pub evidence_refs: Vec<FieldRef>,
    pub measurements: Vec<CheckMeasurement>,
    pub blocking: bool,
    pub remediation: Vec<Remediation>,
}
pub struct ValidationReport {
    pub checks: Vec<ConstraintCheck>,
    pub physical_assurance: PhysicalAssurance,
    pub assignment_completeness: AssignmentCompleteness,
    pub commerce_readiness: CommerceReadiness,
}
pub enum PhysicalAssurance { ConfirmedWithinScope, Conditional, Rejected }
pub struct SearchBudget {
    pub max_work_units: WorkCount,
    pub max_nodes: u32,
    pub max_candidates_per_group: u16,
    pub max_alternatives: u8,
}
pub struct SearchProfile { pub id: String, pub version: u32 }
pub struct SearchResult {
    pub termination: SearchTermination,
    pub scope: SearchScope,
    pub consumed: SearchCounters,
    pub alternatives: Vec<PlanSnapshot>,
    pub diagnostic_candidates: Vec<RejectedCandidate>,
}
pub struct BOMLine {
    pub id: Id, pub variant_id: Option<Id>, pub owned_id: Option<Id>,
    pub placement_ids: Vec<Id>, pub offer_id: Option<Id>,
    pub physical_needed: Quantity, pub reused: Quantity,
    pub new_units_needed: Quantity, pub pack_quantity: Fact<PackQuantity>,
    pub packs_to_order: Fact<Quantity>, pub supplied: Fact<UnitCount>,
    pub surplus: Fact<UnitCount>, pub product_subtotal: Fact<MoneyKrw>,
    pub evidence_refs: Vec<FieldRef>,
}
pub struct ActionStep {
    pub id: Id, pub kind: ActionKind, pub subject_ids: Vec<Id>,
    pub prerequisite_step_ids: Vec<Id>,
    pub required_confirmations: Vec<Id>,
    pub reason_ids: Vec<Id>,
}
```

Unknown quantities use Fact rather than zero-valued placeholders in aggregate summaries. `unassigned` retains the exact ordinal ranges or UnknownQuantity and a reason; displayed counts are Rust-derived from that partition. No assigned or unassigned instance disappears. Provisional association with an unknown interior is reported separately from geometrically placed content; it does not claim capacity. Known rejected geometry is never accepted as a positive plan.

Input Quantity's 10000 cap must not be reused for procurement aggregate results: needed10000 with pack9999 yields packs2, supplied19998 and surplus9998. UnitCount holds supplied/surplus and aggregate counts; use checked u64 intermediate and reject overflow before narrowing to u32. This edge case is mandatory from Task001.

RetrievalMode supports DirectFrontExtraction and PullContainerThenRetrieve only in v1. Both depend on fixed orientation, known staging geometry and explicit handling margins. Inner retrieval may require a known lift allowance after pull-out; missing data stays unknown. OneActionAccess is zero other-container moves plus the declared retrieval operation, not a marketing score. Actions encode necessary clear-space, sort, acquire/arrived, install in validated order, transfer contents, label, verify-unassigned and resolve-condition steps. A dependent step cannot be completed before its prerequisites/confirmations. Arrival is a user assertion stored as action progress, not inferred inventory.

## 7. Immutable snapshot and version identities

```rust
pub struct CompileVersions {
    pub schema_version: u32,
    pub canonical_version: u32,
    pub input_digest: Digest,
    pub catalog_version: String,
    pub catalog_digest: Digest,
    pub rule_version: String,
    pub solver_version: String,
    pub search_profile: SearchProfile,
    pub search_budget: SearchBudget,
    pub seed: Option<String>,
}
pub enum PlanCreation { ReferenceSearch, ManualEdit }
pub struct SnapshotContent {
    pub creation: PlanCreation, // ReferenceSearch or ManualEdit
    pub versions: CompileVersions,
    pub input_facts: ProjectInput,
    pub referenced_catalog: CatalogEvidenceSubset,
    pub strategy: StrategyDecision,
    pub placements: Vec<Placement>,
    pub assignments: Vec<ItemAssignment>,
    pub unassigned: Vec<Unassigned>,
    pub purchase_selections: Vec<PurchaseSelection>,
    pub validation: ValidationReport,
    pub bom: Vec<BOMLine>,
    pub cost_summary: CostSummary,
    pub actions: Vec<ActionStep>,
    pub scope: SearchScope,
}
pub struct PlanSnapshot { pub plan_snapshot_id: Digest, pub content: SnapshotContent }
pub struct SnapshotBinding {
    pub project_id: Id, pub input_revision: Revision, pub plan_snapshot_id: Digest,
}
pub struct ExecutionObservation {
    pub request_id: Id, pub duration_ms: u32,
    pub interrupted_by: Option<Interruption>, pub consumed: SearchCounters,
}
```

Only the core finalizer creates PlanSnapshot from a layout and immutable context. Caller-supplied `pass` or snapshot ID is not trusted. It reruns required checks, verifies conservation, computes BOM/guide, then hashes canonical content. On restored/imported data recompute digest and structural checks; never blindly trust a stored “validated” flag. Old supported schema plans may be shown historical, but current use requires current semantic validation where rule versions differ.

| Field | Changes when | Persisted? |
|---|---|---|
| schemaVersion | Serialized shape or field semantics incompatibly change; v1=1 | Yes, every external record |
| canonicalVersion | Canonical byte rules change | Yes, hashed material |
| projectRevision | Any successful project-bound durable transaction, incl draft/progress/accept | Yes; CAS counter |
| inputRevision | Normalized input/evidence/constraints/preferences semantically change | Yes; monotonic; input-edit undo increments only on changed digest, layout-only undo retains it |
| editorEpoch | Domain-affecting raw edit, immediately including invalid text | Session-local request guard; draft stores source epoch with its session ID only |
| projectActivationId | Project switch/reopen, even to same project/revision | No authoritative persistence |
| workerSessionId | New worker instance | No |
| inputDigest | Canonical normalized planning input changes | Yes |
| catalogVersion | Human-readable immutable catalog release ID changes | Yes |
| catalogDigest | Any canonical catalog fact/provenance/offer changes | Yes |
| ruleVersion | Normalization/strategy/validator/BOM/guide semantic rules change | Yes |
| solverVersion | Enumeration, pruning, tie-break or ranking behavior changes | Yes |
| searchProfile/budget | Scope/limits or reproducibility configuration changes | Yes |
| seed | Reference profile uses none (`null`); future seeded profile explicit | Yes |
| planSnapshotId | Canonical snapshot content changes | Yes |

Formatting-only unit changes do not increment inputRevision if Rust confirms normalized equality. Label/provenance changes affecting snapshot content do increment it. Raw incomplete input persists as draft without replacing the last valid input. Revision allocation occurs consistently with PERSISTENCE transaction semantics; no two tabs reserve the same revision and silently win. Catalog selection/reference changes are input changes; merely discovering an unused newer catalog does not mutate input or old plans.

Canonical v1: UTF-8 JSON; Rust recursively sorts object keys by byte order; fixed lower-case tags; integers use base-10 with no leading zeroes or negative zero; strings are NFC-normalized on input, JSON escaping follows serde_json compact output; no floats in authoritative content. Set-like arrays (IDs, checks, placements, evidence) are sorted by stable semantic keys and duplicates rejected; ordered priority lists and action topological sequence retain semantic order. SHA-256 hashes the entire canonical SnapshotContent including rule/solver/profile/budget/catalog and field observation times, excluding project binding, acceptance/progress, runtime request IDs, run timestamps/durations/device, mutable search progress and termination timing. `inputDigest` excludes project identity/revisions and derived caches. Full referenced catalog subset supports historical display; full catalog remains pinned by digest for recomputation.

PlanSnapshot ID means identical authoritative content. Two plans can have equal physical layout but different prices/evidence/versions and hence different IDs. Alternative dedup uses a separate layout-equivalence signature of physical variant/owned identity, oriented positions, item assignments and strategy outcomes; it excludes prose/placement generated IDs and commerce observations. Offer alternatives for the same geometry belong to purchase comparison, not fake extra physical plans. IDs derived for placements/actions use stable subject and ordered enumeration keys, never clock/random completion order.

Stale is derived from draft dirty/epoch mismatch, binding/input mismatch, or selected compile-context version/digest mismatch. Never persist a boolean and trust it later. Saved historical snapshots remain byte-stable when catalog or rules update.

### Manual layout edits and undo: a separate revision rule

Manual moves/rotations/replacements change a requested layout, not measured ProjectInput. They increment editorEpoch immediately and projectRevision on durable acceptance, retain inputRevision/inputDigest when those source facts are unchanged, and produce a new PlanSnapshot/content ID/binding with `creation: manualEdit`. Reference solver determinism applies to `creation: referenceSearch`; it does not require the user's manually chosen geometry to equal the solver's selected geometry. Final validation/BOM/guide/identity are still exclusively Rust.

The frozen LayoutEditCommand variants are MovePlacement{placementId,position}, RotatePlacement{placementId,orientation}, ReplaceVariant{placementId,variantId,offerId:Option<Id>}, SelectOffer{variantId,offerId} and RestoreLayout{sourceSnapshotId}. All serialize with `kind` camelCase tags and generated fields. Commands reference a current base snapshot and immutable catalog; replacing revalidates contained assignments, sizes, support, access and BOM, retaining any now-unassigned items. ReplaceVariant with Some(offerId) first verifies its target variant reference, then applies that explicit offer to every new placement of the target variant atomically. With None, if any other new placement of the target variant already has a Selected offer, reject with invalid_input/reason offer_selection_required; otherwise mark the replaced placement Unresolved/offer_not_selected. Never silently inherit an offer or mix Selected and Unresolved for the same variant. SelectOffer updates all matching new-container purchase selections, then Rust re-finalizes validation/BOM/guide/identity as a manual edit. The UI discloses every affected purchase line/placement before accepting the result. RestoreLayout receives the corresponding source snapshot through the validated context rather than trusting an ID alone; it revalidates its proposed layout against current input/catalog. A stale base requires reconciliation first, never silent rebinding.

Input edits/undo (measurements, groups, strategy, preferences) allocate a new inputRevision only if Rust digest changes. Layout-only undo restores a prior requested layout through validateEdit and updates editorEpoch/projectRevision, not inputRevision. All durable revisions move forward or stay unchanged according to their own scope; none decrements. Undo may reuse an existing byte-identical content ID, but does not revive old request identity. User action progress remains keyed to complete binding; deliberately restoring the exact previously accepted binding can expose its saved progress, while a different snapshot ID or inputRevision starts separate progress. No automatic progress transfer across bindings.

## 8. Schema generation and migrations

Single Rust DTO declarations export draft-07 Schema. Explicit custom schemas cover decimal-string u64, nonnegative integer ranges, tagged variants and deny additional properties. Build generates `apps/web/src/contracts/generated/` types and standalone shape validators; native and browser fixtures verify Serde/schema agreement. No hand-edited generated declarations, second domain Zod tree or remote `$ref` resolution.

Task 001 implements only bootstrap DTO roots using the final envelope. Task 002 completes/fixes v1 before persisted real projects. Capability negotiation distinguishes unimplemented operations without inventing schemas. After persistence launch, incompatible changes require schema increment, deterministic tested migration, export/recovery path and an explicit related task; unrelated feature work may not change frozen contracts for convenience. See PERSISTENCE for transaction/migration mechanics.
