import { useState } from 'react';
import { Button } from 'react-aria-components';
import type { RawProjectInputDto } from '../../contracts/generated/dto';
import { fieldPathFor, type MeasurementField } from '../project/draft';
import type { NextFactsView } from '../project/nextFacts';
import {
  errorFix,
  FIELD_HELP,
  FIELD_LABELS,
  GUIDE_STEPS,
  hasAnyMeasurement,
  SCOPE_LINES,
  suggestedField,
} from './guide';

const OPEN_KEY = (projectId: string) => `zari-guide-open:${projectId}`;

/** Whether the guide is expanded. Closing is a view choice; the draft is untouched. */
function initialOpen(projectId: string, form: RawProjectInputDto | null, example: boolean): boolean {
  try {
    const stored = sessionStorage.getItem(OPEN_KEY(projectId));
    if (stored === 'true' || stored === 'false') return stored === 'true';
  } catch {
    // Storage may be unavailable; the default applies.
  }
  return example || !hasAnyMeasurement(form);
}

/**
 * Step guide + context help for the measurement screen. It only reads the
 * draft and the Rust next-facts list, and moves focus to the real fields.
 */
export function OnboardingPanel({
  projectId,
  form,
  diagnostics,
  nextFacts,
  focused,
  example,
  onGoto,
}: {
  projectId: string;
  form: RawProjectInputDto | null;
  diagnostics: { code: string; fieldPath: string }[];
  nextFacts: NextFactsView;
  focused: MeasurementField | null;
  example: boolean;
  onGoto: (field: MeasurementField) => void;
}) {
  const [open, setOpen] = useState(() => initialOpen(projectId, form, example));
  const [lastGoto, setLastGoto] = useState<MeasurementField | null>(null);
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      sessionStorage.setItem(OPEN_KEY(projectId), String(next));
    } catch {
      // View state only; losing it changes nothing stored.
    }
  };
  const goto = (field: MeasurementField) => {
    setLastGoto(field);
    onGoto(field);
  };
  const suggestion = suggestedField(form, nextFacts);
  const helpField = focused ?? lastGoto ?? suggestion?.field ?? null;
  const errors = diagnostics
    .map((entry) => ({ entry, field: fieldPathFor(entry.fieldPath) }))
    .filter((row): row is { entry: { code: string; fieldPath: string }; field: MeasurementField } => row.field !== null);

  return (
    <section
      className="onboarding"
      aria-labelledby="onboarding-title"
      data-testid="onboarding"
      data-open={open ? 'true' : 'false'}
      data-example={example ? 'true' : 'false'}
    >
      <div className="onboarding-head">
        <h3 id="onboarding-title">처음이신가요? 측정 안내</h3>
        <Button
          className="button button-quiet"
          data-testid="onboarding-toggle"
          aria-expanded={open}
          aria-controls="onboarding-body"
          onPress={() => toggle(!open)}
        >
          {open ? '안내 닫기' : '안내 열기'}
        </Button>
      </div>
      {!open && (
        <p className="session-note onboarding-closed" data-testid="onboarding-closed-note">
          안내를 닫아도 입력한 값은 그대로 남습니다.
        </p>
      )}
      <div id="onboarding-body" hidden={!open}>
        <p data-testid="onboarding-lead">
          모든 칸을 먼저 채울 필요는 없습니다. 아래 순서대로 필요한 것만 재세요.
        </p>
        <p className="onboarding-next" data-testid="onboarding-next" data-source={suggestion?.source ?? 'none'}>
          {suggestion ? (
            <>
              지금 필요한 값: <strong>{FIELD_LABELS[suggestion.field]}</strong>{' '}
              <span className="session-note">
                {suggestion.source === 'rust'
                  ? '(계산기의 “다음에 확인할 사실” 첫 항목)'
                  : '(안내 순서 — 저장하면 계산기 목록으로 바뀝니다)'}
              </span>{' '}

            </>
          ) : (
            '지금 안내할 필수 값이 없습니다.'
          )}
        </p>
        <ol className="onboarding-steps" data-testid="onboarding-steps">
          {GUIDE_STEPS.map((step) => (
            <li key={step.id} data-testid={`onboarding-step-${step.id}`}>
              <strong>{step.title}</strong>
              {step.optional && <span className="session-note"> (선택)</span>}
              <p>{step.summary}</p>
              {step.fields.length > 0 && (
                <ul className="onboarding-fields">
                  {step.fields.map((field) => (
                    <li key={field}>
                      <Button
                        className="button button-quiet"
                        data-testid={`onboarding-field-${field}`}
                        onPress={() => goto(field)}
                      >
                        {FIELD_LABELS[field]}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        <div className="onboarding-help" data-testid="onboarding-help" aria-live="polite">
          {helpField ? (
            <>
              <strong>{FIELD_LABELS[helpField]}</strong>
              <p>{FIELD_HELP[helpField].how}</p>
              <p>
                입력 예시: <code data-testid="onboarding-example-input">{FIELD_HELP[helpField].example}</code>
              </p>
            </>
          ) : (
            <p>칸을 고르면 재는 방법과 입력 예시가 여기에 나옵니다.</p>
          )}
        </div>
        {errors.length > 0 && (
          <ul className="onboarding-errors" data-testid="onboarding-errors">
            {errors.map(({ entry, field }, i) => (
              <li key={`${entry.fieldPath}-${i}`}>
                <strong>{FIELD_LABELS[field]}</strong>: <span>{errorFix(entry.code)}</span>{' '}
                <Button
                  className="button button-quiet"
                  data-testid={`onboarding-fix-${field}`}
                  onPress={() => goto(field)}
                >
                  고칠 칸으로 이동
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div data-testid="onboarding-scope">
          <strong>지원 범위</strong>
          <ul>
            {SCOPE_LINES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
