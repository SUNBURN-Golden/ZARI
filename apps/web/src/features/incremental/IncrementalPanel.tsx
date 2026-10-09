import { useId, useState } from 'react';
import { Button } from 'react-aria-components';
import type {
  IncrementalPins,
  IncrementalReply,
  Placement,
  PlanSnapshot,
  ReleasablePin,
} from '../../contracts/generated/dto';
import type { IncrementalPanelState } from './controller';
import {
  checkStatusText,
  conflictText,
  operationText,
  releaseLabel,
  reusedPassText,
  scopeReasonText,
} from './phrases';

/**
 * Pin choices and the Rust diff for one previous plan. The page does not
 * move coordinates, reuse a check status, or adopt a late reply.
 */
export function IncrementalPanel({
  base,
  selectedId,
  state,
  reply,
  error,
  ignored,
  onRun,
  onCancel,
  onAdopt,
}: {
  base: PlanSnapshot | null;
  selectedId: string | null;
  state: IncrementalPanelState;
  reply: IncrementalReply | null;
  error: string | null;
  ignored: number;
  onRun: (pins: IncrementalPins) => void;
  onCancel: () => void;
  onAdopt: () => void;
}) {
  const titleId = useId();
  const baseId = base?.planSnapshotId ?? '';
  const [placementIds, setPlacementIds] = useState<ReadonlySet<string>>(new Set());
  const [itemIds, setItemIds] = useState<ReadonlySet<string>>(new Set());
  const [strategy, setStrategy] = useState(false);
  const [seenBase, setSeenBase] = useState(baseId);
  if (seenBase !== baseId) {
    setSeenBase(baseId);
    setPlacementIds(new Set());
    setItemIds(new Set());
    setStrategy(false);
  }

  const aligned =
    base !== null && reply !== null && reply.previousSnapshotId === base.planSnapshotId;
  const shown = aligned ? reply : null;
  let visual: IncrementalPanelState;
  if (!base) visual = 'empty';
  else if (state === 'pending' || state === 'cancelled' || state === 'error') visual = state;
  else if (shown && (state === 'ready' || state === 'blocked')) visual = state;
  else visual = 'idle';

  const pins = (): IncrementalPins => ({
    placementIds: [...placementIds].sort(),
    itemIds: [...itemIds].sort(),
    strategy,
  });
  const toggle = (
    current: ReadonlySet<string>,
    id: string,
    update: (next: ReadonlySet<string>) => void,
    checked: boolean,
  ) => {
    const next = new Set(current);
    if (checked) next.add(id);
    else next.delete(id);
    update(next);
  };
  const release = (pin: ReleasablePin) => {
    if (pin.kind === 'strategy') {
      setStrategy(false);
      return;
    }
    if (!pin.id) return;
    if (pin.kind === 'placement') toggle(placementIds, pin.id, setPlacementIds, false);
    if (pin.kind === 'item') toggle(itemIds, pin.id, setItemIds, false);
  };

  const items = base?.content.inputFacts.items ?? [];
  const itemName = (id: string) => items.find((item) => item.id === id)?.label ?? id;

  return (
    <section
      className="incremental-replan"
      data-testid="incremental-replan"
      data-state={visual}
      data-selected-id={selectedId ?? ''}
      data-moved={shown ? String(shown.diff.movedPlacementIds.length) : ''}
      data-reused-pass={shown ? String(shown.reusedPass) : ''}
      data-ignored={String(ignored)}
      data-outcome={shown ? shown.outcome.kind : ''}
      data-next-snapshot={shown?.diff.nextSnapshotId ?? ''}
      data-read-model={shown?.readModelVersion ?? ''}
      aria-labelledby={titleId}
    >
      <h3 id={titleId}>고정 배치를 지키는 부분 재정리</h3>
      {visual === 'empty' && (
        <p data-testid="incremental-empty">재정리할 계획이 없습니다. 먼저 계획을 계산하거나 채택하세요.</p>
      )}
      {visual === 'pending' && (
        <p data-testid="incremental-status" role="status">
          고정한 배치를 유지한 채 다시 계산하고 있습니다…
        </p>
      )}
      {visual === 'cancelled' && (
        <p data-testid="incremental-status" role="status">
          취소했습니다. 채택한 계획은 그대로입니다.
        </p>
      )}
      {ignored > 0 && (
        <p data-testid="incremental-ignored" role="status">
          늦은 응답은 채택한 계획을 바꾸지 않았습니다.
        </p>
      )}
      {visual === 'error' && (
        <p className="field-error" role="alert" data-testid="incremental-error">
          다시 정리하지 못했습니다. {operationText(error)}
        </p>
      )}
      {base && visual !== 'empty' && (
        <>
          <p className="session-note">
            유지할 배치와 물건, 전략을 고릅니다. 고르지 않은 배치는 맞지 않으면 빠지고, 좌표는 옮기지 않습니다.
          </p>
          <div className="incremental-pins">
            {base.content.placements.map((placement) => (
              <label key={placement.id} className="incremental-pin">
                <input
                  type="checkbox"
                  data-testid={`incremental-pin-placement-${placement.id}`}
                  checked={placementIds.has(placement.id)}
                  disabled={visual === 'pending'}
                  onChange={(event) =>
                    toggle(placementIds, placement.id, setPlacementIds, event.target.checked)
                  }
                />
                <span>{placementCaption(placement, itemName)}</span>
              </label>
            ))}
            {items.map((item) => (
              <label key={item.id} className="incremental-pin">
                <input
                  type="checkbox"
                  data-testid={`incremental-pin-item-${item.id}`}
                  checked={itemIds.has(item.id)}
                  disabled={visual === 'pending'}
                  onChange={(event) => toggle(itemIds, item.id, setItemIds, event.target.checked)}
                />
                <span>{item.label} 고정</span>
              </label>
            ))}
            <label className="incremental-pin">
              <input
                type="checkbox"
                data-testid="incremental-pin-strategy"
                checked={strategy}
                disabled={visual === 'pending'}
                onChange={(event) => setStrategy(event.target.checked)}
              />
              <span>전략 고정</span>
            </label>
          </div>
          <div className="form-actions">
            <Button
              className="button button-primary"
              data-testid="incremental-run"
              onPress={() => onRun(pins())}
              isDisabled={visual === 'pending'}
            >
              부분 재정리
            </Button>
            {visual === 'pending' && (
              <Button className="button button-secondary" data-testid="incremental-cancel" onPress={onCancel}>
                취소
              </Button>
            )}
            {visual === 'error' && (
              <Button
                className="button button-secondary"
                data-testid="incremental-retry"
                onPress={() => onRun(pins())}
              >
                다시 시도
              </Button>
            )}
            {visual === 'ready' && shown?.outcome.kind === 'published' && (
              <Button className="button button-secondary" data-testid="incremental-adopt" onPress={onAdopt}>
                이 계획으로 바꾸기
              </Button>
            )}
          </div>
        </>
      )}
      {shown && (visual === 'ready' || visual === 'blocked') && (
        <>
          <p data-testid="incremental-reused">{reusedPassText(shown.reusedPass)}</p>
          <p data-testid="incremental-ids">
            이전 계획 {shown.diff.previousSnapshotId.slice(0, 8)}
            {' · '}
            새 계획 {shown.diff.nextSnapshotId ? shown.diff.nextSnapshotId.slice(0, 8) : '만들지 않음'}
            {' · '}
            읽기 모형 {shown.readModelVersion}
          </p>
          <p>{shown.diff.strategyChanged ? '전략이 바뀌었습니다' : '전략은 바꾸지 않았습니다'}</p>
          <p data-testid="incremental-moved">
            {shown.diff.movedPlacementIds.length === 0
              ? '옮긴 배치 없음'
              : `옮긴 배치 ${shown.diff.movedPlacementIds.join(', ')}`}
          </p>
          <ul className="incremental-list" data-testid="incremental-kept">
            {shown.diff.kept.map((row) => (
              <li key={row.id} className="pareto-diff">
                유지 {row.id} {row.x}, {row.y}, {row.z} mm
              </li>
            ))}
          </ul>
          <p>
            뺀 배치{' '}
            {shown.diff.removed.length === 0
              ? '없음'
              : shown.diff.removed.map((row) => `${row.id} ${row.x}, ${row.y}, ${row.z} mm`).join(' · ')}
          </p>
          <p data-testid="incremental-unassigned">
            미배정{' '}
            {shown.diff.unassignedItemIds.length === 0
              ? '없음'
              : shown.diff.unassignedItemIds.map((id) => itemName(id)).join(', ')}
          </p>
          {shown.verificationScope.length > 0 && (
            <ul data-testid="incremental-scope">
              {shown.verificationScope.map((subject, index) => (
                <li key={`${subject.subjectId}:${subject.reasonCode}:${index}`}>
                  {itemName(subject.subjectId)} {scopeReasonText(subject.reasonCode)}
                </li>
              ))}
            </ul>
          )}
          <ul data-testid="incremental-fresh">
            {shown.freshChecks.map((check) => (
              <li key={check.id} data-testid="incremental-check" data-status={check.status}>
                {check.id} {checkStatusText(check.status)}
              </li>
            ))}
          </ul>
          {visual === 'blocked' && (
            <>
              <ul data-testid="incremental-conflicts">
                {shown.conflicts.map((conflict, index) => (
                  <li key={`${conflict.code}:${index}`} className="pareto-held" data-code={conflict.code}>
                    {conflictText(conflict.code)}
                  </li>
                ))}
              </ul>
              <div className="form-actions">
                {shown.releasable.map((pin) => (
                  <Button
                    key={releaseKey(pin)}
                    className="button button-secondary"
                    data-testid={`incremental-release-${releaseKey(pin)}`}
                    data-sufficient={String(pin.sufficientAlone)}
                    onPress={() => release(pin)}
                  >
                    {releaseLabel(pin)}
                  </Button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function releaseKey(pin: ReleasablePin): string {
  return `${pin.kind}-${pin.id ?? 'strategy'}`;
}

function placementCaption(placement: Placement, itemName: (id: string) => string): string {
  const subject = placement.subject;
  const name = subjectName(subject, itemName);
  return `${name} ${subject.unitOrdinal + 1} · ${placement.id}`;
}

function subjectName(subject: Placement['subject'], itemName: (id: string) => string): string {
  if (subject.kind === 'directItem') return itemName(subject.itemId);
  if (subject.kind === 'ownedContainer') return '보유 용기';
  return '새 용기';
}
