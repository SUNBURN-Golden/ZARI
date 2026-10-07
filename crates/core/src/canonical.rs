//! Canonical serialization and content digests (DOMAIN_MODEL §7).
//!
//! Canonical v1: UTF-8 JSON, object keys sorted by byte order (serde_json's
//! `Map` is a BTreeMap), compact serde_json escaping, base-10 integers, no
//! floats, NFC-normalized strings. Set-like collections are sorted by stable
//! semantic keys during canonicalization so ordering-nonsemantic permutations
//! hash equally; ordered lists (priorities, action sequences) keep their
//! semantic order.

use crate::catalog::*;
use crate::facts::*;
use crate::input::*;
use crate::plan::*;
use crate::scalars::*;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest as Sha2Digest, Sha256};
use unicode_normalization::UnicodeNormalization;

pub const SCHEMA_VERSION: u32 = 1;
pub const CANONICAL_VERSION: u32 = 1;
/// Guide meaning from SP-013. `zari-domain-v1` snapshots stay readable and
/// are not completable. See `docs/adr/SP-013-execution-guide.md`.
pub const RULE_VERSION: &str = "zari-domain-v2";
/// `zari-solver-v1`: resumable bounded rule→strategy→recipe→placement search.
pub const SOLVER_VERSION: &str = "zari-solver-v1";

fn canonicalize_strings(value: Value) -> Value {
    match value {
        Value::String(text) => Value::String(text.nfc().collect()),
        Value::Array(values) => {
            Value::Array(values.into_iter().map(canonicalize_strings).collect())
        }
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, value)| (key.nfc().collect(), canonicalize_strings(value)))
                .collect(),
        ),
        scalar => scalar,
    }
}
/// Canonical JSON value: sorted keys via BTreeMap plus NFC strings.
pub fn canonical_value<T: Serialize>(value: &T) -> Value {
    canonicalize_strings(serde_json::to_value(value).expect("typed DTO serializes"))
}
pub fn canonical_bytes<T: Serialize>(value: &T) -> Vec<u8> {
    serde_json::to_vec(&canonical_value(value)).expect("canonical value serializes")
}
pub fn content_digest<T: Serialize>(value: &T) -> Digest {
    Digest::from_sha256(Sha256::digest(canonical_bytes(value)).into())
}

fn sort_by_id<T: Clone>(items: &[T], id: impl Fn(&T) -> &Id) -> Vec<T> {
    let mut sorted = items.to_vec();
    sorted.sort_by(|a, b| id(a).as_str().cmp(id(b).as_str()));
    sorted
}
fn sorted_ids(ids: &[Id]) -> Vec<Id> {
    let mut sorted = ids.to_vec();
    sorted.sort();
    sorted
}
fn sorted_enums<T: Clone + Ord>(items: &[T]) -> Vec<T> {
    let mut sorted = items.to_vec();
    sorted.sort();
    sorted
}
fn canonical_fact<T: Clone>(fact: &Fact<T>) -> Fact<T> {
    match fact {
        Fact::Known { value, provenance } => Fact::Known {
            value: value.clone(),
            provenance: canonical_provenance(provenance),
        },
        other => other.clone(),
    }
}
fn canonical_provenance(provenance: &Provenance) -> Provenance {
    let mut normalized = provenance.clone();
    normalized.evidence_ids = sorted_ids(&normalized.evidence_ids);
    normalized.rule_ids.sort();
    normalized.input_refs.sort();
    normalized
}

fn canonical_dimensions(dimensions: &Dimensions) -> Dimensions {
    Dimensions {
        width: canonical_fact(&dimensions.width),
        depth: canonical_fact(&dimensions.depth),
        height: canonical_fact(&dimensions.height),
    }
}
fn canonical_offset_fact(fact: &Fact<MeasuredOffset>) -> Fact<MeasuredOffset> {
    canonical_fact(fact)
}
fn canonical_rectangle(rectangle: &MeasuredRectangle) -> MeasuredRectangle {
    MeasuredRectangle {
        x: canonical_offset_fact(&rectangle.x),
        y: canonical_offset_fact(&rectangle.y),
        width: canonical_fact(&rectangle.width),
        depth: canonical_fact(&rectangle.depth),
    }
}
fn canonical_cuboid(cuboid: &MeasuredCuboid) -> MeasuredCuboid {
    MeasuredCuboid {
        min_x: canonical_offset_fact(&cuboid.min_x),
        min_y: canonical_offset_fact(&cuboid.min_y),
        min_z: canonical_offset_fact(&cuboid.min_z),
        extent: canonical_dimensions(&cuboid.extent),
    }
}
fn canonical_support(surface: &SupportSurface) -> SupportSurface {
    SupportSurface {
        id: surface.id.clone(),
        kind: surface.kind.clone(),
        footprint: canonical_rectangle(&surface.footprint),
        elevation: canonical_fact(&surface.elevation),
        load_limit: canonical_fact(&surface.load_limit),
    }
}
fn canonical_clearances(policy: &ClearancePolicy) -> ClearancePolicy {
    let mut rule_ids = policy.rule_ids.clone();
    rule_ids.sort();
    ClearancePolicy {
        left: canonical_fact(&policy.left),
        right: canonical_fact(&policy.right),
        front: canonical_fact(&policy.front),
        back: canonical_fact(&policy.back),
        top: canonical_fact(&policy.top),
        between_units: canonical_fact(&policy.between_units),
        rule_ids,
    }
}
fn canonical_cavity_clearances(policy: &CavityClearancePolicy) -> CavityClearancePolicy {
    CavityClearancePolicy {
        left: canonical_fact(&policy.left),
        right: canonical_fact(&policy.right),
        front: canonical_fact(&policy.front),
        back: canonical_fact(&policy.back),
        top: canonical_fact(&policy.top),
        between_items: canonical_fact(&policy.between_items),
    }
}
fn canonical_handling(handling: &HandlingClearance) -> HandlingClearance {
    HandlingClearance {
        left: canonical_fact(&handling.left),
        right: canonical_fact(&handling.right),
        top: canonical_fact(&handling.top),
        pull_extra_depth: canonical_fact(&handling.pull_extra_depth),
        lift_above_rim: canonical_fact(&handling.lift_above_rim),
    }
}
fn canonical_orientations(fact: &Fact<Vec<Orientation>>) -> Fact<Vec<Orientation>> {
    match canonical_fact(fact) {
        Fact::Known { value, provenance } => Fact::Known {
            value: sorted_enums(&value),
            provenance,
        },
        other => other,
    }
}
fn canonical_id_list(fact: &Fact<Vec<Id>>) -> Fact<Vec<Id>> {
    match canonical_fact(fact) {
        Fact::Known { value, provenance } => Fact::Known {
            value: sorted_ids(&value),
            provenance,
        },
        other => other,
    }
}
fn canonical_space(space: &Space) -> Space {
    Space {
        id: space.id.clone(),
        kind: space.kind.clone(),
        interior: canonical_dimensions(&space.interior),
        opening: SpaceOpening {
            plane: space.opening.plane.clone(),
            left: canonical_offset_fact(&space.opening.left),
            bottom: canonical_offset_fact(&space.opening.bottom),
            width: canonical_fact(&space.opening.width),
            height: canonical_fact(&space.opening.height),
        },
        staging: StagingEnvelope {
            free_volume: canonical_cuboid(&space.staging.free_volume),
            base_support: match canonical_fact(&space.staging.base_support) {
                Fact::Known { value, provenance } => Fact::Known {
                    value: StagingSupport {
                        load_limit: canonical_fact(&value.load_limit),
                    },
                    provenance,
                },
                other => other,
            },
        },
        support: canonical_support(&space.support),
        obstacles: sort_by_id(&space.obstacles, |o| &o.id)
            .into_iter()
            .map(|o| Obstacle {
                id: o.id,
                bounds: canonical_cuboid(&o.bounds),
                role: o.role,
            })
            .collect(),
        clearances: canonical_clearances(&space.clearances),
    }
}
fn canonical_item(item: &Item) -> Item {
    Item {
        id: item.id.clone(),
        label: item.label.clone(),
        category: item.category.clone(),
        quantity: canonical_fact(&item.quantity),
        dimensions: ItemDimensions {
            storage_state: item.dimensions.storage_state.clone(),
            envelope: canonical_dimensions(&item.dimensions.envelope),
        },
        mass_each: canonical_fact(&item.mass_each),
        requirement: StorageRequirement {
            allowed_orientations: canonical_orientations(&item.requirement.allowed_orientations),
            allowed_retrieval_modes: sorted_enums(&item.requirement.allowed_retrieval_modes),
            handling: canonical_handling(&item.requirement.handling),
            must_stay_together: item.requirement.must_stay_together,
            mandatory_compatibility: sorted_ids(&item.requirement.mandatory_compatibility),
        },
        frequency: canonical_fact(&item.frequency),
        activity_ids: sorted_ids(&item.activity_ids),
        stock_role: canonical_fact(&item.stock_role),
    }
}
fn canonical_variant_dimensions(dimensions: &VariantDimensions) -> VariantDimensions {
    VariantDimensions {
        outer: canonical_dimensions(&dimensions.outer),
        inner: canonical_dimensions(&dimensions.inner),
        inner_offset: match canonical_fact(&dimensions.inner_offset) {
            Fact::Known { value, provenance } => Fact::Known {
                value: InnerOffset {
                    x: canonical_offset_fact(&value.x),
                    y: canonical_offset_fact(&value.y),
                    z: canonical_offset_fact(&value.z),
                },
                provenance,
            },
            other => other,
        },
        inner_support: match canonical_fact(&dimensions.inner_support) {
            Fact::Known { value, provenance } => Fact::Known {
                value: canonical_support(&value),
                provenance,
            },
            other => other,
        },
        handles: canonical_fact(&dimensions.handles),
        lid_state: canonical_fact(&dimensions.lid_state),
        cavity_model: canonical_fact(&dimensions.cavity_model),
        cavity_clearances: canonical_cavity_clearances(&dimensions.cavity_clearances),
    }
}
fn canonical_physical(physical: &PhysicalContainerModel) -> PhysicalContainerModel {
    PhysicalContainerModel {
        dimensions: canonical_variant_dimensions(&physical.dimensions),
        primitive: physical.primitive.clone(),
        allowed_orientations: canonical_orientations(&physical.allowed_orientations),
        mass: canonical_fact(&physical.mass),
        handling: canonical_handling(&physical.handling),
    }
}
fn canonical_owned(owned: &OwnedContainer) -> OwnedContainer {
    OwnedContainer {
        id: owned.id.clone(),
        variant_ref: owned.variant_ref.clone(),
        physical: canonical_physical(&owned.physical),
        quantity_owned: canonical_fact(&owned.quantity_owned),
        quantity_available: canonical_fact(&owned.quantity_available),
        condition: canonical_fact(&owned.condition),
        allowed_use: canonical_fact(&owned.allowed_use),
        provenance: canonical_provenance(&owned.provenance),
    }
}
fn canonical_evidence(evidence: &Evidence) -> Evidence {
    evidence.clone()
}

/// Canonical form of a normalized project input: set-like collections sorted
/// by stable semantic keys. Duplicates are kept here and rejected by
/// validation so canonicalization never silently drops content.
pub fn canonicalize_input(input: &ProjectInput) -> ProjectInput {
    ProjectInput {
        catalog_pin: input.catalog_pin.clone(),
        search: input.search.clone(),
        space: canonical_space(&input.space),
        items: sort_by_id(&input.items, |i| &i.id)
            .into_iter()
            .map(|i| canonical_item(&i))
            .collect(),
        groups: sort_by_id(&input.groups, |g| &g.id)
            .into_iter()
            .map(|g| ItemGroup {
                id: g.id,
                label: g.label,
                item_ids: sorted_ids(&g.item_ids),
                split_policy: g.split_policy,
            })
            .collect(),
        owned_containers: sort_by_id(&input.owned_containers, |o| &o.id)
            .into_iter()
            .map(|o| canonical_owned(&o))
            .collect(),
        strategy_choice: input.strategy_choice.clone(),
        constraints: UserConstraints {
            hard_budget: canonical_fact(&input.constraints.hard_budget),
            soft_budget: canonical_fact(&input.constraints.soft_budget),
            purchase_allowed: input.constraints.purchase_allowed,
            hard_one_action_access: input.constraints.hard_one_action_access,
            safety_restrictions: sorted_enums(&input.constraints.safety_restrictions),
            locked_zones: sort_by_id(&input.constraints.locked_zones, |l| &l.group_id),
        },
        preferences: input.preferences.clone(),
        evidence: sort_by_id(&input.evidence, |e| &e.id)
            .into_iter()
            .map(|e| canonical_evidence(&e))
            .collect(),
    }
}
/// SHA-256 over the canonical normalized input. Project identity and
/// revisions are excluded by type: `ProjectInput` carries neither.
pub fn input_digest(input: &ProjectInput) -> Digest {
    content_digest(&canonicalize_input(input))
}

fn canonical_product(product: &Product) -> Product {
    Product {
        id: product.id.clone(),
        brand: canonical_fact(&product.brand),
        name: product.name.clone(),
        category: product.category.clone(),
        provenance: canonical_provenance(&product.provenance),
    }
}
fn canonical_variant(variant: &ProductVariant) -> ProductVariant {
    ProductVariant {
        id: variant.id.clone(),
        product_id: variant.product_id.clone(),
        option_label: variant.option_label.clone(),
        dimensions: canonical_variant_dimensions(&variant.dimensions),
        primitive: variant.primitive.clone(),
        allowed_orientations: canonical_orientations(&variant.allowed_orientations),
        mass: canonical_fact(&variant.mass),
        material: canonical_fact(&variant.material),
        color: canonical_fact(&variant.color),
        compatibility: canonical_id_list(&variant.compatibility),
        mounting: canonical_fact(&variant.mounting),
        stackability: canonical_fact(&variant.stackability),
        handling: canonical_handling(&variant.handling),
    }
}
fn canonical_offer(offer: &Offer) -> Offer {
    Offer {
        id: offer.id.clone(),
        variant_id: offer.variant_id.clone(),
        seller_id: offer.seller_id.clone(),
        url: canonical_fact(&offer.url),
        pack_quantity: canonical_fact(&offer.pack_quantity),
        pack_price: canonical_fact(&offer.pack_price),
        inventory: canonical_fact(&offer.inventory),
        shipping: canonical_fact(&offer.shipping),
        observed_at: offer.observed_at.clone(),
        bundle_components: offer.bundle_components.clone(),
    }
}
/// The digestable catalog content: every field except the digest itself.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogContent {
    pub schema_version: u32,
    pub catalog_version: String,
    pub source_kind: CatalogSourceKind,
    pub products: Vec<Product>,
    pub variants: Vec<ProductVariant>,
    pub offers: Vec<Offer>,
    pub evidence: Vec<Evidence>,
    pub ingestion_version: String,
    pub source_observations: Vec<SourceObservation>,
}
impl From<&CatalogSnapshot> for CatalogContent {
    fn from(snapshot: &CatalogSnapshot) -> Self {
        Self {
            schema_version: snapshot.schema_version,
            catalog_version: snapshot.catalog_version.clone(),
            source_kind: snapshot.source_kind.clone(),
            products: snapshot.products.clone(),
            variants: snapshot.variants.clone(),
            offers: snapshot.offers.clone(),
            evidence: snapshot.evidence.clone(),
            ingestion_version: snapshot.ingestion_version.clone(),
            source_observations: snapshot.source_observations.clone(),
        }
    }
}
impl From<&CatalogImportDto> for CatalogContent {
    fn from(import: &CatalogImportDto) -> Self {
        Self {
            schema_version: import.schema_version,
            catalog_version: import.catalog_version.clone(),
            source_kind: import.source_kind.clone(),
            products: import.products.clone(),
            variants: import.variants.clone(),
            offers: import.offers.clone(),
            evidence: import.evidence.clone(),
            ingestion_version: import.ingestion_version.clone(),
            source_observations: import.source_observations.clone(),
        }
    }
}
pub fn canonicalize_catalog(content: &CatalogContent) -> CatalogContent {
    CatalogContent {
        schema_version: content.schema_version,
        catalog_version: content.catalog_version.clone(),
        source_kind: content.source_kind.clone(),
        products: sort_by_id(&content.products, |p| &p.id)
            .into_iter()
            .map(|p| canonical_product(&p))
            .collect(),
        variants: sort_by_id(&content.variants, |v| &v.id)
            .into_iter()
            .map(|v| canonical_variant(&v))
            .collect(),
        offers: sort_by_id(&content.offers, |o| &o.id)
            .into_iter()
            .map(|o| canonical_offer(&o))
            .collect(),
        evidence: sort_by_id(&content.evidence, |e| &e.id)
            .into_iter()
            .map(|e| canonical_evidence(&e))
            .collect(),
        ingestion_version: content.ingestion_version.clone(),
        source_observations: sort_by_id(&content.source_observations, |s| &s.id),
    }
}
/// SHA-256 over canonical catalog content (everything but the digest field).
pub fn catalog_digest(content: &CatalogContent) -> Digest {
    content_digest(&canonicalize_catalog(content))
}

fn subject_key(subject: &PlacementSubject) -> (u8, &Id, u32) {
    match subject {
        PlacementSubject::OwnedContainer {
            owned_id,
            unit_ordinal,
        } => (0, owned_id, *unit_ordinal),
        PlacementSubject::NewContainer {
            variant_id,
            unit_ordinal,
        } => (1, variant_id, *unit_ordinal),
        PlacementSubject::DirectItem {
            item_id,
            unit_ordinal,
        } => (2, item_id, *unit_ordinal),
    }
}
/// Canonical snapshot content ordering for the set-like collections the spec
/// names: placements, assignments, unassigned, purchase selections, checks,
/// BOM lines and evidence. Action order is semantic and retained.
pub fn canonicalize_snapshot_content(content: &SnapshotContent) -> SnapshotContent {
    let mut sorted = content.clone();
    sorted.input_facts = canonicalize_input(&sorted.input_facts);
    sorted.referenced_catalog = CatalogEvidenceSubset {
        products: sort_by_id(&sorted.referenced_catalog.products, |p| &p.id)
            .into_iter()
            .map(|p| canonical_product(&p))
            .collect(),
        variants: sort_by_id(&sorted.referenced_catalog.variants, |v| &v.id)
            .into_iter()
            .map(|v| canonical_variant(&v))
            .collect(),
        offers: sort_by_id(&sorted.referenced_catalog.offers, |o| &o.id)
            .into_iter()
            .map(|o| canonical_offer(&o))
            .collect(),
        evidence: sort_by_id(&sorted.referenced_catalog.evidence, |e| &e.id)
            .into_iter()
            .map(|e| canonical_evidence(&e))
            .collect(),
    };
    sorted
        .placements
        .sort_by(|a, b| subject_key(&a.subject).cmp(&subject_key(&b.subject)));
    sorted.assignments.sort_by(|a, b| {
        (a.item_id.as_str(), a.unit_ordinal).cmp(&(b.item_id.as_str(), b.unit_ordinal))
    });
    sorted
        .unassigned
        .sort_by(|a, b| a.item_id.as_str().cmp(b.item_id.as_str()));
    sorted
        .purchase_selections
        .sort_by(|a, b| a.placement_id.as_str().cmp(b.placement_id.as_str()));
    sorted
        .validation
        .checks
        .sort_by(|a, b| a.id.as_str().cmp(b.id.as_str()));
    sorted.bom.sort_by(|a, b| a.id.as_str().cmp(b.id.as_str()));
    sorted
}
/// SHA-256 over the canonical SnapshotContent; the snapshot id binds exactly
/// the authoritative content, never caller-supplied pass flags or identity.
pub fn snapshot_digest(content: &SnapshotContent) -> Digest {
    content_digest(&canonicalize_snapshot_content(content))
}

/// Material hashed into an activation context identity: input + catalog
/// digests and every engine/scope version the spec binds.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextMaterial<'a> {
    schema_version: u32,
    canonical_version: u32,
    input_digest: &'a Digest,
    catalog_digest: &'a Digest,
    rule_version: &'a str,
    solver_version: &'a str,
    search_profile: &'a SearchProfile,
    search_budget: &'a SearchBudget,
    seed: &'a Option<String>,
}
pub fn context_id(input: &ProjectInput, catalog_content: &CatalogContent) -> Digest {
    content_digest(&ContextMaterial {
        schema_version: SCHEMA_VERSION,
        canonical_version: CANONICAL_VERSION,
        input_digest: &input_digest(input),
        catalog_digest: &catalog_digest(catalog_content),
        rule_version: RULE_VERSION,
        solver_version: SOLVER_VERSION,
        search_profile: &input.search.profile,
        search_budget: &input.search.budget,
        seed: &input.search.seed,
    })
}
