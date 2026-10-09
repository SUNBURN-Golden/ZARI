import { Button } from 'react-aria-components';
import type { SearchDiagnosticReply } from '../../contracts/generated/dto';
import type { DiagnosticPanelState } from './controller';
import {
  budgetText,
  classHeading,
  classSentence,
  operationText,
  presentText,
  supportCodeText,
  supportStatusText,
} from './phrases';

/**
 * Rust's separation of an empty catalog, geometry outside the model, an
 * unsettled measurement, and a budget that ran out. The page does not
 * reclassify those rows.
 */
export function SearchDiagnosticPanel({
  search,
  selectedId,
  state,
  reply,
  error,
  ignored,
  onCancel,
  onRetry,
}: {
  search: string;
  selectedId: string | null;
  state: DiagnosticPanelState;
  reply: SearchDiagnosticReply | null;
  error: string | null;
  ignored: number;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const shown = state === 'ready' ? reply : null;
  let visual: DiagnosticPanelState | 'running';
  if (search === 'idle' || search === 'failed') visual = 'empty';
  else if (state === 'pending' || state === 'cancelled' || state === 'error') visual = state;
  else if (shown) visual = 'ready';
  else if (search === 'running' || search === 'cancelling') visual = 'running';
  else visual = 'idle';

  const finding = (kind: SearchDiagnosticReply['classes'][number]['class']) =>
    shown?.classes.find((row) => row.class === kind);
  const noProduct = finding('noProduct')?.present === true;
  const undetermined = finding('undetermined')?.present === true;
  const geometry = finding('geometryOutOfRange')?.present === true;
  const budget = finding('budgetExhausted')?.present === true;
  const unfinished = finding('searchNotFinished')?.present === true;

  const download = () => {
    if (!shown) return;
    const blob = new Blob([JSON.stringify(shown.reproduction, null, 1)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'zari-search-reproduction.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <section
      className="search-diagnostics"
      data-testid="search-diagnostics"
      data-state={visual}
      data-selected-id={selectedId ?? ''}
      data-proves-impossible={shown ? String(shown.provesImpossible) : ''}
      data-budget-proof={shown ? String(shown.budgetSuggestionIsProof) : ''}
      data-larger-budget={shown ? String(shown.largerBudgetSuggested) : ''}
      data-no-product={shown ? String(noProduct) : ''}
      data-undetermined={shown ? String(undetermined) : ''}
      data-geometry={shown ? String(geometry) : ''}
      data-budget={shown ? String(budget) : ''}
      data-unfinished={shown ? String(unfinished) : ''}
      data-read-model={shown?.readModelVersion ?? ''}
      data-ignored={String(ignored)}
      aria-labelledby="search-diagnostics-title"
    >
      <h3 id="search-diagnostics-title">해 없음·측정 부족·탐색 미완료</h3>
      {visual === 'empty' && (
        <p data-testid="diagnostic-empty">
          아직 계산하지 않았습니다. 계산이 끝나면 실패 이유를 구분합니다.
        </p>
      )}
      {visual === 'running' && (
        <p data-testid="diagnostic-running" role="status">
          계산이 끝나면 제품 없음, 범위 밖 기하, 확정 불가능, 예산 소진을 구분합니다.
        </p>
      )}
      {visual === 'idle' && (
        <p data-testid="diagnostic-idle">계산 결과를 아직 진단하지 않았습니다.</p>
      )}
      {visual === 'pending' && (
        <p data-testid="diagnostic-status" role="status">
          실패 이유를 구분하고 있습니다…
        </p>
      )}
      {visual === 'cancelled' && (
        <p data-testid="diagnostic-status" role="status">
          진단을 취소했습니다. 고른 계획은 그대로입니다.
        </p>
      )}
      {ignored > 0 && (
        <p data-testid="diagnostic-ignored" role="status">
          늦은 응답은 고른 계획을 바꾸지 않았습니다.
        </p>
      )}
      {visual === 'error' && (
        <p className="field-error" role="alert" data-testid="diagnostic-error">
          실패 이유를 구분하지 못했습니다. {operationText(error)}
        </p>
      )}
      {shown && visual === 'ready' && (
        <>
          <p data-testid="budget-claim">
            {budgetText(shown.largerBudgetSuggested, budget, shown.budgetSuggestionIsProof)}
          </p>
          <p data-testid="no-product-claim">{classSentence('noProduct', noProduct, undetermined)}</p>
          <table className="diagnostic-table" data-testid="diagnostic-classes">
            <caption>실패 구분</caption>
            <thead>
              <tr>
                <th scope="col">구분</th>
                <th scope="col">해당</th>
                <th scope="col">설명</th>
              </tr>
            </thead>
            <tbody>
              {shown.classes.map((row) => (
                <tr
                  key={row.class}
                  data-testid="diagnostic-class"
                  data-class={row.class}
                  data-present={String(row.present)}
                  className={row.present ? 'pareto-held' : undefined}
                >
                  <th scope="row">{classHeading(row.class)}</th>
                  <td>{presentText(row.present)}</td>
                  <td>{classSentence(row.class, row.present, undetermined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pareto-scroll">
            <table className="diagnostic-table" data-testid="support-range">
              <caption>지원 범위</caption>
              <thead>
                <tr>
                  <th scope="col">범위</th>
                  <th scope="col">상태</th>
                </tr>
              </thead>
              <tbody>
                {shown.support.map((row) => (
                  <tr
                    key={row.code}
                    data-testid="support-row"
                    data-code={row.code}
                    data-status={row.status}
                    className={
                      row.status === 'outsideModel' || row.status === 'exhausted'
                        ? 'pareto-held'
                        : 'pareto-diff'
                    }
                  >
                    <th scope="row">{supportCodeText(row.code)}</th>
                    <td>{supportStatusText(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="session-note" data-testid="budget-account">
            작업 {shown.budgetAccount.consumedWorkUnits} / {shown.budgetAccount.maxWorkUnits}
            {' · '}
            노드 {shown.budgetAccount.consumedNodes} / {shown.budgetAccount.maxNodes}
          </p>
          <h4>다음에 확인할 사실</h4>
          {shown.nextChecks.length === 0 ? (
            <p data-testid="next-checks-empty">연결된 측정 질문이 없습니다.</p>
          ) : (
            <ul className="diagnostic-checks" data-testid="next-checks">
              {shown.nextChecks.map((link) => (
                <li
                  key={`${link.class}:${link.reasonCode}:${link.factKeys.join(',')}:${link.fieldPaths.join(',')}`}
                  data-testid="next-check"
                  data-class={link.class}
                >
                  <span>{classHeading(link.class)}</span>
                  {link.factKeys.length > 0 && (
                    <span data-testid="next-check-facts">{link.factKeys.join(', ')}</span>
                  )}
                  {link.fieldPaths.length > 0 && <span>{link.fieldPaths.join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
          {shown.nextChecksTruncated && (
            <p data-testid="next-checks-truncated">측정 질문이 길어 앞부분만 표시합니다.</p>
          )}
          <div className="form-actions">
            <Button
              className="button button-secondary"
              data-testid="diagnostic-export"
              onPress={download}
            >
              재현 자료 내보내기
            </Button>
            <Button className="button button-quiet" data-testid="diagnostic-retry" onPress={onRetry}>
              다시 구분
            </Button>
          </div>
        </>
      )}
      {visual === 'pending' && (
        <div className="form-actions">
          <Button className="button button-secondary" data-testid="diagnostic-cancel" onPress={onCancel}>
            진단 취소
          </Button>
        </div>
      )}
      {(visual === 'cancelled' || visual === 'error') && (
        <div className="form-actions">
          <Button className="button button-secondary" data-testid="diagnostic-retry" onPress={onRetry}>
            다시 구분
          </Button>
        </div>
      )}
    </section>
  );
}
