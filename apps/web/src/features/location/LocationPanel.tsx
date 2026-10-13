import { useEffect, useState, type FormEvent } from 'react';
import type {
  LocationLog,
  LocationSearchReply,
  ObservationKind,
  PlanSnapshot,
  ProjectInput,
} from '../../contracts/generated/dto';
import { repository, workerController } from '../../app/sessionRegistry';
import { EMPTY_LOG, LocationController } from './controller';
import { quantityPhrase } from '../inventory/phrases';
import { kindPhrase, ordinalsPhrase, plannedPhrase, statusPhrase } from './phrases';

const controller = new LocationController(workerController, repository);

type PanelState = 'empty' | 'pending' | 'saved' | 'read' | 'error';

function observationId(): string {
  return `obs-${crypto.randomUUID()}`;
}

function parseOrdinals(text: string): number[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (!/^\d+(\s*[, ]\s*\d+)*$/.test(trimmed)) return null;
  return trimmed.split(/[,\s]+/).map(Number);
}

/**
 * Local item finder for one project. Rust computes rows from the project's
 * input, the adopted snapshot, and the recorded location log — a planned
 * location never renders as an actual one. Nothing is indexed globally.
 */
export function LocationPanel({
  projectId,
  input,
  snapshot,
}: {
  projectId: string;
  input: ProjectInput | null;
  snapshot: PlanSnapshot | null;
}) {
  const [log, setLog] = useState<LocationLog>(EMPTY_LOG);
  const [revision, setRevision] = useState('0');
  const [reply, setReply] = useState<LocationSearchReply | null>(null);
  const [panel, setPanel] = useState<PanelState>('pending');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [itemId, setItemId] = useState('');
  const [kind, setKind] = useState<ObservationKind>('confirm');
  const [locationText, setLocationText] = useState('');
  const [aliasText, setAliasText] = useState('');
  const [ordinalsText, setOrdinalsText] = useState('');

  const items = input?.items ?? [];
  const noInput = input === null;

  async function runSearch(searchLog: LocationLog, text: string) {
    if (!input) return;
    const result = await controller.search(input, snapshot, searchLog, text);
    setReply(result);
  }

  useEffect(() => {
    let alive = true;
    setPanel('pending');
    void (async () => {
      try {
        const row = await controller.load(projectId);
        if (!alive) return;
        const current = row?.log ?? EMPTY_LOG;
        setLog(current);
        setRevision(row?.revision ?? '0');
        if (input) await runSearch(current, '');
        if (!alive) return;
        setPanel(current.observations.length === 0 ? 'empty' : 'read');
        setError(null);
      } catch (caught) {
        if (!alive) return;
        setPanel('error');
        setError(caught instanceof Error ? caught.message : 'failed');
      }
    })();
    return () => {
      alive = false;
    };
    // The log loads once per project; search reruns through its own effect.
  }, [projectId]);

  useEffect(() => {
    if (!input || panel === 'pending') return;
    let alive = true;
    void (async () => {
      try {
        const result = await controller.search(input, snapshot, log, query);
        if (alive) setReply(result);
      } catch {
        /* a plan change leaves the last honest rows; the next search retries */
      }
    })();
    return () => {
      alive = false;
    };
    // Snapshot and input changes make the last rows stale, so they rerun.
  }, [input, snapshot]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (!input) return;
    setPanel('pending');
    setError(null);
    void runSearch(log, query)
      .then(() => setPanel(log.observations.length === 0 ? 'empty' : 'read'))
      .catch((caught) => {
        setPanel('error');
        setError(caught instanceof Error ? caught.message : 'failed');
      });
  }

  function record(event: FormEvent) {
    event.preventDefault();
    if (!input) return;
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) {
      setPanel('error');
      setError('subject_missing');
      return;
    }
    if (kind === 'alias' && aliasText.trim() === '') {
      setPanel('error');
      setError('invalid_label');
      return;
    }
    if ((kind === 'relocate' || kind === 'reorganize') && locationText.trim() === '') {
      setPanel('error');
      setError('location_required');
      return;
    }
    const unitOrdinals = kind === 'alias' ? [] : parseOrdinals(ordinalsText);
    if (unitOrdinals === null) {
      setPanel('error');
      setError('invalid_input');
      return;
    }
    setPanel('pending');
    setError(null);
    void controller
      .record(projectId, log, revision, input, snapshot, {
        id: observationId(),
        itemId: item.id,
        kind,
        label: kind === 'alias' ? aliasText : item.label,
        location: kind === 'relocate' || kind === 'reorganize' ? locationText : null,
        unitOrdinals,
        planSnapshotId: null,
      })
      .then(async (result) => {
        if (result.persisted) {
          setLog(result.reply.log);
          setRevision(result.revision);
          await runSearch(result.reply.log, query);
        }
        setPanel('saved');
        setLocationText('');
        setAliasText('');
        setOrdinalsText('');
      })
      .catch((caught) => {
        setPanel('error');
        setError(caught instanceof Error ? caught.message : 'failed');
      });
  }

  const statusText =
    panel === 'pending'
      ? '확인 중'
      : panel === 'saved'
        ? '저장됨'
        : panel === 'error'
          ? '저장하지 않음'
          : panel === 'empty'
            ? '관측 기록이 없습니다'
            : '읽기 전용 결과';

  const rows = reply?.rows ?? [];

  return (
    <section
      className="measurement-panel location-panel"
      aria-labelledby="location-title"
      data-testid="location-panel"
    >
      <div className="section-kicker">02.7 · 물건 찾기</div>
      <h2 id="location-title">내 물건 찾기</h2>
      <p className="session-note" data-testid="location-status" data-state={panel} role="status">
        {statusText}
      </p>
      {error && (
        <p className="session-note" data-testid="location-error" data-reason={error}>
          {error}
        </p>
      )}
      {noInput && (
        <p className="session-note" data-testid="location-no-input">
          정규화된 입력이 없습니다. 입력을 정규화하면 물건을 찾을 수 있습니다.
        </p>
      )}
      {panel === 'empty' && !noInput && (
        <p className="session-note" data-testid="location-empty">
          관측 기록이 없습니다. 계획 위치는 실행 전까지 실제 위치가 아닙니다.
        </p>
      )}
      <form onSubmit={submitSearch} data-testid="location-search-form">
        <label className="field">
          <span className="field-label">검색 (이름 · 별칭 · 분류 · 수량 · 위치)</span>
          <input
            type="text"
            value={query}
            data-testid="location-query"
            onChange={(event) => setQuery(event.target.value)}
            disabled={noInput}
          />
        </label>
        <button
          className="button button-primary"
          type="submit"
          data-testid="location-search"
          disabled={noInput || panel === 'pending'}
        >
          찾기
        </button>
      </form>
      {reply !== null && rows.length === 0 && !noInput && (
        <p className="session-note" data-testid="location-no-results">
          검색 결과가 없습니다.
        </p>
      )}
      <ul className="plan-list" data-testid="location-rows">
        {rows.map((row) => (
          <li
            key={`${row.itemId}:${row.unitOrdinals.join('-')}`}
            data-testid={`location-row-${row.itemId}-${row.unitOrdinals.join('-')}`}
            data-status={row.status}
          >
            <span className="location-row-head">
              <strong>{row.label}</strong>
              <span className="session-note">
                {' '}
                · {row.category} ·{' '}
                {quantityPhrase(row.quantityCode, row.quantityCount)} ·{' '}
                {ordinalsPhrase(row.unitOrdinals, row.quantityCount)}
                {row.matchedAlias ? ` · 별칭 ${row.matchedAlias}` : ''}
              </span>
            </span>
            <span className="location-row-body">
              <span className="location-status" data-status={row.status}>
                {statusPhrase(row.status)}
              </span>
              {row.planned && (
                <span className="session-note"> 계획: {plannedPhrase(row.planned)}</span>
              )}
              {row.observed?.location && (
                <span className="session-note"> 관측: {row.observed.location}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {reply?.truncated && (
        <p className="session-note" data-testid="location-truncated">
          결과가 많아 앞 128건만 보입니다.
        </p>
      )}
      <form onSubmit={record} data-testid="location-record-form">
        <label className="field">
          <span className="field-label">물건</span>
          <select
            value={itemId}
            data-testid="location-item"
            onChange={(event) => setItemId(event.target.value)}
            disabled={noInput}
          >
            <option value="">선택</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">관측</span>
          <select
            value={kind}
            data-testid="location-kind"
            onChange={(event) => setKind(event.target.value as ObservationKind)}
            disabled={noInput}
          >
            <option value="confirm">{kindPhrase('confirm')}</option>
            <option value="relocate">{kindPhrase('relocate')}</option>
            <option value="reorganize">{kindPhrase('reorganize')}</option>
            <option value="lost">{kindPhrase('lost')}</option>
            <option value="alias">{kindPhrase('alias')}</option>
          </select>
        </label>
        {kind === 'alias' ? (
          <label className="field">
            <span className="field-label">별칭 이름</span>
            <input
              type="text"
              value={aliasText}
              data-testid="location-alias"
              onChange={(event) => setAliasText(event.target.value)}
              disabled={noInput}
            />
          </label>
        ) : (
          <label className="field">
            <span className="field-label">
              단위 번호 (비우면 전체; 0부터, 쉼표·공백으로 구분)
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={ordinalsText}
              data-testid="location-ordinals"
              onChange={(event) => setOrdinalsText(event.target.value)}
              disabled={noInput}
            />
          </label>
        )}
        {(kind === 'relocate' || kind === 'reorganize') && (
          <label className="field">
            <span className="field-label">실제 위치</span>
            <input
              type="text"
              value={locationText}
              data-testid="location-place"
              onChange={(event) => setLocationText(event.target.value)}
              disabled={noInput}
            />
          </label>
        )}
        <button
          className="button button-secondary"
          type="submit"
          data-testid="location-record"
          disabled={noInput || panel === 'pending' || itemId === ''}
        >
          관측 기록
        </button>
      </form>
    </section>
  );
}
