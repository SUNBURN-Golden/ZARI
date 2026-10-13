import type { ActionStep, SnapshotContent } from '../../contracts/generated/dto';
import type { WorkspaceFocus } from '../workspace/model';
import {
  conditionText,
  confirmationRequired,
  dependentText,
  doneDependents,
  missingPrerequisites,
  nextExecutableStep,
  prerequisiteText,
  stepAccess,
  stepMark,
  stepTitle,
  type GuideEligibility,
  type GuideSurface,
  type ProgressLoad,
  type ProgressMap,
} from '../workspace/stepFocus';
import {
  conditionRows,
  preparationLines,
  subjectText,
  ROLLBACK_OPTIONS,
  type DraftFocusTarget,
} from './model';

/**
 * Per-step execution card (z-execution-checklist). It follows the same
 * Rust-produced DAG, eligibility rows, and progress pipeline as the step
 * list: progress marks are user assertions, condition statuses come from
 * `content.validation.checks`, and a blocked step never becomes completable
 * here even when the list would look the same.
 */
export function ExecutionChecklist({
  surface,
  actions,
  content,
  focus,
  progress,
  progressLoad,
  displayedPlanId,
  displayedDigest,
  accepted,
  currentInputRevision,
  currentInputDigest,
  staleInput,
  conflict,
  eligibility,
  onToggle,
  onRollback,
}: {
  surface: GuideSurface;
  actions: readonly ActionStep[];
  content: SnapshotContent;
  focus: WorkspaceFocus;
  progress: ProgressMap | null;
  progressLoad: ProgressLoad;
  displayedPlanId: string;
  displayedDigest: string;
  accepted: { inputRevision: string; planSnapshotId: string } | null;
  currentInputRevision: string;
  currentInputDigest: string | null;
  staleInput: boolean;
  conflict: boolean;
  eligibility: GuideEligibility | null;
  onToggle: (stepId: string, done: boolean) => void;
  onRollback: (target: DraftFocusTarget) => void;
}) {
  const access = stepAccess({
    surface,
    displayedPlanId,
    displayedDigest,
    accepted,
    currentInputRevision,
    currentInputDigest,
    staleInput,
    conflict,
    progress,
    progressLoad,
  });
  const executableIds =
    eligibility?.eligible === true
      ? new Set(
          eligibility.rows.filter((row) => row.executable).map((row) => row.actionId),
        )
      : null;
  const showMarks =
    access.block !== 'working' &&
    access.block !== 'alternative' &&
    access.block !== 'not_accepted';
  const next =
    progress === null || executableIds === null
      ? { kind: 'unavailable' as const }
      : nextExecutableStep(actions, progress, executableIds);
  if (actions.length === 0) return null;
  const focusedId = focus.kind === 'action' ? focus.stepId : null;
  const step =
    (focusedId ? actions.find((item) => item.id === focusedId) : null) ??
    (next.kind === 'step' ? actions.find((item) => item.id === next.stepId) : null) ??
    actions[0]!;
  const index = actions.findIndex((item) => item.id === step.id);
  const mark = showMarks ? stepMark(progress, step.id) : null;
  const missing = missingPrerequisites(step, showMarks ? progress : null);
  const dependents = doneDependents(step.id, actions, showMarks ? progress : null);
  const needsConfirmation = confirmationRequired(step);
  const row = eligibility?.rows.find((item) => item.actionId === step.id);
  const waiting = eligibility === null || eligibility.eligible !== true;
  const conditionBlocked = !waiting && row?.executable !== true;
  const lockCheck =
    missing.length > 0 ||
    needsConfirmation ||
    (mark !== 'done' && (waiting || conditionBlocked));
  const lockClear = dependents.length > 0;
  const checkboxShown = access.writable && mark !== 'unknown';
  const lockReason = !checkboxShown
    ? null
    : waiting
      ? '진행 조건을 아직 확인하지 못했습니다.'
      : conditionBlocked
        ? '이 단계는 조건이 막혀 완료로 표시할 수 없습니다.'
        : null;
  const describedBy = [
    lockReason ? 'execution-lock' : null,
    missing.length > 0 ? 'execution-prereq' : null,
  ]
    .filter((id): id is string => id !== null)
    .join(' ');
  const preparations = row ? preparationLines(content, row.instanceRefs) : null;
  const subjects = step.subjectIds.map((id) => subjectText(content, id));
  const conditions = conditionRows(content, step);
  return (
    <section
      className="execution-card"
      aria-label="실행 단계 카드"
      data-testid="execution-card"
      data-surface={surface}
    >
      <div className="section-kicker">실행 카드</div>
      <h3 data-testid="execution-title">
        {stepTitle(step)}{' '}
        <span className="session-note">
          {index + 1}/{actions.length}
        </span>
      </h3>
      <div data-testid="execution-preparations">
        <h4>{preparations ? '준비물' : '관련 대상'}</h4>
        {preparations && preparations.length === 0 && (
          <p className="session-note">이 단계에 정해진 준비물이 없습니다.</p>
        )}
        {preparations && preparations.length > 0 && (
          <ul className="plan-list">
            {preparations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {!preparations && subjects.length > 0 && (
          <ul className="plan-list">
            {subjects.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {!preparations && subjects.length === 0 && (
          <p className="session-note">관련 대상을 읽지 못했습니다.</p>
        )}
      </div>
      <div data-testid="execution-conditions">
        <h4>조건</h4>
        {missing.length > 0 && (
          <p className="session-note" id="execution-prereq" data-testid="execution-prereq">
            {prerequisiteText(actions, missing)}
          </p>
        )}
        {dependents.length > 0 && (
          <p className="session-note">{dependentText(actions, dependents)}</p>
        )}
        {needsConfirmation && (
          <p className="session-note" data-testid="execution-confirm">
            확인 절차 필요
          </p>
        )}
        {conditions.length > 0 ? (
          <ul className="plan-list" data-testid="execution-check-list">
            {conditions.map((check) => (
              <li key={check.checkId} data-status={check.status}>
                {check.kindText}: {check.statusText}
              </li>
            ))}
          </ul>
        ) : (
          <p className="session-note">막힌 검사가 없습니다.</p>
        )}
      </div>
      <div data-testid="execution-progress">
        <h4>진행 기록</h4>
        {checkboxShown ? (
          <label className="execution-mark">
            <input
              type="checkbox"
              checked={mark === 'done'}
              disabled={(mark !== 'done' && lockCheck) || (mark === 'done' && lockClear)}
              data-testid={`execution-mark-${step.id}`}
              aria-describedby={describedBy || undefined}
              onChange={(event) => onToggle(step.id, event.target.checked)}
            />{' '}
            완료로 기록
          </label>
        ) : (
          <p className="session-note" data-testid="execution-mark-readonly">
            {mark === 'done'
              ? '완료로 기록됨'
              : mark === 'unknown'
                ? '진행 기록을 읽지 못함'
                : '완료 기록을 쓸 수 없는 화면입니다.'}
          </p>
        )}
        {lockReason && (
          <p className="session-note" id="execution-lock" data-testid="execution-lock">
            {lockReason}
          </p>
        )}
        {conditions.length > 0 && (
          <p className="session-note" data-testid="execution-progress-note">
            {step.reasonIds.map((id) => conditionText(content, id)).join(' · ')} — 완료 기록은
            검사 결과를 바꾸지 않습니다.
          </p>
        )}
      </div>
      <div data-testid="execution-rollback">
        <h4>계획이 현실과 다를 때</h4>
        <p className="session-note">
          초안을 고치고 다시 계획합니다. 되돌리기는 완료 기록이나 검사 결과를 바꾸지 않습니다.
        </p>
        <div className="form-actions" role="group" aria-label="초안으로 되돌리기">
          {ROLLBACK_OPTIONS.map((option) => (
            <button
              key={option.target}
              type="button"
              className="button button-secondary"
              data-testid={`execution-rollback-${option.target}`}
              onClick={() => onRollback(option.target)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
