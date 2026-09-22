# ZARI compiler walkthrough and hand-computed fixture contract

Status: architecture example and expected assertions, not an implemented application, executed fixture, benchmark, or independent audit result. This document illustrates [DOMAIN_MODEL.md](DOMAIN_MODEL.md), [SOLVER.md](SOLVER.md), [WASM_PROTOCOL.md](WASM_PROTOCOL.md), and [PERSISTENCE.md](PERSISTENCE.md); those documents own their contracts.

## Contents

1. One complete synthetic scene
2. Strategy before product selection
3. Direct, reused, and purchased proposals
4. Independent checks and procurement arithmetic
5. Normalization through save and reload
6. Counterexamples and fixture acceptance IDs

## 1. A complete synthetic scene

This example uses a 600 × 400 × 300 mm compartment and six rigid test objects. Every required measurement is explicitly Known with bounded uncertainty of minus0/plus0 mm. These zero bounds are synthetic test assumptions, not defaults for user measurements. Every scalar has field evidence under the synthetic namespace. No measurement is inferred from an image, retailer name, visual diagram, or the difference between outer and inner dimensions.

Coordinates are compartment-local: origin at front-left-bottom, x right, y rear, z up. Occupied intervals are half-open. A stated boundary is not a browser pixel coordinate.

### Space and supported motion

| Field | Explicit fixture value |
|---|---|
| Space ID | `syn:trace:space` |
| Interior W × D × H | 600 × 400 × 300 mm |
| Front opening | y=0; left0, bottom0, width600, height300 mm |
| Compartment support | established floor at z=0; footprint x[0,600) × y[0,400) |
| Compartment load limit | Known20,000g |
| Fixed obstacles/access exclusions | empty lists |
| Static left/right/front/back/top clearances | Known5mm each |
| Static gap between top-level units | Known5mm |
| Staging free volume | min(0,−500,0), extent(600,500,500) mm |
| Staging base support | Known StagingSupport; whole base footprint supported at z=0 |
| Staging load limit | Known5,000g |
| Effective moving left/right/top margins | Known5mm each |
| Additional pull depth | Known5mm |
| Lift above bin rim | Known5mm when pulling a bin then retrieving contents |
| Bottom motion expansion | none below the supported plane |

Staging support is an actual declared physical assumption in this fixture. It is not a claim that an arbitrary shelf has a level table in front of it. An unknown or differently elevated real support cannot reuse this proof. Direct-front extraction uses liftAboveRim=NotApplicable with its rule reason.

### Objects, grouping, and strategy

| Field | Explicit fixture value |
|---|---|
| Item ID | `syn:trace:item` |
| Stored envelope | 75 × 140 × 220 mm |
| Known quantity | 6, ordinals0..5 |
| Mass per item | Known300g |
| Allowed orientation | upright0 only |
| Allowed retrieval | direct-front extraction or pull-container-then-retrieve, selected by the recipe |
| Group ID | `syn:trace:group` |
| Group splitting | AllowMultipleTargets |
| Item mustStayTogether | false |
| Strategy | MinimumPurchase |
| Purchases | allowed |
| Hard budget | Known50,000KRW |
| Hard zero-blocker access | false in the base fixture; true in a separate counterexample |
| Material/color preferences | no ranking preference |
| Safety/mounting requirements | no unmodeled requirement requested |

All six instances belong to one group. They may occupy several containers or a mixture of direct/owned/new targets. This deliberately exercises container multiplicity: a group is not implicitly one container. Every instance must remain accounted for exactly once.

### Bin physical model and offer

| Field | Explicit fixture value |
|---|---|
| Variant ID | `syn:trace:bin` |
| Primitive | openBin |
| Outer W × D × H | 190 × 180 × 250 mm |
| Conservative inner W × D × H | 170 × 160 × 230 mm |
| Inner offset in product frame | (10,10,10) mm |
| Cavity floor | local z=0, footprint170 × 160mm |
| Cavity load limit | Known2,000g |
| Cavity left/right/front/back/top clearances | Known5mm each |
| Gap between contained items | Known5mm |
| Empty bin mass | Known500g |
| Allowed orientation | upright0 only |
| Handles | explicitly included in outer envelope; no unknown protrusion |
| Lid | explicitly absent |
| Mounting | explicitly none |
| Cavity model | explicitly evidenced conservative rectangular cavity |
| Stackability | unused; no stacking in any proposal |
| Owned inventory | `syn:trace:owned`, same embedded physical model, owned2/available2 |
| Offer ID | `syn:trace:offer` for exactly `syn:trace:bin` |
| Seller ID | `syn:trace:seller` |
| Pack quantity | Known2 |
| Pack price | Known12,000KRW |
| Shipping | Known3,000KRW fixed once per seller when purchasing |
| Inventory | synthetic Known available observation |
| Purchase URL | no real URL; synthetic data cannot enable real purchase readiness |

The catalog contains real bytes when implemented and is pinned by the Rust-computed catalog digest. This document invents no digest, snapshot hash, observation timestamp, or completed run. The synthetic offer exercises arithmetic; its price and inventory are not assertions about merchandise.

The immutable ProjectInput also pins reference-v1, its documented deterministic budget, and seed=null. Engine rule/solver/schema/canonical versions come from the actual implementation. Catalog/search choices are included in inputDigest; engine version metadata is not an extra user input field.

## 2. Strategy before product selection

MinimumPurchase emits an inspectable decision that first considers direct placement, then available owned containers, then new physical units. Its reasons reference the selected strategy, six known instances, allowed split policy, and available owned quantity. It does not invent purchase demand from the presence of a catalog.

Generate direct and open-bin recipes for this group. Each recipe selects an allowed retrieval operation and keeps the same inventory facts. The three proposals below are explicit validator/comparator fixtures, not a promise that search returns exactly three plans, these exact coordinates, or every example before its work budget ends.

The comparator must prefer a complete, equally physically proved direct proposal over either proposal requiring new purchases. Other purchase-free reuse/direct arrangements may tie on the minimum-purchase objective and be resolved by the documented remaining ranking fields. This example does not claim a unique globally optimal plan.

## 3. Three complete candidate proposals

### Proposal D: six direct objects, no purchase

Every item is a DirectItem Placement under the space. Its ItemAssignment is Direct with the matching placement ID; it does not carry a second copy of its coordinates.

| Item ordinal | Minimum x,y,z mm | Extent W,D,H mm |
|---|---|---|
| 0 | (5,5,0) | 75,140,220 |
| 1 | (85,5,0) | 75,140,220 |
| 2 | (165,5,0) | 75,140,220 |
| 3 | (245,5,0) | 75,140,220 |
| 4 | (325,5,0) | 75,140,220 |
| 5 | (405,5,0) | 75,140,220 |

Required row width = 6×75 + 5×5 + 2×5 = **485mm**. Last occupied x ends at480; right clearance5 requires485≤600. Required depth=5+140+5=150≤400. Required height=220+5=225≤300. Each object rests on the full established floor; total load=6×300=**1,800g**.

A fully extracted object can sit at the same x,z with y=−145: depth140 plus pull-depth allowance5 stays within staging. The left/right/top moving envelope fits the opening and staging. Adjacent objects remain5mm apart; expanding only the moving object by5mm touches, but does not intersect, its stationary neighbor. Every direct extraction has zero other-unit blockers.

PurchaseSelections, new-purchase BOM lines, and reused-container lines are empty. Purchase cost is Known0; shipping is NotApplicable. Inner-capacity checks are NotApplicable for direct placement, with a rule reason, not fake pass results.

### Proposal R: two reused bins and one new bin

### Proposal N: three new bins

These proposals have the same physical coordinates and item assignment pattern. They differ in owned/new subjects, purchase selections, procurement facts, and snapshot content. Neither contains an extra bin for surplus purchased units.

| Physical slot | Bin minimum x,y,z mm | Proposal R subject | Proposal N subject | Contained item ordinals |
|---|---|---|---|---|
| 0 | (5,5,0) | owned ordinal0 | new ordinal0 | 0,1 |
| 1 | (200,5,0) | owned ordinal1 | new ordinal1 | 2,3 |
| 2 | (395,5,0) | new ordinal0 | new ordinal2 | 4,5 |

In Proposal N, the three NewContainer subjects use unique per-variant ordinals0,1,2 respectively. Proposal R has only new ordinal0 and owned ordinals0/1. Stable placement IDs are generated by the implementation's documented semantic-ID rule, not random completion order.

Outer required width = 3×190 + 2×5 + 2×5 = **590mm**. Occupied x intervals are [5,195), [200,390), [395,585). Required depth=5+180+5=190≤400. Required height=250+5=255≤300.

Every cavity receives two items at local minima (5,5,0) and (85,5,0). Cavity required width=5+75+5+75+5=**165≤170**. Required depth=5+140+5=**150≤160**. Required height=220+5=**225≤230**. These are geometric placements, not volume-sum capacity assertions.

For upright0, add the actual inner offset(10,10,10) and parent minimum exactly once:

| Item ordinal | Cavity-local minimum | Compartment-global minimum |
|---|---|---|
| 0 | (5,5,0) | (20,20,10) |
| 1 | (85,5,0) | (100,20,10) |
| 2 | (5,5,0) | (215,20,10) |
| 3 | (85,5,0) | (295,20,10) |
| 4 | (5,5,0) | (410,20,10) |
| 5 | (85,5,0) | (490,20,10) |

Contained assignments carry these local ItemPlacement coordinates and the container placement reference. They are not extra top-level Placements. Cavity support identity is scoped by the parent placement, so three identical product instances have three physical cavity floors.

## 4. Independent evidence and BOM

### Physical and access checks

Each candidate is sent directly to the core validator without solver pass flags. Reference IDs, known-instance partition, purchase bindings, supported orientations, nominal/conservative geometry, and quantity conservation are rechecked.

For the bin proposals:

- Each cavity carries2×300=**600g≤2,000g**.
- Each loaded bin weighs500+600=**1,100g**.
- Compartment load is3×1,100=**3,300g≤20,000g**; contents are not counted a second time.
- The moving loaded bin requires1,100g≤5,000g staging support capacity.
- Pull-out depth is180+5=**185mm≤500mm**. At y=−185 its occupied depth ends at−5, fully outside the compartment.
- A bin cross-section with side/top margins occupies x[binX−5,binX+195), z[0,255), fitting the opening. There is no fictional lower clearance below z=0.
- All three bins have independent front corridors with zero blockers. Install order is the deterministic ID order because no precedence edge is needed; that order is independently replayed.
- After complete pull-out, a220mm item raised5mm above the250mm rim reaches physical top475mm. Its separate5mm top handling margin reaches**480mm≤500mm**. Cavity and staging x/y sweeps also fit with the declared side margins.

Static clearance and motion margin are separate obligations checked against the actual gap. They are not summed twice merely because both are5mm. Rim clearance and top headroom protect different parts of the lifted motion and are each applied once.

The required physical checks pass conservatively under these fully supplied synthetic assumptions, so the expected physical assurance is ConfirmedWithinScope. That status is not a claim about an actual home or a purchased product. User acceptance, persistence success, and genuine purchase readiness remain separate states.

Temporary parking of removed blockers is outside v1. If another unit blocks retrieval, an acyclic dependency order alone does not establish operational access. Nonzero removable blockers yield Unknown/temporary_parking_unsupported; a hard zero-blocker requirement yields Fail. A user acknowledgment cannot convert either result to Pass.

### Quantity and procurement

| Value | Proposal D | Proposal R | Proposal N |
|---|---:|---:|---:|
| Known item instances assigned | 6 | 6 | 6 |
| Known instances unassigned | 0 | 0 | 0 |
| Placed containers | 0 | 3 | 3 |
| Reused containers | 0 | 2 | 0 |
| New physical containers needed | 0 | 1 | 3 |
| Packs ordered, two units per pack | 0 | 1 | 2 |
| New supplied units | 0 | 2 | 4 |
| Unplaced purchase surplus | 0 | 1 | 1 |
| Product subtotal KRW | 0 | 12,000 | 24,000 |
| Shipping KRW | NotApplicable | 3,000 | 3,000 |
| New purchase total KRW | 0 | 15,000 | 27,000 |

Owned container availability is checked independently: Proposal R consumes owned ordinals0/1 once each. Its new purchase need is1; do not subtract the inventory's2 units again from this already allocated new line. Reuse lines explain the two existing units without inventing a purchase price for them.

Each new placement has one Selected purchase binding to `syn:trace:offer`. All new placements of this variant select the same offer. The BOM groups them into one procurement line, uses checked quotient/remainder ceiling division, and charges the seller's shipping once. No independent UI offer selection or price lookup can change this historical arithmetic.

All totals are below the50,000KRW hard fixture budget. Synthetic price/inventory assertions allow calculation tests but never genuine checkout links or real purchase-ready claims.

### One snapshot supplies all views

The core finalizer constructs one immutable content body containing input facts, catalog evidence subset, strategy reasons, placements, assignments, exact unassigned ranges, purchase selections, validation, BOM, cost summary, actions, and versions. It computes the actual canonical content hash. This document calls that output **S** as a symbolic reference, not a literal digest.

The SVG reads placements and item coordinates; the placement list reads the same IDs; BOM links to those IDs; the guide uses the independently validated installation order. For a bin, the executable sequence is acquisition/arrival where needed, prepare declared staging, load its assigned contents while in staging, then insert the loaded bin at its validated turn. Loading uses the reverse of the proved vertical extraction envelope in staging. It is not an instruction to lift objects into an already installed bin inside the compartment. Fixed-orientation motion carries the contents with their parent under the documented geometric model; it does not certify acceleration, spill resistance, or human biomechanics. Unmodeled mandatory handling requirements remain conditions rather than inferred success. Real progress requires user action and prerequisites; generating S does not mark anything acquired, arrived, loaded, installed, or completed.

S for a reference-search result is not automatically the same content ID as a manually supplied identical physical layout: creation mode is semantic content. Offer or evidence changes also change identity even if coordinates remain equal.

## 5. Normalization, CAS, activation, search, acceptance, and reload

This trace uses illustrative revision counters, not an executed database. A starting project has projectRevision12, inputRevision4, a saved raw draft generation7, and an old accepted plan. Its live Worker session is W1 and activation is A1; these are explanatory symbols, not valid serialized IDs.

1. **Raw edit:** editing the compartment and fixture facts advances editorEpoch to42 and local draft generation8. The old plan is stale immediately, even if a field is temporarily invalid. The UI keeps exact raw text, including `60` with unit cm.
2. **Raw save in this trace:** one short CAS transaction expecting projectRevision12 stores generation8 and advances projectRevision to13. InputRevision stays4. Only the committed transaction authorizes a saved indicator. A combined save/normalization transaction is also allowed by the canonical contract; it must not double-increment one transaction.
3. **Normalize:** send normalizeInput with W1/A1, a fresh request ID, epoch42, inputRevision4, the captured raw DTO, catalog/search selection, and the prior input digest. Rust returns600mm for `60 cm`, normalizes the remaining facts, and returns diagnostics plus the prospective digest. Its reply remains bound to inputRevision4.
4. **Normalization CAS:** outside the Worker, open a short transaction expecting projectRevision13 and saved draft generation8 from the same editor session. If the normalized digest changed, insert the immutable input at revision5, update pointers/draft, and commit projectRevision14. Invalid raw input never creates this replacement input. Any CAS conflict discards the prospective context install and preserves the local draft for conflict handling.
5. **Install committed context:** after commit, activateProject with a fresh activation A2, inputRevision5, the normalized input, and exact pinned catalog bytes or validated cache entry. Only matching projectActivated supplies the searchable contextId. Do not rewrite the earlier normalization reply to claim revision5. Activation failure does not undo the real save or allocate another input revision on retry.
6. **Strategy and search:** use the committed context for proposeStrategies and startSearch. Both derive catalog/strategy/profile/budget from ProjectInput. Step the real Rust continuation within deterministic work limits. Advance through actual physical proposals and independent checks. A partially checked candidate is not published.
7. **Evaluated result:** publish one complete immutable S only if Worker session, activation, request, epoch, revision, context, sequence and noncancelled search ID still match. Diagram/BOM/guide change together. A displayed candidate is not yet a user-accepted or saved plan.
8. **Acceptance CAS:** outside the transaction verify S with Rust; inside the short transaction expect projectRevision14/inputRevision5, compatible draft, matching input/catalog rows and full binding. Insert S unchanged, set the accepted binding and commit projectRevision15. Do not complete action steps. If the transaction fails, S can remain visible as unsaved, with the prior accepted plan intact.
9. **Reload:** terminate all live memory, read actual IndexedDB records, verify envelopes/digests with Rust, create a new Worker W2 and activation A3, and activate the current immutable input. Restore the accepted binding and the same S content ID. No in-memory singleton, current catalog lookup, recomputation, or fabricated hash may supply the displayed historic result.
10. **Version mismatch:** if a new engine/catalog context is selected, keep S byte-stable and label it historical/stale as applicable. Recalculation creates a different evaluated result. A catalog update discovered in the background does not silently change the project's pin.

Equivalent `600 mm` formatting can advance raw draft/project bookkeeping while retaining inputRevision5 after Rust confirms equality. A layout-only edit advances editorEpoch and, if durably accepted, projectRevision; it retains inputRevision5. RestoreLayout goes through the same independent validation under the current facts/catalog. Equal geometry alone does not revive an old request or transfer execution progress. Progress keys include project ID, input revision, and snapshot ID.

## 6. Counterexamples and fixture acceptance IDs

Every row below is a requested implementation assertion, not a passing test report. Changed geometry refers to the explicit proposal described above. A rejected row proposal does not prove no other arrangement exists in the compartment.

| Fixture ID | Change or operation | Required assertion |
|---|---|---|
| TRACE01 | Normalize60cm and600mm | Same normalized600mm and semantic input digest when all other facts match |
| TRACE02 | Proposal D | Six unique direct instances, width485, load1,800g, purchase Known0 and shipping N/A |
| TRACE03 | Proposal N | Three bins at listed coordinates, six exact contained assignments, width590, cavity165/150/225 |
| TRACE04 | Proposal R | Owned0/1 consumed once, new need1, one pack, one surplus, total15,000KRW |
| TRACE05 | Proposal N procurement | Need3/pack2 gives2packs/4supplied/1surplus, total27,000KRW; only three bins drawn |
| TRACE06 | Compare the three complete proposals | D ranks ahead of R/N under MinimumPurchase; no demand is invented to sell bins |
| TRACE07 | Bin outer width195; corresponding row minima(5,5,0),(205,5,0),(405,5,0) preserve5mm gaps | Row requirement605>600; outer geometry fails, never whole-problem impossibility |
| TRACE08 | Inner height210 |220mm item plus top clearance does not fit; independent inner capacity fails |
| TRACE09 | Front opening height254 | Static bin geometry still fits the compartment; insertion margin reaches255 and fails |
| TRACE10 | Staging depth184 | Required185 pull depth fails; static containment can still pass |
| TRACE11 | Staging height479 | Physical lifted top475 plus separate top margin5 requires480; operational access fails |
| TRACE12 | Staging height480 | Exact modeled retrieval-height boundary passes when every other required fact is unchanged |
| TRACE13 | Staging height unknown, or staging base support unknown | Relevant access/support checks are Unknown; physical assurance cannot be ConfirmedWithinScope |
| TRACE14 | Compartment width nominal600, minus11/plus0 | Conservative available589<row requirement590; nominal row pass does not erase conservative failure |
| TRACE15 | Same nominal width, uncertainty unknown | Conservative verification remains unknown; never treat uncertainty as0 |
| TRACE16 | Floor capacity3,299g for R/N | Required3,300g fails support load despite geometry passing |
| TRACE17 | Missing offer price, known physical geometry | Physical checks remain separately evaluated; price/total and budget become unknown when not otherwise disproved |
| TRACE18 | Duplicate direct reference or reuse owned ordinal0 twice | Independent validator rejects instance/reference conservation violation |
| TRACE19 | In R/N, move slot1 bin to(5,200,0), retain slot0 at(5,5,0) and slot2 at(395,5,0); contained local placements follow their parent | Rear bin ends at y380 and fits, rear-before-front insertion succeeds, but front slot0 blocks its extraction; acyclic removal graph alone yields operational_access Unknown/temporary_parking_unsupported |
| TRACE20 | TRACE19 with hard zero-blocker constraint | Known necessary other-unit move yields Fail; user acknowledgment cannot promote it |
| TRACE21 | Native/browser runs with step allowances1/7/128/256 | Same completed canonical output/counters for identical total budget and context; no timing-based selection |
| TRACE22 | Budget ends while final validation is incomplete | Candidate is not published; only fully validated alternatives remain, termination is budget_exhausted |
| TRACE23 | Saved input5 context and S, then browser reload | Exact binding/hash/content restored from IndexedDB; diagram/BOM/actions resolve to the same S |
| TRACE24 | Raw invalid edit after search starts | Old response rejected immediately by epoch even while durable inputRevision remains5 |
| TRACE25 | Another tab commits before acceptance CAS | Acceptance aborts revision_conflict, preserves local result/draft, never silently overwrites |
| TRACE26 | Normalization saved but Worker activation traps | Input save remains real; no current computation claim; new Worker retry does not allocate another input revision |
| TRACE27 | Price changes in another catalog snapshot | Historic S keeps original price/evidence; applying the new pin changes normalized input/context |
| TRACE28 | Empty pinned catalog and no owned containers | Direct recipe remains eligible; catalog_empty must not erase a valid purchase-free path |
| TRACE29 | One group needs multiple bins | AllowMultipleTargets permits3bins for6instances; quantity does not vanish after the first cavity fills |
| TRACE30 | Known quantity exceeds geometric expansion cap | Exact unassigned ordinal ranges conserve the remainder; no silent truncation or phantom placements |

Introduce TRACE01's scalar assertions in the bootstrap where applicable; full candidate/check/BOM assertions belong to Task003, search/ranking/multiplicity to Task004, and persisted browser traces to Tasks005–006. Later edits/import/recovery extend these cases without replacing their expected numeric invariants. The complete fixture manifest must name implemented operation/runtime support honestly.

The worked layout is a reviewed small oracle. A generated golden result must still be checked against these independent numbers and state distinctions; copying implementation output into expected JSON is not independent validation.
