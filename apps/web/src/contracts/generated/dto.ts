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
export type CheckBasis = 'nominal';
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "CheckKind".
 */
export type CheckKind = 'outer_geometry';
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
      context: BootstrapContext;
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
      kind: 'disposeProject';
    };
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "BootstrapContext".
 */
export type BootstrapContext = {
  kind: 'bootstrap';
};
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "NormalizeInputDto".
 */
export type NormalizeInputDto = {
  kind: 'bootstrap';
  probe: BootstrapProbeDto;
};
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
      normalizedInput: NormalizedBootstrapInput | null;
    }
  | {
      kind: 'probeEvaluated';
      result: BootstrapProbeResult;
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
 * via the `definition` "PackQuantity".
 */
export type PackQuantity = number;

export interface ZariContractBundle {
  BootstrapFixture: BootstrapFixture;
  BootstrapProbeDto: BootstrapProbeDto;
  BootstrapProbeResult: BootstrapProbeResult;
  ProtocolRequest: ProtocolRequest;
  ProtocolResponse: ProtocolResponse;
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
  evidenceIds: string[];
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
  entityId: string;
  fieldPath: string;
}
/**
 * This interface was referenced by `ZariContractBundle`'s JSON-Schema
 * via the `definition` "RawMeasurementDto".
 */
export interface RawMeasurementDto {
  evidenceIds: string[];
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
  id: string;
  kind: CheckKind;
  measurements: CheckMeasurement[];
  reasonCode: string;
  remediation: Remediation[];
  status: CheckStatus;
  subjectIds: string[];
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
