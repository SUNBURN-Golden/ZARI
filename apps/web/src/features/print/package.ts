import type {
  ActionStep,
  CatalogSnapshot,
  FactFor_MeasuredLength,
  ItemAssignment,
  Offer,
  PlanSnapshot,
  SnapshotContent,
  SpatialElement,
  SpatialProjection,
} from '../../contracts/generated/dto';
import { rectOf, spaceFrame } from '../plan/projection';
import {
  ACTION_TEXT,
  CHECK_KIND_TEXT,
  CHECK_STATUS_TEXT,
  ORIENTATION_TEXT,
  STRATEGY_TEXT,
  UNASSIGNED_TEXT,
  catalogSourceText,
  isNoPurchase,
  moneyText,
  qtyText,
} from '../plan/view';
import {
  EXCLUDED_CELL_TEXT,
  makeLabeler,
  scopeSummary,
  type Labeler,
  type PrintScope,
} from './scope';

/**
 * The printable plan package (z-print-share): drawings, placements, what is
 * unassigned, every check, the purchase list and the guide, all read from ONE
 * `PlanSnapshot` and the Rust spatial projection stamped for that snapshot.
 *
 * Nothing here computes a quantity, a price, a fit, or a coordinate. Each
 * value is Rust data formatted as text; an unknown stays the word `미확인`
 * and is never turned into 0, a pass, or a default. The package carries no
 * clock, random id or locale-dependent text beyond `ko-KR` money, so the same
 * snapshot, projection, catalog and scope always give the same package.
 */

export const PRINT_PACKAGE_VERSION = 1;
export const UNKNOWN_TEXT = '미확인';

export type GuideProgress = Record<string, 'done' | 'todo'>;

export type PlanStage = 'accepted' | 'alternative' | 'working';

export interface PrintInput {
  snapshot: PlanSnapshot;
  projection: SpatialProjection | null;
  projectionStatus: 'loading' | 'ready' | 'failed' | 'absent';
  projectionFailure: string | null;
  catalog: CatalogSnapshot | null;
  projectName: string;
  stage: PlanStage;
  /** True when the snapshot was built from the saved input as it is now. */
  current: boolean;
  /** Accepted-plan progress; `null` when it could not be read. */
  progress: GuideProgress | null;
  scope: PrintScope;
}

export type PrintBlockCode =
  | 'drawing_loading'
  | 'drawing_unavailable'
  | 'revision_mismatch'
  | 'input_mismatch'
  | 'catalog_mismatch'
  | 'section_revision'
  | 'omitted_rows'
  | 'projection_version';

export interface PrintBlock {
  code: PrintBlockCode;
  text: string;
}

export interface DrawingRect {
  /** The number printed in the drawing; the legend row has the same number. */
  n: number;
  label: string;
  kindText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'container' | 'item' | 'contained';
}

export interface DrawingMissing {
  label: string;
  text: string;
}

export interface PrintDrawing {
  view: 'top' | 'front';
  title: string;
  axesText: string;
  /** The snapshot id the projection behind this drawing is stamped with. */
  revision: string;
  frame: { width: number; height: number } | null;
  rects: DrawingRect[];
  missing: DrawingMissing[];
  /** Drawable elements Rust projected: rects.length + missing.length. */
  elementCount: number;
}

export interface SpaceRow {
  axis: string;
  text: string;
}

export interface PlacementRow {
  label: string;
  x: number;
  y: number;
  z: number;
  orientation: string;
}

export interface AssignmentRow {
  label: string;
  location: string;
}

export interface UnassignedRow {
  label: string;
  quantity: string;
  reason: string;
}

export interface CheckRow {
  kind: string;
  blocking: boolean;
  status: 'pass' | 'fail' | 'unknown' | 'not_applicable' | string;
  statusText: string;
  reason: string;
}

export interface BomRow {
  label: string;
  needed: string;
  reused: string;
  packs: string;
  subtotal: string;
  inventory: string;
  shipping: string;
  observed: string;
  link: string;
}

export interface CostRow {
  label: string;
  value: string;
}

export interface StepRow {
  n: number;
  title: string;
  subjects: string[];
  prerequisites: string[];
  conditions: string[];
  confirmation: boolean;
  progress: string;
}

export interface PrintPackage {
  version: typeof PRINT_PACKAGE_VERSION;
  /** The `planSnapshotId` every section must carry. */
  revision: string;
  inputDigest: string;
  catalogDigest: string;
  catalogVersion: string;
  ruleVersion: string;
  unit: 'mm';
  scope: PrintScope;
  scopeText: string;
  projectName: string;
  stageText: string;
  currentText: string;
  strategyText: string;
  catalogSource: string;
  assuranceText: string;
  commerceText: string;
  completenessText: string;
  space: SpaceRow[];
  drawings: PrintDrawing[];
  diagnostics: string[];
  placements: PlacementRow[];
  assignments: AssignmentRow[];
  unassigned: UnassignedRow[];
  checks: CheckRow[];
  bomRevision: string;
  noPurchase: boolean;
  bom: BomRow[];
  cost: CostRow[];
  purchaseNotes: string[];
  guideRevision: string;
  steps: StepRow[];
  notes: string[];
}

export type PrintResult =
  | { status: 'ready'; pkg: PrintPackage }
  | { status: 'blocked'; blocks: PrintBlock[] };

const STAGE_TEXT: Record<PlanStage, string> = {
  accepted: '채택한 계획',
  alternative: '채택 전 후보',
  working: '편집 중인 초안',
};

const ASSURANCE_TEXT: Record<string, string> = {
  confirmedWithinScope: '검토 범위 안에서 확인됨',
  conditional: '조건부 — 미확인 항목이 남아 있음',
  rejected: '거절됨',
};

const COMMERCE_TEXT: Record<string, string> = {
  ready: '구매 조건이 모두 확인됨',
  conditional: '구매 조건 중 미확인이 있음',
  notApplicable: '구매 없음',
};

const KIND_TEXT: Record<DrawingRect['kind'], string> = {
  container: '수납함',
  item: '물건',
  contained: '수납함 안 물건',
};

const MISSING_REASON_TEXT: Record<string, string> = {
  offset_unknown: '수납함 안의 위치를 몰라 그리지 못했습니다',
};

const DRAW_ROLES = new Set<SpatialElement['role']>([
  'directItem',
  'ownedContainer',
  'newContainer',
  'containedItem',
]);

const INTERIOR_AXES = [
  ['width', '폭'],
  ['depth', '깊이'],
  ['height', '높이'],
] as const;

function lengthText(fact: FactFor_MeasuredLength): string {
  if (fact.state === 'unknown') return UNKNOWN_TEXT;
  if (fact.state === 'notApplicable') return '해당 없음';
  const { nominal, uncertainty } = fact.value;
  const tolerance =
    uncertainty.state === 'bounded'
      ? ` (+${uncertainty.plusMm} / −${uncertainty.minusMm} mm)`
      : ' (오차 미확인)';
  return `${nominal} mm${tolerance}`;
}

function inventoryText(offer: Offer | null): string {
  if (!offer || offer.inventory.state !== 'known') return UNKNOWN_TEXT;
  return offer.inventory.value === 'inStock' ? '재고 있음' : '품절';
}

function shippingText(offer: Offer | null): string {
  if (!offer || offer.shipping.state !== 'known') return UNKNOWN_TEXT;
  const rule = offer.shipping.value;
  if (rule.kind === 'free') return '무료 배송';
  if (rule.kind === 'fixedPerSeller') return `배송비 ${moneyText(rule.fee)}`;
  return '배송비 조건부';
}

/** A product address is printed only as plain text and only for http(s). */
export function safeLinkText(offer: Offer | null, scope: PrintScope): string {
  if (!offer || offer.url.state !== 'known') return '—';
  if (!scope.purchaseLinks) return EXCLUDED_CELL_TEXT;
  const url = offer.url.value;
  return /^https?:\/\/[^\s\p{Cc}\p{Cf}]+$/iu.test(url) ? url : '주소 형식 확인 불가';
}

function locationText(row: ItemAssignment, labels: Labeler, content: SnapshotContent): string {
  const holder = (placementId: string) => {
    const placement = content.placements.find((entry) => entry.id === placementId);
    return placement ? labels.placement(placement.subject) : '(배치)';
  };
  const location = row.location;
  if (location.kind === 'direct') return `바로 놓임 · ${holder(location.placementId)}`;
  if (location.kind === 'contained') {
    const at = location.localPlacement.position;
    return `${holder(location.containerPlacementId)} 안 · 수납함 안 위치 (${at.x}, ${at.y}, ${at.z}) mm`;
  }
  return `${holder(location.containerPlacementId)} 안 (임시) · ${location.reasonCode}`;
}

function buildDrawing(
  view: 'top' | 'front',
  projection: SpatialProjection,
  labels: Labeler,
  content: SnapshotContent,
): PrintDrawing {
  const rects: DrawingRect[] = [];
  const missing: DrawingMissing[] = [];
  let count = 0;
  for (const element of projection.elements) {
    if (!DRAW_ROLES.has(element.role)) continue;
    count += 1;
    const label = elementName(element, labels, content);
    const geometry = view === 'top' ? element.topRect : element.frontRect;
    const rect = rectOf(geometry);
    const kind: DrawingRect['kind'] =
      element.role === 'containedItem'
        ? 'contained'
        : element.role === 'directItem'
          ? 'item'
          : 'container';
    if (rect) {
      rects.push({
        n: rects.length + 1,
        label,
        kindText: KIND_TEXT[kind],
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        kind,
      });
    } else {
      const reason =
        geometry.kind === 'unavailable' || geometry.kind === 'notApplicable'
          ? geometry.reasonCode
          : 'zero_extent';
      missing.push({
        label,
        text: MISSING_REASON_TEXT[reason] ?? `그리지 못함 (${reason})`,
      });
    }
  }
  return {
    view,
    title: view === 'top' ? '위에서 본 도면' : '앞에서 본 도면',
    axesText:
      view === 'top'
        ? '가로 x(폭), 세로 y(안쪽 깊이) · 단위 mm'
        : '가로 x(폭), 세로 z(높이) · 단위 mm',
    revision:
      projection.source.kind === 'plan' ? projection.source.planSnapshotId : '(계획 아님)',
    frame: spaceFrame(projection, view),
    rects,
    missing,
    elementCount: count,
  };
}

function elementName(element: SpatialElement, labels: Labeler, content: SnapshotContent): string {
  const target = element.target;
  if (target.kind === 'placement') {
    const placement = content.placements.find((entry) => entry.id === target.placementId);
    return placement ? labels.placement(placement.subject) : '(배치)';
  }
  if (target.kind === 'itemInstance') {
    const name = labels.item(target.itemId);
    return target.unitOrdinal > 0 ? `${name} #${target.unitOrdinal + 1}` : name;
  }
  return '(이름 없음)';
}

function stepRow(
  step: ActionStep,
  index: number,
  steps: readonly ActionStep[],
  input: PrintInput,
  labels: Labeler,
): StepRow {
  const content = input.snapshot.content;
  const subjects = [...new Set(step.subjectIds.map((id) => labels.subject(id)))];
  const prerequisites = step.prerequisiteStepIds.map((id) => {
    const at = steps.findIndex((entry) => entry.id === id);
    return at < 0 ? '(알 수 없는 단계)' : `${at + 1}단계`;
  });
  const conditions = step.reasonIds.map((id) => {
    const check = content.validation.checks.find((entry) => entry.id === id);
    if (!check) return '(알 수 없는 조건)';
    return `${CHECK_KIND_TEXT[check.kind] ?? check.kind}: ${CHECK_STATUS_TEXT[check.status] ?? check.status}`;
  });
  let progress: string;
  if (!input.scope.progress) progress = EXCLUDED_CELL_TEXT;
  else if (input.stage !== 'accepted') progress = '채택 전';
  else if (input.progress === null) progress = '진행 기록을 읽지 못함';
  else progress = input.progress[step.id] === 'done' ? '완료' : '미완료';
  return {
    n: index + 1,
    title: ACTION_TEXT[step.kind] ?? step.kind,
    subjects,
    prerequisites,
    conditions,
    confirmation: step.requiredConfirmations.length > 0,
    progress,
  };
}

/** Why the drawing cannot be paired with this snapshot. Empty when it can. */
export function revisionBlocks(
  snapshot: PlanSnapshot,
  projection: SpatialProjection | null,
  status: PrintInput['projectionStatus'],
  failure: string | null,
): PrintBlock[] {
  if (status === 'loading' || (status === 'absent' && projection === null)) {
    return [{ code: 'drawing_loading', text: '도면을 만들고 있습니다. 끝나면 출력할 수 있습니다.' }];
  }
  if (status === 'failed' || projection === null) {
    if (failure === 'projection_source_mismatch') {
      return [
        {
          code: 'revision_mismatch',
          text: '도면이 다른 계획에서 나왔습니다. 도면과 구매 목록의 계획 ID가 달라 출력하지 않습니다.',
        },
      ];
    }
    return [
      {
        code: 'drawing_unavailable',
        text: `도면을 만들지 못해 출력하지 않습니다${failure ? ` (${failure})` : ''}.`,
      },
    ];
  }
  const blocks: PrintBlock[] = [];
  const stamp = projection.source;
  if (stamp.kind !== 'plan' || stamp.planSnapshotId !== snapshot.planSnapshotId) {
    blocks.push({
      code: 'revision_mismatch',
      text: '도면과 구매 목록의 계획 ID가 달라 출력하지 않습니다.',
    });
  } else {
    if (stamp.inputDigest !== snapshot.content.versions.inputDigest) {
      blocks.push({
        code: 'input_mismatch',
        text: '도면과 구매 목록의 입력 기준이 달라 출력하지 않습니다.',
      });
    }
    if (stamp.catalogDigest !== snapshot.content.versions.catalogDigest) {
      blocks.push({
        code: 'catalog_mismatch',
        text: '도면과 구매 목록의 카탈로그 기준이 달라 출력하지 않습니다.',
      });
    }
  }
  return blocks;
}

/**
 * After assembly: every section carries the same revision and every row Rust
 * produced is in the package. A package that fails here is never offered, so
 * an unknown, an unassigned item, or a check cannot be dropped by a bug.
 */
export function verifyPackage(
  pkg: PrintPackage,
  content: SnapshotContent,
  projection: SpatialProjection | null,
): PrintBlock[] {
  const blocks: PrintBlock[] = [];
  const sections = [pkg.bomRevision, pkg.guideRevision, ...pkg.drawings.map((d) => d.revision)];
  if (sections.some((revision) => revision !== pkg.revision)) {
    blocks.push({
      code: 'section_revision',
      text: '도면·구매 목록·실행 순서의 계획 ID가 하나로 맞지 않아 출력하지 않습니다.',
    });
  }
  const drawable = projection
    ? projection.elements.filter((element) => DRAW_ROLES.has(element.role)).length
    : 0;
  const counts: [string, number, number][] = [
    ['배치', pkg.placements.length, content.placements.length],
    ['물건별 위치', pkg.assignments.length, content.assignments.length],
    ['미배치', pkg.unassigned.length, content.unassigned.length],
    ['검사', pkg.checks.length, content.validation.checks.length],
    ['구매 목록', pkg.bom.length, content.bom.length],
    ['실행 순서', pkg.steps.length, content.actions.length],
    ...pkg.drawings.map((drawing): [string, number, number] => [
      drawing.title,
      drawing.rects.length + drawing.missing.length,
      drawable,
    ]),
  ];
  const lost = counts.filter(([, got, expected]) => got !== expected).map(([name]) => name);
  if (lost.length > 0) {
    blocks.push({
      code: 'omitted_rows',
      text: `${lost.join(', ')}의 일부가 빠져 출력하지 않습니다.`,
    });
  }
  return blocks;
}

export function buildPrintPackage(input: PrintInput): PrintResult {
  const { snapshot, projection } = input;
  const content = snapshot.content;
  const early = revisionBlocks(snapshot, projection, input.projectionStatus, input.projectionFailure);
  if (early.length > 0 || projection === null) return { status: 'blocked', blocks: early };
  if (projection.projectionVersion !== 1) {
    return {
      status: 'blocked',
      blocks: [
        {
          code: 'projection_version',
          text: '도면의 형식 버전을 알 수 없어 출력하지 않습니다.',
        },
      ],
    };
  }
  const labels = makeLabeler(content, input.scope);
  const revision = snapshot.planSnapshotId;
  const noPurchase = isNoPurchase(snapshot);
  const offerOf = (id: string | null) =>
    id === null ? null : (content.referencedCatalog.offers.find((offer) => offer.id === id) ?? null);

  const bom: BomRow[] = content.bom.map((line) => {
    const offer = offerOf(line.offerId);
    const label = line.variantId
      ? (content.referencedCatalog.variants.find((v) => v.id === line.variantId)?.optionLabel ??
        line.variantId)
      : line.ownedId
        ? labels.owned(line.ownedId)
        : '—';
    return {
      label,
      needed: String(line.physicalNeeded),
      reused: String(line.reused),
      packs: qtyText(line.packsToOrder),
      subtotal: moneyText(line.productSubtotal),
      inventory: inventoryText(offer),
      shipping: shippingText(offer),
      observed: offer === null ? '—' : (offer.observedAt ?? '확인 시각 없음'),
      link: safeLinkText(offer, input.scope),
    };
  });
  const completeness = content.validation.assignmentCompleteness;
  const stage = STAGE_TEXT[input.stage];
  const pkg: PrintPackage = {
    version: PRINT_PACKAGE_VERSION,
    revision,
    inputDigest: content.versions.inputDigest,
    catalogDigest: content.versions.catalogDigest,
    catalogVersion: content.versions.catalogVersion,
    ruleVersion: content.versions.ruleVersion,
    unit: 'mm',
    scope: input.scope,
    scopeText: scopeSummary(input.scope),
    projectName: labels.project(input.projectName),
    stageText: stage,
    currentText: input.current
      ? '현재 입력으로 계산된 계획'
      : '입력이 바뀌기 전에 계산된 과거 계획 — 지금 입력과 다릅니다',
    strategyText: STRATEGY_TEXT[content.strategy.strategy] ?? content.strategy.strategy,
    catalogSource: catalogSourceText(input.catalog, content.versions.catalogDigest),
    assuranceText:
      ASSURANCE_TEXT[content.validation.physicalAssurance] ?? content.validation.physicalAssurance,
    commerceText:
      COMMERCE_TEXT[content.validation.commerceReadiness] ?? content.validation.commerceReadiness,
    completenessText: `배정 ${completeness.assignedInstances} · 임시 ${completeness.provisionalInstances} · 미배치 ${completeness.unassignedInstances} · 수량 미확인 물건 ${completeness.unknownQuantityItems}`,
    space: INTERIOR_AXES.map(([key, name]) => ({
      axis: name,
      text: lengthText(content.inputFacts.space.interior[key]),
    })),
    drawings: [
      buildDrawing('top', projection, labels, content),
      buildDrawing('front', projection, labels, content),
    ],
    diagnostics: projection.diagnostics.map((d) => `${d.code}: ${d.reasonCode}`),
    placements: content.placements.map((placement) => ({
      label: labels.placement(placement.subject),
      x: placement.position.x,
      y: placement.position.y,
      z: placement.position.z,
      orientation: ORIENTATION_TEXT[placement.orientation] ?? placement.orientation,
    })),
    assignments: content.assignments.map((row) => ({
      label:
        row.unitOrdinal > 0
          ? `${labels.item(row.itemId)} #${row.unitOrdinal + 1}`
          : labels.item(row.itemId),
      location: locationText(row, labels, content),
    })),
    unassigned: content.unassigned.map((row) => ({
      label: labels.item(row.itemId),
      quantity:
        row.instances.kind === 'known'
          ? `${row.instances.ranges.reduce((total, range) => total + (range.endExclusive - range.start), 0)}개`
          : `수량 ${UNKNOWN_TEXT}`,
      reason: UNASSIGNED_TEXT[row.reasonCode] ?? row.reasonCode,
    })),
    checks: content.validation.checks.map((check) => ({
      kind: CHECK_KIND_TEXT[check.kind] ?? check.kind,
      blocking: check.blocking,
      status: check.status,
      statusText: CHECK_STATUS_TEXT[check.status] ?? check.status,
      reason: check.status === 'pass' ? '' : check.reasonCode,
    })),
    bomRevision: revision,
    noPurchase,
    bom,
    cost: [
      { label: '상품 소계', value: moneyText(content.costSummary.productSubtotal) },
      { label: '배송비 합계', value: moneyText(content.costSummary.shippingTotal) },
      { label: '합계', value: moneyText(content.costSummary.grandTotal) },
    ],
    purchaseNotes: [
      'ZARI는 아무것도 구매하지 않았습니다. 이 목록은 구매 약속이 아닙니다.',
      `가격·재고·배송은 입력한 출처 기준입니다. 확인 시각이 없거나 ${UNKNOWN_TEXT}이면 지금 살 수 있다는 뜻이 아닙니다.`,
      noPurchase ? '이 계획은 구매 없이 정리됩니다.' : '살 때는 판매처에서 값·재고·치수를 다시 확인하세요.',
    ],
    guideRevision: revision,
    steps: content.actions.map((step, index, all) => stepRow(step, index, all, input, labels)),
    notes: [
      '모든 길이는 mm입니다. 도면의 숫자는 Rust가 계산한 계획 좌표 그대로이며 화면 배율만 다릅니다.',
      `${UNKNOWN_TEXT}은 통과가 아니고 0도 아닙니다. 미배치 물건과 ${UNKNOWN_TEXT} 검사는 생략하지 않고 모두 적습니다.`,
      '이 문서는 계획이며 실제 치수의 측정 증명이 아닙니다.',
    ],
  };
  const blocks = verifyPackage(pkg, content, projection);
  if (blocks.length > 0) return { status: 'blocked', blocks };
  return { status: 'ready', pkg };
}

/** Hex SHA-256 over the package JSON: the reproducibility handle of one output. */
export async function packageDigest(pkg: PrintPackage): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(pkg));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
