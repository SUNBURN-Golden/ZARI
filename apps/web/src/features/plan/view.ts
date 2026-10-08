import type {
  CatalogSnapshot,
  FactFor_MoneyKrw,
  FactFor_PackQuantity,
  FactFor_Quantity,
  FactFor_UnitCount,
  LayoutEditCommand,
  Orientation,
  PlanSnapshot,
  Placement,
  PlacementSubject,
  SnapshotContent,
} from '../../contracts/generated/dto';

/**
 * Read-only labels and edit gates over one immutable PlanSnapshot. Drawn
 * rectangles come from the Rust spatial projection (`projection.ts`); this
 * module does not turn yaw, offsets, or extents into geometry.
 */

export function subjectLabel(content: SnapshotContent, subject: PlacementSubject): string {
  if (subject.kind === 'directItem') {
    const item = content.inputFacts.items.find((i) => i.id === subject.itemId);
    const label = item?.label ?? subject.itemId;
    return subject.unitOrdinal > 0 ? `${label} #${subject.unitOrdinal + 1}` : label;
  }
  if (subject.kind === 'newContainer') {
    const variant = content.referencedCatalog.variants.find(
      (v) => v.id === subject.variantId,
    );
    const label = variant?.optionLabel ?? subject.variantId;
    return subject.unitOrdinal > 0 ? `${label} #${subject.unitOrdinal + 1}` : label;
  }
  const owned = content.inputFacts.ownedContainers.find((o) => o.id === subject.ownedId);
  return owned ? `${owned.id} #${subject.unitOrdinal + 1}` : subject.ownedId;
}

export function moneyText(fact: FactFor_MoneyKrw): string {
  if (fact.state === 'known') {
    return `₩${new Intl.NumberFormat('ko-KR').format(BigInt(fact.value))}`;
  }
  if (fact.state === 'notApplicable') return '해당 없음';
  return '미확인';
}

export function qtyText(
  fact: FactFor_Quantity | FactFor_PackQuantity | FactFor_UnitCount,
): string {
  if (fact.state === 'known') return String(fact.value);
  if (fact.state === 'notApplicable') return '—';
  return '미확인';
}

export interface UnassignedPlacement {
  known: number;
  unknownRows: number;
}

/**
 * Known instance counts and rows whose quantity Rust left unknown.
 * Unknown rows are not added as zero.
 */
export function unassignedPlacement(snapshot: PlanSnapshot): UnassignedPlacement {
  let known = 0;
  let unknownRows = 0;
  for (const row of snapshot.content.unassigned) {
    if (row.instances.kind === 'known') {
      for (const range of row.instances.ranges) known += range.endExclusive - range.start;
    } else {
      unknownRows += 1;
    }
  }
  return { known, unknownRows };
}

/** Unknown quantity is never rendered as a zero unassigned count. */
export function unassignedPlacementText(summary: UnassignedPlacement): string {
  if (summary.unknownRows > 0 && summary.known === 0) return '미확인';
  if (summary.unknownRows > 0) {
    return `미배치 ${summary.known} · 수량 미확인 ${summary.unknownRows}`;
  }
  return `미배치 ${summary.known}`;
}

function rustNoPurchases(fact: FactFor_MoneyKrw): boolean {
  return fact.state === 'notApplicable' && fact.reasonCode === 'no_purchases';
}

/**
 * No purchase only when Rust's cost summary says `no_purchases` and the BOM
 * has no purchase line. Owned-reuse lines are not purchases. Placement kinds
 * are not consulted.
 */
export function isNoPurchase(snapshot: PlanSnapshot): boolean {
  const { bom, costSummary } = snapshot.content;
  const purchaseLines = bom.filter((line) => line.ownedId === null);
  return (
    purchaseLines.length === 0 &&
    rustNoPurchases(costSummary.grandTotal) &&
    rustNoPurchases(costSummary.productSubtotal) &&
    rustNoPurchases(costSummary.shippingTotal)
  );
}

export const CHECK_KIND_TEXT: Record<string, string> = {
  outer_geometry: '외형 치수',
  inner_capacity: '내부 수용',
  installation_path: '반입 경로',
  operational_access: '사용 접근',
  support_geometry: '지지면',
  support_load: '하중',
  orientation: '방향',
  quantity_conservation: '수량 보존',
  compatibility: '호환',
  inventory: '재고',
  price: '가격',
  shipping: '배송',
  budget: '예산',
};

export const CHECK_STATUS_TEXT: Record<string, string> = {
  pass: '확인됨',
  fail: '실패',
  unknown: '미확인',
  not_applicable: '해당 없음',
};

export const UNASSIGNED_TEXT: Record<string, string> = {
  no_feasible_anchor: '둘 수 있는 위치가 없습니다',
  geometry_unknown: '치수를 알 수 없습니다',
  retrieval_mode_not_permitted: '이 수납 방식을 허용하지 않습니다',
  no_compatible_target: '맞는 수납함이 없습니다',
  measurement_missing: '측정값이 없습니다',
  compatibility_crosses_groups: '그룹이 갈라져 함께 둘 수 없습니다',
  quantity_unknown: '수량을 알 수 없습니다',
};

export const ACTION_TEXT: Record<string, string> = {
  clearSpace: '칸을 비웠다고 표시합니다',
  sortContents: '내용물을 분류합니다',
  acquire: '구매 의사를 표시합니다',
  confirmArrival: '도착했다고 표시합니다',
  install: '수납함을 배치합니다',
  transferContents: '밖에서 내용물을 넣습니다',
  label: '라벨을 붙입니다',
  verifyUnassigned: '남은 물건을 확인합니다',
  resolveCondition: '미확인 조건을 나중에 확인합니다',
};

export const STRATEGY_TEXT: Record<string, string> = {
  minimumPurchase: '최소 구매',
  frequencySeparation: '사용 빈도 분리',
  activityGrouping: '활동별 묶음',
  activeReserveSeparation: '사용/보관 분리',
  oneActionAccess: '한 동작 접근',
};

export const REJECTION_TEXT: Record<string, string> = {
  ordinal_partition_overlap: '수량 분배가 겹칩니다',
  validation_failed: '독립 검증을 통과하지 못했습니다',
  budget_exceeded: '예산을 초과합니다',
};

/**
 * Origin label for the catalog a snapshot was compiled against. The loaded
 * catalog row speaks for the snapshot only when its digest is exactly the
 * snapshot's; otherwise the origin is not known here and is never presented
 * as an imported (or synthetic) catalog by default.
 */
export function catalogSourceText(
  catalog: CatalogSnapshot | null,
  snapshotCatalogDigest: string,
): string {
  if (!catalog || catalog.catalogDigest !== snapshotCatalogDigest)
    return '출처 확인 불가';
  return catalog.sourceKind === 'synthetic'
    ? '합성 데이터 — 실제 상품이 아닙니다'
    : '가져온 카탈로그 — 입력된 출처 기준';
}

// ---------- ZARI-007 editing views ----------

/** Every orientation value in display order. */
export const ORIENTATIONS: Orientation[] = ['upright0', 'upright90'];

export const MOVE_AXES = ['x', 'y', 'z'] as const;
export type MoveAxis = (typeof MOVE_AXES)[number];
export type MoveInputError = 'position_missing' | 'position_not_integer_mm';

export const MOVE_INPUT_TEXT: Record<MoveInputError, string> = {
  position_missing:
    '값이 비어 있거나 숫자로 읽을 수 없습니다 — 빈 칸을 0mm로 보내지 않습니다',
  position_not_integer_mm: '1mm 단위 정수로 입력하세요',
};

/** Raw inspector text for one axis plus the browser's own parse verdict. */
export interface MoveFieldText {
  text: string;
  /** `ValidityState.badInput`: the browser could not read the typed text. */
  badInput: boolean;
}

export type MovePositionRead =
  | { ok: true; position: Extract<LayoutEditCommand, { kind: 'movePlacement' }>['position'] }
  | { ok: false; errors: Partial<Record<MoveAxis, MoveInputError>> };

/**
 * Gate the inspector's raw coordinate text before a `movePlacement` command
 * exists. A blank or unreadable field is an absent value — never 0mm — and
 * only a plain integer literal passes, so the JS number parser never coerces
 * forms such as `1e3` or `12.0` into a coordinate. The gate only refuses:
 * range and physical validity stay with the generated request validator and
 * Rust.
 */
export function readMovePosition(
  fields: Record<MoveAxis, MoveFieldText>,
): MovePositionRead {
  const errors: Partial<Record<MoveAxis, MoveInputError>> = {};
  const values: Partial<Record<MoveAxis, number>> = {};
  for (const axis of MOVE_AXES) {
    const { text, badInput } = fields[axis];
    const trimmed = text.trim();
    if (badInput || trimmed === '') errors[axis] = 'position_missing';
    else if (!/^-?\d+$/.test(trimmed)) errors[axis] = 'position_not_integer_mm';
    else values[axis] = Number(trimmed);
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, position: { x: values.x!, y: values.y!, z: values.z! } };
}

export const ORIENTATION_TEXT: Record<string, string> = {
  upright0: '정면 0°',
  upright90: '90° 회전',
};

/**
 * The orientations the subject itself allows; `null` when the fact is unknown
 * — unknown never silently means "allowed".
 */
export function allowedOrientations(
  content: SnapshotContent,
  placement: Placement,
): Orientation[] | null {
  const subject = placement.subject;
  const fact =
    subject.kind === 'directItem'
      ? content.inputFacts.items.find((i) => i.id === subject.itemId)
          ?.requirement.allowedOrientations
      : subject.kind === 'newContainer'
        ? content.referencedCatalog.variants.find((v) => v.id === subject.variantId)
            ?.allowedOrientations
        : content.inputFacts.ownedContainers.find((o) => o.id === subject.ownedId)
            ?.physical.allowedOrientations;
  if (!fact || fact.state !== 'known') return null;
  return fact.value;
}

export const EDIT_COMMAND_TEXT: Record<string, string> = {
  movePlacement: '위치 이동',
  rotatePlacement: '회전',
  replaceVariant: '옵션 교체',
  selectOffer: '구매 선택',
  restoreLayout: '이전 배치로 되돌리기',
};

/** Rust edit/command rejection codes → Korean explanation. */
export const EDIT_REJECTION_TEXT: Record<string, string> = {
  unknown_placement: '배치를 찾을 수 없습니다',
  edit_command_not_applicable: '이 배치에는 적용할 수 없는 명령입니다',
  edit_base_not_in_scope: '이 스냅샷은 지금 입력 기준이 아닙니다',
  edit_source_required: '되돌릴 스냅샷이 없습니다',
  edit_source_mismatch: '되돌리기 대상이 일치하지 않습니다',
  edit_source_not_in_scope: '되돌리기 대상이 지금 입력 기준이 아닙니다',
  dangling_variant_ref: '카탈로그에 없는 옵션입니다',
  offer_not_for_variant: '이 옵션에 연결된 판매처가 아닙니다',
  digest_mismatch: '스냅샷 무결성 검증에 실패했습니다',
  invalid_request_shape: '허용된 수치 범위(±20000mm)를 벗어났습니다',
  context_not_installed: '작업 컨텍스트가 준비되지 않았습니다',
  stale_input: '입력이 바뀌어 편집을 저장할 수 없습니다',
  orientation_forbidden: '이 물건은 그 방향으로 둘 수 없습니다',
  outside_compartment: '공간 밖으로 나갑니다',
  clearance_violated: '옆 물건과의 여유 공간이 부족합니다',
  unsupported_footprint: '지지면에서 벗어납니다',
  opening_too_narrow: '문 입구로 들어갈 수 없습니다',
  insertion_cycle: '넣는 순서가 꼬입니다',
  staging_width_insufficient: '작업 공간이 부족합니다',
  cyclic_blockers: '꺼낼 때 서로 막습니다',
};
