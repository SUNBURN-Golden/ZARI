import type { ActionStep, SnapshotContent, SpatialProjection } from '../../contracts/generated/dto';
import type { WorkspaceFocus } from './model';
import {
  confirmationRequired,
  dependentText,
  doneDependents,
  missingPrerequisites,
  neighborStep,
  nextExecutableStep,
  prerequisiteText,
  stepAccess,
  stepMark,
  stepTargetView,
  stepTitle,
  targetLabel,
  type GuideSurface,
  type ProgressLoad,
  type ProgressMap,
} from './stepFocus';

const SAVE_FAILURE = new Set([
  'blocked_prerequisites',
  'blocked_dependents',
  'not_accepted',
  'unknown_step',
  'confirmation_required',
  'stale_input',
  'conflict',
  'progress_unavailable',
  'readonly',
]);

function errorText(code: string): string {
  switch (code) {
    case 'blocked_prerequisites':
      return '먼저 해야 할 단계가 남아 있습니다.';
    case 'blocked_dependents':
      return '이 단계에 의존하는 단계가 완료되어 있습니다.';
    case 'not_accepted':
      return '현재 채택된 계획이 아닙니다.';
    case 'confirmation_required':
      return '확인 절차 필요';
    case 'stale_input':
      return '입력이 바뀐 계획에는 완료를 기록하지 않습니다.';
    case 'conflict':
      return '다른 탭에서 저장이 바뀌었습니다.';
    case 'progress_unavailable':
      return '진행 기록을 읽지 못함';
    case 'unknown_step':
      return '이 계획은 그 단계를 가지고 있지 않습니다.';
    default:
      return `진행 저장 실패: ${code}`;
  }
}

export function StepFocus({
  surface,
  actions,
  content,
  projection,
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
  actionError,
  actionRetry,
  onFocusStep,
  onToggle,
  onShowAccepted,
}: {
  surface: GuideSurface;
  actions: readonly ActionStep[];
  content: SnapshotContent;
  projection: SpatialProjection | null;
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
  actionError: string | null;
  actionRetry: { stepId: string; done: boolean } | null;
  onFocusStep: (stepId: string) => void;
  onToggle: (stepId: string, done: boolean) => void;
  onShowAccepted: (() => void) | null;
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
  const currentId = focus.kind === 'action' ? focus.stepId : null;
  const current = actions.find((step) => step.id === currentId) ?? null;
  const judgeProgress =
    access.writable || access.block === 'stale' || access.block === 'conflict';
  const executable = access.block === 'progress_unknown'
    ? nextExecutableStep(actions, null)
    : judgeProgress
      ? nextExecutableStep(actions, progress)
      : { kind: 'hidden' as const };
  const showMarks = access.block !== 'working' && access.block !== 'alternative' && access.block !== 'not_accepted';
  const retry =
    actionRetry && actionError && !SAVE_FAILURE.has(actionError) ? actionRetry : null;

  return (
    <div data-surface={surface} data-write={access.block} id={surface === 'accepted' ? 'accepted-guide' : undefined}>
      {access.block === 'working' && (
        <p className="session-note" data-testid="progress-working">
          작업 중인 계획은 미리보기입니다. 채택된 계획의 완료 기록을 가져오지 않습니다.
        </p>
      )}
      {access.block === 'alternative' && (
        <p className="session-note" data-testid="progress-inactive">
          이 계획을 채택하면 단계별 완료를 기록할 수 있습니다.
        </p>
      )}
      {access.block === 'stale' && (
        <p className="notice notice-stale" data-testid="progress-stale" role="status">
          입력이 바뀐 기록입니다. 완료를 바꾸지 않습니다.
        </p>
      )}
      {access.block === 'conflict' && (
        <p className="notice notice-stale" data-testid="progress-conflict" role="status">
          다른 탭의 저장 때문에 완료를 기록하지 않습니다.
        </p>
      )}
      {access.block === 'progress_loading' && (
        <p className="session-note" data-testid="progress-loading">
          진행 기록을 읽고 있습니다.
        </p>
      )}
      {access.block === 'progress_unknown' && (
        <p className="notice notice-error" data-testid="progress-unavailable" role="alert">
          진행 기록을 읽지 못함
        </p>
      )}
      {onShowAccepted && surface !== 'accepted' && (
        <p className="form-actions">
          <button type="button" className="button button-secondary" data-testid="open-accepted-plan" onClick={onShowAccepted}>
            채택된 계획에서 실행하기
          </button>
        </p>
      )}
      {actionError && (
        <p className="field-error" role="alert" data-testid="action-error">
          {errorText(actionError)}
        </p>
      )}
      {retry && (
        <p className="form-actions">
          <button
            type="button"
            className="button button-secondary"
            data-testid="progress-retry"
            onClick={() => onToggle(retry.stepId, retry.done)}
          >
            다시 시도
          </button>
        </p>
      )}
      <div className="guide-nav" role="group" aria-label="실행 단계">
        <button
          type="button"
          className="button button-secondary"
          data-testid="step-prev"
          disabled={neighborStep(actions, currentId, -1) === null}
          onClick={() => {
            const id = neighborStep(actions, currentId, -1);
            if (id) onFocusStep(id);
          }}
        >
          이전 단계
        </button>
        <button
          type="button"
          className="button button-secondary"
          data-testid="step-next"
          disabled={neighborStep(actions, currentId, 1) === null}
          onClick={() => {
            const id = neighborStep(actions, currentId, 1);
            if (id) onFocusStep(id);
          }}
        >
          다음 단계
        </button>
        <button
          type="button"
          className="button button-secondary"
          data-testid="step-next-executable"
          disabled={executable.kind !== 'step'}
          onClick={() => {
            if (executable.kind === 'step') onFocusStep(executable.stepId);
          }}
        >
          다음 실행 단계
        </button>
      </div>
      {executable.kind === 'unavailable' && (
        <p className="session-note" data-testid="next-step-unavailable">
          진행을 알 수 없어 다음 단계를 정할 수 없습니다.
        </p>
      )}
      {executable.kind === 'none' && showMarks && (
        <p className="session-note" data-testid="next-step-none">
          남은 실행 단계가 없습니다.
        </p>
      )}
      <p className="session-note" data-testid="current-step">
        {current ? `현재 단계: ${stepTitle(current)}` : '현재 단계: 없음'}
      </p>
      {current && (
        <StepTargetLine step={current} projection={projection} content={content} />
      )}
      <ol className="plan-list" data-testid="guide-list">
        {actions.map((step) => {
          const mark = showMarks ? stepMark(progress, step.id) : null;
          const missing = missingPrerequisites(step, showMarks ? progress : null);
          const dependents = doneDependents(step.id, actions, showMarks ? progress : null);
          const needsConfirmation = confirmationRequired(step);
          const isCurrent = step.id === currentId;
          const lockCheck = missing.length > 0 || needsConfirmation;
          const lockClear = dependents.length > 0;
          return (
            <li
              key={step.id}
              className={isCurrent ? 'guide-step step-current' : 'guide-step'}
              data-current={isCurrent ? 'true' : undefined}
              data-status={mark === 'done' ? 'done' : mark === 'unknown' ? 'unknown' : undefined}
            >
              <div className="guide-step-row">
                {access.writable && mark !== 'unknown' ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={mark === 'done'}
                      disabled={(mark !== 'done' && lockCheck) || (mark === 'done' && lockClear)}
                      data-testid={`action-${step.id}`}
                      onChange={(event) => onToggle(step.id, event.target.checked)}
                    />{' '}
                    {stepTitle(step)}
                  </label>
                ) : (
                  <span>{stepTitle(step)}</span>
                )}
                <button
                  type="button"
                  className="button button-quiet"
                  data-testid={`step-focus-${step.id}`}
                  aria-pressed={isCurrent}
                  onClick={() => onFocusStep(step.id)}
                >
                  이 단계 보기
                </button>
              </div>
              <StepTargetLine step={step} projection={projection} content={content} />
              {mark === 'unknown' && <span className="session-note">알 수 없음</span>}
              {missing.length > 0 && (
                <span className="session-note" data-testid={`step-prereq-${step.id}`}>
                  {prerequisiteText(actions, missing)}
                </span>
              )}
              {dependents.length > 0 && (
                <span className="session-note">{dependentText(actions, dependents)}</span>
              )}
              {needsConfirmation && (
                <span className="session-note" data-testid={`step-confirm-${step.id}`}>
                  확인 절차 필요
                </span>
              )}
            </li>
          );
        })}
        {actions.length === 0 && <li>실행할 단계가 없습니다.</li>}
      </ol>
    </div>
  );
}

function StepTargetLine({
  step,
  projection,
  content,
}: {
  step: ActionStep;
  projection: SpatialProjection | null;
  content: SnapshotContent;
}) {
  const view = stepTargetView(step, projection, content);
  return (
    <p className="session-note" data-testid={`step-targets-${step.id}`}>
      {view.keys.length > 0 && (
        <span data-target-keys={view.keys.join(' ')}>
          대상: {view.targets.map((target) => targetLabel(content, target)).join(', ')}
        </span>
      )}
      {view.note && (
        <span data-testid={`step-note-${step.id}`}>
          {view.keys.length > 0 ? ` · ${view.note}` : view.note}
        </span>
      )}
    </p>
  );
}

