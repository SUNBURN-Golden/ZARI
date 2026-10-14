import { useEffect, useId, useState, type FormEvent } from 'react';
import type {
  FeedbackKind,
  FeedbackLog,
  Frequency,
  LocationLog,
  PlanSnapshot,
  ProjectInput,
  ProposalReply,
} from '../../contracts/generated/dto';
import { repository, workerController } from '../../app/sessionRegistry';
import { kindPhrase } from '../location/phrases';
import {
  BUDGET_CHOICES,
  DEFAULT_BUDGET,
  EMPTY_FEEDBACK_LOG,
  EMPTY_LOCATION_LOG,
  FeedbackController,
  type FeedbackPanelState,
} from './controller';
import {
  blockerText,
  frequencyText,
  kindText,
  measureText,
  operationText,
  outcomeText,
  reasonText,
  ruleText,
  statusText,
  swapText,
} from './phrases';

const controller = new FeedbackController(workerController, repository);

type RecordState = 'loading' | 'ready' | 'saving' | 'saved' | 'error';

function feedbackId(): string {
  return `fb-${crypto.randomUUID()}`;
}

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'rare'];
const KINDS: FeedbackKind[] = ['accessDifficulty', 'frequencyChange', 'maintenanceDifficulty'];

/**
 * Use feedback for the adopted plan and the next-arrangement draft Rust makes
 * from it. A recorded entry is a statement, never a decision: nothing is
 * discarded, bought, moved, or adopted until the person says so. The page
 * does not move a placement, rank a draft, or reuse a check status.
 */
export function FeedbackPanel({
  projectId,
  input,
  inputDigest,
  accepted,
  selectedId,
  acceptState,
  state,
  reply,
  error,
  ignored,
  onPropose,
  onCancel,
  onDiscard,
  onOpen,
  onAccept,
}: {
  projectId: string;
  input: ProjectInput | null;
  inputDigest: string | null;
  accepted: PlanSnapshot | null;
  selectedId: string | null;
  acceptState: 'idle' | 'saving' | 'saved' | 'error';
  state: FeedbackPanelState;
  reply: ProposalReply | null;
  error: string | null;
  ignored: number;
  onPropose: (log: FeedbackLog, locations: LocationLog, budget: number) => void;
  onCancel: () => void;
  onDiscard: () => void;
  onOpen: () => void;
  onAccept: (planSnapshotId: string) => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const [log, setLog] = useState<FeedbackLog>(EMPTY_FEEDBACK_LOG);
  const [locations, setLocations] = useState<LocationLog>(EMPTY_LOCATION_LOG);
  const [revision, setRevision] = useState('0');
  const [recordState, setRecordState] = useState<RecordState>('loading');
  const [recordError, setRecordError] = useState<string | null>(null);
  const [itemId, setItemId] = useState('');
  const [kind, setKind] = useState<FeedbackKind>('accessDifficulty');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [note, setNote] = useState('');
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET);

  useEffect(() => {
    let alive = true;
    setRecordState('loading');
    void (async () => {
      try {
        const [row, located] = await Promise.all([
          controller.load(projectId),
          controller.loadLocations(projectId),
        ]);
        if (!alive) return;
        setLog(row?.log ?? EMPTY_FEEDBACK_LOG);
        setRevision(row?.revision ?? '0');
        setLocations(located?.log ?? EMPTY_LOCATION_LOG);
        setRecordState('ready');
        setRecordError(null);
      } catch (caught) {
        if (!alive) return;
        setRecordState('error');
        setRecordError(caught instanceof Error ? caught.message : 'failed');
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const items = input?.items ?? [];
  const itemName = (id: string) => items.find((item) => item.id === id)?.label ?? id;
  const acceptedId = accepted?.planSnapshotId ?? null;
  const stalePlan =
    accepted !== null &&
    inputDigest !== null &&
    accepted.content.versions.inputDigest !== inputDigest;
  const isLive = (entryId: string, bound: string | null) =>
    bound === acceptedId && !log.withdrawnIds.includes(entryId);
  const liveCount = log.entries.filter((entry) => isLive(entry.id, entry.planSnapshotId)).length;

  const aligned = reply !== null && acceptedId !== null && reply.baseSnapshotId === acceptedId;
  const shown = aligned ? reply : null;
  const draft = shown && shown.outcome.kind === 'published' ? shown.outcome.snapshot : null;
  let visual: FeedbackPanelState;
  if (!accepted || !input) visual = 'empty';
  else if (state === 'pending' || state === 'cancelled' || state === 'error') visual = state;
  else if (shown && (state === 'ready' || state === 'nochange')) visual = state;
  else visual = 'idle';

  const busy = recordState === 'saving' || recordState === 'loading';
  /** A moved placement is named by what it holds; any other keeps its id. */
  const placementName = (placementId: string): string => {
    const move = shown?.moves.find((row) => row.placementId === placementId);
    return move && move.itemIds.length > 0 ? move.itemIds.map(itemName).join(', ') : placementId;
  };

  function afterLogChange() {
    // A draft made from an older record would claim a cause that changed.
    if (reply !== null || state !== 'idle') onDiscard();
  }

  function record(event: FormEvent) {
    event.preventDefault();
    if (!input || !accepted) return;
    if (!items.some((item) => item.id === itemId)) {
      setRecordState('error');
      setRecordError('subject_missing');
      return;
    }
    setRecordState('saving');
    setRecordError(null);
    void controller
      .record(projectId, log, revision, input, accepted, {
        id: feedbackId(),
        itemId,
        kind,
        frequency: kind === 'frequencyChange' ? frequency : null,
        note: note.trim() === '' ? null : note,
        planSnapshotId: null,
      })
      .then((result) => {
        setLog(result.reply.log);
        setRevision(result.revision);
        setRecordState('saved');
        setNote('');
        afterLogChange();
      })
      .catch((caught) => {
        setRecordState('error');
        setRecordError(caught instanceof Error ? caught.message : 'failed');
      });
  }

  function withdraw(entryId: string) {
    if (!input || !accepted) return;
    setRecordState('saving');
    setRecordError(null);
    void controller
      .withdraw(projectId, log, revision, input, accepted, entryId)
      .then((result) => {
        setLog(result.reply.log);
        setRevision(result.revision);
        setRecordState('saved');
        afterLogChange();
      })
      .catch((caught) => {
        setRecordState('error');
        setRecordError(caught instanceof Error ? caught.message : 'failed');
      });
  }

  const recordStatus =
    recordState === 'loading'
      ? '기록을 불러오는 중'
      : recordState === 'saving'
        ? '저장 중'
        : recordState === 'saved'
          ? '기록을 저장했습니다. 계획은 바뀌지 않았습니다'
          : recordState === 'error'
            ? '저장하지 않음'
            : log.entries.length === 0
              ? '기록이 없습니다'
              : '기록을 읽었습니다';

  return (
    <section
      className="measurement-panel feedback-panel"
      aria-labelledby={titleId}
      data-testid="feedback-panel"
      data-state={visual}
      data-record-state={recordState}
      data-outcome={shown ? shown.outcome.kind : ''}
      data-base={shown?.baseSnapshotId ?? ''}
      data-draft={shown?.reproduction.draftSnapshotId ?? ''}
      data-read-model={shown?.readModelVersion ?? ''}
      data-rule-set={shown?.ruleSetVersion ?? ''}
      data-request={shown?.reproduction.requestDigest ?? ''}
      data-auto-discard={shown ? String(shown.autoDiscard) : ''}
      data-auto-purchase={shown ? String(shown.autoPurchase) : ''}
      data-ignored={String(ignored)}
      data-live={String(liveCount)}
    >
      <div className="section-kicker">생활 피드백</div>
      <h3 id={titleId}>사용 피드백으로 다음 정리 제안</h3>
      <p className="session-note">
        기록은 판단이 아닙니다. 피드백만으로 물건을 버리거나 사지 않고, 입력 값도 바꾸지 않습니다. 제안은 초안이며
        채택하기 전까지 지금 계획과 실제 위치는 그대로입니다.
      </p>
      <p className="session-note" data-testid="feedback-record-status" role="status">
        {recordStatus}
      </p>
      {recordError && (
        <p
          id={errorId}
          className="field-error"
          role="alert"
          data-testid="feedback-record-error"
          data-reason={recordError}
        >
          {operationText(recordError)}
        </p>
      )}
      {visual === 'empty' && (
        <p className="session-note" data-testid="feedback-empty">
          채택한 계획이 없습니다. 계획을 채택하면 사용 피드백을 남길 수 있습니다.
        </p>
      )}
      {stalePlan && (
        <p className="session-note" data-testid="feedback-stale-plan" role="status">
          채택한 계획이 지금 입력과 다릅니다. 다시 계산해 채택한 뒤에 제안을 만들 수 있습니다.
        </p>
      )}

      {accepted && input && (
        <form onSubmit={record} data-testid="feedback-form">
          <label className="field">
            <span className="field-label">물건</span>
            <select
              value={itemId}
              data-testid="feedback-item"
              aria-describedby={recordError ? errorId : undefined}
              onChange={(event) => setItemId(event.target.value)}
              disabled={busy}
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
            <span className="field-label">피드백</span>
            <select
              value={kind}
              data-testid="feedback-kind"
              aria-describedby={recordError ? errorId : undefined}
              onChange={(event) => setKind(event.target.value as FeedbackKind)}
              disabled={busy}
            >
              {KINDS.map((value) => (
                <option key={value} value={value}>
                  {kindText(value)}
                </option>
              ))}
            </select>
          </label>
          {kind === 'frequencyChange' && (
            <label className="field">
              <span className="field-label">실제 사용 빈도</span>
              <select
                value={frequency}
                data-testid="feedback-frequency"
              aria-describedby={recordError ? errorId : undefined}
                onChange={(event) => setFrequency(event.target.value as Frequency)}
                disabled={busy}
              >
                {FREQUENCIES.map((value) => (
                  <option key={value} value={value}>
                    {frequencyText(value)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field-label">메모 (선택)</span>
            <input
              type="text"
              value={note}
              data-testid="feedback-note"
              aria-describedby={recordError ? errorId : undefined}
              maxLength={256}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="button button-secondary"
            type="submit"
            data-testid="feedback-record"
            disabled={busy || itemId === ''}
          >
            피드백 기록
          </button>
        </form>
      )}

      {log.entries.length > 0 && (
        <ul className="plan-list feedback-entries" data-testid="feedback-entries">
          {log.entries.map((entry, index) => {
            const withdrawn = log.withdrawnIds.includes(entry.id);
            const live = isLive(entry.id, entry.planSnapshotId);
            return (
              <li
                key={entry.id}
                data-testid="feedback-entry"
                data-feedback-id={entry.id}
                data-kind={entry.kind}
                data-live={String(live)}
                data-withdrawn={String(withdrawn)}
              >
                <span className="feedback-entry-head">
                  <strong>{itemName(entry.itemId)}</strong>
                  <span className="session-note">
                    {' '}
                    · {kindText(entry.kind)}
                    {entry.kind === 'frequencyChange' ? ` → ${frequencyText(entry.frequency)}` : ''}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </span>
                </span>
                <span className="feedback-entry-body">
                  <span className="feedback-badge">
                    {withdrawn ? '철회됨' : live ? '이 계획에 기록됨' : '다른 계획에 기록됨 · 적용 안 함'}
                  </span>
                  {live && (
                    <button
                      className="button button-secondary"
                      type="button"
                      data-testid={`feedback-withdraw-${index}`}
                      onClick={() => withdraw(entry.id)}
                      disabled={busy}
                    >
                      철회
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {accepted && input && (
        <div className="feedback-run">
          <label className="field">
            <span className="field-label">검토 횟수 (후보를 검증기에 보내는 최대 횟수)</span>
            <select
              value={budget}
              data-testid="feedback-budget"
              onChange={(event) => setBudget(Number(event.target.value))}
              disabled={visual === 'pending'}
            >
              {BUDGET_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button
              className="button button-primary"
              type="button"
              data-testid="feedback-run"
              onClick={() => onPropose(log, locations, budget)}
              disabled={visual === 'pending' || liveCount === 0 || stalePlan}
            >
              다음 안 만들기
            </button>
            {visual === 'pending' && (
              <button
                className="button button-secondary"
                type="button"
                data-testid="feedback-cancel"
                onClick={onCancel}
              >
                취소
              </button>
            )}
            {visual === 'error' && (
              <button
                className="button button-secondary"
                type="button"
                data-testid="feedback-retry"
                onClick={() => onPropose(log, locations, budget)}
              >
                다시 시도
              </button>
            )}
          </div>
          {liveCount === 0 && !stalePlan && (
            <p className="session-note" data-testid="feedback-no-live">
              이 계획에 남긴 피드백이 없어 제안을 만들 수 없습니다.
            </p>
          )}
        </div>
      )}

      {visual === 'pending' && (
        <p className="session-note" data-testid="feedback-status" role="status">
          기록한 피드백으로 후보를 검증하고 있습니다…
        </p>
      )}
      {visual === 'cancelled' && (
        <p className="session-note" data-testid="feedback-status" role="status">
          취소했습니다. 채택한 계획과 실제 위치는 그대로입니다.
        </p>
      )}
      {ignored > 0 && (
        <p className="session-note" data-testid="feedback-ignored" role="status">
          늦은 응답은 채택한 계획을 바꾸지 않았습니다.
        </p>
      )}
      {visual === 'error' && (
        <p className="field-error" role="alert" data-testid="feedback-error" data-reason={error ?? ''}>
          제안을 만들지 못했습니다. {operationText(error)}
        </p>
      )}

      {shown && (visual === 'ready' || visual === 'nochange') && (
        <div className="feedback-result" data-testid="feedback-result">
          <p data-testid="feedback-summary" role="status">
            {visual === 'ready'
              ? `초안을 만들었습니다. 배치 ${shown.moves.length}곳의 위치가 바뀝니다.`
              : '바꿀 만한 안전한 배치를 찾지 못했습니다. 현재 계획이 그대로입니다.'}
            {shown.budgetExhausted ? ' 검토 횟수가 다 차서 일부 후보는 보지 못했습니다.' : ''}
          </p>
          <ul className="feedback-causes" data-testid="feedback-causes">
            {shown.causes.map((cause) => (
              <li
                key={cause.feedbackId}
                data-testid="feedback-cause"
                data-feedback-id={cause.feedbackId}
                data-outcome={cause.outcome}
                data-reason={cause.reasonCode}
                data-rule={cause.ruleId}
              >
                <strong>
                  {itemName(cause.itemId)} · {kindText(cause.kind)}
                </strong>{' '}
                <span className="feedback-badge">{outcomeText(cause.outcome)}</span>
                <span className="session-note">
                  {' '}
                  {ruleText(cause.kind)} {reasonText(cause.reasonCode)}
                </span>
                {cause.kind !== 'maintenanceDifficulty' &&
                  (cause.frequencyInput !== cause.frequencyEffective ||
                    cause.frequencyEffective === null) && (
                    <span className="session-note">
                      {' '}
                      입력 빈도 {frequencyText(cause.frequencyInput)} → 기록 빈도{' '}
                      {frequencyText(cause.frequencyEffective)}.
                    </span>
                  )}
                {cause.swap && cause.partnerPlacementId && (
                  <span className="session-note">
                    {' '}
                    {swapText(cause.swap)}: {cause.focusPlacementIds.map(placementName).join(', ')} ↔{' '}
                    {placementName(cause.partnerPlacementId)}.
                  </span>
                )}
                {cause.measureBefore !== null && cause.measureAfter !== null && (
                  <span className="session-note" data-testid="feedback-measure">
                    {' '}
                    {measureText(cause.kind, cause.measureBefore, cause.measureAfter)}.
                  </span>
                )}
                {cause.unknownSiblings > 0 && (
                  <span className="session-note">
                    {' '}
                    빈도를 모르는 배치 {cause.unknownSiblings}곳은 비교하지 않았습니다.
                  </span>
                )}
                {cause.blockers.length > 0 && (
                  <span className="session-note" data-testid="feedback-blockers">
                    {' '}
                    막힌 이유: {cause.blockers.map((code) => blockerText(code)).join(', ')}.
                  </span>
                )}
                {cause.observed && (
                  <span className="session-note" data-testid="feedback-observed">
                    {' '}
                    참고한 위치 기록: {kindPhrase(cause.observed.kind)}
                    {cause.observed.location ? ` ${cause.observed.location}` : ''}. 이 기록은 바꾸지 않습니다.
                  </span>
                )}
              </li>
            ))}
          </ul>

          <h4 className="feedback-subhead">현재 계획과 제안 비교</h4>
          <ul className="feedback-moves" data-testid="feedback-moves">
            {shown.moves.length === 0 && <li>위치가 바뀌는 배치가 없습니다.</li>}
            {shown.moves.map((move) => (
              <li key={move.placementId} data-testid="feedback-move" data-placement={move.placementId}>
                {move.itemIds.length > 0 ? move.itemIds.map(itemName).join(', ') : move.placementId}
                {' · '}현재 ({move.from.x}, {move.from.y}) mm → 제안 ({move.to.x}, {move.to.y}) mm
              </li>
            ))}
          </ul>
          <ul className="feedback-checks" data-testid="feedback-checks">
            {shown.checkChanges.length === 0 && <li>검사 결과가 달라진 곳이 없습니다.</li>}
            {shown.checkChanges.map((change) => (
              <li key={change.checkId} data-testid="feedback-check-change" data-status={change.after}>
                {change.checkId}: {statusText(change.before)} → {statusText(change.after)}
              </li>
            ))}
          </ul>
          <ul className="feedback-preserved" data-testid="feedback-preserved">
            <li data-kept={String(shown.preserved.assignments)}>
              물건 배정 {shown.preserved.assignments ? '그대로' : '달라짐'}
            </li>
            <li data-kept={String(shown.preserved.unassigned)}>
              미배정 {shown.preserved.unassigned ? '그대로' : '달라짐'}
            </li>
            <li data-kept={String(shown.preserved.purchaseSelections)}>
              구매 선택 {shown.preserved.purchaseSelections ? '그대로' : '달라짐'}
            </li>
            <li data-kept={String(shown.preserved.bom)}>
              구매 목록 {shown.preserved.bom ? '그대로' : '달라짐'}
            </li>
            <li data-kept={String(shown.preserved.costSummary)}>
              비용 {shown.preserved.costSummary ? '그대로' : '달라짐'}
            </li>
          </ul>
          <p data-testid="feedback-no-decision">
            {shown.autoDiscard || shown.autoPurchase
              ? '이 응답은 버리기나 구매를 결정하려 했습니다. 사용하지 마세요.'
              : '물건을 버리거나 사는 결정은 하지 않았습니다.'}
          </p>
          <p data-testid="feedback-fresh">
            {shown.reusedPass
              ? '이전 통과를 다시 썼습니다. 사용하지 마세요.'
              : '검사는 초안에서 새로 계산했습니다. 이전 통과를 다시 쓰지 않습니다.'}
          </p>
          <details data-testid="feedback-reproduction">
            <summary>재현 정보</summary>
            <ul className="session-note">
              <li>읽기 모형 {shown.readModelVersion}</li>
              <li>규칙 {shown.ruleSetVersion}</li>
              <li>입력 {shown.reproduction.inputDigest.slice(0, 12)}</li>
              <li>카탈로그 {shown.reproduction.catalogDigest.slice(0, 12)}</li>
              <li>채택한 계획 {shown.reproduction.baseSnapshotId.slice(0, 12)}</li>
              <li>피드백 {shown.reproduction.feedbackDigest.slice(0, 12)}</li>
              <li>위치 기록 {shown.reproduction.locationDigest.slice(0, 12)}</li>
              <li>검토 횟수 {shown.reproduction.budget.maxEvaluations}회 중 {shown.evaluationsUsed}회 사용</li>
              <li>요청 {shown.reproduction.requestDigest.slice(0, 12)}</li>
              <li>
                초안{' '}
                {shown.reproduction.draftSnapshotId
                  ? shown.reproduction.draftSnapshotId.slice(0, 12)
                  : '만들지 않음'}
              </li>
            </ul>
            <p className="session-note">
              같은 입력·규칙·피드백·위치 기록·검토 횟수로 다시 요청하면 같은 초안이 나옵니다.
            </p>
          </details>
          <div className="form-actions">
            {draft && (
              <button
                className="button button-secondary"
                type="button"
                data-testid="feedback-open"
                onClick={onOpen}
                disabled={selectedId === draft.planSnapshotId}
              >
                초안 보기
              </button>
            )}
            {draft && selectedId === draft.planSnapshotId && acceptedId !== draft.planSnapshotId && (
              <button
                className="button button-primary"
                type="button"
                data-testid="feedback-accept"
                onClick={() => onAccept(draft.planSnapshotId)}
                disabled={acceptState === 'saving'}
              >
                이 초안을 채택
              </button>
            )}
            <button
              className="button button-secondary"
              type="button"
              data-testid="feedback-discard"
              onClick={onDiscard}
            >
              결과 닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
