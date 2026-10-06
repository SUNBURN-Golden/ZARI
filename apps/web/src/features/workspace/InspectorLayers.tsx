import { useId, type ReactNode } from 'react';
import type {
  Dimensions,
  FactFor_ArrayOf_Orientation,
  FactFor_MeasuredLength,
  ItemLocation,
  Placement,
  SnapshotContent,
  SpatialProjection,
  SpatialTarget,
  VariantDimensions,
} from '../../contracts/generated/dto';
import {
  CHECK_KIND_TEXT,
  CHECK_STATUS_TEXT,
  ORIENTATION_TEXT,
  moneyText,
  qtyText,
  subjectLabel,
} from '../plan/view';
import type { WorkspaceFocus } from './model';
import { diagramTextEntries, lengthFactText } from './projection';
import { isItemInstance, parentPlacementId, targetKey, targetsEqual } from './selection';

type InspectorLayersProps = {
  content: SnapshotContent;
  projection: SpatialProjection | null;
  selection: SpatialTarget | null;
  focus: WorkspaceFocus;
  onSelect: (target: SpatialTarget) => void;
  onShowInList?: (elementId: string) => void;
  children?: ReactNode;
};

const AXIS_LABEL = { width: '폭', depth: '깊이', height: '높이' } as const;

export function InspectorLayers({
  content,
  projection,
  selection,
  focus,
  onSelect,
  onShowInList,
  children,
}: InspectorLayersProps) {
  const placement = placementOf(content, selection);
  const parentId = parentPlacementId(projection, selection);
  const parent = parentId ? content.placements.find((item) => item.id === parentId) : undefined;
  const child = isItemInstance(selection);
  const titleId = useId();
  return (
    <aside className="workspace-inspector" aria-labelledby={titleId} data-testid="inspector-layers">
      <div className="section-kicker">선택</div>
      <h3 id={titleId}>대상</h3>
      {!selection && (
        <>
          <p data-testid="inspector-prompt">대상을 선택하면 내용물과 근거를 볼 수 있습니다.</p>
          <CheckSummary content={content} />
        </>
      )}
      {selection && (
        <>
          <p className="inspector-name" data-testid="inspector-name">
            <span className="legend-selection">선택됨</span> {selectionLabel(content, selection, placement)}
          </p>
          <p className="session-note" data-testid="inspector-role">
            {roleText(content, selection, placement)}
          </p>
          {child && (
            <div data-testid="inspector-child">
              <p>이 물건은 부모 수납함 안의 내용물입니다. 이동은 부모를 선택한 뒤에만 할 수 있습니다.</p>
              {parent && (
                <button
                  type="button"
                  className="button button-quiet"
                  data-testid="select-parent"
                  onClick={() => onSelect({ kind: 'placement', placementId: parent.id })}
                >
                  부모 선택 · {subjectLabel(content, parent.subject)}
                </button>
              )}
              {!parent && parentId && (
                <p className="session-note">부모 배치 {parentId} 는 이 스냅샷에 없습니다.</p>
              )}
            </div>
          )}
          <Contents content={content} selection={selection} placement={placement} onSelect={onSelect} />
          <DimensionsBlock content={content} placement={placement} selection={selection} />
          <Checks content={content} projection={projection} selection={selection} focus={focus} />
          <Commerce content={content} placement={placement} onShowInList={onShowInList} />
          {children}
        </>
      )}
      {focus.kind !== 'none' && focus.kind !== 'measurement' && (
        <p className="session-note" data-testid="focus-channel">
          <span className="legend-focus">목록 강조</span>{' '}
          {focus.kind === 'bom'
            ? `구매 행 ${focus.bomLineId}`
            : focus.kind === 'check'
              ? `검사 ${focus.checkId}`
              : `단계 ${focus.stepId}`}
        </p>
      )}
    </aside>
  );
}

export function DiagramTextList({
  content,
  projection,
  selection,
  onSelect,
}: {
  content: SnapshotContent;
  projection: SpatialProjection | null;
  selection: SpatialTarget | null;
  onSelect?: (target: SpatialTarget) => void;
}) {
  if (!projection) return null;
  const entries = diagramTextEntries(projection, content);
  return (
    <section aria-labelledby="diagram-text-title">
      <h3 id="diagram-text-title" className="section-kicker">
        도면 목록
      </h3>
      <ul className="plan-list" data-testid="diagram-text-list">
        {entries.map((entry) => (
          <li key={entry.key} data-selected={entry.target && targetsEqual(selection, entry.target) ? 'true' : undefined}>
            {entry.target && onSelect ? (
              <button
                type="button"
                className="text-pick"
                data-testid={`diagram-pick-${entry.key}`}
                onClick={() => entry.target && onSelect(entry.target)}
              >
                {entry.label}
              </button>
            ) : (
              <span>{entry.label}</span>
            )}
            {entry.note && <span className="session-note">{entry.note}</span>}
          </li>
        ))}
        {entries.length === 0 && <li>그릴 대상이 없습니다.</li>}
      </ul>
    </section>
  );
}

function CheckSummary({ content }: { content: SnapshotContent }) {
  const checks = content.validation.checks;
  const unknown = checks.filter((item) => item.status === 'unknown').length;
  const failed = checks.filter((item) => item.status === 'fail').length;
  return (
    <p className="session-note" data-testid="inspector-check-summary">
      검사 {checks.length}건
      {failed > 0 ? ` · 실패 ${failed}` : ''}
      {unknown > 0 ? ` · 미확인 ${unknown}` : ''}
    </p>
  );
}

function Contents({
  content,
  selection,
  placement,
  onSelect,
}: {
  content: SnapshotContent;
  selection: SpatialTarget;
  placement: Placement | undefined;
  onSelect: (target: SpatialTarget) => void;
}) {
  const placementId = containerOf(content, selection);
  if (!placementId) return null;
  const rows = content.assignments.filter((item) => containerId(item.location) === placementId);
  if (rows.length === 0 && !placement) return null;
  return (
    <section aria-labelledby="contents-title">
      <h4 id="contents-title">내용물</h4>
      <ul className="plan-list" data-testid="inspector-contents">
        {rows.map((row) => {
          const item = content.inputFacts.items.find((entry) => entry.id === row.itemId);
          const provisional = row.location.kind === 'provisionalContainer';
          return (
            <li key={`${row.itemId}:${row.unitOrdinal}`}>
              <button
                type="button"
                className="text-pick"
                data-testid={`content-${row.itemId}-${row.unitOrdinal}`}
                onClick={() =>
                  onSelect({
                    kind: 'itemInstance',
                    itemId: row.itemId,
                    unitOrdinal: row.unitOrdinal,
                  })
                }
              >
                {item?.label ?? row.itemId}
                {row.unitOrdinal > 0 ? ` #${row.unitOrdinal + 1}` : ''}
              </button>
              {provisional && <span className="session-note">수납 확인 전</span>}
            </li>
          );
        })}
        {rows.length === 0 && <li className="session-note">담긴 내용물이 없습니다.</li>}
      </ul>
    </section>
  );
}

function DimensionsBlock({
  content,
  placement,
  selection,
}: {
  content: SnapshotContent;
  placement: Placement | undefined;
  selection: SpatialTarget;
}) {
  const dims = dimensionsFor(content, placement, selection);
  if (!dims) return null;
  return (
    <section aria-labelledby="dims-title">
      <h4 id="dims-title">치수</h4>
      <dl className="measurement-list" data-testid="inspector-dimensions">
        <DimensionGroup title="외경" dims={dims.outer} />
        <DimensionGroup title="내경" dims={dims.inner} />
      </dl>
      {dims.orientations && (
        <p className="session-note" data-testid="inspector-orientations">
          허용 방향{' '}
          {dims.orientations.state === 'known'
            ? dims.orientations.value.map((item) => ORIENTATION_TEXT[item] ?? item).join(', ')
            : dims.orientations.state === 'notApplicable'
              ? '해당 없음'
              : '미확인'}
        </p>
      )}
      {(dims.outerProvenance || dims.innerProvenance) && (
        <p className="session-note" data-testid="inspector-provenance">
          {dims.outerProvenance && `외경 출처 ${dims.outerProvenance}`}
          {dims.outerProvenance && dims.innerProvenance ? ' · ' : ''}
          {dims.innerProvenance && `내경 출처 ${dims.innerProvenance}`}
        </p>
      )}
    </section>
  );
}

function DimensionGroup({
  title,
  dims,
}: {
  title: string;
  dims: Dimensions | null;
}) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>
        {dims ? (
          <ul className="axis-facts">
            {(['width', 'depth', 'height'] as const).map((axis) => {
              const read = lengthFactText(dims[axis]);
              return (
                <li key={axis} data-axis={axis} data-state={read.state}>
                  {AXIS_LABEL[axis]}{' '}
                  {read.state === 'known'
                    ? read.valueText
                    : read.state === 'notApplicable'
                      ? `해당 없음 (${read.uncertaintyNote ?? ''})`
                      : `미확인${read.uncertaintyNote ? ` (${read.uncertaintyNote})` : ''}`}
                  {read.state === 'known' && read.uncertaintyNote ? ` · ${read.uncertaintyNote}` : ''}
                </li>
              );
            })}
          </ul>
        ) : (
          <span>해당 없음</span>
        )}
      </dd>
    </div>
  );
}

function Checks({
  content,
  projection,
  selection,
  focus,
}: {
  content: SnapshotContent;
  projection: SpatialProjection | null;
  selection: SpatialTarget;
  focus: WorkspaceFocus;
}) {
  const id = subjectId(selection);
  const linked = new Set(
    (projection?.links ?? [])
      .filter(
        (link) =>
          link.source.kind === 'check' &&
          link.targets.some((target) => targetsEqual(target, selection)),
      )
      .map((link) => (link.source.kind === 'check' ? link.source.checkId : '')),
  );
  const checks = content.validation.checks.filter(
    (check) => linked.has(check.id) || (id !== null && check.subjectIds.includes(id)),
  );
  if (checks.length === 0) return null;
  return (
    <section aria-labelledby="inspector-checks-title">
      <h4 id="inspector-checks-title">검사</h4>
      <ul className="plan-list" data-testid="inspector-checks">
        {checks.map((check) => {
          const overlay = projection?.overlays.find(
            (item) =>
              item.checkIds.includes(check.id) && targetsEqual(item.target, selection),
          );
          const geometry =
            overlay?.geometry.kind === 'unavailable'
              ? `형상 없음 (${overlay.geometry.reasonCode})`
              : overlay?.geometry.kind === 'notApplicable'
                ? `형상 해당 없음 (${overlay.geometry.reasonCode})`
                : null;
          return (
            <li key={check.id} data-status={check.status} data-focused={focus.kind === 'check' && focus.checkId === check.id ? 'true' : undefined}>
              <span>
                {CHECK_KIND_TEXT[check.kind] ?? check.kind}
                {' · '}
                {CHECK_STATUS_TEXT[check.status] ?? check.status}
                {check.status !== 'pass' ? ` (${check.reasonCode})` : ''}
              </span>
              {geometry && <span className="session-note">{geometry}</span>}
              {check.evidenceRefs.length > 0 && (
                <span className="session-note" data-testid={`check-evidence-${check.id}`}>
                  근거 {check.evidenceRefs.map((ref) => ref.fieldPath).join(', ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Commerce({
  content,
  placement,
  onShowInList,
}: {
  content: SnapshotContent;
  placement: Placement | undefined;
  onShowInList?: (elementId: string) => void;
}) {
  if (!placement) return null;
  const lines = content.bom.filter((line) => line.placementIds.includes(placement.id));
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby="inspector-commerce-title">
      <h4 id="inspector-commerce-title">수량과 비용</h4>
      <ul className="plan-list" data-testid="inspector-commerce">
        {lines.map((line) => (
          <li key={line.id}>
            <span>
              필요 {line.physicalNeeded} · 주문 {qtyText(line.packsToOrder)} ·{' '}
              {moneyText(line.productSubtotal)}
            </span>
            {line.placementIds.length > 1 && (
              <span className="session-note">배치 {line.placementIds.length}곳</span>
            )}
            {onShowInList && (
              <button
                type="button"
                className="button button-quiet"
                data-testid={`show-in-list-${line.id}`}
                onClick={() => onShowInList(`bom-row-${line.id}`)}
              >
                목록에서 보기
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function containerId(location: ItemLocation): string | null {
  if (location.kind === 'direct') return null;
  return location.containerPlacementId;
}

function containerOf(content: SnapshotContent, selection: SpatialTarget): string | null {
  if (selection.kind === 'placement') return selection.placementId;
  if (selection.kind !== 'itemInstance') return null;
  const assignment = content.assignments.find(
    (item) => item.itemId === selection.itemId && item.unitOrdinal === selection.unitOrdinal,
  );
  return assignment ? containerId(assignment.location) : null;
}

function placementOf(content: SnapshotContent, selection: SpatialTarget | null): Placement | undefined {
  if (selection?.kind !== 'placement') return undefined;
  return content.placements.find((item) => item.id === selection.placementId);
}

function selectionLabel(
  content: SnapshotContent,
  selection: SpatialTarget,
  placement: Placement | undefined,
): string {
  if (placement) return subjectLabel(content, placement.subject);
  if (selection.kind === 'itemInstance' || selection.kind === 'item') {
    const item = content.inputFacts.items.find((entry) => entry.id === selection.itemId);
    const label = item?.label ?? selection.itemId;
    return selection.kind === 'itemInstance' && selection.unitOrdinal > 0
      ? `${label} #${selection.unitOrdinal + 1}`
      : label;
  }
  if (selection.kind === 'opening') return '입구';
  if (selection.kind === 'space') return '공간';
  if (selection.kind === 'obstacle') return '장애물';
  if (selection.kind === 'support') return '지지면';
  return targetKey(selection);
}

function roleText(
  content: SnapshotContent,
  selection: SpatialTarget,
  placement: Placement | undefined,
): string {
  if (selection.kind === 'itemInstance') return '내용물';
  if (!placement) return selection.kind;
  if (placement.subject.kind === 'directItem') return '직접 배치';
  if (placement.subject.kind === 'ownedContainer') {
    const ownedId = placement.subject.ownedId;
    const owned = content.inputFacts.ownedContainers.find((item) => item.id === ownedId);
    return owned?.variantRef ? '보유 수납함 · 옵션 연결' : '보유 수납함';
  }
  if (placement.subject.kind === 'newContainer') return '새 수납함';
  return '배치';
}

function subjectId(selection: SpatialTarget): string | null {
  if (selection.kind === 'placement') return selection.placementId;
  if (selection.kind === 'item' || selection.kind === 'itemInstance') return selection.itemId;
  if (selection.kind === 'obstacle') return selection.obstacleId;
  if (selection.kind === 'support') return selection.supportId;
  if (selection.kind === 'space' || selection.kind === 'opening') return selection.spaceId;
  return null;
}

function dimensionsFor(
  content: SnapshotContent,
  placement: Placement | undefined,
  selection: SpatialTarget,
): {
  outer: Dimensions | null;
  inner: Dimensions | null;
  orientations: FactFor_ArrayOf_Orientation | null;
  outerProvenance: string | null;
  innerProvenance: string | null;
} | null {
  if (selection.kind === 'item' || selection.kind === 'itemInstance' || placement?.subject.kind === 'directItem') {
    const itemId =
      selection.kind === 'item' || selection.kind === 'itemInstance'
        ? selection.itemId
        : placement?.subject.kind === 'directItem'
          ? placement.subject.itemId
          : null;
    const item = itemId ? content.inputFacts.items.find((entry) => entry.id === itemId) : undefined;
    if (!item) return null;
    return {
      outer: item.dimensions.envelope,
      inner: null,
      orientations: null,
      outerProvenance: lengthFactText(item.dimensions.envelope.width).provenanceText,
      innerProvenance: null,
    };
  }
  if (!placement) return null;
  const subject = placement.subject;
  if (subject.kind === 'ownedContainer') {
    const owned = content.inputFacts.ownedContainers.find((item) => item.id === subject.ownedId);
    if (!owned) return null;
    return pack(owned.physical.dimensions, owned.physical.allowedOrientations);
  }
  if (subject.kind === 'newContainer') {
    const variant = content.referencedCatalog.variants.find((item) => item.id === subject.variantId);
    if (!variant) return null;
    return pack(variant.dimensions, variant.allowedOrientations);
  }
  return null;
}

function pack(
  dims: VariantDimensions,
  orientations: FactFor_ArrayOf_Orientation,
): {
  outer: Dimensions;
  inner: Dimensions;
  orientations: FactFor_ArrayOf_Orientation;
  outerProvenance: string | null;
  innerProvenance: string | null;
} {
  return {
    outer: dims.outer,
    inner: dims.inner,
    orientations,
    outerProvenance: axisProvenance(dims.outer.width),
    innerProvenance: axisProvenance(dims.inner.width),
  };
}

function axisProvenance(fact: FactFor_MeasuredLength): string | null {
  return lengthFactText(fact).provenanceText;
}
