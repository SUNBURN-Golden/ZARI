import type {
  ActionStep,
  ConstraintCheck,
  InstanceRef,
  SnapshotContent,
} from '../../contracts/generated/dto';
import { CHECK_KIND_TEXT, CHECK_STATUS_TEXT, subjectLabel } from '../plan/view';

/**
 * Execution-checklist view helpers (z-execution-checklist). Everything here is
 * a label over Rust-produced data — ActionStep fields, eligibility
 * `instanceRefs`, snapshot checks. The UI never recomputes eligibility,
 * prerequisites, or physical suitability.
 */

/** Rollback reasons: reality differs from the plan. Each returns to one draft section. */
export type DraftFocusTarget = 'differentItem' | 'missingParts' | 'measuredDiff';

export interface RollbackOption {
  target: DraftFocusTarget;
  label: string;
}

export const ROLLBACK_OPTIONS: readonly RollbackOption[] = [
  { target: 'differentItem', label: '다른 물건을 발견했다' },
  { target: 'missingParts', label: '부품이 모자라다' },
  { target: 'measuredDiff', label: '실측이 다르다' },
];

/**
 * Where a rollback lands on the draft screen. `id` is a focusable element id;
 * `testId` is a `data-testid` query. The draft screen focuses the element —
 * navigation alone never edits the draft.
 */
export function draftFocusQuery(
  target: DraftFocusTarget,
): { kind: 'id'; value: string } | { kind: 'testId'; value: string } {
  switch (target) {
    case 'differentItem':
      return { kind: 'id', value: 'items.item-a.dimensions.envelope.width' };
    case 'missingParts':
      return { kind: 'testId', value: 'catalog-pin-select' };
    case 'measuredDiff':
      return { kind: 'id', value: 'space.interior.width' };
  }
}

export function itemText(content: SnapshotContent, itemId: string): string {
  return content.inputFacts.items.find((item) => item.id === itemId)?.label ?? itemId;
}

function placementText(content: SnapshotContent, placementId: string): string {
  const placement = content.placements.find((entry) => entry.id === placementId);
  return placement ? subjectLabel(content, placement.subject) : placementId;
}

function variantText(content: SnapshotContent, variantId: string): string {
  return (
    content.referencedCatalog.variants.find((variant) => variant.id === variantId)
      ?.optionLabel ?? variantId
  );
}

/**
 * One preparation line per Rust `InstanceRef`. Ordinals are one-based display
 * counters, not quantities; an unassigned row with unknown instances stays
 * '수량 미확인', never a guessed count.
 */
export function instanceLabel(content: SnapshotContent, ref: InstanceRef): string {
  switch (ref.kind) {
    case 'directItem':
      return `${itemText(content, ref.itemId)} ${ref.unitOrdinal + 1}번째`;
    case 'containedItem':
      return `${itemText(content, ref.itemId)} ${ref.unitOrdinal + 1}번째 → ${placementText(content, ref.containerPlacementId)}`;
    case 'ownedContainer':
      return `보유 수납함 ${ref.ownedId} ${ref.unitOrdinal + 1}번째`;
    case 'newContainer':
      return `새 수납함 ${variantText(content, ref.variantId)} ${ref.unitOrdinal + 1}번째`;
    case 'unassigned': {
      const count =
        ref.instances.kind === 'known'
          ? `${ref.instances.ranges.reduce((total, range) => total + (range.endExclusive - range.start), 0)}개`
          : '수량 미확인';
      return `미배정 ${itemText(content, ref.itemId)} ${count}`;
    }
    case 'space':
      return '작업할 칸';
    default: {
      const _never: never = ref;
      return _never;
    }
  }
}

/** Preparations come only from the eligibility row's instanceRefs. */
export function preparationLines(
  content: SnapshotContent,
  refs: readonly InstanceRef[],
): string[] {
  return refs.map((ref) => instanceLabel(content, ref));
}

/**
 * Fallback related-subject labels when no eligibility row exists (read-only
 * surfaces where eligibility is never queried). Subject ids are Rust data on
 * the ActionStep itself; this resolves labels without recomputing refs.
 */
export function subjectText(content: SnapshotContent, id: string): string {
  const placement = content.placements.find((entry) => entry.id === id);
  if (placement) return subjectLabel(content, placement.subject);
  const item = content.inputFacts.items.find((entry) => entry.id === id);
  if (item) return item.label;
  const variant = content.referencedCatalog.variants.find((entry) => entry.id === id);
  if (variant) return `옵션 ${variant.optionLabel}`;
  const owned = content.inputFacts.ownedContainers.find((entry) => entry.id === id);
  if (owned) return `보유 수납함 ${owned.id}`;
  const offer = content.referencedCatalog.offers.find((entry) => entry.id === id);
  if (offer) {
    const offerVariant = variantText(content, offer.variantId);
    return `${offerVariant} 판매 옵션 ${offer.id}`;
  }
  if (content.inputFacts.space.id === id) return '작업할 칸';
  return id;
}

export interface ConditionRow {
  checkId: string;
  kindText: string;
  status: ConstraintCheck['status'];
  statusText: string;
}

/**
 * The checks Rust pinned to this step (`reasonIds` are only unknown or
 * blocking-fail checks). Status text is a label over `check.status`; nothing
 * here changes or re-derives it.
 */
export function conditionRows(
  content: SnapshotContent,
  step: ActionStep,
): ConditionRow[] {
  return step.reasonIds
    .map((id) => content.validation.checks.find((check) => check.id === id))
    .filter((check): check is ConstraintCheck => check !== undefined)
    .map((check) => ({
      checkId: check.id,
      kindText: CHECK_KIND_TEXT[check.kind] ?? check.kind,
      status: check.status,
      statusText: CHECK_STATUS_TEXT[check.status] ?? check.status,
    }));
}
