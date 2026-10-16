import type { PlacementSubject, SnapshotContent } from '../../contracts/generated/dto';
import { subjectLabel } from '../plan/view';

/**
 * What a printed package or a downloaded CSV may say about the person who
 * made the plan (z-print-share). The choice is made per output, lives only in
 * the panel, and is never saved. Everything not named here — photos,
 * attachments, observed locations, feedback, free-text notes, account and
 * device facts — is never part of an output.
 */
export interface PrintScope {
  /** The project name the person typed. */
  projectName: boolean;
  /** Names of the things the person owns: items and owned containers. */
  itemNames: boolean;
  /** Product page addresses of the purchase lines. */
  purchaseLinks: boolean;
  /** Which guide steps the person marked done. */
  progress: boolean;
}

export type PrintScopeKey = keyof PrintScope;

/** The safest choice: shareable with an installer without personal text. */
export const SHARE_SCOPE: PrintScope = {
  projectName: false,
  itemNames: false,
  purchaseLinks: false,
  progress: false,
};

export const FULL_SCOPE: PrintScope = {
  projectName: true,
  itemNames: true,
  purchaseLinks: true,
  progress: true,
};

export const DEFAULT_PRINT_SCOPE: PrintScope = SHARE_SCOPE;

export const SCOPE_ROWS: readonly {
  key: PrintScopeKey;
  label: string;
  detail: string;
}[] = [
  { key: 'projectName', label: '프로젝트 이름', detail: '끄면 이름 대신 “이름 숨김”으로 적습니다' },
  {
    key: 'itemNames',
    label: '내 물건·보유 수납함 이름',
    detail: '끄면 “물건 1”, “보유 수납함 1”처럼 번호로 적습니다',
  },
  { key: 'purchaseLinks', label: '구매 링크', detail: '끄면 상품 주소를 적지 않습니다' },
  { key: 'progress', label: '실행 진행 기록', detail: '끄면 단계의 완료 표시를 적지 않습니다' },
];

/** Always left out, whatever the scope says. Shown next to the choices. */
export const ALWAYS_EXCLUDED_TEXT =
  '사진·첨부 파일, 실제 위치 기록, 사용 피드백, 메모와 근거 문서의 자유 서술, 계정·기기 정보는 항상 제외됩니다.';

export function scopeEquals(a: PrintScope, b: PrintScope): boolean {
  return (
    a.projectName === b.projectName &&
    a.itemNames === b.itemNames &&
    a.purchaseLinks === b.purchaseLinks &&
    a.progress === b.progress
  );
}

/** One line that is printed on every page, so a reader knows what was left out. */
export function scopeSummary(scope: PrintScope): string {
  const part = (on: boolean, name: string) => `${name} ${on ? '포함' : '제외'}`;
  return [
    part(scope.projectName, '프로젝트 이름'),
    part(scope.itemNames, '물건 이름'),
    part(scope.purchaseLinks, '구매 링크'),
    part(scope.progress, '진행 기록'),
  ].join(' · ');
}

export const HIDDEN_PROJECT_TEXT = '이름 숨김';
export const EXCLUDED_CELL_TEXT = '범위에서 제외';

/**
 * Names for the things a plan refers to. With `itemNames` off, no label or id
 * of an item or owned container can reach the output: they become
 * numbers by their order in the saved input. Catalog product names are
 * catalog data, not personal text, and are always kept.
 */
export interface Labeler {
  project(name: string): string;
  item(itemId: string): string;
  owned(ownedId: string): string;
  placement(subject: PlacementSubject): string;
  /** A subject id from an action step: placement, item, variant, owned container, offer, space. */
  subject(id: string): string;
}

export function makeLabeler(content: SnapshotContent, scope: PrintScope): Labeler {
  const items = content.inputFacts.items;
  const owned = content.inputFacts.ownedContainers;
  const variants = content.referencedCatalog.variants;
  const itemNumber = (itemId: string) => {
    const index = items.findIndex((entry) => entry.id === itemId);
    return index < 0 ? '?' : String(index + 1);
  };
  const ownedNumber = (ownedId: string) => {
    const index = owned.findIndex((entry) => entry.id === ownedId);
    return index < 0 ? '?' : String(index + 1);
  };
  const itemName = (itemId: string) =>
    scope.itemNames
      ? (items.find((entry) => entry.id === itemId)?.label ?? itemId)
      : `물건 ${itemNumber(itemId)}`;
  const ownedName = (ownedId: string) =>
    scope.itemNames ? ownedId : `보유 수납함 ${ownedNumber(ownedId)}`;
  const variantName = (variantId: string) =>
    variants.find((entry) => entry.id === variantId)?.optionLabel ?? variantId;
  const placement = (subject: PlacementSubject): string => {
    if (scope.itemNames) return subjectLabel(content, subject);
    const unit = subject.unitOrdinal > 0 ? ` #${subject.unitOrdinal + 1}` : '';
    if (subject.kind === 'directItem') return `${itemName(subject.itemId)}${unit}`;
    if (subject.kind === 'newContainer') return `${variantName(subject.variantId)}${unit}`;
    return `${ownedName(subject.ownedId)} #${subject.unitOrdinal + 1}`;
  };
  return {
    project: (name) => (scope.projectName ? name : HIDDEN_PROJECT_TEXT),
    item: itemName,
    owned: ownedName,
    placement,
    subject: (id) => {
      const placed = content.placements.find((entry) => entry.id === id);
      if (placed) return placement(placed.subject);
      if (items.some((entry) => entry.id === id)) return itemName(id);
      const variant = variants.find((entry) => entry.id === id);
      if (variant) return `옵션 ${variant.optionLabel}`;
      if (owned.some((entry) => entry.id === id)) {
        return scope.itemNames ? `보유 수납함 ${id}` : ownedName(id);
      }
      if (content.inputFacts.space.id === id) return '작업할 칸';
      const offer = content.referencedCatalog.offers.find((entry) => entry.id === id);
      if (offer) return `판매 옵션 (${variantName(offer.variantId)})`;
      // An unknown id is never printed in a scope that hides names: it could
      // be text the person typed.
      return scope.itemNames ? id : '(대상)';
    },
  };
}
