import type {
  Diagnostic,
  Evidence,
  FormattedMeasurementGroup,
  FormattedUncertainty,
  MeasurementOrigin,
  ProjectInput,
  RawFactFor_RawScalarTextDto,
  RawFactFor_RawStagingSupportDto,
  RawMeasurementDto,
  RawOffsetDto,
  RawProjectInputDto,
  RawUncertaintyDto,
  Unit,
  UnknownReason,
} from '../../contracts/generated/dto';

/**
 * Project-side reader for the SP-008 measurement grammar.
 * Paths are the finite routes Rust already accepts. Item ids come from the
 * draft, not from a sample name. Catalogue and owned-container physical
 * paths are recognized only so the UI can refuse to write them.
 */

const ID_PATTERN = /^[A-Za-z0-9_:-]{1,96}$/;

export type MeasurableKind = 'positiveLength' | 'signedOffset';
export type ScalarKind = 'clearance' | 'mass' | 'quantity';
export type DetailKind = MeasurableKind | ScalarKind | 'baseSupport';

export type DetailValue =
  | {
      kind: MeasurableKind;
      text: string;
      unit: Unit;
      uncertainty: RawUncertaintyDto;
      origin: MeasurementOrigin;
      evidenceIds: string[];
    }
  | {
      kind: ScalarKind;
      text: string;
      known: boolean;
      origin: MeasurementOrigin | null;
      evidenceIds: string[];
      reason: UnknownReason | null;
    }
  | {
      kind: 'baseSupport';
      known: boolean;
      origin: MeasurementOrigin | null;
      evidenceIds: string[];
      loadText: string;
      loadKnown: boolean;
      loadOrigin: MeasurementOrigin | null;
      loadEvidenceIds: string[];
    };

export type DetailField = {
  path: string;
  label: string;
  kind: DetailKind;
};

export type DetailGroup = {
  id: string;
  label: string;
  fields: DetailField[];
  readOnly: boolean;
};

const HUMAN_ORIGINS: readonly MeasurementOrigin[] = [
  'userDeclared',
  'userMeasured',
  'manufacturer',
  'retailer',
];

export const HUMAN_ORIGINS_LIST = HUMAN_ORIGINS;

export const ORIGIN_LABEL: Record<MeasurementOrigin, string> = {
  userDeclared: '사용자 선언',
  userMeasured: '사용자 측정',
  manufacturer: '제조사',
  retailer: '판매처',
  synthetic: '합성',
  derived: '계산됨',
  aiEstimated: '추정',
};

const HANDLING_AXES = [
  ['left', '왼쪽 여유'],
  ['right', '오른쪽 여유'],
  ['top', '위쪽 여유'],
  ['pullExtraDepth', '추가로 꺼내는 깊이'],
  ['liftAboveRim', '테두리 위로 드는 높이'],
] as const;

const CLEARANCE_AXES = [
  ['left', '왼쪽 정적 여유'],
  ['right', '오른쪽 정적 여유'],
  ['front', '앞쪽 정적 여유'],
  ['back', '뒤쪽 정적 여유'],
  ['top', '위쪽 정적 여유'],
  ['betweenUnits', '수납함 사이 여유'],
] as const;

export function unknownScalar(reason: UnknownReason = 'notMeasured'): RawFactFor_RawScalarTextDto {
  return { state: 'unknown', reason };
}

function unknownSupport(): Extract<RawFactFor_RawStagingSupportDto, { state: 'unknown' }> {
  return { state: 'unknown', reason: 'notMeasured' };
}

/** Fresh ordinary projects must not inherit the sample's known support or handling. */
export function clearFreshProjectAssumptions(form: RawProjectInputDto): void {
  form.space.staging.baseSupport = unknownSupport();
  for (const item of form.items) {
    for (const [axis] of HANDLING_AXES) {
      item.requirement.handling[axis] = unknownScalar();
    }
  }
}

export function evidenceIdFor(path: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of path) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `ev-${hash.toString(16).padStart(16, '0')}`;
}

function validId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function routeKind(path: string): { kind: DetailKind; mutable: boolean } | null {
  if (!path || path.split('.').some((segment) => segment.length === 0)) return null;
  if (
    path === 'space.interior.width' ||
    path === 'space.interior.depth' ||
    path === 'space.interior.height' ||
    path === 'space.opening.width' ||
    path === 'space.opening.height' ||
    path === 'space.staging.freeVolume.extent.width' ||
    path === 'space.staging.freeVolume.extent.depth' ||
    path === 'space.staging.freeVolume.extent.height' ||
    path === 'space.support.footprint.width' ||
    path === 'space.support.footprint.depth'
  ) {
    return { kind: 'positiveLength', mutable: true };
  }
  if (
    path === 'space.opening.left' ||
    path === 'space.opening.bottom' ||
    path === 'space.staging.freeVolume.minX' ||
    path === 'space.staging.freeVolume.minY' ||
    path === 'space.staging.freeVolume.minZ' ||
    path === 'space.support.footprint.x' ||
    path === 'space.support.footprint.y' ||
    path === 'space.support.elevation'
  ) {
    return { kind: 'signedOffset', mutable: true };
  }
  if (path === 'space.staging.baseSupport') return { kind: 'baseSupport', mutable: true };
  if (path === 'space.staging.baseSupport.loadLimit' || path === 'space.support.loadLimit') {
    return { kind: 'mass', mutable: true };
  }
  if (
    path === 'space.clearances.left' ||
    path === 'space.clearances.right' ||
    path === 'space.clearances.front' ||
    path === 'space.clearances.back' ||
    path === 'space.clearances.top' ||
    path === 'space.clearances.betweenUnits'
  ) {
    return { kind: 'clearance', mutable: true };
  }
  const item = /^items\.([^.]+)\.(dimensions\.envelope\.(width|depth|height)|quantity|massEach|requirement\.handling\.(left|right|top|pullExtraDepth|liftAboveRim))$/.exec(
    path,
  );
  if (item?.[1] && validId(item[1])) {
    if (item[2]?.startsWith('dimensions')) return { kind: 'positiveLength', mutable: true };
    if (item[2] === 'quantity') return { kind: 'quantity', mutable: true };
    if (item[2] === 'massEach') return { kind: 'mass', mutable: true };
    return { kind: 'clearance', mutable: true };
  }
  if (path.startsWith('variants.') || path.startsWith('offers.')) {
    return { kind: 'positiveLength', mutable: false };
  }
  const ownedPhysical = /^ownedContainers\.([^.]+)\.physical(?:\.|$)/.exec(path);
  if (ownedPhysical?.[1] && validId(ownedPhysical[1])) {
    return { kind: 'positiveLength', mutable: false };
  }
  return null;
}

function walk(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return null;
    current = Array.isArray(current)
      ? current.find(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry as { id?: unknown }).id === segment,
        )
      : (current as Record<string, unknown>)[segment];
  }
  return current ?? null;
}

function isMeasurement(value: unknown): value is RawMeasurementDto {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    'unit' in value &&
    'uncertainty' in value &&
    'origin' in value
  );
}

function isOffset(value: unknown): value is RawOffsetDto {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    'uncertainty' in value &&
    'origin' in value &&
    !('unit' in value)
  );
}

function isScalar(value: unknown): value is RawFactFor_RawScalarTextDto {
  return typeof value === 'object' && value !== null && 'state' in value && !('text' in value);
}

function readScalar(fact: RawFactFor_RawScalarTextDto, kind: ScalarKind): DetailValue {
  if (fact.state === 'known') {
    return {
      kind,
      text: fact.value.text,
      known: true,
      origin: fact.origin,
      evidenceIds: [...fact.evidenceIds],
      reason: null,
    };
  }
  if (fact.state === 'unknown') {
    return {
      kind,
      text: '',
      known: false,
      origin: null,
      evidenceIds: [],
      reason: fact.reason,
    };
  }
  return {
    kind,
    text: '',
    known: false,
    origin: null,
    evidenceIds: [],
    reason: null,
  };
}

export function readDetail(form: RawProjectInputDto, path: string): DetailValue | null {
  const route = routeKind(path);
  if (!route?.mutable) return null;
  if (route.kind === 'baseSupport') {
    const fact = form.space.staging.baseSupport;
    if (fact.state === 'known') {
      const load = fact.value.loadLimit;
      return {
        kind: 'baseSupport',
        known: true,
        origin: fact.origin,
        evidenceIds: [...fact.evidenceIds],
        loadText: load.state === 'known' ? load.value.text : '',
        loadKnown: load.state === 'known',
        loadOrigin: load.state === 'known' ? load.origin : null,
        loadEvidenceIds: load.state === 'known' ? [...load.evidenceIds] : [],
      };
    }
    return {
      kind: 'baseSupport',
      known: false,
      origin: null,
      evidenceIds: [],
      loadText: '',
      loadKnown: false,
      loadOrigin: null,
      loadEvidenceIds: [],
    };
  }
  if (path === 'space.staging.baseSupport.loadLimit') {
    const support = form.space.staging.baseSupport;
    if (support.state !== 'known') {
      return {
        kind: 'mass',
        text: '',
        known: false,
        origin: null,
        evidenceIds: [],
        reason: 'notMeasured',
      };
    }
    return readScalar(support.value.loadLimit, 'mass');
  }
  const node = walk(form, path);
  if (route.kind === 'positiveLength') {
    if (!isMeasurement(node)) return null;
    return {
      kind: 'positiveLength',
      text: node.text,
      unit: node.unit,
      uncertainty: node.uncertainty,
      origin: node.origin,
      evidenceIds: [...node.evidenceIds],
    };
  }
  if (route.kind === 'signedOffset') {
    if (!isOffset(node)) return null;
    return {
      kind: 'signedOffset',
      text: node.text,
      unit: 'mm',
      uncertainty: node.uncertainty,
      origin: node.origin,
      evidenceIds: [...node.evidenceIds],
    };
  }
  if (!isScalar(node)) return null;
  return readScalar(node, route.kind);
}

function clone(form: RawProjectInputDto): RawProjectInputDto {
  return structuredClone(form);
}

function measurementAt(form: RawProjectInputDto, path: string): RawMeasurementDto | null {
  const node = walk(form, path);
  return isMeasurement(node) ? node : null;
}

function offsetAt(form: RawProjectInputDto, path: string): RawOffsetDto | null {
  const node = walk(form, path);
  return isOffset(node) ? node : null;
}

function scalarAt(form: RawProjectInputDto, path: string): RawFactFor_RawScalarTextDto | null {
  if (path === 'space.staging.baseSupport.loadLimit') {
    const support = form.space.staging.baseSupport;
    return support.state === 'known' ? support.value.loadLimit : null;
  }
  const node = walk(form, path);
  return isScalar(node) ? node : null;
}

export function writeNominal(
  form: RawProjectInputDto,
  path: string,
  text: string,
  origin: MeasurementOrigin = 'userDeclared',
): RawProjectInputDto | null {
  const route = routeKind(path);
  if (!route?.mutable || route.kind === 'baseSupport') return null;
  const next = clone(form);
  if (route.kind === 'positiveLength') {
    const node = measurementAt(next, path);
    if (!node) return null;
    node.text = text;
    return next;
  }
  if (route.kind === 'signedOffset') {
    const node = offsetAt(next, path);
    if (!node) return null;
    node.text = text;
    return next;
  }
  const node = scalarAt(next, path);
  if (!node) return null;
  const parent = parentRecord(next, path);
  if (!parent) return null;
  const evidenceIds = evidenceIdsFor(next, path, node);
  parent.record[parent.key] = scalarFromText(text, origin, evidenceIds);
  return next;
}

function parentRecord(
  form: RawProjectInputDto,
  path: string,
): { record: Record<string, unknown>; key: string } | null {
  if (path === 'space.staging.baseSupport.loadLimit') {
    const support = form.space.staging.baseSupport;
    if (support.state !== 'known') return null;
    return { record: support.value as unknown as Record<string, unknown>, key: 'loadLimit' };
  }
  const parts = path.split('.');
  const key = parts.at(-1);
  if (!key) return null;
  const parent = walk(form, parts.slice(0, -1).join('.'));
  if (typeof parent !== 'object' || parent === null || Array.isArray(parent)) return null;
  return { record: parent as Record<string, unknown>, key };
}

function evidenceIdsFor(
  form: RawProjectInputDto,
  path: string,
  fact: RawFactFor_RawScalarTextDto,
): string[] {
  const id = evidenceIdFor(path);
  const linked = fact.state === 'known' ? fact.evidenceIds : [];
  if (form.evidence.some((entry) => entry.id === id) && !linked.includes(id)) {
    return [...linked, id];
  }
  return [...linked];
}

function scalarFromText(
  text: string,
  origin: MeasurementOrigin,
  evidenceIds: string[],
): RawFactFor_RawScalarTextDto {
  if (text.trim() === '') return unknownScalar();
  return {
    state: 'known',
    origin,
    evidenceIds,
    value: { text },
  };
}

export function writeUncertainty(
  form: RawProjectInputDto,
  path: string,
  uncertainty: RawUncertaintyDto,
): RawProjectInputDto | null {
  const current = readDetail(form, path);
  if (!current || (current.kind !== 'positiveLength' && current.kind !== 'signedOffset')) return null;
  const next = clone(form);
  const node = current.kind === 'positiveLength' ? measurementAt(next, path) : offsetAt(next, path);
  if (!node) return null;
  if (uncertainty.state === 'unknown') {
    node.uncertainty = { state: 'unknown' };
    return next;
  }
  node.uncertainty = {
    state: 'bounded',
    minusText: uncertainty.minusText,
    plusText: uncertainty.plusText,
    unit: current.kind === 'signedOffset' ? 'mm' : uncertainty.unit,
  };
  return next;
}

export function writeOrigin(
  form: RawProjectInputDto,
  path: string,
  origin: MeasurementOrigin,
): RawProjectInputDto | null {
  if (!HUMAN_ORIGINS.includes(origin)) return null;
  const route = routeKind(path);
  if (!route?.mutable) return null;
  const next = clone(form);
  if (route.kind === 'positiveLength') {
    const node = measurementAt(next, path);
    if (!node) return null;
    node.origin = origin;
    return next;
  }
  if (route.kind === 'signedOffset') {
    const node = offsetAt(next, path);
    if (!node) return null;
    node.origin = origin;
    return next;
  }
  if (route.kind === 'baseSupport') {
    const fact = next.space.staging.baseSupport;
    if (fact.state !== 'known') return null;
    fact.origin = origin;
    return next;
  }
  const node = scalarAt(next, path);
  if (!node || node.state !== 'known') return null;
  node.origin = origin;
  return next;
}

export function writeUnit(form: RawProjectInputDto, path: string, unit: Unit): RawProjectInputDto | null {
  const route = routeKind(path);
  if (!route?.mutable || route.kind !== 'positiveLength') return null;
  const next = clone(form);
  const node = measurementAt(next, path);
  if (!node) return null;
  node.unit = unit;
  return next;
}

export type EvidenceDraft = {
  note: string;
  locator: string;
  observedAt: string;
  sourceKind: MeasurementOrigin;
};

export function writeEvidence(
  form: RawProjectInputDto,
  path: string,
  draft: EvidenceDraft | null,
): RawProjectInputDto | null {
  const route = routeKind(path);
  if (!route?.mutable) return null;
  const next = clone(form);
  const id = evidenceIdFor(path);
  const blank =
    draft === null ||
    (draft.note.trim() === '' && draft.locator.trim() === '' && draft.observedAt.trim() === '');
  if (blank) {
    next.evidence = next.evidence.filter((entry) => entry.id !== id);
    unlink(next, path, id);
    return next;
  }
  const sourceKind = HUMAN_ORIGINS.includes(draft.sourceKind) ? draft.sourceKind : 'userDeclared';
  const record: Evidence = {
    id,
    sourceKind,
    locator: draft.locator.trim() === '' ? null : draft.locator,
    sourceField: path,
    note: draft.note,
    observedAt: draft.observedAt.trim() === '' ? null : draft.observedAt,
    confirmedBy: null,
  };
  const index = next.evidence.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    record.confirmedBy = next.evidence[index]?.confirmedBy ?? null;
    next.evidence[index] = record;
  } else {
    next.evidence = [...next.evidence, record];
  }
  link(next, path, id, sourceKind);
  return next;
}

function link(
  form: RawProjectInputDto,
  path: string,
  id: string,
  origin: MeasurementOrigin,
): void {
  const route = routeKind(path);
  if (!route) return;
  if (route.kind === 'baseSupport') {
    const fact = form.space.staging.baseSupport;
    if (fact.state === 'known' && !fact.evidenceIds.includes(id)) {
      fact.evidenceIds = [...fact.evidenceIds, id];
    }
    return;
  }
  if (route.kind === 'positiveLength') {
    const node = measurementAt(form, path);
    if (node && !node.evidenceIds.includes(id)) node.evidenceIds = [...node.evidenceIds, id];
    return;
  }
  if (route.kind === 'signedOffset') {
    const node = offsetAt(form, path);
    if (node && !node.evidenceIds.includes(id)) node.evidenceIds = [...node.evidenceIds, id];
    return;
  }
  const node = scalarAt(form, path);
  if (!node || node.state !== 'known') return;
  if (!node.evidenceIds.includes(id)) node.evidenceIds = [...node.evidenceIds, id];
  if (!node.origin) node.origin = origin;
}

function unlink(form: RawProjectInputDto, path: string, id: string): void {
  const route = routeKind(path);
  if (!route) return;
  if (route.kind === 'baseSupport') {
    const fact = form.space.staging.baseSupport;
    if (fact.state === 'known') {
      fact.evidenceIds = fact.evidenceIds.filter((entry) => entry !== id);
    }
    return;
  }
  if (route.kind === 'positiveLength') {
    const node = measurementAt(form, path);
    if (node) node.evidenceIds = node.evidenceIds.filter((entry) => entry !== id);
    return;
  }
  if (route.kind === 'signedOffset') {
    const node = offsetAt(form, path);
    if (node) node.evidenceIds = node.evidenceIds.filter((entry) => entry !== id);
    return;
  }
  const node = scalarAt(form, path);
  if (node?.state === 'known') node.evidenceIds = node.evidenceIds.filter((entry) => entry !== id);
}

export function readEvidence(form: RawProjectInputDto, path: string): Evidence | null {
  const id = evidenceIdFor(path);
  return form.evidence.find((entry) => entry.id === id) ?? null;
}

export function writeBaseSupport(form: RawProjectInputDto, known: boolean): RawProjectInputDto {
  const next = clone(form);
  if (!known) {
    next.space.staging.baseSupport = unknownSupport();
    return next;
  }
  if (next.space.staging.baseSupport.state === 'known') return next;
  const evidenceId = evidenceIdFor('space.staging.baseSupport');
  next.space.staging.baseSupport = {
    state: 'known',
    origin: 'userDeclared',
    evidenceIds: next.evidence.some((entry) => entry.id === evidenceId) ? [evidenceId] : [],
    value: { loadLimit: unknownScalar() },
  };
  return next;
}

export function currentLengthUnit(form: RawProjectInputDto, path: string): Unit | null {
  const value = readDetail(form, path);
  if (!value) return null;
  if (value.kind === 'positiveLength' || value.kind === 'signedOffset') return value.unit;
  return null;
}

export function canRequestGroupUnit(path: string, unit: Unit): boolean {
  const route = routeKind(path);
  if (!route?.mutable) return false;
  if (route.kind === 'positiveLength') return true;
  if (route.kind === 'signedOffset') return unit === 'mm';
  // Clearance, mass, and quantity have no persisted unit. A converted display
  // string would be parsed again as millimetres, grams, or a count.
  return false;
}

export function isBlankUnknown(form: RawProjectInputDto, path: string): boolean {
  const value = readDetail(form, path);
  if (!value) return false;
  if (value.kind === 'positiveLength' || value.kind === 'signedOffset') {
    return value.text.trim() === '' && value.uncertainty.state === 'unknown';
  }
  return false;
}

export function applyGroupFormatResult(
  form: RawProjectInputDto,
  path: string,
  unit: Unit,
  group: FormattedMeasurementGroup | undefined,
): { form: RawProjectInputDto } | { hold: string } {
  const route = routeKind(path);
  if (!route?.mutable) return { hold: 'catalog_field_read_only' };
  if (!group || group.fieldPath !== path) return { hold: 'missing_group' };
  if (group.converted && group.nominalText != null && group.uncertainty.state !== 'notConverted') {
    const applied = applyConverted(form, path, unit, group.nominalText, group.uncertainty);
    return applied ? { form: applied } : { hold: 'not_converted' };
  }
  const code = group.uncertainty.state === 'notConverted' ? group.uncertainty.code : 'not_converted';
  if (
    isBlankUnknown(form, path) &&
    route.kind === 'positiveLength' &&
    (code === 'not_measured' || code === 'fact_unknown')
  ) {
    const next = writeUnit(form, path, unit);
    return next ? { form: next } : { hold: code };
  }
  return { hold: code };
}

function applyConverted(
  form: RawProjectInputDto,
  path: string,
  unit: Unit,
  nominalText: string,
  uncertainty: FormattedUncertainty,
): RawProjectInputDto | null {
  const route = routeKind(path);
  if (!route?.mutable) return null;
  if (uncertainty.state === 'notConverted') return null;
  const next = clone(form);
  if (route.kind === 'positiveLength') {
    const node = measurementAt(next, path);
    if (!node) return null;
    node.text = nominalText;
    node.unit = unit;
    node.uncertainty =
      uncertainty.state === 'bounded'
        ? {
            state: 'bounded',
            minusText: uncertainty.minusText,
            plusText: uncertainty.plusText,
            unit,
          }
        : { state: 'unknown' };
    return next;
  }
  if (route.kind === 'signedOffset') {
    if (unit !== 'mm') return null;
    const node = offsetAt(next, path);
    if (!node) return null;
    node.text = nominalText;
    node.uncertainty =
      uncertainty.state === 'bounded'
        ? {
            state: 'bounded',
            minusText: uncertainty.minusText,
            plusText: uncertainty.plusText,
            unit: 'mm',
          }
        : { state: 'unknown' };
    return next;
  }
  return null;
}

export function uncertaintyLabel(uncertainty: RawUncertaintyDto): string {
  if (uncertainty.state === 'unknown') return '오차 미확인';
  const minus = uncertainty.minusText === '' ? '비어 있음' : uncertainty.minusText;
  const plus = uncertainty.plusText === '' ? '비어 있음' : uncertainty.plusText;
  return `오차 −${minus} / +${plus} ${uncertainty.unit}`;
}

export function detailGroups(form: RawProjectInputDto): DetailGroup[] {
  const groups: DetailGroup[] = [
    {
      id: 'interior',
      label: '공간 안쪽',
      readOnly: false,
      fields: [
        { path: 'space.interior.width', label: '안쪽 폭', kind: 'positiveLength' },
        { path: 'space.interior.depth', label: '안쪽 깊이', kind: 'positiveLength' },
        { path: 'space.interior.height', label: '안쪽 높이', kind: 'positiveLength' },
      ],
    },
    {
      id: 'opening',
      label: '입구',
      readOnly: false,
      fields: [
        { path: 'space.opening.width', label: '입구 폭', kind: 'positiveLength' },
        { path: 'space.opening.height', label: '입구 높이', kind: 'positiveLength' },
        { path: 'space.opening.left', label: '입구 왼쪽 오프셋', kind: 'signedOffset' },
        { path: 'space.opening.bottom', label: '입구 아래 오프셋', kind: 'signedOffset' },
      ],
    },
    {
      id: 'staging',
      label: '앞쪽 작업 공간',
      readOnly: false,
      fields: [
        { path: 'space.staging.freeVolume.minX', label: '작업 공간 왼쪽', kind: 'signedOffset' },
        { path: 'space.staging.freeVolume.minY', label: '작업 공간 앞쪽', kind: 'signedOffset' },
        { path: 'space.staging.freeVolume.minZ', label: '작업 공간 높이 시작', kind: 'signedOffset' },
        { path: 'space.staging.freeVolume.extent.width', label: '작업 공간 폭', kind: 'positiveLength' },
        { path: 'space.staging.freeVolume.extent.depth', label: '작업 공간 깊이', kind: 'positiveLength' },
        { path: 'space.staging.freeVolume.extent.height', label: '작업 공간 높이', kind: 'positiveLength' },
        { path: 'space.staging.baseSupport', label: '앞쪽 지지면', kind: 'baseSupport' },
        { path: 'space.staging.baseSupport.loadLimit', label: '앞쪽 지지 하중', kind: 'mass' },
      ],
    },
    {
      id: 'support',
      label: '바닥 지지',
      readOnly: false,
      fields: [
        { path: 'space.support.footprint.x', label: '바닥 왼쪽', kind: 'signedOffset' },
        { path: 'space.support.footprint.y', label: '바닥 앞쪽', kind: 'signedOffset' },
        { path: 'space.support.footprint.width', label: '바닥 폭', kind: 'positiveLength' },
        { path: 'space.support.footprint.depth', label: '바닥 깊이', kind: 'positiveLength' },
        { path: 'space.support.elevation', label: '바닥 높이', kind: 'signedOffset' },
        { path: 'space.support.loadLimit', label: '바닥 하중', kind: 'mass' },
      ],
    },
    {
      id: 'clearance',
      label: '정적 여유',
      readOnly: false,
      fields: CLEARANCE_AXES.map(([axis, label]) => ({
        path: `space.clearances.${axis}`,
        label,
        kind: 'clearance' as const,
      })),
    },
  ];
  for (const item of form.items) {
    if (!validId(item.id)) continue;
    groups.push({
      id: `item-${item.id}`,
      label: item.label || item.id,
      readOnly: false,
      fields: [
        { path: `items.${item.id}.dimensions.envelope.width`, label: '폭', kind: 'positiveLength' },
        { path: `items.${item.id}.dimensions.envelope.depth`, label: '깊이', kind: 'positiveLength' },
        { path: `items.${item.id}.dimensions.envelope.height`, label: '높이', kind: 'positiveLength' },
        { path: `items.${item.id}.quantity`, label: '수량', kind: 'quantity' },
        { path: `items.${item.id}.massEach`, label: '개당 질량', kind: 'mass' },
        ...HANDLING_AXES.map(([axis, label]) => ({
          path: `items.${item.id}.requirement.handling.${axis}`,
          label,
          kind: 'clearance' as const,
        })),
      ],
    });
  }
  return groups;
}

export type CatalogEntry = {
  path: string;
  label: string;
};

export function catalogEntries(form: RawProjectInputDto): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const owned of form.ownedContainers) {
    if (!validId(owned.id)) continue;
    entries.push({
      path: `ownedContainers.${owned.id}.physical`,
      label: `${owned.id} 물리 치수`,
    });
    if (owned.variantRef && validId(owned.variantRef.variantId)) {
      entries.push({
        path: `variants.${owned.variantRef.variantId}`,
        label: `${owned.id} · 옵션 ${owned.variantRef.variantId}`,
      });
    }
  }
  return entries;
}

export function valueUnknown(value: DetailValue | null): boolean {
  if (!value) return true;
  if (value.kind === 'baseSupport') return !value.known;
  if (value.kind === 'positiveLength' || value.kind === 'signedOffset') return value.text.trim() === '';
  if (value.kind === 'clearance' || value.kind === 'mass' || value.kind === 'quantity') return !value.known;
  return value.text.trim() === '';
}

export function unknownValueCount(form: RawProjectInputDto): number {
  let count = 0;
  for (const group of detailGroups(form)) {
    for (const field of group.fields) {
      if (field.path === 'space.staging.baseSupport.loadLimit') {
        const support = readDetail(form, 'space.staging.baseSupport');
        if (!support || support.kind !== 'baseSupport' || !support.known) continue;
      }
      if (valueUnknown(readDetail(form, field.path))) count += 1;
    }
  }
  return count;
}

export function canonicalDiagnosticPath(diagPath: string, spaceId: string): string {
  const prefix = `space.${spaceId}.`;
  if (diagPath.startsWith(prefix)) return `space.${diagPath.slice(prefix.length)}`;
  return diagPath;
}

export function diagnosticsFor(
  diagnostics: Diagnostic[],
  path: string,
  spaceId: string,
): Diagnostic[] {
  return diagnostics.filter((entry) => canonicalDiagnosticPath(entry.fieldPath, spaceId) === path);
}

export type NormalizedView = {
  state: 'absent' | 'unknown' | 'notApplicable' | 'known';
  reason: string | null;
  nominal: number | null;
  minusMm: number | null;
  plusMm: number | null;
  verification: string | null;
  origin: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readFact(node: unknown, shaped: 'length' | 'scalar'): NormalizedView {
  const fact = asRecord(node);
  if (!fact || typeof fact.state !== 'string') return emptyView();
  if (fact.state === 'unknown') {
    return { ...emptyView(), state: 'unknown', reason: typeof fact.reason === 'string' ? fact.reason : null };
  }
  if (fact.state === 'notApplicable') {
    return {
      ...emptyView(),
      state: 'notApplicable',
      reason: typeof fact.reasonCode === 'string' ? fact.reasonCode : null,
    };
  }
  if (fact.state !== 'known') return emptyView();
  const provenance = asRecord(fact.provenance);
  const value = fact.value;
  let nominal: number | null = null;
  let minusMm: number | null = null;
  let plusMm: number | null = null;
  if (shaped === 'scalar' && typeof value === 'number') nominal = value;
  if (shaped === 'length') {
    const measured = asRecord(value);
    if (measured && typeof measured.nominal === 'number') nominal = measured.nominal;
    const uncertainty = asRecord(measured?.uncertainty);
    if (uncertainty?.state === 'bounded') {
      minusMm = typeof uncertainty.minusMm === 'number' ? uncertainty.minusMm : null;
      plusMm = typeof uncertainty.plusMm === 'number' ? uncertainty.plusMm : null;
    }
  }
  return {
    state: 'known',
    reason: null,
    nominal,
    minusMm,
    plusMm,
    verification: provenance && typeof provenance.verification === 'string' ? provenance.verification : null,
    origin: provenance && typeof provenance.origin === 'string' ? provenance.origin : null,
  };
}

function emptyView(): NormalizedView {
  return {
    state: 'absent',
    reason: null,
    nominal: null,
    minusMm: null,
    plusMm: null,
    verification: null,
    origin: null,
  };
}

export function normalizedView(input: ProjectInput | null, path: string): NormalizedView {
  if (!input) return emptyView();
  const route = routeKind(path);
  if (!route) return emptyView();
  if (path === 'space.staging.baseSupport') return readFact(input.space.staging.baseSupport, 'scalar');
  if (path === 'space.staging.baseSupport.loadLimit') {
    const support = input.space.staging.baseSupport;
    if (support.state !== 'known') {
      return { ...emptyView(), state: 'unknown', reason: support.state === 'unknown' ? support.reason : null };
    }
    return readFact(support.value.loadLimit, 'scalar');
  }
  if (path.startsWith('space.')) {
    let node: unknown = input.space;
    for (const segment of path.split('.').slice(1)) {
      const record = asRecord(node);
      if (!record) return emptyView();
      node = record[segment];
    }
    if (route.kind === 'positiveLength' || route.kind === 'signedOffset') return readFact(node, 'length');
    return readFact(node, 'scalar');
  }
  const match = /^items\.([^.]+)\.(.+)$/.exec(path);
  if (!match?.[1] || !match[2]) return emptyView();
  const item = input.items.find((entry) => entry.id === match[1]);
  if (!item) return emptyView();
  let node: unknown = item;
  for (const segment of match[2].split('.')) {
    const record = asRecord(node);
    if (!record) return emptyView();
    node = record[segment];
  }
  if (route.kind === 'positiveLength' || route.kind === 'signedOffset') return readFact(node, 'length');
  return readFact(node, 'scalar');
}

export function normalizedText(view: NormalizedView, kind: DetailKind): string {
  if (view.state === 'absent') return '—';
  if (view.state === 'unknown') return '미확인';
  if (view.state === 'notApplicable') return '해당 없음';
  const verification = view.verification === 'confirmed' ? '확인됨' : '확인되지 않음';
  if (kind === 'baseSupport') return `지지면 있음 · ${verification}`;
  const unit = kind === 'mass' ? 'g' : kind === 'quantity' ? '개' : 'mm';
  const nominal = view.nominal == null ? '—' : `${view.nominal} ${unit}`;
  if (view.minusMm != null && view.plusMm != null) {
    return `${nominal}, 오차 −${view.minusMm} / +${view.plusMm} mm, ${verification}`;
  }
  return `${nominal}, ${verification}`;
}

export const DIAGNOSTIC_TEXT: Record<string, string> = {
  submillimeter_precision: '1 mm보다 작은 단위는 반올림하지 않습니다. 0.1 cm 단위로 입력해 주세요.',
  numeric_field_too_long: '입력값이 너무 깁니다. 숫자와 단위를 확인해 주세요.',
  numeric_overflow: '입력값이 너무 큽니다. 숫자와 단위를 확인해 주세요.',
  invalid_number: '숫자 형식을 확인해 주세요.',
  out_of_range: '허용 범위를 벗어났습니다.',
  scalar_out_of_range: '허용 범위를 벗어났습니다.',
  required_text_missing: '필수 항목이 비어 있습니다.',
  uncertainty_missing: '오차 범위는 양쪽을 모두 입력해야 합니다. 빈칸은 0이 아닙니다.',
  uncertainty_out_of_range: '오차 범위가 허용 구간을 벗어났습니다.',
  uncertainty_not_supported: '이 값에는 측정 오차를 붙일 수 없습니다.',
  invalid_timestamp: '관측 시각은 실제 UTC 시각으로 입력해 주세요.',
  invalid_locator: '출처 위치 형식을 확인해 주세요.',
  text_too_long: '텍스트가 너무 깁니다.',
  unit_not_supported: '이 항목은 그 단위로 바꾸지 않습니다. 원래 입력을 유지합니다.',
  not_measured: '값이 비어 있어 단위를 변환하지 않았습니다.',
};

export function diagnosticText(code: string, fieldPath: string): string {
  return DIAGNOSTIC_TEXT[code] ?? `${code} (${fieldPath})`;
}

export const STAGING_LIMIT =
  '현재 버전은 같은 높이의 앞쪽 지지면을 따라 넣고 꺼내는 동작만 검사합니다. 손으로 들어 옮기는 동작은 검사 범위에 포함되지 않습니다.';
