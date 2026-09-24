//! Rule registry → inspectable `StrategyDecision` IR (SOLVER.md §2).
//!
//! Rules are a small versioned registry evaluated deterministically over the
//! normalized input. A decision binds every input group to a zone, an ordered
//! priority and the reasons/assumptions the UI translates. Unknown facts emit
//! assumptions; they are never silently defaulted.

use std::collections::BTreeMap;

use zari_core::geometry::*;
use zari_core::scalars::*;
use zari_core::*;

/// The supported strategy catalogue, in `proposeStrategies` emission order.
pub(crate) const SUPPORTED: [Strategy; 5] = [
    Strategy::MinimumPurchase,
    Strategy::FrequencySeparation,
    Strategy::ActivityGrouping,
    Strategy::ActiveReserveSeparation,
    Strategy::OneActionAccess,
];

/// Zone ids emitted by the default front/rear split rule.
pub(crate) const ZONE_FRONT: &str = "zone:front";
pub(crate) const ZONE_REAR: &str = "zone:rear";
pub(crate) const ZONE_ALL: &str = "zone:all";

fn id(raw: &str) -> Id {
    Id::new(raw).expect("solver ids are bounded")
}

fn frequency_rank(frequency: &Frequency) -> u32 {
    match frequency {
        Frequency::Daily => 0,
        Frequency::Weekly => 1,
        Frequency::Monthly => 2,
        Frequency::Rare => 3,
    }
}

fn reason(
    id_raw: &str,
    rule_id: &str,
    refs: Vec<FieldRef>,
    message_key: &str,
    parameters: MessageParams,
) -> Reason {
    Reason {
        id: id(id_raw),
        rule_id: rule_id.into(),
        fact_refs: refs,
        message_key: message_key.into(),
        parameters,
    }
}

fn condition(
    id_raw: &str,
    code: &str,
    refs: Vec<FieldRef>,
    message_key: &str,
    parameters: MessageParams,
) -> Condition {
    Condition {
        id: id(id_raw),
        code: code.into(),
        fact_refs: refs,
        message_key: message_key.into(),
        parameters,
    }
}

/// The default soft front/rear split plus the catch-all zone. Empty when the
/// interior dimensions are not all known; every group then lands on a locked
/// zone or stays unresolved with an assumption.
fn default_zones(input: &ProjectInput) -> BTreeMap<&'static str, Zone> {
    let interior = &input.space.interior;
    let (Some(w), Some(d), Some(h)) = (
        nominal_length(&interior.width),
        nominal_length(&interior.depth),
        nominal_length(&interior.height),
    ) else {
        return BTreeMap::new();
    };
    let cuboid = |min_y: i64, depth: i64| Cuboid {
        min: Vec3Mm {
            x: PositionMm::new(0).expect("zero"),
            y: PositionMm::new(min_y as i32).expect("bounded"),
            z: PositionMm::new(0).expect("zero"),
        },
        extent: Extent3Mm {
            width: LengthMm::new(w as u32).expect("bounded"),
            depth: LengthMm::new(depth as u32).expect("bounded"),
            height: LengthMm::new(h as u32).expect("bounded"),
        },
    };
    let zone = |id_raw: &str, label: &str, min_y: i64, depth: i64| Zone {
        id: id(id_raw),
        label: label.into(),
        kind: ZoneKind::SoftPreference,
        bounds: cuboid(min_y, depth),
    };
    let split = d / 2;
    BTreeMap::from([
        (ZONE_FRONT, zone(ZONE_FRONT, "Front", 0, split)),
        (ZONE_REAR, zone(ZONE_REAR, "Rear", split, d - split)),
        (ZONE_ALL, zone(ZONE_ALL, "Whole compartment", 0, d)),
    ])
}

/// A group's frequency verdict: the most frequent member decides; any unknown
/// member frequency keeps the group unresolved rather than silently daily.
fn group_frequency(input: &ProjectInput, group: &ItemGroup) -> Option<Frequency> {
    let mut best: Option<Frequency> = None;
    for item_id in &group.item_ids {
        let item = input.items.iter().find(|i| &i.id == item_id)?;
        let frequency = item.frequency.value()?;
        best = match (&best, frequency) {
            (None, f) => Some(f.clone()),
            (Some(b), f) if frequency_rank(f) < frequency_rank(b) => Some(f.clone()),
            (b, _) => b.clone(),
        };
    }
    best
}

/// A group's stock-role verdict: known only when every member agrees.
fn group_role(input: &ProjectInput, group: &ItemGroup) -> Option<StockRole> {
    let mut role: Option<StockRole> = None;
    for item_id in &group.item_ids {
        let item = input.items.iter().find(|i| &i.id == item_id)?;
        let member = item.stock_role.value()?.clone();
        role = match (&role, &member) {
            (None, _) => Some(member),
            (Some(r), m) if r == m => Some(r.clone()),
            _ => return None,
        };
    }
    role
}

/// The zone a strategy assigns one group to: a user lock always wins; soft
/// zones are rule-derived preferences. `None` when no resolvable zone exists
/// (the group is then omitted from the resolved set rather than dangling).
fn zone_for(
    input: &ProjectInput,
    group: &ItemGroup,
    strategy: &Strategy,
    defaults: &BTreeMap<&'static str, Zone>,
    zones: &mut BTreeMap<String, Zone>,
    assumptions: &mut Vec<Condition>,
) -> Option<Id> {
    if let Some(locked) = input
        .constraints
        .locked_zones
        .iter()
        .find(|l| l.group_id == group.id)
    {
        return Some(locked.zone.id.clone());
    }
    let want = match strategy {
        Strategy::FrequencySeparation | Strategy::OneActionAccess => {
            match group_frequency(input, group) {
                Some(Frequency::Daily) | Some(Frequency::Weekly) => ZONE_FRONT,
                Some(Frequency::Monthly) | Some(Frequency::Rare) => ZONE_REAR,
                None => {
                    assumptions.push(condition(
                        &format!("c:freq:{}", group.id.as_str()),
                        "frequency_unknown",
                        group
                            .item_ids
                            .iter()
                            .map(|i| FieldRef {
                                entity_id: i.clone(),
                                field_path: "frequency".into(),
                            })
                            .collect(),
                        "assumption.frequency_unknown",
                        MessageParams::from([("groupId".into(), group.id.as_str().into())]),
                    ));
                    ZONE_ALL
                }
            }
        }
        Strategy::ActiveReserveSeparation => match group_role(input, group) {
            Some(StockRole::Active) => ZONE_FRONT,
            Some(StockRole::Reserve) => ZONE_REAR,
            None => {
                assumptions.push(condition(
                    &format!("c:role:{}", group.id.as_str()),
                    "stock_role_unknown",
                    group
                        .item_ids
                        .iter()
                        .map(|i| FieldRef {
                            entity_id: i.clone(),
                            field_path: "stockRole".into(),
                        })
                        .collect(),
                    "assumption.stock_role_unknown",
                    MessageParams::from([("groupId".into(), group.id.as_str().into())]),
                ));
                ZONE_ALL
            }
        },
        _ => ZONE_ALL,
    };
    match defaults.get(want) {
        Some(zone) => {
            zones.insert(zone.id.as_str().to_owned(), zone.clone());
            Some(zone.id.clone())
        }
        // Interior dimensions are unknown: the group cannot be bound to a
        // derived soft zone. It stays out of the resolved set rather than
        // inventing bounds.
        None => {
            assumptions.push(condition(
                &format!("c:zone:{}", group.id.as_str()),
                "space_dimensions_unknown",
                vec![FieldRef {
                    entity_id: input.space.id.clone(),
                    field_path: "interior".into(),
                }],
                "assumption.space_dimensions_unknown",
                MessageParams::from([("groupId".into(), group.id.as_str().into())]),
            ));
            None
        }
    }
}

/// Group priority ordering per strategy: frequency/one-action put the most
/// frequent groups first, active-reserve puts known-active first, the rest
/// order by descending member footprint then id. Unknown facts rank last and
/// stay visible.
fn priority_order(input: &ProjectInput, strategy: &Strategy) -> Vec<usize> {
    let footprint = |group: &ItemGroup| -> i64 {
        group
            .item_ids
            .iter()
            .filter_map(|i| input.items.iter().find(|item| &item.id == i))
            .map(|item| {
                oriented_nominal_extent(&item.dimensions.envelope, Orientation::Upright0)
                    .map(|e| e[0] * e[1])
                    .unwrap_or(0)
            })
            .sum()
    };
    let key = |group: &ItemGroup| -> (u32, u64, String) {
        match strategy {
            Strategy::FrequencySeparation | Strategy::OneActionAccess => {
                let rank = group_frequency(input, group)
                    .map(|f| frequency_rank(&f))
                    .unwrap_or(u32::MAX - 1);
                (rank, 0, group.id.as_str().to_owned())
            }
            Strategy::ActiveReserveSeparation => {
                let rank = match group_role(input, group) {
                    Some(StockRole::Active) => 0,
                    Some(StockRole::Reserve) => 1,
                    None => 2,
                };
                (rank, 0, group.id.as_str().to_owned())
            }
            _ => (
                0,
                (i64::MAX - footprint(group)) as u64,
                group.id.as_str().to_owned(),
            ),
        }
    };
    let mut order: Vec<usize> = (0..input.groups.len()).collect();
    order.sort_by(|a, b| key(&input.groups[*a]).cmp(&key(&input.groups[*b])));
    order
}

/// Evaluate one strategy's decision IR over the normalized input. The result
/// is deterministic for a fixed input and is the only strategy trace the
/// solver stamps into proposals.
pub(crate) fn decide(input: &ProjectInput, strategy: &Strategy) -> StrategyDecision {
    let defaults = default_zones(input);
    let mut zones: BTreeMap<String, Zone> = BTreeMap::new();
    let mut assumptions: Vec<Condition> = vec![];
    let order = priority_order(input, strategy);
    let mut groups = vec![];
    let mut priorities = vec![];
    let mut reasons = vec![];
    let mut fact_refs: Vec<FieldRef> = vec![];

    for (ordinal, index) in order.iter().enumerate() {
        let group = &input.groups[*index];
        if group.item_ids.is_empty() {
            // An empty resolved group is a structural violation; empty groups
            // are still searched but never enter the strategy trace.
            continue;
        }
        let mut refs: Vec<FieldRef> = vec![];
        let mut parameters = MessageParams::from([("groupId".into(), group.id.as_str().into())]);
        let (rule_id, message_key) = match strategy {
            Strategy::MinimumPurchase => ("min-purchase/reuse-first", "reason.min_purchase.group"),
            Strategy::FrequencySeparation | Strategy::OneActionAccess => {
                let frequency = group_frequency(input, group);
                parameters.insert(
                    "frequency".into(),
                    frequency
                        .as_ref()
                        .and_then(|f| serde_json::to_value(f).ok())
                        .and_then(|v| v.as_str().map(str::to_owned))
                        .unwrap_or_else(|| "unknown".into()),
                );
                for item_id in &group.item_ids {
                    refs.push(FieldRef {
                        entity_id: item_id.clone(),
                        field_path: "frequency".into(),
                    });
                }
                ("frequency/zone-assignment", "reason.frequency.zone")
            }
            Strategy::ActivityGrouping => ("activity/declared-groups", "reason.activity.group"),
            Strategy::ActiveReserveSeparation => {
                for item_id in &group.item_ids {
                    refs.push(FieldRef {
                        entity_id: item_id.clone(),
                        field_path: "stockRole".into(),
                    });
                }
                ("active-reserve/split", "reason.active_reserve.zone")
            }
        };
        let Some(zone_id) = zone_for(
            input,
            group,
            strategy,
            &defaults,
            &mut zones,
            &mut assumptions,
        ) else {
            // No resolvable zone (interior unknown and no lock): the group is
            // still searched; it is only absent from the resolved trace.
            continue;
        };
        parameters.insert("zoneId".into(), zone_id.as_str().into());
        groups.push(ResolvedGroup {
            group_id: group.id.clone(),
            zone_id: zone_id.clone(),
            item_ids: group.item_ids.clone(),
        });
        priorities.push(GroupPriority {
            group_id: group.id.clone(),
            ordinal: ordinal as u32,
        });
        fact_refs.extend(refs.iter().cloned());
        reasons.push(reason(
            &format!("r:{}:{}", rule_id.replace('/', "-"), group.id.as_str()),
            rule_id,
            refs,
            message_key,
            parameters,
        ));
    }
    if !input.constraints.purchase_allowed {
        assumptions.push(condition(
            "c:purchase-disallowed",
            "purchase_prohibited",
            vec![FieldRef {
                entity_id: input.space.id.clone(),
                field_path: "constraints.purchaseAllowed".into(),
            }],
            "assumption.purchase_prohibited",
            MessageParams::new(),
        ));
    }
    if !input.constraints.safety_restrictions.is_empty() {
        assumptions.push(condition(
            "c:safety-unmodeled",
            "safety_restriction_unmodeled",
            vec![FieldRef {
                entity_id: input.space.id.clone(),
                field_path: "constraints.safetyRestrictions".into(),
            }],
            "assumption.safety_restriction_unmodeled",
            MessageParams::new(),
        ));
    }
    let mut rule_ids: Vec<&'static str> = match strategy {
        Strategy::MinimumPurchase => {
            vec!["min-purchase/reuse-first", "min-purchase/count-new-units"]
        }
        Strategy::FrequencySeparation | Strategy::OneActionAccess => {
            vec!["frequency/front-daily", "frequency/rear-rare"]
        }
        Strategy::ActivityGrouping => vec!["activity/declared-groups"],
        Strategy::ActiveReserveSeparation => vec!["active-reserve/split"],
    };
    if matches!(strategy, Strategy::OneActionAccess) {
        rule_ids.push("one-action/zero-moves");
    }
    if assumptions.iter().any(|c| c.code == "frequency_unknown") {
        rule_ids.push("frequency/unknown-kept-unresolved");
    }
    if assumptions.iter().any(|c| c.code == "stock_role_unknown") {
        rule_ids.push("active-reserve/unknown-kept-unresolved");
    }
    rule_ids.push("zones/default-split");
    let mut rule_ids: Vec<String> = rule_ids.into_iter().map(str::to_owned).collect();
    rule_ids.sort();
    StrategyDecision {
        strategy: strategy.clone(),
        rule_ids,
        fact_refs,
        groups,
        zones: zones.into_values().collect(),
        priorities,
        reasons,
        assumptions,
    }
}

/// The deterministic strategy catalogue for `proposeStrategies`.
pub(crate) fn propose(input: &ProjectInput) -> Vec<StrategyDecision> {
    SUPPORTED.iter().map(|s| decide(input, s)).collect()
}
