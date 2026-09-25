import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import type { Diagnostic, ProjectInput } from '../contracts/generated/dto';
import {
  fieldPathFor,
  getMeasurement,
  sampleProjectForm,
  MEASUREMENT_FIELDS,
  type MeasurementField,
} from '../features/project/draft';
import type { ProjectSession, SessionSnapshot } from '../features/project/session';
import { DimensionField } from '../ui/DimensionField';
import { acquireSession, discardSession, releaseSession, workerController } from './sessionRegistry';
import { navigate } from './router';

const FIELD_LABELS: Record<MeasurementField, string> = {
  'space.interior.width': '공간 안쪽 폭',
  'space.interior.depth': '공간 안쪽 깊이',
  'space.interior.height': '공간 안쪽 높이',
  'space.opening.width': '개구부 폭',
  'space.opening.height': '개구부 높이',
  'items.item-a.dimensions.envelope.width': '물건 A 폭',
  'items.item-a.dimensions.envelope.depth': '물건 A 깊이',
  'items.item-a.dimensions.envelope.height': '물건 A 높이',
  'items.item-b.dimensions.envelope.width': '물건 B 폭',
  'items.item-b.dimensions.envelope.depth': '물건 B 깊이',
  'items.item-b.dimensions.envelope.height': '물건 B 높이',
};

const UNKNOWN_REASON: Record<string, string> = {
  notMeasured: '미측정',
  notProvided: '미제공',
  sourceMissing: '출처 없음',
  conflictingSources: '출처 충돌',
};

/** Read one normalized measurement fact for display; never recomputes. */
function normalizedAt(input: ProjectInput | null, field: MeasurementField) {
  if (!input) return null;
  const parts = field.split('.');
  if (parts[0] === 'space') {
    let node: unknown = input.space;
    for (const seg of parts.slice(1)) {
      if (typeof node !== 'object' || node === null) return null;
      node = (node as Record<string, unknown>)[seg];
    }
    return node as { state: string; value?: { nominal: number }; reason?: string };
  }
  const item = input.items.find((i) => i.id === parts[1]);
  if (!item) return null;
  const axis = parts.at(-1) as 'width' | 'depth' | 'height';
  return item.dimensions.envelope[axis] as {
    state: string;
    value?: { nominal: number };
    reason?: string;
  };
}

function normalizedText(input: ProjectInput | null, field: MeasurementField): string {
  const fact = normalizedAt(input, field);
  if (!fact) return '—';
  if (fact.state === 'known' && fact.value) return `${fact.value.nominal} mm`;
  if (fact.state === 'notApplicable') return '해당 없음';
  return UNKNOWN_REASON[fact.reason ?? ''] ?? '미확인';
}

const DIAGNOSTIC_TEXT: Record<string, string> = {
  submillimeter_precision: '1 mm보다 작은 단위는 반올림하지 않습니다. 0.1 cm 단위로 입력해 주세요.',
  numeric_field_too_long: '입력값이 너무 깁니다. 숫자와 단위를 확인해 주세요.',
  numeric_overflow: '입력값이 너무 큽니다. 숫자와 단위를 확인해 주세요.',
  invalid_number: '숫자 형식을 확인해 주세요.',
  out_of_range: '허용 범위를 벗어났습니다.',
  required_text_missing: '필수 항목이 비어 있습니다.',
};

function diagnosticText(d: Diagnostic): string {
  return DIAGNOSTIC_TEXT[d.code] ?? `${d.code} (${d.fieldPath})`;
}

const SAVE_TEXT: Record<SessionSnapshot['saveState'], string> = {
  idle: '저장된 상태입니다',
  dirty: '저장 대기 중',
  saving: '저장 중…',
  saved: '저장됨',
  error: '저장 실패 — 입력은 이 화면에 유지됩니다',
  conflict: '다른 탭에서 먼저 저장되었습니다',
  unsupported: '이 프로젝트는 더 새로운 형식입니다 — 쓰기가 중단되었습니다',
};

function FieldGroup({
  session,
  state,
  fields,
  focused,
  setFocused,
}: {
  session: ProjectSession;
  state: SessionSnapshot;
  fields: MeasurementField[];
  focused: MeasurementField | null;
  setFocused: (f: MeasurementField | null) => void;
}) {
  const fieldError = (field: MeasurementField) => {
    const d = state.diagnostics.find((entry) => fieldPathFor(entry.fieldPath) === field);
    return d ? diagnosticText(d) : undefined;
  };
  return (
    <>
      {fields.map((field) => {
        const measurement = state.form ? getMeasurement(state.form, field) : null;
        if (!measurement) return null;
        return (
          <div key={field} data-focused={focused === field} className="measure-field">
            <DimensionField
              id={field}
              label={FIELD_LABELS[field]}
              value={measurement.text}
              unit={measurement.unit}
              onChange={(text) => session.edit(field, text)}
              onUnitChange={(unit) => session.setUnit(field, unit)}
              onFocus={() => setFocused(field)}
              onBlur={() => setFocused(null)}
              error={fieldError(field)}
            />
            <span className="normalized-value" data-testid={`normalized-${field}`}>
              {normalizedText(state.normalizedInput, field)}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function ProjectScreen({ projectId }: { projectId: string }) {
  const sessionRef = useRef<ProjectSession | null>(null);
  if (!sessionRef.current || sessionRef.current.snapshot.projectId !== projectId) {
    sessionRef.current = acquireSession(projectId);
  }
  const session = sessionRef.current;
  const state = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.snapshot,
  );
  const [focused, setFocused] = useState<MeasurementField | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  useEffect(() => () => releaseSession(projectId), [projectId]);

  async function download(kind: 'standard' | 'recovery') {
    const data = await session.exportJson(kind);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zari-${projectId}-${kind}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(kind);
  }

  if (state.status === 'loading') {
    return <Shell name="불러오는 중"><p data-testid="project-loading">프로젝트를 불러오고 있습니다…</p></Shell>;
  }
  if (state.status === 'not-found') {
    return <Shell name="없음"><p data-testid="project-not-found">이 프로젝트는 이 기기에 없습니다.</p></Shell>;
  }
  if (state.status === 'unsupported') {
    return (
      <Shell name="새 형식">
        <p data-testid="project-unsupported" role="alert">
          이 프로젝트는 더 새로운 저장 형식으로 기록되어 있습니다. 쓰기는 중단되었고,
          보내기로 데이터를 보존할 수 있습니다.
        </p>
        <Button className="button button-secondary" onPress={() => void download('recovery')}>
          복구용보내기
        </Button>
      </Shell>
    );
  }
  const otherDiagnostics = state.diagnostics.filter((d) => fieldPathFor(d.fieldPath) === null);
  return (
    <Shell name={state.name || '프로젝트'}>
      <div className="session-status" data-testid="save-state" data-save-state={state.saveState}>
        {SAVE_TEXT[state.saveState]}
        {state.saveError ? ` · ${state.saveError}` : ''}
      </div>
      {state.context === 'degraded' && (
        <p className="notice notice-stale" data-testid="degraded-notice" role="alert">
          카탈로그를 확인할 수 없어 배치 기능이 제한됩니다. 입력은 계속 저장됩니다.
          {state.degradedReason ? ` (${state.degradedReason})` : ''}
        </p>
      )}
      {state.corrupt.length > 0 && (
        <div className="recovery-panel" role="alert" data-testid="corrupt-notice">
          <strong>일부 기록이 손상되었습니다.</strong>
          <p>손상된 기록 {state.corrupt.length}건을 격리했습니다. 다른 기록은 그대로 사용할 수 있고, 보내기로 원본을 보존할 수 있습니다.</p>
          <Button className="button button-secondary" onPress={() => void download('recovery')}>
            복구용보내기
          </Button>
        </div>
      )}
      {state.conflict && (
        <div className="recovery-panel" role="alert" data-testid="conflict-notice">
          <strong>다른 탭에서 이 프로젝트가 먼저 저장되었습니다.</strong>
          <p>자동으로 덮어쓰지 않습니다. 어떻게 할지 선택해 주세요.</p>
          <div className="form-actions">
            <Button className="button button-secondary" onPress={() => void session.reloadLatest()} data-testid="conflict-reload">
              최신 버전 열기
            </Button>
            <Button className="button button-secondary" onPress={() => void session.saveAsCopy()} data-testid="conflict-copy">
              사본으로 저장
            </Button>
            <Button className="button button-quiet" onPress={() => void download('standard')} data-testid="conflict-export">
              내 변경보내기
            </Button>
          </div>
        </div>
      )}
      {state.closeBlocked && (
        <div className="recovery-panel" role="alert" data-testid="close-blocked">
          <strong>저장하지 못한 변경이 있습니다.</strong>
          <p>{state.closeBlocked}</p>
          <div className="form-actions">
            <Button className="button button-secondary" onPress={() => session.retrySave()}>
              다시 저장
            </Button>
            <Button className="button button-quiet" onPress={() => void download('recovery')}>
              복구용보내기
            </Button>
            <Button className="button button-quiet" onPress={() => discardSession(projectId)}>
              변경 버리기
            </Button>
          </div>
        </div>
      )}
      {state.worker === 'failed' && (
        <div className="recovery-panel" role="alert" data-testid="worker-failed">
          <strong>계산기가 중단되었습니다.</strong>
          <p>입력과 마지막으로 저장된 상태는 그대로입니다. 다시 연결하면 새 세션이 시작됩니다.</p>
          <Button className="button button-secondary" onPress={() => void workerController.recover()} data-testid="worker-retry">
            계산기 다시 연결
          </Button>
        </div>
      )}
      <section className="measurement-panel" aria-labelledby="measure-title">
        <div className="section-kicker">01 · 공간 치수</div>
        <h2 id="measure-title">공간을 측정해 주세요.</h2>
        <FieldGroup
          session={session}
          state={state}
          fields={MEASUREMENT_FIELDS.filter((f) => f.startsWith('space.'))}
          focused={focused}
          setFocused={setFocused}
        />
        <div className="section-kicker">02 · 물건 치수</div>
        <FieldGroup
          session={session}
          state={state}
          fields={MEASUREMENT_FIELDS.filter((f) => f.startsWith('items.'))}
          focused={focused}
          setFocused={setFocused}
        />
        {focused && (
          <p className="focus-context" data-testid="focus-context">
            지금 {FIELD_LABELS[focused]} 치수를 입력하고 있습니다.
          </p>
        )}
        {otherDiagnostics.length > 0 && (
          <ul className="diagnostic-list" data-testid="diagnostic-list">
            {otherDiagnostics.map((d, i) => (
              <li key={i} className="field-error">{diagnosticText(d)}</li>
            ))}
          </ul>
        )}
        <div className="form-actions">
          <Button className="button button-primary" onPress={() => session.commit()} data-testid="commit-input">
            측정값 확인 · 저장
          </Button>
          <Button
            className="button button-quiet"
            onPress={() => session.replaceForm(sampleProjectForm())}
            data-testid="fill-sample"
          >
            샘플 값 채우기
          </Button>
          <Button className="button button-quiet" onPress={() => void download('standard')} data-testid="export-project">
            프로젝트보내기
          </Button>
          <Button
            className="button button-secondary"
            onPress={() => navigate(`#/project/${projectId}/plan`)}
            data-testid="goto-plan"
          >
            계획 검토 →
          </Button>
        </div>
        {exported && <p className="session-note" data-testid="exported-note">{exported === 'recovery' ? '복구' : '표준'}보내기 파일을 만들었습니다.</p>}
      </section>
      <aside className="inspector" aria-labelledby="state-title">
        <div className="section-kicker">정규화 상태</div>
        <h2 id="state-title">Rust가 확인한 값</h2>
        <dl className="measurement-list">
          <div><dt>프로젝트 리비전</dt><dd data-testid="project-revision">{state.projectRevision}</dd></div>
          <div><dt>입력 리비전</dt><dd data-testid="input-revision">{state.inputRevision}</dd></div>
          <div><dt>입력 다이제스트</dt><dd data-testid="input-digest">{state.inputDigest ? `${state.inputDigest.slice(0, 12)}…` : '없음'}</dd></div>
          <div><dt>작업 컨텍스트</dt><dd data-testid="context-state">{state.context}</dd></div>
          <div><dt>워커</dt><dd data-testid="worker-state">{state.worker}</dd></div>
        </dl>
        {state.staleInput && (
          <p className="notice notice-stale" data-testid="stale-notice">저장되지 않은 입력 변경이 있습니다.</p>
        )}
        {state.integrity && (
          <p className="session-note" data-testid="integrity-note">
            무결성 검사: {state.integrity.filter((i) => i.verified).length}/{state.integrity.length}개 기록 검증됨
          </p>
        )}
      </aside>
    </Shell>
  );
}

export function Shell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="zari-ui app-shell">
      <header className="app-header">
        <div className="brand" aria-label="ZARI">
          <svg viewBox="0 0 26 26" aria-hidden="true">
            <path d="M2 2H24V24H2Z M2 10H24 M11 10V24" />
          </svg>
          <span>ZARI</span>
        </div>
        <nav className="header-context" aria-label="화면 이동">
          <a href="#/projects" onClick={(e) => { e.preventDefault(); navigate('#/projects'); }}>
            프로젝트 목록
          </a>
        </nav>
        <div className="local-note">
          <span aria-hidden="true" className="local-dot" />{name}
        </div>
      </header>
      <main className="project-main">{children}</main>
    </div>
  );
}
