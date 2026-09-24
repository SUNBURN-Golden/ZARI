import type {
  RawMeasurementDto,
  RawProjectInputDto,
  Unit,
} from '../../contracts/generated/dto';
import template from './default-form.json';

/** The bundled synthetic catalog. Reproduction claims pin this digest. */
export const CATALOG_PIN = {
  catalogVersion: 'catalog-2025-01',
  catalogDigest:
    '802a109192357c493fd4effc09ccef51c109a7ab05b18a927d109572505cff1a',
} as const;

/**
 * Measurement fields the measurement step can edit. Paths match the Rust
 * `project_measurement` grammar used by `formatRequests`.
 */
export const MEASUREMENT_FIELDS = [
  'space.interior.width',
  'space.interior.depth',
  'space.interior.height',
  'space.opening.width',
  'space.opening.height',
  'items.item-a.dimensions.envelope.width',
  'items.item-a.dimensions.envelope.depth',
  'items.item-a.dimensions.envelope.height',
  'items.item-b.dimensions.envelope.width',
  'items.item-b.dimensions.envelope.depth',
  'items.item-b.dimensions.envelope.height',
] as const;
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number];

const SPACE_SEGMENTS = new Set(['interior', 'opening', 'staging', 'support']);

/** Clone the fixture-shaped template so callers can mutate freely. */
export function sampleProjectForm(): RawProjectInputDto {
  const form = structuredClone(template) as unknown as RawProjectInputDto;
  // The fixture's all-zero pin is a normalize-only placeholder; activation
  // requires the real catalog digest.
  form.catalogPin = { ...CATALOG_PIN };
  return form;
}

function blankMeasurement(m: RawMeasurementDto): void {
  m.text = '';
  m.uncertainty = { state: 'unknown' };
  m.origin = 'userDeclared';
  m.evidenceIds = [];
}
function blankOffset(offset: { text: string; uncertainty: unknown }): void {
  offset.text = '';
  offset.uncertainty = { state: 'unknown' };
}
/** Collapse a `RawFactDto` to `Unknown{notProvided}` preserving its variant tag. */
function blankScalarFact(fact: { state: string } & Record<string, unknown>): void {
  delete fact.value;
  delete fact.origin;
  delete fact.evidenceIds;
  delete fact.reasonCode;
  fact.state = 'unknown';
  fact.reason = 'notProvided';
}

/**
 * A fresh editable draft: the template shape with every user-entered
 * measurement reduced to blank text, which Rust normalizes to
 * `Unknown{notMeasured}` — nothing enters the draft as fact without input.
 */
export function emptyProjectForm(): RawProjectInputDto {
  const form = sampleProjectForm();
  const space = form.space;
  for (const m of Object.values(space.interior)) blankMeasurement(m);
  blankMeasurement(space.opening.width);
  blankMeasurement(space.opening.height);
  blankOffset(space.opening.left);
  blankOffset(space.opening.bottom);
  for (const m of Object.values(space.staging.freeVolume.extent)) blankMeasurement(m);
  blankOffset(space.staging.freeVolume.minX);
  blankOffset(space.staging.freeVolume.minY);
  blankOffset(space.staging.freeVolume.minZ);
  for (const axis of ['width', 'depth'] as const)
    blankMeasurement(space.support.footprint[axis]);
  blankOffset(space.support.footprint.x);
  blankOffset(space.support.footprint.y);
  blankOffset(space.support.elevation);
  blankScalarFact(space.support.loadLimit);
  for (const m of Object.values(space.clearances)) {
    if (typeof m === 'object' && m !== null && 'state' in m)
      blankScalarFact(m as { state: string } & Record<string, unknown>);
  }
  for (const item of form.items) {
    for (const m of Object.values(item.dimensions.envelope)) blankMeasurement(m);
    blankScalarFact(item.massEach);
    blankScalarFact(item.quantity);
  }
  blankScalarFact(form.constraints.hardBudget);
  blankScalarFact(form.constraints.softBudget);
  return form;
}

function resolve(form: RawProjectInputDto, field: string): RawMeasurementDto | null {
  const parts = field.split('.');
  let current: unknown = form;
  for (const segment of parts) {
    if (typeof current !== 'object' || current === null) return null;
    // `items.<id>` segments address the element carrying that `id`, not an
    // array index or object key.
    current = Array.isArray(current)
      ? current.find(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry as { id?: unknown }).id === segment,
        )
      : (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'object' && current !== null && 'text' in current
    ? (current as RawMeasurementDto)
    : null;
}

export function getMeasurement(
  form: RawProjectInputDto,
  field: MeasurementField,
): RawMeasurementDto {
  const found = resolve(form, field);
  if (!found) throw new Error(`unknown measurement field: ${field}`);
  return found;
}

export function setMeasurementText(
  form: RawProjectInputDto,
  field: MeasurementField,
  text: string,
): RawProjectInputDto {
  const next = structuredClone(form);
  const m = resolve(next, field);
  if (!m) throw new Error(`unknown measurement field: ${field}`);
  m.text = text;
  return next;
}

export function setMeasurementUnit(
  form: RawProjectInputDto,
  field: MeasurementField,
  unit: Unit,
): RawProjectInputDto {
  const next = structuredClone(form);
  const m = resolve(next, field);
  if (!m) throw new Error(`unknown measurement field: ${field}`);
  m.unit = unit;
  return next;
}

/**
 * Map a Rust diagnostic path onto an editable field. Diagnostics carry the
 * space id (`space.space-1.interior.width`) while `formatRequests` paths do
 * not; the id segment is collapsed here.
 */
export function fieldPathFor(diagPath: string): MeasurementField | null {
  const parts = diagPath.split('.');
  const collapsed =
    parts[0] === 'space' && parts.length > 2 && SPACE_SEGMENTS.has(parts[2] ?? '')
      ? `space.${parts.slice(2).join('.')}`
      : diagPath;
  return (MEASUREMENT_FIELDS as readonly string[]).includes(collapsed)
    ? (collapsed as MeasurementField)
    : null;
}
