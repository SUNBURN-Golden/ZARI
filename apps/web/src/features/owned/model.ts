import type {
  CavityClearancePolicy,
  FactFor_ClearanceMm,
  FactFor_HandleEnvelope,
  FactFor_InnerOffset,
  HandlingClearance,
  FactFor_MassGrams,
  FactFor_MeasuredLength,
  FactFor_MeasuredOffset,
  FactFor_Quantity,
  FactFor_SupportSurface,
  FactForString,
  FactFor_ArrayOf_Orientation,
  FactFor_CavityModel,
  FactFor_LidState,
  OwnedContainer,
  ProductVariant,
  RawFactFor_ArrayOf_Orientation,
  RawFactFor_CavityModel,
  RawFactFor_LidState,
  RawFactFor_RawHandleEnvelopeDto,
  RawFactFor_RawInnerOffsetDto,
  RawFactFor_RawScalarTextDto,
  RawFactFor_RawSupportSurfaceDto,
  RawMeasurementDto,
  RawOffsetDto,
  RawOwnedContainerDto,
  RawPhysicalContainerModelDto,
  RawVariantDimensionsDto,
  UnknownReason,
  VariantDimensions,
} from '../../contracts/generated/dto';

/**
 * Owned-container conversions (Ticket 008). The library stores normalized
 * `OwnedContainer` records; the project draft and the registration form speak
 * the raw DTO. These functions are faithful re-serializations only — a known
 * fact becomes its exact text, an unknown fact becomes blank text with the
 * same reason — so the draft's Rust `normalizeInput` round-trip reproduces
 * the stored values verbatim. No fact is ever upgraded or invented here.
 */

const textOf = (value: number | bigint | string): RawFactFor_RawScalarTextDto => ({
  state: 'known',
  value: { text: String(value) },
  origin: 'userDeclared',
  evidenceIds: [],
});
const unknownText = (reason: UnknownReason = 'notProvided'): RawFactFor_RawScalarTextDto => ({
  state: 'unknown',
  reason,
});

function scalarToRaw(
  fact:
    | FactFor_Quantity
    | FactFor_MassGrams
    | FactFor_ClearanceMm
    | FactForString
    | { state: string },
): RawFactFor_RawScalarTextDto {
  if (fact.state === 'known') {
    const known = fact as { state: 'known'; value: unknown; provenance: { origin: RawMeasurementDto['origin']; evidenceIds: string[] } };
    return {
      state: 'known',
      value: { text: String(known.value) },
      origin: known.provenance.origin,
      evidenceIds: known.provenance.evidenceIds,
    };
  }
  if (fact.state === 'notApplicable')
    return { state: 'notApplicable', reasonCode: (fact as { reasonCode: string }).reasonCode };
  return unknownText((fact as { reason: UnknownReason }).reason);
}

function measurementToRaw(fact: FactFor_MeasuredLength): RawMeasurementDto {
  if (fact.state !== 'known')
    return {
      text: '',
      unit: 'mm',
      uncertainty: { state: 'unknown' },
      origin: 'userDeclared',
      evidenceIds: [],
    };
  const uncertainty =
    fact.value.uncertainty.state === 'bounded'
      ? {
          state: 'bounded' as const,
          minusText: String(fact.value.uncertainty.minusMm),
          plusText: String(fact.value.uncertainty.plusMm),
          unit: 'mm' as const,
        }
      : { state: 'unknown' as const };
  return {
    text: String(fact.value.nominal),
    unit: 'mm',
    uncertainty,
    origin: fact.provenance.origin,
    evidenceIds: fact.provenance.evidenceIds,
  };
}

function offsetToRaw(fact: FactFor_MeasuredOffset): RawOffsetDto {
  if (fact.state !== 'known')
    return {
      text: '',
      uncertainty: { state: 'unknown' },
      origin: 'userDeclared',
      evidenceIds: [],
    };
  const uncertainty =
    fact.value.uncertainty.state === 'bounded'
      ? {
          state: 'bounded' as const,
          minusText: String(fact.value.uncertainty.minusMm),
          plusText: String(fact.value.uncertainty.plusMm),
          unit: 'mm' as const,
        }
      : { state: 'unknown' as const };
  return {
    text: String(fact.value.nominal),
    uncertainty,
    origin: fact.provenance.origin,
    evidenceIds: fact.provenance.evidenceIds,
  };
}

function rawDims(dimensions: {
  width: FactFor_MeasuredLength;
  depth: FactFor_MeasuredLength;
  height: FactFor_MeasuredLength;
}) {
  return {
    width: measurementToRaw(dimensions.width),
    depth: measurementToRaw(dimensions.depth),
    height: measurementToRaw(dimensions.height),
  };
}

/** `Extent3Mm` holds bare mm numbers — each becomes a mm measurement text. */
function rawExtent(extent: { width: number; depth: number; height: number }) {
  const axis = (value: number): RawMeasurementDto => ({
    text: String(value),
    unit: 'mm',
    uncertainty: { state: 'unknown' },
    origin: 'userDeclared',
    evidenceIds: [],
  });
  return { width: axis(extent.width), depth: axis(extent.depth), height: axis(extent.height) };
}

function rawCavityClearances(
  policy: CavityClearancePolicy,
): RawVariantDimensionsDto['cavityClearances'] {
  return {
    left: scalarToRaw(policy.left),
    right: scalarToRaw(policy.right),
    front: scalarToRaw(policy.front),
    back: scalarToRaw(policy.back),
    top: scalarToRaw(policy.top),
    betweenItems: scalarToRaw(policy.betweenItems),
  };
}

function rawHandling(handling: HandlingClearance): RawPhysicalContainerModelDto['handling'] {
  return {
    left: scalarToRaw(handling.left),
    right: scalarToRaw(handling.right),
    top: scalarToRaw(handling.top),
    pullExtraDepth: scalarToRaw(handling.pullExtraDepth),
    liftAboveRim: scalarToRaw(handling.liftAboveRim),
  };
}

function innerOffsetToRaw(fact: FactFor_InnerOffset): RawFactFor_RawInnerOffsetDto {
  if (fact.state !== 'known') return { state: 'unknown', reason: 'notProvided' };
  return {
    state: 'known',
    value: {
      x: offsetToRaw(fact.value.x),
      y: offsetToRaw(fact.value.y),
      z: offsetToRaw(fact.value.z),
    },
    origin: fact.provenance.origin,
    evidenceIds: fact.provenance.evidenceIds,
  };
}

function innerSupportToRaw(fact: FactFor_SupportSurface): RawFactFor_RawSupportSurfaceDto {
  if (fact.state !== 'known') return { state: 'unknown', reason: 'notProvided' };
  const surface = fact.value;
  return {
    state: 'known',
    value: {
      id: surface.id,
      kind: surface.kind,
      footprint: {
        x: offsetToRaw(surface.footprint.x),
        y: offsetToRaw(surface.footprint.y),
        width: measurementToRaw(surface.footprint.width),
        depth: measurementToRaw(surface.footprint.depth),
      },
      elevation: offsetToRaw(surface.elevation),
      loadLimit: scalarToRaw(surface.loadLimit),
    },
    origin: fact.provenance.origin,
    evidenceIds: fact.provenance.evidenceIds,
  };
}

function handlesToRaw(fact: FactFor_HandleEnvelope): RawFactFor_RawHandleEnvelopeDto {
  if (fact.state !== 'known') return { state: 'unknown', reason: 'notProvided' };
  return {
    state: 'known',
    value:
      fact.value.kind === 'includedInOuter'
        ? { kind: 'includedInOuter' }
        : { kind: 'extraExtent', extent: rawExtent(fact.value.extent) },
    origin: fact.provenance.origin,
    evidenceIds: fact.provenance.evidenceIds,
  };
}

function lidToRaw(fact: FactFor_LidState): RawFactFor_LidState {
  if (fact.state !== 'known') return { state: 'unknown', reason: 'notProvided' };
  return {
    state: 'known',
    value: fact.value,
    origin: fact.provenance.origin,
    evidenceIds: fact.provenance.evidenceIds,
  };
}

function cavityToRaw(fact: FactFor_CavityModel): RawFactFor_CavityModel {
  if (fact.state !== 'known') return { state: 'unknown', reason: 'notProvided' };
  return {
    state: 'known',
    value: fact.value,
    origin: fact.provenance.origin,
    evidenceIds: fact.provenance.evidenceIds,
  };
}

function orientationsToRaw(
  fact: FactFor_ArrayOf_Orientation,
): RawFactFor_ArrayOf_Orientation {
  if (fact.state !== 'known') return { state: 'unknown', reason: 'notProvided' };
  return {
    state: 'known',
    value: fact.value,
    origin: fact.provenance.origin,
    evidenceIds: fact.provenance.evidenceIds,
  };
}

export function rawDimensions(dimensions: VariantDimensions): RawVariantDimensionsDto {
  return {
    outer: rawDims(dimensions.outer),
    inner: rawDims(dimensions.inner),
    innerOffset: innerOffsetToRaw(dimensions.innerOffset),
    innerSupport: innerSupportToRaw(dimensions.innerSupport),
    handles: handlesToRaw(dimensions.handles),
    lidState: lidToRaw(dimensions.lidState),
    cavityModel: cavityToRaw(dimensions.cavityModel),
    cavityClearances: rawCavityClearances(dimensions.cavityClearances),
  };
}

/** A normalized library record back into draft form — exact, by value. */
export function ownedToRaw(container: OwnedContainer): RawOwnedContainerDto {
  const physical = container.physical;
  return {
    id: container.id,
    variantRef:
      container.variantRef === null
        ? null
        : {
            variantId: container.variantRef.variantId,
            catalogDigest: container.variantRef.catalogDigest,
          },
    physical: {
      dimensions: rawDimensions(physical.dimensions),
      primitive: physical.primitive,
      allowedOrientations: orientationsToRaw(physical.allowedOrientations),
      mass: scalarToRaw(physical.mass),
      handling: rawHandling(physical.handling),
    },
    quantityOwned: scalarToRaw(container.quantityOwned),
    quantityAvailable: scalarToRaw(container.quantityAvailable),
    condition: scalarToRaw(container.condition),
    allowedUse: scalarToRaw(container.allowedUse),
    provenance: container.provenance,
  };
}

/**
 * Registration prefill from a catalog variant: physical facts are copied with
 * their declared origins/evidence ids — never upgraded to user-measured.
 */
export function rawPhysicalFromVariant(variant: ProductVariant): RawPhysicalContainerModelDto {
  return {
    dimensions: rawDimensions(variant.dimensions),
    primitive: variant.primitive,
    allowedOrientations: orientationsToRaw(variant.allowedOrientations),
    mass: scalarToRaw(variant.mass),
    handling: rawHandling(variant.handling),
  };
}

export interface OwnedFormFields {
  id: string;
  quantityOwned: string;
  quantityAvailable: string;
  condition: string;
  allowedUse: string;
  /** By-value physical facts; blank stays an explicit unknown, never zero. */
  outerWidthMm: string;
  outerDepthMm: string;
  outerHeightMm: string;
  innerWidthMm: string;
  innerDepthMm: string;
  innerHeightMm: string;
  massGrams: string;
}

export const EMPTY_OWNED_FIELDS: OwnedFormFields = {
  id: '',
  quantityOwned: '',
  quantityAvailable: '',
  condition: '',
  allowedUse: '',
  outerWidthMm: '',
  outerDepthMm: '',
  outerHeightMm: '',
  innerWidthMm: '',
  innerDepthMm: '',
  innerHeightMm: '',
  massGrams: '',
};

/** A fresh manual entry: physical facts by value, everything else unknown. */
export function blankOwnedRaw(fields: OwnedFormFields): RawOwnedContainerDto {
  const dimText = (text: string): RawMeasurementDto =>
    text === ''
      ? {
          text: '',
          unit: 'mm',
          uncertainty: { state: 'unknown' },
          origin: 'userDeclared',
          evidenceIds: [],
        }
      : {
          text,
          unit: 'mm',
          uncertainty: { state: 'unknown' },
          origin: 'userDeclared',
          evidenceIds: [],
        };
  return {
    id: fields.id,
    variantRef: null,
    physical: {
      dimensions: {
        outer: {
          width: dimText(fields.outerWidthMm),
          depth: dimText(fields.outerDepthMm),
          height: dimText(fields.outerHeightMm),
        },
        inner: {
          width: dimText(fields.innerWidthMm),
          depth: dimText(fields.innerDepthMm),
          height: dimText(fields.innerHeightMm),
        },
        innerOffset: { state: 'unknown', reason: 'notProvided' },
        innerSupport: { state: 'unknown', reason: 'notProvided' },
        handles: { state: 'unknown', reason: 'notProvided' },
        lidState: { state: 'unknown', reason: 'notProvided' },
        cavityModel: { state: 'unknown', reason: 'notProvided' },
        cavityClearances: {
          left: unknownText(),
          right: unknownText(),
          front: unknownText(),
          back: unknownText(),
          top: unknownText(),
          betweenItems: unknownText(),
        },
      },
      primitive: 'openBin',
      allowedOrientations: { state: 'unknown', reason: 'notProvided' },
      mass: fields.massGrams === '' ? unknownText() : textOf(fields.massGrams),
      handling: {
        left: unknownText(),
        right: unknownText(),
        top: unknownText(),
        pullExtraDepth: unknownText(),
        liftAboveRim: unknownText(),
      },
    },
    quantityOwned: fields.quantityOwned === '' ? unknownText() : textOf(fields.quantityOwned),
    quantityAvailable:
      fields.quantityAvailable === '' ? unknownText() : textOf(fields.quantityAvailable),
    condition: fields.condition === '' ? unknownText() : textOf(fields.condition),
    allowedUse: fields.allowedUse === '' ? unknownText() : textOf(fields.allowedUse),
    provenance: {
      origin: 'userDeclared',
      verification: 'unverified',
      evidenceIds: [],
      ruleIds: [],
      inputRefs: [],
      observedAt: null,
    },
  };
}
