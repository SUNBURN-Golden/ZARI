import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from 'react-aria-components';
import type { NextFactRow } from '../../contracts/generated/dto';
import { nextFactDestination, type NextFactsView } from './nextFacts';

const NEED_LABEL: Record<NextFactRow['needKind'], string> = {
  missingNominal: '값을 입력',
  missingBound: '오차 범위를 입력',
  missingEvidence: '근거를 확인',
  conflictingEvidence: '서로 다른 기록',
  unsupportedInput: '지원되지 않는 입력',
  repairKnownFailure: '다시 측정',
};

const PRIORITY_LABEL: Record<NextFactRow['priorityClass'], string> = {
  repairKnownFailure: '수정',
  requiredPhysicalUnknown: '치수',
  quantityCompleteness: '수량',
  procurementUnknown: '자료',
  softOrUnsupported: '범위',
};

type NextFactsListProps = {
  view: NextFactsView;
  onRecompile: () => void;
  onField: (path: string) => void;
  onCatalog: (path: string) => void;
};

export function NextFactsList({ view, onRecompile, onField, onCatalog }: NextFactsListProps) {
  const [active, setActive] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    setActive(0);
  }, [view.sourceKey, view.status]);

  const activate = (row: NextFactRow) => {
    const destination = nextFactDestination(row);
    if (destination.kind === 'field') onField(destination.path);
    else if (destination.kind === 'catalog') onCatalog(destination.path);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (view.rows.length === 0) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = (active + delta + view.rows.length) % view.rows.length;
    setActive(next);
    buttons.current[next]?.focus();
  };

  return (
    <section
      className="next-facts"
      aria-labelledby="next-facts-title"
      data-testid="next-facts"
      data-next-facts-status={view.status}
      data-next-facts-reason={view.reason ?? ''}
      data-next-facts-freshness={view.freshness ?? ''}
      data-next-facts-requests={view.requests}
      data-next-facts-rows={view.rows.length}
      data-next-facts-roundtrip-ms={view.roundTripMs === null ? '' : String(Math.round(view.roundTripMs))}
    >
      <h3 id="next-facts-title">다음에 확인할 사실</h3>
      {view.status === 'stale' && view.reason === 'draft' && (
        <p className="next-facts-stale" data-testid="next-facts-stale">
          입력이 바뀌었습니다. 저장한 뒤 다시 확인하면 목록을 새로 받습니다.
        </p>
      )}
      {view.status === 'stale' && view.reason === 'committed' && (
        <p className="next-facts-stale" data-testid="next-facts-stale">
          저장한 입력이 바뀌었습니다. 다시 확인을 누르면 그 입력의 목록을 받습니다.
        </p>
      )}
      {view.status === 'stale' && view.reason === 'worker' && (
        <p className="next-facts-stale" data-testid="next-facts-stale">
          계산기가 바뀌었습니다. 다시 연결한 뒤 같은 입력으로 목록을 받습니다.
        </p>
      )}
      {view.status === 'limited' && (
        <p className="next-facts-stale" data-testid="next-facts-limit">
          확인 목록이 한도를 넘었습니다. 일부를 빼서 성공으로 보이지 않습니다.
        </p>
      )}
      {view.status === 'failed' && (
        <p className="field-error" data-testid="next-facts-failed">
          목록을 받지 못했습니다.
        </p>
      )}
      {view.status === 'ready' && view.freshness === 'stale' && (
        <p className="next-facts-stale" data-testid="next-facts-snapshot-stale">
          표시 중인 계획은 현재 입력과 맞지 않습니다. 현재 검사를 빌리지 않습니다.
        </p>
      )}
      {view.status === 'ready' && view.freshness === 'inputOnly' && (
        <p data-testid="next-facts-input-only">
          아직 계산된 계획이 없습니다. 입력에서 비어 있는 값만 보여 줍니다.
        </p>
      )}
      <ul className="next-facts-list" data-testid="next-facts-list" onKeyDown={onKeyDown}>
        {view.rows.map((row, index) => {
          const destination = nextFactDestination(row);
          const label = `${PRIORITY_LABEL[row.priorityClass]}. ${NEED_LABEL[row.needKind]}. ${row.fieldRefs[0]?.fieldPath ?? row.factKey}`;
          return (
            <li key={row.factKey}>
              <button
                type="button"
                className="next-fact-row"
                data-testid={`next-fact-${row.factKey}`}
                data-field-path={row.fieldRefs[0]?.fieldPath ?? ''}
                data-need={row.needKind}
                data-priority={row.priorityClass}
                data-destination={destination.kind}
                tabIndex={index === active ? 0 : -1}
                ref={(node) => {
                  buttons.current[index] = node;
                }}
                onClick={() => activate(row)}
              >
                <span>{label}</span>
                {row.relatedCheckCount > 0 && <span>검사 {row.relatedCheckCount}</span>}
                {destination.kind === 'unsupported' && (
                  <span>이 항목은 측정 칸으로 열리지 않습니다.</span>
                )}
                {destination.kind === 'catalog' && <span>자료 화면에서 봅니다.</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <Button className="button button-secondary" data-testid="recompile-next-facts" onPress={onRecompile}>
        다시 확인
      </Button>
    </section>
  );
}
