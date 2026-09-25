import type {
  FactFor_MeasuredLength,
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
 * Read-only display projections over one immutable PlanSnapshot. Nothing here
 * computes fit, quantity or cost — every number shown is copied verbatim from
 * the snapshot's own facts (Rust output), never recomputed in the UI.
 */

export interface RectVm {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Placement id for cross-highlighting with lists/checks. */
  refId: string;
  kind: 'container' | 'item' | 'contained' | 'ghost';
}

const nominal = (fact: FactFor_MeasuredLength): number | null =>
  fact.state === 'known' ? fact.value.nominal : null;

const yawSwaps = (orientation: Orientation): boolean => orientation === 'upright90';

function itemExtent(
  content: SnapshotContent,
  itemId: string,
  orientation: Orientation,
): { width: number; depth: number; height: number } | null {
  const item = content.inputFacts.items.find((i) => i.id === itemId);
  if (!item) return null;
  const w = nominal(item.dimensions.envelope.width);
  const d = nominal(item.dimensions.envelope.depth);
  const h = nominal(item.dimensions.envelope.height);
  if (w === null || d === null || h === null) return null;
  return yawSwaps(orientation)
    ? { width: d, depth: w, height: h }
    : { width: w, depth: d, height: h };
}

function containerExtent(
  content: SnapshotContent,
  subject: PlacementSubject,
  orientation: Orientation,
): { width: number; depth: number; height: number } | null {
  let dims = null;
  if (subject.kind === 'newContainer') {
    dims =
      content.referencedCatalog.variants.find((v) => v.id === subject.variantId)
        ?.dimensions.outer ?? null;
  } else if (subject.kind === 'ownedContainer') {
    dims =
      content.inputFacts.ownedContainers.find((o) => o.id === subject.ownedId)
        ?.physical.dimensions.outer ?? null;
  }
  if (!dims) return null;
  const w = nominal(dims.width);
  const d = nominal(dims.depth);
  const h = nominal(dims.height);
  if (w === null || d === null || h === null) return null;
  return yawSwaps(orientation)
    ? { width: d, depth: w, height: h }
    : { width: w, depth: d, height: h };
}

export function placementExtent(
  content: SnapshotContent,
  placement: Placement,
): { width: number; depth: number; height: number } | null {
  const s = placement.subject;
  if (s.kind === 'directItem') {
    return itemExtent(content, s.itemId, placement.orientation);
  }
  return containerExtent(content, s, placement.orientation);
}

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

/** Space interior box; `null` when any dimension is unknown. */
export function interiorBox(content: SnapshotContent): {
  width: number;
  depth: number;
  height: number;
} | null {
  const interior = content.inputFacts.space.interior;
  const w = nominal(interior.width);
  const d = nominal(interior.depth);
  const h = nominal(interior.height);
  return w === null || d === null || h === null ? null : { width: w, depth: d, height: h };
}

/** Top-view rectangles: space outline + every placement; contained items inside their container. */
export function topViewRects(content: SnapshotContent): RectVm[] {
  const rects: RectVm[] = [];
  for (const p of content.placements) {
    const extent = placementExtent(content, p);
    if (!extent) continue;
    const isContainer = p.subject.kind !== 'directItem';
    rects.push({
      x: p.position.x,
      y: p.position.y,
      width: extent.width,
      height: extent.depth,
      label: subjectLabel(content, p.subject),
      refId: p.id,
      kind: isContainer ? 'container' : 'item',
    });
    if (isContainer) {
      for (const a of content.assignments) {
        if (a.location.kind !== 'contained' || a.location.containerPlacementId !== p.id)
          continue;
        const local = itemExtent(content, a.itemId, a.location.localPlacement.orientation);
        if (!local) continue;
        const item = content.inputFacts.items.find((i) => i.id === a.itemId);
        rects.push({
          x: p.position.x + a.location.localPlacement.position.x,
          y: p.position.y + a.location.localPlacement.position.y,
          width: local.width,
          height: local.depth,
          label: `${item?.label ?? a.itemId} #${a.unitOrdinal + 1}`,
          refId: p.id,
          kind: 'contained',
        });
      }
    }
  }
  return rects;
}

/** Front-view rectangles (x against z): the same placements seen from the opening. */
export function frontViewRects(content: SnapshotContent): RectVm[] {
  const rects: RectVm[] = [];
  for (const p of content.placements) {
    const extent = placementExtent(content, p);
    if (!extent) continue;
    const isContainer = p.subject.kind !== 'directItem';
    rects.push({
      x: p.position.x,
      y: p.position.z,
      width: extent.width,
      height: extent.height,
      label: subjectLabel(content, p.subject),
      refId: p.id,
      kind: isContainer ? 'container' : 'item',
    });
  }
  return rects;
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

export function unassignedCount(snapshot: PlanSnapshot): number {
  let count = 0;
  for (const u of snapshot.content.unassigned) {
    if (u.instances.kind === 'known') {
      for (const r of u.instances.ranges) count += r.endExclusive - r.start;
    }
  }
  return count;
}

/** The plan needs a purchase only when a new-container placement exists. */
export function isNoPurchase(snapshot: PlanSnapshot): boolean {
  return !snapshot.content.placements.some(
    (p) => p.subject.kind === 'newContainer',
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
  clearSpace: '공간을 비웁니다',
  sortContents: '내용물을 분류합니다',
  acquire: '구매합니다',
  confirmArrival: '도착을 확인합니다',
  install: '수납함을 배치합니다',
  transferContents: '물건을 넣습니다',
  label: '라벨을 붙입니다',
  verifyUnassigned: '남은 물건을 확인합니다',
  resolveCondition: '미확인 조건을 확인합니다',
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

// ---------- ZARI-007 editing views ----------

/** Every orientation value in display order. */
export const ORIENTATIONS: Orientation[] = ['upright0', 'upright90'];

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

/**
 * Ghost rectangle for an in-flight edit command: where the placement *would*
 * sit. It is a provisional preview — dashed styling, never a verified plan.
 */
export function ghostRect(content: SnapshotContent, command: LayoutEditCommand): RectVm | null {
  let placement: Placement | undefined;
  let x: number;
  let y: number;
  let orientation: Orientation;
  if (command.kind === 'movePlacement') {
    placement = content.placements.find((p) => p.id === command.placementId);
    if (!placement) return null;
    x = command.position.x;
    y = command.position.y;
    orientation = placement.orientation;
  } else if (command.kind === 'rotatePlacement') {
    placement = content.placements.find((p) => p.id === command.placementId);
    if (!placement) return null;
    x = placement.position.x;
    y = placement.position.y;
    orientation = command.orientation;
  } else {
    return null;
  }
  const extent = placementExtent(content, { ...placement, orientation });
  if (!extent) return null;
  return {
    x,
    y,
    width: extent.width,
    height: extent.depth,
    label: `${subjectLabel(content, placement.subject)} (검증 중)`,
    refId: placement.id,
    kind: 'ghost',
  };
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
