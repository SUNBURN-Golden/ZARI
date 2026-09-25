/* Generated from Rust DTOs. Run npm run contracts:generate; do not edit. */

/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CheckStatus".
 */
export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'not_applicable';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_ClearanceMm".
 */
export type FactFor_ClearanceMm =
  | {
      provenance: Provenance;
      state: 'known';
      value: ClearanceMm;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "MeasurementOrigin".
 */
export type MeasurementOrigin =
  | 'synthetic'
  | 'manufacturer'
  | 'retailer'
  | 'userMeasured'
  | 'userDeclared'
  | 'aiEstimated'
  | 'derived';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "VerificationStatus".
 */
export type VerificationStatus = 'unverified' | 'estimated' | 'confirmed';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ClearanceMm".
 */
export type ClearanceMm = number;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "UnknownReason".
 */
export type UnknownReason = 'notMeasured' | 'notProvided' | 'sourceMissing' | 'conflictingSources';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawUncertaintyDto".
 */
export type RawUncertaintyDto =
  | {
      state: 'unknown';
    }
  | {
      minusText: string;
      plusText: string;
      state: 'bounded';
      unit: Unit;
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Unit".
 */
export type Unit = 'mm' | 'cm';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_MeasuredLength".
 */
export type FactFor_MeasuredLength =
  | {
      provenance: Provenance;
      state: 'known';
      value: MeasuredLength;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "LengthMm".
 */
export type LengthMm = number;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Uncertainty".
 */
export type Uncertainty =
  | {
      state: 'unknown';
    }
  | {
      minusMm: ClearanceMm;
      plusMm: ClearanceMm;
      state: 'bounded';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_Quantity".
 */
export type FactFor_Quantity =
  | {
      provenance: Provenance;
      state: 'known';
      value: Quantity;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Quantity".
 */
export type Quantity = number;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_UnitCount".
 */
export type FactFor_UnitCount =
  | {
      provenance: Provenance;
      state: 'known';
      value: UnitCount;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "UnitCount".
 */
export type UnitCount = number;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_Revision".
 */
export type FactFor_Revision =
  | {
      provenance: Provenance;
      state: 'known';
      value: Revision;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = string;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_Array_of_RowObject".
 */
export type FactFor_ArrayOf_RowObject =
  | {
      provenance: Provenance;
      state: 'known';
      value: RowObject[];
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CheckBasis".
 */
export type CheckBasis = 'nominal' | 'conservative' | 'nonGeometric';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CheckKind".
 */
export type CheckKind =
  | 'outer_geometry'
  | 'inner_capacity'
  | 'installation_path'
  | 'operational_access'
  | 'support_geometry'
  | 'support_load'
  | 'orientation'
  | 'quantity_conservation'
  | 'compatibility'
  | 'inventory'
  | 'price'
  | 'shipping'
  | 'budget';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "PackQuantity".
 */
export type PackQuantity = number;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_InventoryState".
 */
export type FactFor_InventoryState =
  | {
      provenance: Provenance;
      state: 'known';
      value: InventoryState;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "InventoryState".
 */
export type InventoryState = 'inStock' | 'outOfStock';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_MoneyKrw".
 */
export type FactFor_MoneyKrw =
  | {
      provenance: Provenance;
      state: 'known';
      value: MoneyKrw;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "MoneyKrw".
 */
export type MoneyKrw = string;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_PackQuantity".
 */
export type FactFor_PackQuantity =
  | {
      provenance: Provenance;
      state: 'known';
      value: PackQuantity;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_ShippingRule".
 */
export type FactFor_ShippingRule =
  | {
      provenance: Provenance;
      state: 'known';
      value: ShippingRule;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * v1 supports a known fixed fee per seller order or free; anything else is an
 * explicit unknown/complex policy fact, never a zero-price default.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ShippingRule".
 */
export type ShippingRule =
  | {
      kind: 'free';
    }
  | {
      fee: FactFor_MoneyKrw;
      kind: 'fixedPerSeller';
    }
  | {
      kind: 'complex';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_string".
 */
export type FactForString =
  | {
      provenance: Provenance;
      state: 'known';
      value: string;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CatalogSourceKind".
 */
export type CatalogSourceKind = 'synthetic' | 'imported';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_Array_of_Orientation".
 */
export type FactFor_ArrayOf_Orientation =
  | {
      provenance: Provenance;
      state: 'known';
      value: Orientation[];
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Orientation".
 */
export type Orientation = 'upright0' | 'upright90';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_Array_of_Id".
 */
export type FactFor_ArrayOf_Id =
  | {
      provenance: Provenance;
      state: 'known';
      value: Id[];
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_CavityModel".
 */
export type FactFor_CavityModel =
  | {
      provenance: Provenance;
      state: 'known';
      value: CavityModel;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Only an evidenced conservative rectangular cavity is supported; a tapered
 * product uses an evidenced inscribed cuboid inside the outer envelope.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CavityModel".
 */
export type CavityModel = 'conservativeCuboid' | 'inscribedCuboid';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_HandleEnvelope".
 */
export type FactFor_HandleEnvelope =
  | {
      provenance: Provenance;
      state: 'known';
      value: HandleEnvelope;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "HandleEnvelope".
 */
export type HandleEnvelope =
  | {
      kind: 'includedInOuter';
    }
  | {
      extent: Extent3Mm;
      kind: 'extraExtent';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_InnerOffset".
 */
export type FactFor_InnerOffset =
  | {
      provenance: Provenance;
      state: 'known';
      value: InnerOffset;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_MeasuredOffset".
 */
export type FactFor_MeasuredOffset =
  | {
      provenance: Provenance;
      state: 'known';
      value: MeasuredOffset;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "PositionMm".
 */
export type PositionMm = number;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_SupportSurface".
 */
export type FactFor_SupportSurface =
  | {
      provenance: Provenance;
      state: 'known';
      value: SupportSurface;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SupportKind".
 */
export type SupportKind = 'establishedFloor' | 'containerCavityFloor';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_MassGrams".
 */
export type FactFor_MassGrams =
  | {
      provenance: Provenance;
      state: 'known';
      value: MassGrams;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "MassGrams".
 */
export type MassGrams = number;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_LidState".
 */
export type FactFor_LidState =
  | {
      provenance: Provenance;
      state: 'known';
      value: LidState;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "LidState".
 */
export type LidState = 'absent' | 'present';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_MountingRequirement".
 */
export type FactFor_MountingRequirement =
  | {
      provenance: Provenance;
      state: 'known';
      value: MountingRequirement;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "MountingRequirement".
 */
export type MountingRequirement = 'none' | 'required';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "StoragePrimitive".
 */
export type StoragePrimitive = 'directPlacement' | 'openBin' | 'tray' | 'verticalFile';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_Stackability".
 */
export type FactFor_Stackability =
  | {
      provenance: Provenance;
      state: 'known';
      value: Stackability;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Stackability".
 */
export type Stackability =
  | {
      kind: 'notStackable';
    }
  | {
      kind: 'stackable';
      maxUnits: number;
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Digest".
 */
export type Digest = string;
/**
 * Per-operation oracle. `decodeError` asserts that the payload cannot even
 * decode into the operation's input type — the worker answers
 * `operationFailed/invalid_input`.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "DomainFixtureExpected".
 */
export type DomainFixtureExpected =
  | {
      decodeError: boolean;
      diagnostics: ExpectedDiagnostic[];
      inputDigest: Digest | null;
      kind: 'normalizeProjectInput';
    }
  | {
      computedDigest: Digest | null;
      decodeError: boolean;
      diagnostics: ExpectedDiagnostic[];
      kind: 'verifyRecord';
      verified: boolean | null;
    }
  | {
      decodeError: boolean;
      fields: ExpectedCatalogField[];
      kind: 'normalizeCatalogFields';
    }
  | {
      checks: ExpectedCheck[];
      commerceReadiness: CommerceReadiness | null;
      decodeError: boolean;
      diagnostics: ExpectedDiagnostic[];
      kind: 'validateCandidate';
      physicalAssurance: PhysicalAssurance | null;
      snapshotDigest: Digest | null;
    }
  | {
      checks: ExpectedCheck[];
      commerceReadiness: CommerceReadiness | null;
      decodeError: boolean;
      diagnostics: ExpectedDiagnostic[];
      kind: 'evaluateLayoutEdit';
      physicalAssurance: PhysicalAssurance | null;
      snapshotDigest: Digest | null;
    }
  | {
      /**
       * Sorted union of assumption codes across all decisions.
       */
      conditionCodes: string[];
      decodeError: boolean;
      kind: 'proposeStrategies';
      /**
       * Ordered strategies the event must return.
       */
      strategies: Strategy[];
    }
  | {
      /**
       * Ordered snapshot digests of the emitted ranked alternatives.
       */
      alternativeDigests: Digest[];
      /**
       * Exact consumed counters at termination; `null` for a cancelled or
       * non-terminated run (asserted against the event either way).
       */
      consumed: SearchCounters | null;
      decodeError: boolean;
      /**
       * Sorted diagnostic-candidate reason codes.
       */
      diagnosticReasons: string[];
      kind: 'runSearch';
      /**
       * Sorted scope-restriction codes.
       */
      restrictionCodes: string[];
      /**
       * Required terminal reason; `null` asserts the run never terminated
       * within the declared steps (last event is `searchProgress`).
       */
      termination: SearchTermination | null;
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CommerceReadiness".
 */
export type CommerceReadiness = 'ready' | 'conditional' | 'notApplicable';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "PhysicalAssurance".
 */
export type PhysicalAssurance = 'confirmedWithinScope' | 'conditional' | 'rejected';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Strategy".
 */
export type Strategy =
  | 'minimumPurchase'
  | 'frequencySeparation'
  | 'activityGrouping'
  | 'activeReserveSeparation'
  | 'oneActionAccess';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "WorkCount".
 */
export type WorkCount = string;
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SearchTermination".
 */
export type SearchTermination = 'scopeComplete' | 'budgetExhausted' | 'cancelled' | 'interrupted';
/**
 * The domain interchange operation a shared fixture exercises. The fixture's
 * `expected.kind` must carry the same name.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "DomainOperation".
 */
export type DomainOperation =
  | ('normalizeProjectInput' | 'verifyRecord' | 'normalizeCatalogFields' | 'validateCandidate')
  | 'evaluateLayoutEdit'
  | 'proposeStrategies'
  | 'runSearch';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "LayoutEditCommand".
 */
export type LayoutEditCommand =
  | {
      kind: 'movePlacement';
      placementId: Id;
      position: Vec3Mm;
    }
  | {
      kind: 'rotatePlacement';
      orientation: Orientation;
      placementId: Id;
    }
  | {
      kind: 'replaceVariant';
      offerId: Id | null;
      placementId: Id;
      variantId: Id;
    }
  | {
      kind: 'selectOffer';
      offerId: Id;
      variantId: Id;
    }
  | {
      kind: 'restoreLayout';
      sourceSnapshotId: Digest;
    };
/**
 * The typed result of one converted catalog field.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CatalogFieldValue".
 */
export type CatalogFieldValue =
  | {
      kind: 'measurement';
      value: FactFor_MeasuredLength;
    }
  | {
      kind: 'quantity';
      value: FactFor_Quantity;
    }
  | {
      kind: 'packQuantity';
      value: FactFor_PackQuantity;
    }
  | {
      kind: 'moneyKrw';
      value: FactFor_MoneyKrw;
    }
  | {
      kind: 'massGrams';
      value: FactFor_MassGrams;
    }
  | {
      kind: 'clearanceMm';
      value: FactFor_ClearanceMm;
    }
  | {
      kind: 'positionMm';
      value: FactFor_MeasuredOffset;
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ActionKind".
 */
export type ActionKind =
  | 'clearSpace'
  | 'sortContents'
  | 'acquire'
  | 'confirmArrival'
  | 'install'
  | 'transferContents'
  | 'label'
  | 'verifyUnassigned'
  | 'resolveCondition';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ItemLocation".
 */
export type ItemLocation =
  | {
      kind: 'direct';
      placementId: Id;
    }
  | {
      containerPlacementId: Id;
      kind: 'contained';
      localPlacement: ItemPlacement;
    }
  | {
      containerPlacementId: Id;
      kind: 'provisionalContainer';
      reasonCode: string;
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "PlanCreation".
 */
export type PlanCreation = 'referenceSearch' | 'manualEdit';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ZoneKind".
 */
export type ZoneKind = 'softPreference' | 'hardLocked';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SafetyRestriction".
 */
export type SafetyRestriction = 'hazardousMaterials' | 'highLoad' | 'childSafety';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "GroupSplitPolicy".
 */
export type GroupSplitPolicy = 'oneTarget' | 'allowMultipleTargets';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_Frequency".
 */
export type FactFor_Frequency =
  | {
      provenance: Provenance;
      state: 'known';
      value: Frequency;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Frequency".
 */
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'rare';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RetrievalMode".
 */
export type RetrievalMode = 'directFrontExtraction' | 'pullContainerThenRetrieve';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_StockRole".
 */
export type FactFor_StockRole =
  | {
      provenance: Provenance;
      state: 'known';
      value: StockRole;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "StockRole".
 */
export type StockRole = 'active' | 'reserve';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SpaceKind".
 */
export type SpaceKind = 'rectangularCompartment';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ObstacleRole".
 */
export type ObstacleRole = 'physicalSolid' | 'accessExclusion';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "OpeningPlane".
 */
export type OpeningPlane = 'frontYZero';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FactFor_StagingSupport".
 */
export type FactFor_StagingSupport =
  | {
      provenance: Provenance;
      state: 'known';
      value: StagingSupport;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ParentRef".
 */
export type ParentRef =
  | {
      kind: 'space';
      spaceId: Id;
    }
  | {
      kind: 'container';
      placementId: Id;
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "PlacementSubject".
 */
export type PlacementSubject =
  | {
      kind: 'ownedContainer';
      ownedId: Id;
      unitOrdinal: number;
    }
  | {
      kind: 'newContainer';
      unitOrdinal: number;
      variantId: Id;
    }
  | {
      itemId: Id;
      kind: 'directItem';
      unitOrdinal: number;
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "OfferSelection".
 */
export type OfferSelection =
  | {
      kind: 'selected';
      offerId: Id;
    }
  | {
      kind: 'unresolved';
      reasonCode: string;
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "UnassignedInstances".
 */
export type UnassignedInstances =
  | {
      kind: 'known';
      ranges: OrdinalRange[];
    }
  | {
      kind: 'unknownQuantity';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Command".
 */
export type Command =
  | {
      buildId: string;
      expectedProtocolVersion: number;
      expectedSchemaVersion: number;
      kind: 'initialize';
    }
  | {
      context: ActivationContext;
      kind: 'activateProject';
    }
  | {
      formatRequests: FieldFormatRequest[];
      input: NormalizeInputDto;
      kind: 'normalizeInput';
      priorInputDigest: string | null;
    }
  | {
      kind: 'evaluateProbe';
      probe: BootstrapProbeDto;
    }
  | {
      kind: 'verifyRecord';
      record: VerifiableRecordDto;
    }
  | {
      fields: RawCatalogFieldDto[];
      kind: 'normalizeCatalogFields';
    }
  | {
      kind: 'validateCandidate';
      proposal: CandidateProposal;
    }
  | {
      baseSnapshot: PlanSnapshot;
      command: LayoutEditCommand;
      kind: 'evaluateLayoutEdit';
      sourceSnapshot: PlanSnapshot | null;
    }
  | {
      kind: 'proposeStrategies';
    }
  | {
      kind: 'startSearch';
      mode: SearchMode;
    }
  | {
      allowance: number;
      kind: 'stepSearch';
      searchId: string;
    }
  | {
      kind: 'cancelSearch';
      searchId: string;
    }
  | {
      kind: 'disposeProject';
    };
/**
 * Activation payload: the bootstrap probe context or a normalized project
 * plus the catalog bytes matching its pin (or a cached digest).
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ActivationContext".
 */
export type ActivationContext =
  | {
      kind: 'bootstrap';
    }
  | {
      catalog: CatalogSnapshot | null;
      input: ProjectInput;
      kind: 'project';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "NormalizeInputDto".
 */
export type NormalizeInputDto =
  | {
      kind: 'bootstrap';
      probe: BootstrapProbeDto;
    }
  | {
      kind: 'project';
      project: RawProjectInputDto;
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_RawScalarTextDto".
 */
export type RawFactFor_RawScalarTextDto =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: RawScalarTextDto;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_Frequency".
 */
export type RawFactFor_Frequency =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: Frequency;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_Array_of_Orientation".
 */
export type RawFactFor_ArrayOf_Orientation =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: Orientation[];
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_StockRole".
 */
export type RawFactFor_StockRole =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: StockRole;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_CavityModel".
 */
export type RawFactFor_CavityModel =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: CavityModel;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_RawHandleEnvelopeDto".
 */
export type RawFactFor_RawHandleEnvelopeDto =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: RawHandleEnvelopeDto;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawHandleEnvelopeDto".
 */
export type RawHandleEnvelopeDto =
  | {
      kind: 'includedInOuter';
    }
  | {
      extent: RawExtent3Dto;
      kind: 'extraExtent';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_RawInnerOffsetDto".
 */
export type RawFactFor_RawInnerOffsetDto =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: RawInnerOffsetDto;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_RawSupportSurfaceDto".
 */
export type RawFactFor_RawSupportSurfaceDto =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: RawSupportSurfaceDto;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_LidState".
 */
export type RawFactFor_LidState =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: LidState;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * Raw form of `Fact<T>`: a known value with declared origin/evidence, an
 * explicit unknown reason, or an explicit not-applicable reason.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawFactFor_RawStagingSupportDto".
 */
export type RawFactFor_RawStagingSupportDto =
  | {
      evidenceIds: Id[];
      origin: MeasurementOrigin;
      state: 'known';
      value: RawStagingSupportDto;
    }
  | {
      reason: UnknownReason;
      state: 'unknown';
    }
  | {
      reasonCode: string;
      state: 'notApplicable';
    };
/**
 * A durable record whose claimed content digest Rust can verify.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "VerifiableRecordDto".
 */
export type VerifiableRecordDto =
  | {
      input: ProjectInput;
      inputDigest: Digest;
      kind: 'input';
    }
  | {
      catalog: CatalogSnapshot;
      kind: 'catalog';
    }
  | {
      kind: 'snapshot';
      snapshot: PlanSnapshot;
    };
/**
 * One catalog field presented for stateless Rust scalar conversion.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawCatalogFieldValueDto".
 */
export type RawCatalogFieldValueDto =
  | {
      kind: 'measurement';
      raw: RawMeasurementDto;
    }
  | {
      kind: 'quantity';
      text: string;
    }
  | {
      kind: 'packQuantity';
      text: string;
    }
  | {
      kind: 'moneyKrw';
      text: string;
    }
  | {
      kind: 'massGrams';
      text: string;
    }
  | {
      kind: 'clearanceMm';
      text: string;
    }
  | {
      kind: 'positionMm';
      text: string;
    };
/**
 * Search drive mode recorded at `startSearch`. The single-threaded runtime
 * only ever advances on explicit `stepSearch` requests, so `continuous` is a
 * scheduling hint for the host — never an autonomous loop inside WASM.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SearchMode".
 */
export type SearchMode = 'continuous' | 'manual';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Event".
 */
export type Event =
  | {
      buildId: string;
      canonicalVersion: number;
      capabilities: string[];
      kind: 'ready';
      protocolVersion: number;
      ruleVersion: string;
      schemaVersion: number;
      solverVersion: string;
    }
  | {
      contextId: string | null;
      kind: 'projectActivated';
    }
  | {
      diagnostics: Diagnostic[];
      equivalentToPrior: boolean;
      formattedFields: FormattedField[];
      inputDigest: string | null;
      kind: 'normalized';
      normalizedInput: NormalizedInput | null;
    }
  | {
      kind: 'probeEvaluated';
      result: BootstrapProbeResult;
    }
  | {
      computedDigest: Digest | null;
      diagnostics: Diagnostic[];
      kind: 'recordVerified';
      recordKind: string;
      verified: boolean;
    }
  | {
      fields: NormalizedCatalogField[];
      kind: 'catalogFieldsNormalized';
    }
  | {
      diagnostics: Diagnostic[];
      kind: 'candidateValidated';
      report: ValidationReport | null;
      snapshot: PlanSnapshot | null;
    }
  | {
      diagnostics: Diagnostic[];
      kind: 'editEvaluated';
      report: ValidationReport | null;
      snapshot: PlanSnapshot | null;
    }
  | {
      decisions: StrategyDecision[];
      kind: 'strategiesProposed';
    }
  | {
      kind: 'searchStarted';
      mode: SearchMode;
      searchId: string;
    }
  | {
      consumed: SearchCounters;
      kind: 'searchProgress';
      searchId: string;
    }
  | {
      kind: 'searchCompleted';
      result: SearchResult;
      searchId: string;
    }
  | {
      consumed: SearchCounters;
      kind: 'searchCancelled';
      searchId: string;
    }
  | {
      kind: 'projectDisposed';
    }
  | {
      affectedFields: string[];
      affectedIds: string[];
      code: string;
      kind: 'operationFailed';
      reasonParameters: {
        [k: string]: string;
      };
      retryable: boolean;
    };
/**
 * The normalized result of `normalizeInput`, tagged by input kind.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "NormalizedInput".
 */
export type NormalizedInput =
  | {
      input: NormalizedBootstrapInput;
      kind: 'bootstrap';
    }
  | {
      input: ProjectInput;
      kind: 'project';
    };

export interface ZariContractBundle {
  BootstrapFixture: BootstrapFixture;
  BootstrapProbeDto: BootstrapProbeDto;
  BootstrapProbeResult: BootstrapProbeResult;
  CatalogImportDto: CatalogImportDto;
  CatalogSnapshot: CatalogSnapshot;
  DomainFixture: DomainFixture;
  LayoutEditCommand: LayoutEditCommand;
  NormalizedCatalogField: NormalizedCatalogField;
  PlanSnapshot: PlanSnapshot;
  ProjectInput: ProjectInput;
  ProtocolRequest: ProtocolRequest;
  ProtocolResponse: ProtocolResponse;
  RawCatalogFieldDto: RawCatalogFieldDto;
  RawProjectInputDto: RawProjectInputDto;
  SnapshotBinding: SnapshotBinding;
  VerifiableRecordDto: VerifiableRecordDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "BootstrapFixture".
 */
export interface BootstrapFixture {
  caseId: string;
  engineContext: EngineContext;
  expected: FixtureExpected;
  fixtureSchemaVersion: number;
  input: BootstrapProbeDto;
  operation: string;
  schemaVersion: number;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "EngineContext".
 */
export interface EngineContext {
  buildId: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FixtureExpected".
 */
export interface FixtureExpected {
  diagnosticFields: string[];
  packsToOrder: number | null;
  requiredWidthMm: string | null;
  suppliedUnits: number | null;
  surplusUnits: number | null;
  widthStatus: CheckStatus;
  xPositionsMm: string[] | null;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "BootstrapProbeDto".
 */
export interface BootstrapProbeDto {
  betweenGapMm: FactFor_ClearanceMm;
  compartmentWidth: RawMeasurementDto;
  leftGapMm: FactFor_ClearanceMm;
  neededNewUnits: RawCountDto;
  packQuantity: RawCountDto;
  rightGapMm: FactFor_ClearanceMm;
  unitCount: RawCountDto;
  unitWidth: RawMeasurementDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Provenance".
 */
export interface Provenance {
  evidenceIds: Id[];
  inputRefs: FieldRef[];
  observedAt: string | null;
  origin: MeasurementOrigin;
  ruleIds: string[];
  verification: VerificationStatus;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FieldRef".
 */
export interface FieldRef {
  entityId: Id;
  fieldPath: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawMeasurementDto".
 */
export interface RawMeasurementDto {
  evidenceIds: Id[];
  origin: MeasurementOrigin;
  text: string;
  uncertainty: RawUncertaintyDto;
  unit: Unit;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawCountDto".
 */
export interface RawCountDto {
  text: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "BootstrapProbeResult".
 */
export interface BootstrapProbeResult {
  diagnostics: Diagnostic[];
  normalizedCompartmentWidth: FactFor_MeasuredLength;
  normalizedUnitWidth: FactFor_MeasuredLength;
  order: OrderResult;
  requiredWidthMm: FactFor_Revision;
  rowObjects: FactFor_ArrayOf_RowObject;
  widthCheck: ConstraintCheck;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Diagnostic".
 */
export interface Diagnostic {
  code: string;
  fieldPath: string;
  reasonCode: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "MeasuredLength".
 */
export interface MeasuredLength {
  nominal: LengthMm;
  uncertainty: Uncertainty;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "OrderResult".
 */
export interface OrderResult {
  packsToOrder: FactFor_Quantity;
  suppliedUnits: FactFor_UnitCount;
  surplusUnits: FactFor_UnitCount;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RowObject".
 */
export interface RowObject {
  ordinal: number;
  widthMm: LengthMm;
  xMm: Revision;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ConstraintCheck".
 */
export interface ConstraintCheck {
  basis: CheckBasis;
  blocking: boolean;
  evidenceRefs: FieldRef[];
  id: Id;
  kind: CheckKind;
  measurements: CheckMeasurement[];
  reasonCode: string;
  remediation: Remediation[];
  status: CheckStatus;
  subjectIds: Id[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CheckMeasurement".
 */
export interface CheckMeasurement {
  fieldPath: string;
  valueMm: FactFor_Revision;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Remediation".
 */
export interface Remediation {
  code: string;
  fieldPaths: string[];
}
/**
 * Same versioned fields as `CatalogSnapshot` minus the digest that only Rust
 * produces; the catalog import boundary for Task008.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CatalogImportDto".
 */
export interface CatalogImportDto {
  catalogVersion: string;
  evidence: Evidence[];
  ingestionVersion: string;
  offers: Offer[];
  products: Product[];
  schemaVersion: number;
  sourceKind: CatalogSourceKind;
  sourceObservations: SourceObservation[];
  variants: ProductVariant[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Evidence".
 */
export interface Evidence {
  confirmedBy: string | null;
  id: Id;
  locator: string | null;
  note: string;
  observedAt: string | null;
  sourceField: string;
  sourceKind: MeasurementOrigin;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Offer".
 */
export interface Offer {
  bundleComponents: BundleComponent[];
  id: Id;
  inventory: FactFor_InventoryState;
  observedAt: string | null;
  packPrice: FactFor_MoneyKrw;
  packQuantity: FactFor_PackQuantity;
  sellerId: Id;
  shipping: FactFor_ShippingRule;
  url: FactForString;
  variantId: Id;
}
/**
 * A declared component of a heterogeneous bundle. v1 plans only homogeneous
 * variant packs; a nonempty list marks the offer as an unsupported bundle.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "BundleComponent".
 */
export interface BundleComponent {
  quantity: PackQuantity;
  variantId: Id;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Product".
 */
export interface Product {
  brand: FactForString;
  category: string;
  id: Id;
  name: string;
  provenance: Provenance;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SourceObservation".
 */
export interface SourceObservation {
  id: Id;
  note: string;
  observedAt: string | null;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ProductVariant".
 */
export interface ProductVariant {
  allowedOrientations: FactFor_ArrayOf_Orientation;
  color: FactForString;
  compatibility: FactFor_ArrayOf_Id;
  dimensions: VariantDimensions;
  handling: HandlingClearance;
  id: Id;
  mass: FactFor_MassGrams;
  material: FactForString;
  mounting: FactFor_MountingRequirement;
  optionLabel: string;
  primitive: StoragePrimitive;
  productId: Id;
  stackability: FactFor_Stackability;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "VariantDimensions".
 */
export interface VariantDimensions {
  cavityClearances: CavityClearancePolicy;
  cavityModel: FactFor_CavityModel;
  handles: FactFor_HandleEnvelope;
  inner: Dimensions;
  innerOffset: FactFor_InnerOffset;
  innerSupport: FactFor_SupportSurface;
  lidState: FactFor_LidState;
  outer: Dimensions;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CavityClearancePolicy".
 */
export interface CavityClearancePolicy {
  back: FactFor_ClearanceMm;
  betweenItems: FactFor_ClearanceMm;
  front: FactFor_ClearanceMm;
  left: FactFor_ClearanceMm;
  right: FactFor_ClearanceMm;
  top: FactFor_ClearanceMm;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Extent3Mm".
 */
export interface Extent3Mm {
  depth: LengthMm;
  height: LengthMm;
  width: LengthMm;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Dimensions".
 */
export interface Dimensions {
  depth: FactFor_MeasuredLength;
  height: FactFor_MeasuredLength;
  width: FactFor_MeasuredLength;
}
/**
 * Cavity floor origin in the original product frame.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "InnerOffset".
 */
export interface InnerOffset {
  x: FactFor_MeasuredOffset;
  y: FactFor_MeasuredOffset;
  z: FactFor_MeasuredOffset;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "MeasuredOffset".
 */
export interface MeasuredOffset {
  nominal: PositionMm;
  uncertainty: Uncertainty;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SupportSurface".
 */
export interface SupportSurface {
  elevation: FactFor_MeasuredOffset;
  footprint: MeasuredRectangle;
  id: Id;
  kind: SupportKind;
  loadLimit: FactFor_MassGrams;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "MeasuredRectangle".
 */
export interface MeasuredRectangle {
  depth: FactFor_MeasuredLength;
  width: FactFor_MeasuredLength;
  x: FactFor_MeasuredOffset;
  y: FactFor_MeasuredOffset;
}
/**
 * Motion margins for the supported extraction model.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "HandlingClearance".
 */
export interface HandlingClearance {
  left: FactFor_ClearanceMm;
  liftAboveRim: FactFor_ClearanceMm;
  pullExtraDepth: FactFor_ClearanceMm;
  right: FactFor_ClearanceMm;
  top: FactFor_ClearanceMm;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CatalogSnapshot".
 */
export interface CatalogSnapshot {
  catalogDigest: Digest;
  catalogVersion: string;
  evidence: Evidence[];
  ingestionVersion: string;
  offers: Offer[];
  products: Product[];
  schemaVersion: number;
  sourceKind: CatalogSourceKind;
  sourceObservations: SourceObservation[];
  variants: ProductVariant[];
}
/**
 * One shared domain interchange case, executed through the identical
 * `Runtime::handle_json` path natively and inside the real browser
 * Worker/WASM. `input` stays untyped so malformed payloads reach the Rust
 * decoder unchanged.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "DomainFixture".
 */
export interface DomainFixture {
  caseId: string;
  engineContext: EngineContext;
  expected: DomainFixtureExpected;
  fixtureSchemaVersion: number;
  input: unknown;
  operation: DomainOperation;
  schemaVersion: number;
}
/**
 * One expected diagnostic, compared as an unordered `(fieldPath, code)` set.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ExpectedDiagnostic".
 */
export interface ExpectedDiagnostic {
  code: string;
  fieldPath: string;
}
/**
 * The expected result of one catalog field conversion: either the exact
 * typed fact JSON or the diagnostic codes the field must carry.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ExpectedCatalogField".
 */
export interface ExpectedCatalogField {
  diagnosticCodes: string[];
  fieldPath: string;
  value: unknown;
}
/**
 * One expected check assertion on a `candidateValidated` report: the check
 * id must exist with this status (and reason when declared).
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ExpectedCheck".
 */
export interface ExpectedCheck {
  id: string;
  reasonCode: string | null;
  status: CheckStatus;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SearchCounters".
 */
export interface SearchCounters {
  nodes: number;
  validatedCandidates: number;
  workUnits: WorkCount;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Vec3Mm".
 */
export interface Vec3Mm {
  x: PositionMm;
  y: PositionMm;
  z: PositionMm;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "NormalizedCatalogField".
 */
export interface NormalizedCatalogField {
  diagnostics: Diagnostic[];
  fieldPath: string;
  value: CatalogFieldValue | null;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "PlanSnapshot".
 */
export interface PlanSnapshot {
  content: SnapshotContent;
  planSnapshotId: Digest;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SnapshotContent".
 */
export interface SnapshotContent {
  actions: ActionStep[];
  assignments: ItemAssignment[];
  bom: BOMLine[];
  costSummary: CostSummary;
  creation: PlanCreation;
  inputFacts: ProjectInput;
  placements: Placement[];
  purchaseSelections: PurchaseSelection[];
  referencedCatalog: CatalogEvidenceSubset;
  scope: SearchScope;
  strategy: StrategyDecision;
  unassigned: Unassigned[];
  validation: ValidationReport;
  versions: CompileVersions;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ActionStep".
 */
export interface ActionStep {
  id: Id;
  kind: ActionKind;
  prerequisiteStepIds: Id[];
  reasonIds: Id[];
  requiredConfirmations: Id[];
  subjectIds: Id[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ItemAssignment".
 */
export interface ItemAssignment {
  itemId: Id;
  location: ItemLocation;
  unitOrdinal: number;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ItemPlacement".
 */
export interface ItemPlacement {
  orientation: Orientation;
  position: Vec3Mm;
  supportId: Id;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "BOMLine".
 */
export interface BOMLine {
  evidenceRefs: FieldRef[];
  id: Id;
  newUnitsNeeded: Quantity;
  offerId: Id | null;
  ownedId: Id | null;
  packQuantity: FactFor_PackQuantity;
  packsToOrder: FactFor_Quantity;
  physicalNeeded: Quantity;
  placementIds: Id[];
  productSubtotal: FactFor_MoneyKrw;
  reused: Quantity;
  supplied: FactFor_UnitCount;
  surplus: FactFor_UnitCount;
  variantId: Id | null;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CostSummary".
 */
export interface CostSummary {
  grandTotal: FactFor_MoneyKrw;
  productSubtotal: FactFor_MoneyKrw;
  shippingTotal: FactFor_MoneyKrw;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ProjectInput".
 */
export interface ProjectInput {
  catalogPin: CatalogPin;
  constraints: UserConstraints;
  evidence: Evidence[];
  groups: ItemGroup[];
  items: Item[];
  ownedContainers: OwnedContainer[];
  preferences: Preferences;
  search: SearchSelection;
  space: Space;
  strategyChoice: Strategy;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CatalogPin".
 */
export interface CatalogPin {
  catalogDigest: Digest;
  catalogVersion: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "UserConstraints".
 */
export interface UserConstraints {
  hardBudget: FactFor_MoneyKrw;
  hardOneActionAccess: boolean;
  lockedZones: LockedGroupZone[];
  purchaseAllowed: boolean;
  safetyRestrictions: SafetyRestriction[];
  softBudget: FactFor_MoneyKrw;
}
/**
 * A user-locked assignment of one group to one explicit zone.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "LockedGroupZone".
 */
export interface LockedGroupZone {
  groupId: Id;
  zone: Zone;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Zone".
 */
export interface Zone {
  bounds: Cuboid;
  id: Id;
  kind: ZoneKind;
  label: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Cuboid".
 */
export interface Cuboid {
  extent: Extent3Mm;
  min: Vec3Mm;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ItemGroup".
 */
export interface ItemGroup {
  id: Id;
  itemIds: Id[];
  label: string;
  splitPolicy: GroupSplitPolicy;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Item".
 */
export interface Item {
  activityIds: Id[];
  category: string;
  dimensions: ItemDimensions;
  frequency: FactFor_Frequency;
  id: Id;
  label: string;
  massEach: FactFor_MassGrams;
  quantity: FactFor_Quantity;
  requirement: StorageRequirement;
  stockRole: FactFor_StockRole;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ItemDimensions".
 */
export interface ItemDimensions {
  envelope: Dimensions;
  storageState: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "StorageRequirement".
 */
export interface StorageRequirement {
  allowedOrientations: FactFor_ArrayOf_Orientation;
  allowedRetrievalModes: RetrievalMode[];
  handling: HandlingClearance;
  mandatoryCompatibility: Id[];
  mustStayTogether: boolean;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "OwnedContainer".
 */
export interface OwnedContainer {
  allowedUse: FactForString;
  condition: FactForString;
  id: Id;
  physical: PhysicalContainerModel;
  provenance: Provenance;
  quantityAvailable: FactFor_Quantity;
  quantityOwned: FactFor_Quantity;
  variantRef: VariantRef | null;
}
/**
 * The physical model copy embedded in a user-owned container; kept by value
 * so a later catalog change cannot rewrite owned facts.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "PhysicalContainerModel".
 */
export interface PhysicalContainerModel {
  allowedOrientations: FactFor_ArrayOf_Orientation;
  dimensions: VariantDimensions;
  handling: HandlingClearance;
  mass: FactFor_MassGrams;
  primitive: StoragePrimitive;
}
/**
 * A stable reference to a catalog variant under a known catalog digest.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "VariantRef".
 */
export interface VariantRef {
  catalogDigest: Digest;
  variantId: Id;
}
/**
 * Ranked objective first; material/color/visual preferences never change
 * physical facts and never carry a synthetic safety score.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Preferences".
 */
export interface Preferences {
  color: string | null;
  material: string | null;
  objectiveRanking: Strategy[];
  visualNotes: string[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SearchSelection".
 */
export interface SearchSelection {
  budget: SearchBudget;
  profile: SearchProfile;
  seed: string | null;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SearchBudget".
 */
export interface SearchBudget {
  maxAlternatives: number;
  maxCandidatesPerGroup: number;
  maxNodes: number;
  maxWorkUnits: WorkCount;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SearchProfile".
 */
export interface SearchProfile {
  id: string;
  version: number;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Space".
 */
export interface Space {
  clearances: ClearancePolicy;
  id: Id;
  interior: Dimensions;
  kind: SpaceKind;
  obstacles: Obstacle[];
  opening: SpaceOpening;
  staging: StagingEnvelope;
  support: SupportSurface;
}
/**
 * Static wall and between-unit clearances, each independently sourced.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ClearancePolicy".
 */
export interface ClearancePolicy {
  back: FactFor_ClearanceMm;
  betweenUnits: FactFor_ClearanceMm;
  front: FactFor_ClearanceMm;
  left: FactFor_ClearanceMm;
  right: FactFor_ClearanceMm;
  ruleIds: string[];
  top: FactFor_ClearanceMm;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Obstacle".
 */
export interface Obstacle {
  bounds: MeasuredCuboid;
  id: Id;
  role: ObstacleRole;
}
/**
 * Three measured minimum axes plus a measured extent, in the parent frame.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "MeasuredCuboid".
 */
export interface MeasuredCuboid {
  extent: Dimensions;
  minX: FactFor_MeasuredOffset;
  minY: FactFor_MeasuredOffset;
  minZ: FactFor_MeasuredOffset;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SpaceOpening".
 */
export interface SpaceOpening {
  bottom: FactFor_MeasuredOffset;
  height: FactFor_MeasuredLength;
  left: FactFor_MeasuredOffset;
  plane: OpeningPlane;
  width: FactFor_MeasuredLength;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "StagingEnvelope".
 */
export interface StagingEnvelope {
  baseSupport: FactFor_StagingSupport;
  freeVolume: MeasuredCuboid;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "StagingSupport".
 */
export interface StagingSupport {
  loadLimit: FactFor_MassGrams;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Placement".
 */
export interface Placement {
  id: Id;
  orientation: Orientation;
  parent: ParentRef;
  position: Vec3Mm;
  subject: PlacementSubject;
  supportId: Id;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "PurchaseSelection".
 */
export interface PurchaseSelection {
  offer: OfferSelection;
  placementId: Id;
}
/**
 * The referenced subset retained inside a snapshot for historical display.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CatalogEvidenceSubset".
 */
export interface CatalogEvidenceSubset {
  evidence: Evidence[];
  offers: Offer[];
  products: Product[];
  variants: ProductVariant[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SearchScope".
 */
export interface SearchScope {
  budget: SearchBudget;
  groupIds: Id[];
  profile: SearchProfile;
  restrictions: ScopeRestriction[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ScopeRestriction".
 */
export interface ScopeRestriction {
  code: string;
  subjectIds: Id[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "StrategyDecision".
 */
export interface StrategyDecision {
  assumptions: Condition[];
  factRefs: FieldRef[];
  groups: ResolvedGroup[];
  priorities: GroupPriority[];
  reasons: Reason[];
  ruleIds: string[];
  strategy: Strategy;
  zones: Zone[];
}
/**
 * An unresolved assumption or scope restriction attached to a decision.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Condition".
 */
export interface Condition {
  code: string;
  factRefs: FieldRef[];
  id: Id;
  messageKey: string;
  parameters: {
    [k: string]: string;
  };
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ResolvedGroup".
 */
export interface ResolvedGroup {
  groupId: Id;
  itemIds: Id[];
  zoneId: Id;
}
/**
 * Ordered group ranking; list position is semantic and never re-sorted.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "GroupPriority".
 */
export interface GroupPriority {
  groupId: Id;
  ordinal: number;
}
/**
 * A reason the UI can translate: rule id, field references and message
 * parameters; never a free-text claim.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Reason".
 */
export interface Reason {
  factRefs: FieldRef[];
  id: Id;
  messageKey: string;
  parameters: {
    [k: string]: string;
  };
  ruleId: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "Unassigned".
 */
export interface Unassigned {
  instances: UnassignedInstances;
  itemId: Id;
  reasonCode: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "OrdinalRange".
 */
export interface OrdinalRange {
  endExclusive: number;
  start: number;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ValidationReport".
 */
export interface ValidationReport {
  assignmentCompleteness: AssignmentCompleteness;
  checks: ConstraintCheck[];
  commerceReadiness: CommerceReadiness;
  physicalAssurance: PhysicalAssurance;
}
/**
 * The exact known/unknown instance partition exposed by a report.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "AssignmentCompleteness".
 */
export interface AssignmentCompleteness {
  assignedInstances: UnitCount;
  provisionalInstances: UnitCount;
  unassignedInstances: UnitCount;
  unknownQuantityItems: UnitCount;
}
/**
 * The immutable engine/input context stamped into every snapshot. Engine
 * versions are copied from the engine, never accepted as caller input.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CompileVersions".
 */
export interface CompileVersions {
  canonicalVersion: number;
  catalogDigest: Digest;
  catalogVersion: string;
  inputDigest: Digest;
  ruleVersion: string;
  schemaVersion: number;
  searchBudget: SearchBudget;
  searchProfile: SearchProfile;
  seed?: string | null;
  solverVersion: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ProtocolRequest".
 */
export interface ProtocolRequest {
  command: Command;
  meta: RequestMeta;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FieldFormatRequest".
 */
export interface FieldFormatRequest {
  fieldPath: string;
  unit: Unit;
}
/**
 * The project form of `NormalizeInputDto`: mirrors `ProjectInput` with raw
 * numeric fields. Rust normalization owns every conversion.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawProjectInputDto".
 */
export interface RawProjectInputDto {
  catalogPin: CatalogPin;
  constraints: RawUserConstraintsDto;
  evidence: Evidence[];
  groups: RawItemGroupDto[];
  items: RawItemDto[];
  ownedContainers: RawOwnedContainerDto[];
  preferences: Preferences;
  search: SearchSelection;
  space: RawSpaceDto;
  strategyChoice: Strategy;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawUserConstraintsDto".
 */
export interface RawUserConstraintsDto {
  hardBudget: RawFactFor_RawScalarTextDto;
  hardOneActionAccess: boolean;
  lockedZones: LockedGroupZone[];
  purchaseAllowed: boolean;
  safetyRestrictions: SafetyRestriction[];
  softBudget: RawFactFor_RawScalarTextDto;
}
/**
 * Plain unsigned text entry inside a `RawFactDto` value.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawScalarTextDto".
 */
export interface RawScalarTextDto {
  text: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawItemGroupDto".
 */
export interface RawItemGroupDto {
  id: Id;
  itemIds: Id[];
  label: string;
  splitPolicy: GroupSplitPolicy;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawItemDto".
 */
export interface RawItemDto {
  activityIds: Id[];
  category: string;
  dimensions: RawItemDimensionsDto;
  frequency: RawFactFor_Frequency;
  id: Id;
  label: string;
  massEach: RawFactFor_RawScalarTextDto;
  quantity: RawFactFor_RawScalarTextDto;
  requirement: RawStorageRequirementDto;
  stockRole: RawFactFor_StockRole;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawItemDimensionsDto".
 */
export interface RawItemDimensionsDto {
  envelope: RawDimensionsDto;
  storageState: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawDimensionsDto".
 */
export interface RawDimensionsDto {
  depth: RawMeasurementDto;
  height: RawMeasurementDto;
  width: RawMeasurementDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawStorageRequirementDto".
 */
export interface RawStorageRequirementDto {
  allowedOrientations: RawFactFor_ArrayOf_Orientation;
  allowedRetrievalModes: RetrievalMode[];
  handling: RawHandlingClearanceDto;
  mandatoryCompatibility: Id[];
  mustStayTogether: boolean;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawHandlingClearanceDto".
 */
export interface RawHandlingClearanceDto {
  left: RawFactFor_RawScalarTextDto;
  liftAboveRim: RawFactFor_RawScalarTextDto;
  pullExtraDepth: RawFactFor_RawScalarTextDto;
  right: RawFactFor_RawScalarTextDto;
  top: RawFactFor_RawScalarTextDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawOwnedContainerDto".
 */
export interface RawOwnedContainerDto {
  allowedUse: RawFactFor_RawScalarTextDto;
  condition: RawFactFor_RawScalarTextDto;
  id: Id;
  physical: RawPhysicalContainerModelDto;
  provenance: Provenance;
  quantityAvailable: RawFactFor_RawScalarTextDto;
  quantityOwned: RawFactFor_RawScalarTextDto;
  variantRef: RawVariantRefDto | null;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawPhysicalContainerModelDto".
 */
export interface RawPhysicalContainerModelDto {
  allowedOrientations: RawFactFor_ArrayOf_Orientation;
  dimensions: RawVariantDimensionsDto;
  handling: RawHandlingClearanceDto;
  mass: RawFactFor_RawScalarTextDto;
  primitive: StoragePrimitive;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawVariantDimensionsDto".
 */
export interface RawVariantDimensionsDto {
  cavityClearances: RawCavityClearancePolicyDto;
  cavityModel: RawFactFor_CavityModel;
  handles: RawFactFor_RawHandleEnvelopeDto;
  inner: RawDimensionsDto;
  innerOffset: RawFactFor_RawInnerOffsetDto;
  innerSupport: RawFactFor_RawSupportSurfaceDto;
  lidState: RawFactFor_LidState;
  outer: RawDimensionsDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawCavityClearancePolicyDto".
 */
export interface RawCavityClearancePolicyDto {
  back: RawFactFor_RawScalarTextDto;
  betweenItems: RawFactFor_RawScalarTextDto;
  front: RawFactFor_RawScalarTextDto;
  left: RawFactFor_RawScalarTextDto;
  right: RawFactFor_RawScalarTextDto;
  top: RawFactFor_RawScalarTextDto;
}
/**
 * A known-positive axis extent entered as measurement text; uncertainty is
 * not representable on `Extent3Mm` and is rejected during normalization.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawExtent3Dto".
 */
export interface RawExtent3Dto {
  depth: RawMeasurementDto;
  height: RawMeasurementDto;
  width: RawMeasurementDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawInnerOffsetDto".
 */
export interface RawInnerOffsetDto {
  x: RawOffsetDto;
  y: RawOffsetDto;
  z: RawOffsetDto;
}
/**
 * Signed integer-millimetre position entry; the only signed raw grammar.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawOffsetDto".
 */
export interface RawOffsetDto {
  evidenceIds: Id[];
  origin: MeasurementOrigin;
  text: string;
  uncertainty: RawUncertaintyDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawSupportSurfaceDto".
 */
export interface RawSupportSurfaceDto {
  elevation: RawOffsetDto;
  footprint: RawMeasuredRectangleDto;
  id: Id;
  kind: SupportKind;
  loadLimit: RawFactFor_RawScalarTextDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawMeasuredRectangleDto".
 */
export interface RawMeasuredRectangleDto {
  depth: RawMeasurementDto;
  width: RawMeasurementDto;
  x: RawOffsetDto;
  y: RawOffsetDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawVariantRefDto".
 */
export interface RawVariantRefDto {
  catalogDigest: Digest;
  variantId: Id;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawSpaceDto".
 */
export interface RawSpaceDto {
  clearances: RawClearancePolicyDto;
  id: Id;
  interior: RawDimensionsDto;
  kind: SpaceKind;
  obstacles: RawObstacleDto[];
  opening: RawSpaceOpeningDto;
  staging: RawStagingEnvelopeDto;
  support: RawSupportSurfaceDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawClearancePolicyDto".
 */
export interface RawClearancePolicyDto {
  back: RawFactFor_RawScalarTextDto;
  betweenUnits: RawFactFor_RawScalarTextDto;
  front: RawFactFor_RawScalarTextDto;
  left: RawFactFor_RawScalarTextDto;
  right: RawFactFor_RawScalarTextDto;
  ruleIds: string[];
  top: RawFactFor_RawScalarTextDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawObstacleDto".
 */
export interface RawObstacleDto {
  bounds: RawMeasuredCuboidDto;
  id: Id;
  role: ObstacleRole;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawMeasuredCuboidDto".
 */
export interface RawMeasuredCuboidDto {
  extent: RawDimensionsDto;
  minX: RawOffsetDto;
  minY: RawOffsetDto;
  minZ: RawOffsetDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawSpaceOpeningDto".
 */
export interface RawSpaceOpeningDto {
  bottom: RawOffsetDto;
  height: RawMeasurementDto;
  left: RawOffsetDto;
  plane: OpeningPlane;
  width: RawMeasurementDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawStagingEnvelopeDto".
 */
export interface RawStagingEnvelopeDto {
  baseSupport: RawFactFor_RawStagingSupportDto;
  freeVolume: RawMeasuredCuboidDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawStagingSupportDto".
 */
export interface RawStagingSupportDto {
  loadLimit: RawFactFor_RawScalarTextDto;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawCatalogFieldDto".
 */
export interface RawCatalogFieldDto {
  fieldPath: string;
  value: RawCatalogFieldValueDto;
}
/**
 * The full proposal handed to the independent validator boundary: the
 * candidate layout plus the declared strategy trace and creation mode that
 * the snapshot embeds. None of it asserts validity; the engine recomputes
 * every check and stamps its own compile versions.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CandidateProposal".
 */
export interface CandidateProposal {
  creation: PlanCreation;
  layout: CandidateLayout;
  strategy: StrategyDecision;
}
/**
 * The complete proposal crossing the independent validator boundary; a
 * caller-supplied pass flag does not exist and cannot be trusted.
 *
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CandidateLayout".
 */
export interface CandidateLayout {
  assignments: ItemAssignment[];
  placements: Placement[];
  purchaseSelections: PurchaseSelection[];
  unassigned: Unassigned[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RequestMeta".
 */
export interface RequestMeta {
  contextId: string | null;
  editorEpoch: Revision;
  inputRevision: Revision;
  projectActivationId: string;
  projectId: string;
  protocolVersion: number;
  requestId: string;
  schemaVersion: number;
  workerSessionId: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "ProtocolResponse".
 */
export interface ProtocolResponse {
  event: Event;
  meta: RequestMeta;
  sequence: number;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "FormattedField".
 */
export interface FormattedField {
  fieldPath: string;
  text: string;
  unit: Unit;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "NormalizedBootstrapInput".
 */
export interface NormalizedBootstrapInput {
  betweenGapMm: FactFor_ClearanceMm;
  compartmentWidth: FactFor_MeasuredLength;
  leftGapMm: FactFor_ClearanceMm;
  neededNewUnits: FactFor_Quantity;
  packQuantity: FactFor_PackQuantity;
  rightGapMm: FactFor_ClearanceMm;
  unitCount: FactFor_Quantity;
  unitWidth: FactFor_MeasuredLength;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SearchResult".
 */
export interface SearchResult {
  alternatives: PlanSnapshot[];
  consumed: SearchCounters;
  diagnosticCandidates: RejectedCandidate[];
  scope: SearchScope;
  termination: SearchTermination;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RejectedCandidate".
 */
export interface RejectedCandidate {
  reasonCode: string;
  subjectIds: Id[];
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "SnapshotBinding".
 */
export interface SnapshotBinding {
  inputRevision: Revision;
  planSnapshotId: Digest;
  projectId: Id;
}
