import { useId, useState } from 'react';
import { Button } from 'react-aria-components';
import type { ParetoReply, ParetoRow, Strategy } from '../../contracts/generated/dto';
import { strategyName } from '../strategy/phrases';
import {
  optimalityText,
  paretoCountText,
  paretoItemQuantityText,
  paretoMoneyText,
} from './phrases';

type PanelState = 'idle' | 'pending' | 'ready' | 'empty' | 'error';

/**
 * Side-by-side differences from the Rust Pareto reply. The page does not
 * decide dominance, treat unknown as zero, or call a finished budget optimal.
 */
export function ParetoPanel({
  state,
  reply,
  error,
  draftStrategy,
  savedStrategy,
  labels,
  selectedId,
  onSelect,
  onRecalculate,
  onRetry,
}: {
  state: PanelState;
  reply: ParetoReply | null;
  error: string | null;
  draftStrategy: Strategy | null;
  savedStrategy: Strategy | null;
  labels: ReadonlyMap<string, string>;
  selectedId: string | null;
  onSelect: (candidateId: string) => void;
  onRecalculate: () => void;
  onRetry: () => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState<string | null>(null);
  if (state === 'idle') return null;
  const held =
    reply !== null && draftStrategy !== null && savedStrategy !== null && draftStrategy !== savedStrategy;
  const askAgain = held || reply?.recalculationRequired === true;

  return (
    <section
      className="pareto-compare"
      data-testid="pareto-compare"
      data-state={state}
      data-global-optimum={reply ? String(reply.globalOptimum) : ''}
      data-optimality={reply?.optimality ?? ''}
      data-recalculation={reply ? String(reply.recalculationRequired) : ''}
      data-stale={held ? 'true' : 'false'}
      aria-labelledby={titleId}
    >
      <h3 id={titleId}>대안 비교</h3>
      {state === 'pending' && (
        <p data-testid="pareto-status" role="status">
          비교를 계산하고 있습니다…
        </p>
      )}
      {state === 'error' && (
        <>
          <p className="field-error" role="alert" data-testid="pareto-error">
            비교를 만들지 못했습니다. {error ?? ''}
          </p>
          <Button className="button button-secondary" data-testid="pareto-retry" onPress={onRetry}>
            다시 비교
          </Button>
        </>
      )}
      {state === 'empty' && <p data-testid="pareto-empty">비교할 안이 없습니다.</p>}
      {state === 'ready' && reply && (
        <>
          <p data-testid="pareto-optimality">{optimalityText(reply.optimality)}</p>
          <p data-testid="pareto-goal">
            저장된 목표 {strategyName(reply.goal)}. 읽기 모형 {reply.readModelVersion}.
          </p>
          {held && (
            <div className="pareto-held" role="status" data-testid="pareto-held">
              <p>화면에서 고른 목표는 아직 저장되지 않았습니다. 비교는 저장된 목표를 유지합니다.</p>
            </div>
          )}
          {reply.recalculationRequired && (
            <p role="status" data-testid="pareto-recalc">
              목표·입력·예산·시드가 후보와 다릅니다. 이 결과를 전역 최적해로 두지 않습니다.
            </p>
          )}
          {askAgain && (
            <Button
              className="button button-secondary"
              data-testid="pareto-recalculate"
              onPress={onRecalculate}
            >
              이 목표로 다시 계산
            </Button>
          )}
          <div className="pareto-scroll">
            <table className="bom-table" data-testid="pareto-front">
              <thead>
                <tr>
                  <th>안</th>
                  <th>구매비</th>
                  <th>재사용</th>
                  <th>선행 이동</th>
                  <th>미배정</th>
                  <th>수량 미확인</th>
                  <th>미확인 조건</th>
                </tr>
              </thead>
              <tbody>
                {reply.front.map((row, index) => (
                  <Row
                    key={row.candidateId}
                    row={row}
                    index={index}
                    selected={selectedId === row.candidateId}
                    open={open === row.candidateId}
                    labels={labels}
                    onSelect={onSelect}
                    onToggle={() => setOpen(open === row.candidateId ? null : row.candidateId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {reply.front.length === 0 && (
            <p data-testid="pareto-front-empty">앞에 남은 안이 없습니다.</p>
          )}
          {reply.dominated.length > 0 && (
            <>
              <h4>지배된 안</h4>
              <div className="pareto-scroll">
                <table className="bom-table" data-testid="pareto-dominated">
                  <tbody>
                    {reply.dominated.map((row) => (
                      <tr key={row.candidateId}>
                        <td>{shortId(row.candidateId)}</td>
                        <td data-money={row.purchase.state}>{paretoMoneyText(row.purchase)}</td>
                        <td>{paretoCountText(row.reuse)}</td>
                        <td data-moves={row.precedingMoves.state}>{paretoCountText(row.precedingMoves)}</td>
                        <td>{row.unassignedInstances}</td>
                        <td>{row.unknownQuantityItems}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {reply.excluded.length > 0 && (
            <>
              <h4>제외</h4>
              <ul className="pareto-excluded" data-testid="pareto-excluded">
                {reply.excluded.map((row) => (
                  <li key={row.candidateId} data-testid={`pareto-excluded-${row.candidateId}`}>
                    {shortId(row.candidateId)} {paretoMoneyText(row.purchase)} {row.reasonCode}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Row({
  row,
  index,
  selected,
  open,
  labels,
  onSelect,
  onToggle,
}: {
  row: ParetoRow;
  index: number;
  selected: boolean;
  open: boolean;
  labels: ReadonlyMap<string, string>;
  onSelect: (candidateId: string) => void;
  onToggle: () => void;
}) {
  return (
    <>
      <tr data-candidate={row.candidateId} data-selected={selected ? 'true' : 'false'}>
        <td>
          <Button
            className="button button-quiet"
            data-testid={`pareto-select-${index}`}
            onPress={() => onSelect(row.candidateId)}
          >
            #{index + 1} {shortId(row.candidateId)}
          </Button>
        </td>
        <Metric different={row.difference.purchase} testId={`pareto-purchase-${index}`} money={row.purchase.state}>
          {paretoMoneyText(row.purchase)}
        </Metric>
        <Metric different={row.difference.reuse} testId={`pareto-reuse-${index}`}>
          {paretoCountText(row.reuse)}
        </Metric>
        <Metric
          different={row.difference.precedingMoves}
          testId={`pareto-moves-${index}`}
          moves={row.precedingMoves.state}
        >
          {paretoCountText(row.precedingMoves)}
        </Metric>
        <Metric different={row.difference.unassigned} testId={`pareto-unassigned-${index}`}>
          {String(row.unassignedInstances)}
        </Metric>
        <Metric different={row.difference.unknownQuantity} testId={`pareto-unknown-qty-${index}`}>
          {String(row.unknownQuantityItems)}
        </Metric>
        <td>
          <Button
            className="button button-quiet"
            data-testid={`pareto-conditions-${index}`}
            aria-expanded={open}
            onPress={onToggle}
          >
            조건 {row.unknownConditions}
            {row.difference.unknownConditions ? ' 다름' : ''}
          </Button>
        </td>
      </tr>
      {open && (
        <tr data-testid={`pareto-detail-${index}`}>
          <td colSpan={7}>
            {row.conditions.length === 0 && row.items.length === 0 ? (
              <p>이 안의 미확인 조건과 미배정 물건은 없습니다.</p>
            ) : (
              <ul>
                {row.conditions.map((condition) => (
                  <li key={condition.id}>
                    {condition.id} {condition.kind} {condition.status} {condition.reasonCode}
                  </li>
                ))}
                {row.items.map((item) => (
                  <li key={item.itemId} data-testid={`pareto-item-${item.itemId}`}>
                    {labels.get(item.itemId) ?? item.itemId} {paretoItemQuantityText(item.quantity)}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Metric({
  different,
  testId,
  money,
  moves,
  children,
}: {
  different: boolean;
  testId: string;
  money?: string;
  moves?: string;
  children: string;
}) {
  return (
    <td
      className={different ? 'pareto-diff' : undefined}
      data-different={different ? 'true' : 'false'}
      data-testid={testId}
      data-money={money}
      data-moves={moves}
    >
      {children}
      {different ? ' 다름' : ''}
    </td>
  );
}

function shortId(id: string): string {
  return id.slice(-6);
}
