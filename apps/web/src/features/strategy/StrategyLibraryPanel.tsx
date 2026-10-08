import { useId, useState } from 'react';
import type { Strategy, StrategyLibraryReply } from '../../contracts/generated/dto';
import { Button } from 'react-aria-components';
import {
  accessText,
  messageText,
  primitiveText,
  quantityText,
  retrievalText,
  statementText,
  strategyName,
  unassignedReasonText,
} from './phrases';

type PanelState = 'idle' | 'pending' | 'ready' | 'empty' | 'error';

/**
 * Comparison of the saved strategy. Rust owns the rules, the dedup, and the
 * unassigned quantities. A draft radio change does not move the pinned row.
 */
export function StrategyLibraryPanel({
  state,
  reply,
  error,
  draftStrategy,
  labels,
  onRetry,
  onCommit,
}: {
  state: PanelState;
  reply: StrategyLibraryReply | null;
  error: string | null;
  draftStrategy: Strategy | null;
  labels: ReadonlyMap<string, string>;
  onRetry: () => void;
  onCommit: () => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState<string | null>(null);
  if (state === 'idle') return null;
  const pinned = reply?.pinnedStrategy ?? null;
  const held = reply !== null && draftStrategy !== null && draftStrategy !== pinned;
  const expanded = (strategy: string, selected: boolean) =>
    open === null ? selected : open === strategy;

  return (
    <section
      className="strategy-library"
      data-testid="strategy-library"
      data-state={state}
      data-pinned={pinned ?? ''}
      data-changed={reply ? String(reply.strategyChanged) : ''}
      data-stale={held ? 'true' : 'false'}
      aria-labelledby={titleId}
    >
      <h3 id={titleId}>전략 비교</h3>
      {state === 'pending' && (
        <p data-testid="strategy-library-status" role="status">
          비교를 계산하고 있습니다…
        </p>
      )}
      {state === 'error' && (
        <>
          <p className="field-error" role="alert" data-testid="strategy-library-error">
            비교를 만들지 못했습니다. {error ?? ''}
          </p>
          <Button className="button button-secondary" data-testid="strategy-library-retry" onPress={onRetry}>
            다시 비교
          </Button>
        </>
      )}
      {state === 'empty' && (
        <p data-testid="strategy-library-empty">비교할 레시피가 없습니다.</p>
      )}
      {state === 'ready' && reply && (
        <>
          <p className="strategy-library-pin" data-testid="strategy-library-pin">
            저장된 전략 {strategyName(reply.pinnedStrategy)}. 라이브러리 {reply.libraryVersion}.
          </p>
          {reply.strategyChanged && (
            <p role="alert" data-testid="strategy-library-changed">
              저장된 전략이 비교 중에 바뀌었습니다.
            </p>
          )}
          {held && (
            <div className="strategy-library-held" role="status" data-testid="strategy-library-held">
              <p>화면에서 고른 전략은 아직 저장되지 않았습니다. 비교는 저장된 전략을 유지합니다.</p>
              <Button
                className="button button-secondary"
                data-testid="strategy-library-save"
                onPress={onCommit}
              >
                이 선택 저장
              </Button>
            </div>
          )}
          <p data-testid="strategy-library-dropped">
            {reply.droppedWordingDuplicates > 0
              ? `문구만 같은 결과 ${reply.droppedWordingDuplicates}개를 뺐습니다.`
              : '문구만 같은 결과는 없습니다.'}
          </p>
          <h4>강제 제약</h4>
          <ul data-testid="strategy-hard">
            {reply.hardConstraints.map((row, index) => (
              <li key={`${row.code}-${index}`}>{statementText(row)}</li>
            ))}
          </ul>
          <h4>시각적 취향</h4>
          <ul data-testid="strategy-visual">
            {reply.visualPreferences.map((row, index) => (
              <li key={`${row.code}-${index}`}>{statementText(row)}</li>
            ))}
          </ul>
          <h4>레시피</h4>
          <ul className="strategy-recipes">
            {reply.recipes.map((recipe) => (
              <li key={recipe.id} data-selected={recipe.selected ? 'true' : 'false'}>
                <Button
                  className="button button-quiet"
                  data-testid={`strategy-rules-${recipe.strategy}`}
                  aria-expanded={expanded(recipe.strategy, recipe.selected)}
                  onPress={() =>
                    setOpen(
                      expanded(recipe.strategy, recipe.selected) ? '' : recipe.strategy,
                    )
                  }
                >
                  {strategyName(recipe.strategy)}
                  {recipe.selected ? ' · 사용 중' : ''} · 버전 {recipe.version}
                </Button>
                <p>
                  {recipe.primitives.map(primitiveText).join(', ')}. 묶음{' '}
                  {recipe.groupIds.join(', ') || '없음'}. {accessText(recipe.accessCode)}{' '}
                  {recipe.retrievals.map(retrievalText).join(', ')}.
                </p>
                {expanded(recipe.strategy, recipe.selected) && (
                  <p data-testid={`strategy-rule-ids-${recipe.strategy}`}>
                    규칙 {recipe.ruleIds.join(', ') || '없음'}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <h4>차이</h4>
          <ul data-testid="strategy-alternatives">
            {reply.alternatives.map((row) => (
              <li key={row.strategy}>
                <strong>{strategyName(row.strategy)}</strong>
                <span>
                  {' '}
                  {row.messageKeys.map(messageText).join(' · ')} 규칙 {row.ruleIds.join(', ')}
                </span>
              </li>
            ))}
          </ul>
          <p data-testid="strategy-candidates">
            배치 후보 {reply.candidateItemIds.length}개. 배치 완료가 아닙니다.
          </p>
          <h4>미배정</h4>
          {reply.unassigned.length === 0 ? (
            <p data-testid="strategy-unassigned-empty">이 레시피가 받지 못하는 물건은 없습니다.</p>
          ) : (
            <table className="bom-table" data-testid="strategy-unassigned">
              <thead>
                <tr>
                  <th>물건</th>
                  <th>수량</th>
                  <th>이유</th>
                </tr>
              </thead>
              <tbody>
                {reply.unassigned.map((row) => (
                  <tr key={row.itemId} data-testid={`unassigned-${row.itemId}`}>
                    <td>{labels.get(row.itemId) ?? row.itemId}</td>
                    <td data-testid={`unassigned-count-${row.itemId}`}>{quantityText(row.quantity)}</td>
                    <td>{unassignedReasonText(row.reasonCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
