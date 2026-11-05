//! Nominal catalog search. Clearance is reserved once at the high end of each
//! axis (default 5 mm); inter-item gaps are zero, so stacks retain contact.
//! No opening, load, tolerance or contents guarantee is inferred from W/D/H.
use crate::{
    canonical::*, catalog::*, facts::*, geometry::Box3, input::Orientation, plan::CheckStatus,
    scalars::*,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use std::collections::BTreeMap;

fn default_clearance() -> [u32; 3] {
    [5; 3]
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitInput {
    pub schema_version: u32,
    pub input_revision: String,
    pub space: [String; 3],
    pub catalog: CatalogSnapshot,
    #[serde(default = "default_clearance")]
    pub clearance_mm: [u32; 3],
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitBlock {
    pub variant_id: String,
    pub name: String,
    pub orientation: Orientation,
    pub unit_mm: [u32; 3],
    pub grid: [u32; 3],
    pub origin_mm: [u32; 3],
    pub quantity: String,
    pub urls: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitChecks {
    pub outer: CheckStatus,
    pub inner: CheckStatus,
    pub installation: CheckStatus,
    pub opening: CheckStatus,
    pub access: CheckStatus,
    pub support_load: CheckStatus,
    pub orientation: CheckStatus,
    pub quantity: CheckStatus,
    pub tolerance: CheckStatus,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitCandidate {
    pub id: String,
    pub blocks: Vec<SpaceFitBlock>,
    pub remaining_mm: [u32; 3],
    pub occupied_volume_mm3: String,
    pub unconfirmed: bool,
    pub checks: SpaceFitChecks,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitPage {
    pub schema_version: u32,
    pub input_revision: String,
    pub catalog_digest: String,
    pub solver_version: String,
    pub space_mm: [u32; 3],
    pub profile: String,
    pub singles: Vec<SpaceFitCandidate>,
    pub combinations: Vec<SpaceFitCandidate>,
    pub inspected_variants: u32,
    pub missing_dimensions: u32,
    pub unavailable_variants: u32,
    pub nodes: u32,
    pub singles_complete: bool,
    pub combinations_complete: bool,
}
#[derive(Clone)]
struct Item {
    variant_index: usize,
    block: SpaceFitBlock,
    max: [u32; 3],
    confirmed: bool,
    orientation_known: bool,
    envelope_known: bool,
}
/// One search owns one catalog/revision. A step does at most 1,000 nodes and
/// returns at most 100 combinations; state stays in the worker until disposed.
pub struct SpaceFitSearch {
    input: SpaceFitInput,
    space: [u32; 3],
    available: [u32; 3],
    items: Vec<Item>,
    singles: Vec<SpaceFitCandidate>,
    missing: u32,
    unavailable: u32,
    stage: u8,
    a: usize,
    b: usize,
    pattern: u32,
    offset: u64,
}
fn confirmed<T>(fact: &Fact<T>) -> bool {
    matches!(fact, Fact::Known { provenance, .. } if provenance.verification == VerificationStatus::Confirmed)
}
impl SpaceFitSearch {
    pub fn new(input: SpaceFitInput) -> Result<Self, String> {
        if input.schema_version != 1
            || input.input_revision.len() > 80
            || input.catalog.variants.len() > 5000
            || input.clearance_mm.iter().any(|c| *c > 10000)
        {
            return Err("space_fit_input_invalid".into());
        }
        let content = CatalogContent::from(&input.catalog);
        if !crate::validate::validate_catalog_content(&content).is_empty()
            || catalog_digest(&content) != input.catalog.catalog_digest
        {
            return Err("space_fit_catalog_invalid".into());
        }
        let mut space = [0; 3];
        for (axis, raw) in input.space.iter().enumerate() {
            space[axis] = parse_length(raw, Unit::Cm)
                .map_err(|_| format!("space_axis_{axis}"))?
                .ok_or_else(|| format!("space_axis_{axis}"))?
                .get();
        }
        let available = std::array::from_fn(|i| space[i].saturating_sub(input.clearance_mm[i]));
        let names: BTreeMap<_, _> = input
            .catalog
            .products
            .iter()
            .map(|p| (&p.id, &p.name))
            .collect();
        let products: BTreeMap<_, _> = input.catalog.products.iter().map(|p| (&p.id, p)).collect();
        let mut offers_by_variant: BTreeMap<_, Vec<_>> = BTreeMap::new();
        for offer in &input.catalog.offers {
            offers_by_variant
                .entry(&offer.variant_id)
                .or_default()
                .push(offer);
        }
        let mut items = vec![];
        let mut missing = 0;
        let mut unavailable = 0;
        for (variant_index, v) in input.catalog.variants.iter().enumerate() {
            // This feature searches storage boxes only, not furniture.
            let product = products.get(&v.product_id);
            if product.is_none_or(|p| p.category != "bin") {
                continue;
            }
            let offers = offers_by_variant.get(&v.id).cloned().unwrap_or_default();
            if !offers.is_empty()
                && offers
                    .iter()
                    .all(|o| o.inventory.value() == Some(&InventoryState::OutOfStock))
            {
                unavailable += 1;
                continue;
            }
            let dims = [
                &v.dimensions.outer.width,
                &v.dimensions.outer.depth,
                &v.dimensions.outer.height,
            ];
            let Some(mut base) = dims
                .iter()
                .map(|f| f.value().map(|m| m.nominal.get()))
                .collect::<Option<Vec<_>>>()
            else {
                missing += 1;
                continue;
            };
            let extra = crate::geometry::handle_extra(&v.dimensions.handles);
            if let Some(extra) = extra {
                for i in 0..3 {
                    base[i] = base[i]
                        .checked_add(extra[i] as u32)
                        .ok_or("envelope_overflow")?;
                }
            }
            // Unknown directions get an explicitly conditional upright0 only.
            let directions = v
                .allowed_orientations
                .value()
                .cloned()
                .unwrap_or_else(|| vec![Orientation::Upright0]);
            let mut seen = vec![];
            for direction in directions {
                let unit = if direction == Orientation::Upright90 {
                    [base[1], base[0], base[2]]
                } else {
                    [base[0], base[1], base[2]]
                };
                if seen.contains(&unit) {
                    continue;
                }
                seen.push(unit);
                if (0..3).any(|i| unit[i] > available[i]) {
                    continue;
                }
                let mut max = std::array::from_fn(|i| available[i] / unit[i]);
                // No tilting or speculative stacking. Only evidenced stackability
                // authorizes K>1; support/load remain separate unknown checks.
                max[2] = match v.stackability.value() {
                    Some(Stackability::Stackable { max_units }) if confirmed(&v.stackability) => {
                        max[2].min(*max_units)
                    }
                    _ => max[2].min(1),
                };
                if max.contains(&0) {
                    continue;
                }
                let urls = offers
                    .iter()
                    .filter_map(|o| o.url.value())
                    .filter(|u| crate::catalog_bundle::allowed_product_url(u))
                    .cloned()
                    .collect();
                items.push(Item {
                    variant_index,
                    block: SpaceFitBlock {
                        variant_id: v.id.to_string(),
                        name: format!("{} {}", names[&v.product_id], v.option_label)
                            .trim()
                            .into(),
                        orientation: direction,
                        unit_mm: unit,
                        grid: [1; 3],
                        origin_mm: [0; 3],
                        quantity: "1".into(),
                        urls,
                    },
                    max,
                    confirmed: dims.iter().all(|f| confirmed(*f)),
                    orientation_known: confirmed(&v.allowed_orientations),
                    envelope_known: extra.is_some(),
                });
            }
        }
        items.sort_by(|a, b| {
            (&a.block.variant_id, a.block.orientation)
                .cmp(&(&b.block.variant_id, b.block.orientation))
        });
        let mut search = Self {
            input,
            space,
            available,
            items,
            singles: vec![],
            missing,
            unavailable,
            stage: 0,
            a: 0,
            b: 1,
            pattern: 0,
            offset: 0,
        };
        for i in 0..search.items.len() {
            if let Some(c) = search.candidate(&[(i, [1; 3], [0; 3])]) {
                search.singles.push(c);
            }
        }
        rank_candidates(&mut search.singles);
        Ok(search)
    }
    fn candidate(&self, selections: &[(usize, [u32; 3], [u32; 3])]) -> Option<SpaceFitCandidate> {
        let mut blocks = vec![];
        let mut unconfirmed = false;
        let mut orientation_known = true;
        let mut envelope_known = true;
        for (index, grid, origin) in selections {
            let item = &self.items[*index];
            if (0..3).any(|i| grid[i] == 0 || grid[i] > item.max[i]) {
                return None;
            }
            let mut block = item.block.clone();
            block.grid = *grid;
            block.origin_mm = *origin;
            block.quantity = u64::from(grid[0])
                .checked_mul(u64::from(grid[1]))?
                .checked_mul(u64::from(grid[2]))?
                .to_string();
            blocks.push(block);
            unconfirmed |= !item.confirmed;
            orientation_known &= item.orientation_known;
            envelope_known &= item.envelope_known;
        }
        let (end, volume) = validate_blocks(&blocks, self.available)?;
        for (block, (index, _, _)) in blocks.iter().zip(selections) {
            let variant = &self.input.catalog.variants[self.items[*index].variant_index];
            if variant.id.as_str() != block.variant_id {
                return None;
            }
            if let Some(allowed) = variant.allowed_orientations.value() {
                if !allowed.contains(&block.orientation) {
                    return None;
                }
            } else if block.orientation != Orientation::Upright0 {
                return None;
            }
            if block.grid[2] > 1
                && (!confirmed(&variant.stackability)
                    || !matches!(variant.stackability.value(), Some(Stackability::Stackable { max_units }) if block.grid[2] <= *max_units))
            {
                return None;
            }
        }
        let id = format!("sf-{:x}", Sha256::digest(serde_json::to_vec(&blocks).ok()?));
        Some(SpaceFitCandidate {
            id,
            blocks,
            remaining_mm: std::array::from_fn(|i| self.space[i] - end[i]),
            occupied_volume_mm3: volume.to_string(),
            unconfirmed,
            checks: SpaceFitChecks {
                outer: if envelope_known {
                    CheckStatus::Pass
                } else {
                    CheckStatus::Unknown
                },
                inner: CheckStatus::NotApplicable,
                installation: CheckStatus::Unknown,
                opening: CheckStatus::Unknown,
                access: CheckStatus::Unknown,
                support_load: CheckStatus::Unknown,
                orientation: if orientation_known {
                    CheckStatus::Pass
                } else {
                    CheckStatus::Unknown
                },
                quantity: CheckStatus::Pass,
                tolerance: CheckStatus::Unknown,
            },
        })
    }
    pub fn step(&mut self, budget: u32) -> SpaceFitPage {
        let mut combinations = vec![];
        let mut nodes = 0;
        while nodes < budget.clamp(1, 1000) && combinations.len() < 100 && self.stage < 2 {
            nodes += 1;
            if self.stage == 0 {
                if self.a >= self.items.len() {
                    self.stage = 1;
                    self.a = 0;
                    self.offset = 0;
                    continue;
                }
                let max = self.items[self.a].max;
                let total = u64::from(max[0]) * u64::from(max[1]) * u64::from(max[2]);
                if self.offset >= total {
                    self.a += 1;
                    self.offset = 0;
                    continue;
                }
                let n = self.offset;
                self.offset += 1;
                let grid = [
                    1 + (n % u64::from(max[0])) as u32,
                    1 + ((n / u64::from(max[0])) % u64::from(max[1])) as u32,
                    1 + (n / (u64::from(max[0]) * u64::from(max[1]))) as u32,
                ];
                if grid != [1; 3]
                    && let Some(c) = self.candidate(&[(self.a, grid, [0; 3])])
                {
                    combinations.push(c);
                }
            } else {
                if self.a >= self.items.len() {
                    self.stage = 2;
                    continue;
                }
                if self.b >= self.items.len() {
                    self.a += 1;
                    self.b = self.a + 1;
                    self.pattern = 0;
                    self.offset = 0;
                    continue;
                }
                if self.items[self.a].block.variant_id == self.items[self.b].block.variant_id {
                    self.b += 1;
                    continue;
                }
                // Four row patterns: W/D separation, A/B order. 1..63 units
                // per row, total <=64. Mixed stacking is deliberately excluded.
                if self.pattern >= 4 {
                    self.b += 1;
                    self.pattern = 0;
                    self.offset = 0;
                    continue;
                }
                let axis = (self.pattern % 2) as usize;
                let max_a = self.items[self.a].max[axis].min(63);
                let max_b = self.items[self.b].max[axis].min(63);
                if self.offset >= u64::from(max_a) * u64::from(max_b) {
                    self.pattern += 1;
                    self.offset = 0;
                    continue;
                }
                let na = 1 + (self.offset % u64::from(max_a)) as u32;
                let nb = 1 + (self.offset / u64::from(max_a)) as u32;
                self.offset += 1;
                if na + nb > 64 {
                    continue;
                }
                let axis = (self.pattern % 2) as usize;
                let mut ga = [1; 3];
                ga[axis] = na;
                let mut gb = [1; 3];
                gb[axis] = nb;
                let mut oa = [0; 3];
                let mut ob = [0; 3];
                if self.pattern < 2 {
                    ob[axis] = self.items[self.a].block.unit_mm[axis] * na;
                } else {
                    oa[axis] = self.items[self.b].block.unit_mm[axis] * nb;
                }
                if let Some(c) = self.candidate(&[(self.a, ga, oa), (self.b, gb, ob)]) {
                    combinations.push(c);
                }
            }
        }
        rank_candidates(&mut combinations);
        SpaceFitPage {
            schema_version: 1,
            input_revision: self.input.input_revision.clone(),
            catalog_digest: self.input.catalog.catalog_digest.to_string(),
            solver_version: "space-fit-1".into(),
            space_mm: self.space,
            profile: "grids-and-two-type-floor-rows-64".into(),
            singles: std::mem::take(&mut self.singles),
            combinations,
            inspected_variants: self.input.catalog.variants.len() as u32,
            missing_dimensions: self.missing,
            unavailable_variants: self.unavailable,
            nodes,
            singles_complete: true,
            combinations_complete: self.stage == 2,
        }
    }
}
/// Independent compressed-grid validator: checked extents, bounded quantity,
/// floor support and positive-volume AABB collisions; no solver success flags.
fn validate_blocks(blocks: &[SpaceFitBlock], available: [u32; 3]) -> Option<([u32; 3], u64)> {
    if blocks.is_empty() || blocks.len() > 2 {
        return None;
    }
    let mut boxes = vec![];
    let mut end = [0; 3];
    let mut volume = 0u64;
    for block in blocks {
        if block.grid.contains(&0) || block.unit_mm.contains(&0) || block.origin_mm[2] != 0 {
            return None;
        }
        let mut extent = [0; 3];
        for i in 0..3 {
            extent[i] = block.unit_mm[i].checked_mul(block.grid[i])?;
            let hi = block.origin_mm[i].checked_add(extent[i])?;
            if hi > available[i] {
                return None;
            }
            end[i] = end[i].max(hi);
        }
        let quantity = u64::from(block.grid[0])
            .checked_mul(u64::from(block.grid[1]))?
            .checked_mul(u64::from(block.grid[2]))?;
        if block.quantity != quantity.to_string() {
            return None;
        }
        let region = Box3::from_min_extent(block.origin_mm.map(i64::from), extent.map(i64::from));
        if boxes.iter().any(|other| region.intersects(other)) {
            return None;
        }
        boxes.push(region);
        volume = volume.checked_add(
            u64::from(extent[0])
                .checked_mul(u64::from(extent[1]))?
                .checked_mul(u64::from(extent[2]))?,
        )?;
    }
    Some((end, volume))
}
pub fn rank_candidates(candidates: &mut [SpaceFitCandidate]) {
    candidates.sort_by(|a, b| {
        (a.unconfirmed, a.remaining_mm.iter().sum::<u32>(), &a.id).cmp(&(
            b.unconfirmed,
            b.remaining_mm.iter().sum::<u32>(),
            &b.id,
        ))
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog_bundle::{BundleGenerator, build_bundle_from_json, review_bundle_text};
    use serde_json::json;
    fn input(sizes: &[[u32; 3]], space: [&str; 3]) -> SpaceFitInput {
        let items: Vec<_> = sizes.iter().enumerate().map(|(i,size)| json!({
            "id":format!("crawl:muji:{}",i+1), "sourceKind":"crawled", "status":"unconfirmed", "name":format!("합성 수납함 {i}"), "brand":"합성", "category":"수납함", "categoryHint":"bin", "productUrl":format!("https://mujikorea.co.kr/products/{}",i+1), "source":"muji", "fetchedAt":"2026-11-05T00:00:00Z",
            "dimensions":{"rawText":format!("외경 가로 {}mm 깊이 {}mm 높이 {}mm",size[0],size[1],size[2]),"width":size[0].to_string(),"depth":size[1].to_string(),"height":size[2].to_string(),"unit":"mm","confidence":"high"}
        })).collect();
        let built = build_bundle_from_json(
            &serde_json::to_string(&items).unwrap(),
            "2026-11-05T00:00:00Z",
            BundleGenerator {
                name: "test".into(),
                version: "1".into(),
            },
        );
        let catalog = review_bundle_text(&built.bundle_text.unwrap())
            .snapshot
            .unwrap();
        SpaceFitInput {
            schema_version: 1,
            input_revision: "r1".into(),
            space: space.map(String::from),
            catalog,
            clearance_mm: [5; 3],
        }
    }
    fn rehash(input: &mut SpaceFitInput) {
        input.catalog.catalog_digest = catalog_digest(&CatalogContent::from(&input.catalog));
    }
    fn allow(input: &mut SpaceFitInput, rotate: bool, stack: Option<u32>) {
        for v in &mut input.catalog.variants {
            let p = Provenance {
                origin: MeasurementOrigin::Synthetic,
                verification: VerificationStatus::Confirmed,
                evidence_ids: vec![],
                rule_ids: vec![],
                input_refs: vec![],
                observed_at: None,
            };
            v.allowed_orientations = Fact::Known {
                value: if rotate {
                    vec![Orientation::Upright0, Orientation::Upright90]
                } else {
                    vec![Orientation::Upright0]
                },
                provenance: p.clone(),
            };
            if let Some(max_units) = stack {
                v.stackability = Fact::Known {
                    value: Stackability::Stackable { max_units },
                    provenance: p,
                };
            }
        }
        rehash(input);
    }
    #[test]
    fn clearance_boundaries_rotation_and_unknown() {
        let mut i = input(&[[200, 300, 100]], ["30.5", "20.5", "10.5"]);
        assert!(
            SpaceFitSearch::new(i.clone())
                .unwrap()
                .step(1000)
                .singles
                .is_empty()
        );
        allow(&mut i, true, None);
        let p = SpaceFitSearch::new(i.clone()).unwrap().step(1000);
        assert_eq!(p.singles.len(), 1);
        assert_eq!(p.singles[0].blocks[0].orientation, Orientation::Upright90);
        assert_eq!(p.singles[0].remaining_mm, [5; 3]);
        assert!(p.singles[0].unconfirmed);
        assert_eq!(p.singles[0].checks.installation, CheckStatus::Unknown);
        assert_eq!(p.singles[0].checks.outer, CheckStatus::Unknown);
        i.space[0] = "30.4".into();
        assert!(
            SpaceFitSearch::new(i)
                .unwrap()
                .step(1000)
                .singles
                .is_empty()
        );
    }
    #[test]
    fn invalid_dimensions_and_digest_are_rejected() {
        for bad in [
            "",
            "0",
            "-1",
            "NaN",
            "Infinity",
            "20.01",
            "1000.1",
            "99999999999999999999999",
        ] {
            assert!(
                SpaceFitSearch::new(input(&[[100; 3]], [bad, "20", "20"])).is_err(),
                "{bad}"
            );
        }
        let mut i = input(&[[100; 3]], ["20"; 3]);
        i.catalog.catalog_version.push('x');
        assert!(SpaceFitSearch::new(i).is_err());
    }
    #[test]
    fn small_grids_match_independent_brute_force_without_duplicates() {
        for w in 1..=4 {
            for d in 1..=3 {
                for h in 1..=2 {
                    let mut i = input(&[[100; 3]], ["50"; 3]);
                    i.space = [
                        format!("{}.5", w * 10),
                        format!("{}.5", d * 10),
                        format!("{}.5", h * 10),
                    ];
                    allow(&mut i, false, Some(2));
                    let mut s = SpaceFitSearch::new(i).unwrap();
                    let mut actual = std::collections::BTreeSet::new();
                    loop {
                        let p = s.step(3);
                        for c in p.singles.into_iter().chain(p.combinations) {
                            assert!(actual.insert(c.blocks[0].grid));
                        }
                        if p.combinations_complete {
                            break;
                        }
                    }
                    let mut expected = std::collections::BTreeSet::new();
                    for n in 1..=4 {
                        for m in 1..=3 {
                            for k in 1..=2 {
                                if n * 100 <= w * 100 && m * 100 <= d * 100 && k * 100 <= h * 100 {
                                    expected.insert([n, m, k]);
                                }
                            }
                        }
                    }
                    assert_eq!(actual, expected);
                }
            }
        }
    }
    #[test]
    fn unknown_or_forbidden_stacking_never_adds_a_layer() {
        let i = input(&[[100; 3]], ["30.5"; 3]);
        let p = SpaceFitSearch::new(i).unwrap().step(1000);
        assert!(p.combinations.iter().all(|c| c.blocks[0].grid[2] == 1));
    }
    #[test]
    fn mixed_a_a_b_is_bounded_and_independently_disjoint() {
        let i = input(&[[100, 100, 100], [50, 100, 150]], ["25.5", "10.5", "15.5"]);
        let mut s = SpaceFitSearch::new(i).unwrap();
        let mut found = false;
        let mut ids = std::collections::BTreeSet::new();
        for _ in 0..1000 {
            let p = s.step(u32::MAX);
            assert!(p.nodes <= 1000);
            assert!(p.combinations.len() <= 100);
            for c in p.combinations {
                assert!(ids.insert(c.id));
                if c.blocks.len() == 2 {
                    assert!(c.blocks.iter().all(|b| b.grid[2] == 1));
                    assert!(validate_blocks(&c.blocks, [250, 100, 150]).is_some());
                    found |= c.blocks[0].quantity == "2" && c.blocks[1].quantity == "1";
                }
            }
            if p.combinations_complete {
                break;
            }
        }
        assert!(found);
    }
    #[test]
    fn compressed_large_grids_and_budget_are_deterministic() {
        let mut i = input(&[[1; 3]], ["1000"; 3]);
        allow(&mut i, false, Some(10000));
        let mut a = SpaceFitSearch::new(i.clone()).unwrap();
        let mut b = SpaceFitSearch::new(i).unwrap();
        for _ in 0..3 {
            assert_eq!(a.step(1000), b.step(1000));
        }
        assert!(!a.step(1).combinations_complete);
    }
    #[test]
    fn independent_validator_rejects_collision_overflow_floating_and_wrong_quantity() {
        let p = SpaceFitSearch::new(input(&[[100; 3]], ["30"; 3]))
            .unwrap()
            .step(1);
        let b = p.singles[0].blocks[0].clone();
        assert!(validate_blocks(&[b.clone(), b.clone()], [1000; 3]).is_none());
        let mut bad = b.clone();
        bad.origin_mm[2] = 1;
        assert!(validate_blocks(&[bad], [1000; 3]).is_none());
        let mut bad = b.clone();
        bad.grid = [u32::MAX; 3];
        assert!(validate_blocks(&[bad], [1000; 3]).is_none());
        let mut bad = b;
        bad.quantity = "2".into();
        assert!(validate_blocks(&[bad], [1000; 3]).is_none());
    }
}
