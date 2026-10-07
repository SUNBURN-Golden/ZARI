import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import type { MeasurementOrigin, Unit } from '../../contracts/generated/dto';
import type { ProjectSession, SessionSnapshot } from './session';
import {
  DIAGNOSTIC_TEXT,
  HUMAN_ORIGINS_LIST,
  ORIGIN_LABEL,
  STAGING_LIMIT,
  catalogEntries,
  detailGroups,
  diagnosticText,
  diagnosticsFor,
  normalizedText,
  normalizedView,
  readDetail,
  readEvidence,
  uncertaintyLabel,
  unknownValueCount,
  valueUnknown,
  type DetailField,
  type DetailValue,
} from './detailFacts';

type DetailMeasureProps = {
  session: ProjectSession;
  state: SessionSnapshot;
  focusedField: string | null;
  /** Opens this field once per token. Later draft edits do not move focus. */
  detailTarget?: { path: string; token: number } | null;
};

function groupFor(path: string, form: NonNullable<SessionSnapshot['form']>): string | null {
  return detailGroups(form).find((group) => group.fields.some((field) => field.path === path))?.id ?? null;
}

export function DetailMeasure({ session, state, focusedField, detailTarget = null }: DetailMeasureProps) {
  const form = state.form;
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [inactiveBounds, setInactiveBounds] = useState<Record<string, { minus: string; plus: string }>>({});
  const [pendingOrigin, setPendingOrigin] = useState<MeasurementOrigin>('userDeclared');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const compact = useCompact();
  const compactRef = useRef(compact);
  compactRef.current = compact;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && compact) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, compact]);

  useEffect(() => {
    if (!detailTarget || !form) return;
    const group = groupFor(detailTarget.path, form);
    if (!group) return;
    setOpen(true);
    setGroupId(group);
    setPath(detailTarget.path);
    const targetPath = detailTarget.path;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        document.getElementById(`nominal-${targetPath}`)?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [detailTarget?.token]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onDialogClose = () => {
      if (!compactRef.current) return;
      setOpen(false);
      queueMicrotask(() => {
        document.querySelector<HTMLElement>('[data-testid="open-detail"]')?.focus();
      });
    };
    dialog.addEventListener('close', onDialogClose);
    return () => dialog.removeEventListener('close', onDialogClose);
  }, [compact]);

  if (!form) return null;
  const count = unknownValueCount(form);
  const close = () => {
    setOpen(false);
    queueMicrotask(() => {
      document.querySelector<HTMLElement>('[data-testid="open-detail"]')?.focus();
    });
  };
  const openPanel = () => {
    setOpen(true);
    if (focusedField) {
      const group = groupFor(focusedField, form);
      if (group) {
        setGroupId(group);
        setPath(focusedField);
      }
    }
  };
  const body = (
    <DetailBody
      session={session}
      state={state}
      groupId={groupId}
      path={path}
      inactiveBounds={inactiveBounds}
      pendingOrigin={pendingOrigin}
      onGroup={(id) => {
        setGroupId(id);
        setPath(null);
      }}
      onPath={setPath}
      onInactive={(fieldPath, bounds) =>
        setInactiveBounds((current) => ({ ...current, [fieldPath]: bounds }))
      }
      onPendingOrigin={setPendingOrigin}
      onClose={close}
    />
  );
  return (
    <div className="detail-entry">
      <p className="uncertainty-status" data-testid="detail-unknown-count">
        상세 값 미확인 {count}
      </p>
      <Button
        className="button button-secondary"
        data-testid="open-detail"
        aria-expanded={open}
        onPress={() => (open ? close() : openPanel())}
      >
        {open ? '상세 측정 닫기' : '상세 측정'}
      </Button>
      {open && !compact && (
        <section className="detail-panel" aria-labelledby="detail-title" data-testid="detail-panel">
          {body}
        </section>
      )}
      {compact && (
        <dialog
          ref={dialogRef}
          className="detail-sheet"
          aria-labelledby="detail-title"
          data-testid="detail-sheet"
        >
          {open ? body : null}
        </dialog>
      )}
    </div>
  );
}

function DetailBody({
  session,
  state,
  groupId,
  path,
  inactiveBounds,
  pendingOrigin,
  onGroup,
  onPath,
  onInactive,
  onPendingOrigin,
  onClose,
}: {
  session: ProjectSession;
  state: SessionSnapshot;
  groupId: string | null;
  path: string | null;
  inactiveBounds: Record<string, { minus: string; plus: string }>;
  pendingOrigin: MeasurementOrigin;
  onGroup: (id: string) => void;
  onPath: (path: string) => void;
  onInactive: (path: string, bounds: { minus: string; plus: string }) => void;
  onPendingOrigin: (origin: MeasurementOrigin) => void;
  onClose: () => void;
}) {
  const form = state.form;
  if (!form) return null;
  const groups = detailGroups(form);
  const group = groups.find((entry) => entry.id === groupId) ?? null;
  const catalogs = catalogEntries(form);
  return (
    <>
      <div className="detail-heading">
        <h3 id="detail-title">상세 측정</h3>
        <Button className="button button-quiet" data-testid="detail-close" onPress={onClose}>
          닫기
        </Button>
      </div>
      <p className="field-help">값, 오차, 출처를 한 묶음으로 입력합니다. 오차를 비워 두면 0이 아닙니다.</p>
      <ul className="detail-groups">
        {groups.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="text-pick"
              data-testid={`detail-group-${entry.id}`}
              aria-pressed={groupId === entry.id}
              onClick={() => onGroup(entry.id)}
            >
              {entry.label}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="text-pick"
            data-testid="detail-group-catalog"
            aria-pressed={groupId === 'catalog'}
            onClick={() => onGroup('catalog')}
          >
            카탈로그
          </button>
        </li>
      </ul>
      {groupId === 'catalog' && (
        <div data-testid="detail-catalog">
          <p data-testid="detail-catalog-readonly">
            입력 지원 안 됨. 카탈로그와 보유 수납함의 물리 치수는 이 프로젝트에서 바꾸지 않습니다.
          </p>
          <a href="#/catalog" data-testid="detail-catalog-editor">
            카탈로그에서 수정
          </a>
          <ul className="plan-list">
            {catalogs.map((entry) => (
              <li key={entry.path} data-testid={`catalog-path-${entry.path}`}>
                {entry.label}
              </li>
            ))}
            {catalogs.length === 0 && <li>연결된 보유 수납함이 없습니다.</li>}
          </ul>
        </div>
      )}
      {group?.id === 'staging' && <p className="field-help">{STAGING_LIMIT}</p>}
      {group && (
        <ul className="detail-fields">
          {group.fields.map((field) => {
            const value = readDetail(form, field.path);
            const view = normalizedView(state.normalizedInput, field.path);
            return (
              <li key={field.path}>
                <button
                  type="button"
                  className="text-pick"
                  data-testid={`detail-pick-${field.path}`}
                  aria-pressed={path === field.path}
                  onClick={() => onPath(field.path)}
                >
                  {field.label}
                  <span className="uncertainty-status">
                    {valueUnknown(value) ? '미확인' : '값 있음'}
                  </span>
                </button>
                {value && (value.kind === 'positiveLength' || value.kind === 'signedOffset') && (
                  <span className="uncertainty-status" data-testid={`detail-uncertainty-${field.path}`}>
                    {uncertaintyLabel(value.uncertainty)}
                  </span>
                )}
                <span
                  className="normalized-value"
                  data-testid={`detail-normalized-${field.path}`}
                  data-state={view.state}
                  data-nominal={view.nominal ?? ''}
                  data-minus={view.minusMm ?? ''}
                  data-plus={view.plusMm ?? ''}
                  data-verification={view.verification ?? ''}
                  data-origin={view.origin ?? ''}
                >
                  {normalizedText(view, field.kind)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {group && path && group.fields.some((field) => field.path === path) && (
        <FieldEditor
          session={session}
          state={state}
          field={group.fields.find((field) => field.path === path)!}
          supportKnown={(() => {
            const support = readDetail(form, 'space.staging.baseSupport');
            return support?.kind === 'baseSupport' && support.known;
          })()}
          inactive={inactiveBounds[path] ?? { minus: '', plus: '' }}
          pendingOrigin={pendingOrigin}
          onInactive={(bounds) => onInactive(path, bounds)}
          onPendingOrigin={onPendingOrigin}
        />
      )}
    </>
  );
}

function FieldEditor({
  session,
  state,
  field,
  supportKnown,
  inactive,
  pendingOrigin,
  onInactive,
  onPendingOrigin,
}: {
  session: ProjectSession;
  state: SessionSnapshot;
  field: DetailField;
  supportKnown: boolean;
  inactive: { minus: string; plus: string };
  pendingOrigin: MeasurementOrigin;
  onInactive: (bounds: { minus: string; plus: string }) => void;
  onPendingOrigin: (origin: MeasurementOrigin) => void;
}) {
  const form = state.form;
  if (!form) return null;
  const value = readDetail(form, field.path);
  if (!value) return null;
  const spaceId = form.space.id;
  const errors = diagnosticsFor(state.diagnostics, field.path, spaceId);
  const hold = state.unitHold?.fieldPath === field.path ? state.unitHold.code : null;
  return (
    <div className="detail-editor" data-testid="detail-editor">
      {value.kind === 'baseSupport' ? (
        <BaseSupportEditor
          session={session}
          value={value}
          pendingOrigin={pendingOrigin}
          onPendingOrigin={onPendingOrigin}
          evidenceNote={readEvidence(form, field.path)}
        />
      ) : (
        <NominalEditor
          session={session}
          field={field}
          value={value}
          loadBlocked={field.path === 'space.staging.baseSupport.loadLimit' && !supportKnown}
          inactive={inactive}
          pendingOrigin={pendingOrigin}
          onInactive={onInactive}
          onPendingOrigin={onPendingOrigin}
          evidenceNote={readEvidence(form, field.path)}
        />
      )}
      {hold && (
        <p className="field-error" data-testid="detail-unit-hold">
          {DIAGNOSTIC_TEXT[hold] ?? '단위를 바꾸지 않았습니다. 원래 입력을 유지합니다.'}
        </p>
      )}
      {errors.map((error) => (
        <p key={`${error.fieldPath}:${error.code}`} className="field-error" data-testid={`detail-error-${error.code}`}>
          {diagnosticText(error.code, error.fieldPath)}
        </p>
      ))}
    </div>
  );
}

function BaseSupportEditor({
  session,
  value,
  pendingOrigin,
  onPendingOrigin,
  evidenceNote,
}: {
  session: ProjectSession;
  value: Extract<DetailValue, { kind: 'baseSupport' }>;
  pendingOrigin: MeasurementOrigin;
  onPendingOrigin: (origin: MeasurementOrigin) => void;
  evidenceNote: ReturnType<typeof readEvidence>;
}) {
  const origin = value.origin ?? pendingOrigin;
  return (
    <fieldset className="detail-fieldset">
      <legend>앞쪽 지지면</legend>
      <label>
        <input
          type="radio"
          name="base-support"
          data-testid="detail-support-unknown"
          checked={!value.known}
          onChange={() => session.editBaseSupport(false)}
        />
        미확인
      </label>
      <label>
        <input
          type="radio"
          name="base-support"
          data-testid="detail-support-known"
          checked={value.known}
          onChange={() => session.editBaseSupport(true)}
        />
        지지면이 있다
      </label>
      <p className="field-help">지지면이 있다고 해서 하중이나 50000 g가 채워지지는 않습니다. 해당 없음으로 검사를 건너뛰지 않습니다.</p>
      {value.known && (
        <>
          <label className="field-label" htmlFor="origin-space.staging.baseSupport">
            출처
          </label>
          <select
            id="origin-space.staging.baseSupport"
            data-testid="detail-origin"
            value={origin}
            onChange={(event) => {
              const next = event.target.value as MeasurementOrigin;
              onPendingOrigin(next);
              session.editOrigin('space.staging.baseSupport', next);
            }}
          >
            {HUMAN_ORIGINS_LIST.map((entry) => (
              <option key={entry} value={entry}>
                {ORIGIN_LABEL[entry]}
              </option>
            ))}
          </select>
          <p className="field-help">사용자 측정을 골라도 확인됨이 되지 않습니다.</p>
          <EvidenceEditor
            session={session}
            path="space.staging.baseSupport"
            sourceKind={origin}
            note={evidenceNote?.note ?? ''}
            locator={evidenceNote?.locator ?? ''}
            observedAt={evidenceNote?.observedAt ?? ''}
          />
        </>
      )}
    </fieldset>
  );
}

function NominalEditor({
  session,
  field,
  value,
  loadBlocked,
  inactive,
  pendingOrigin,
  onInactive,
  onPendingOrigin,
  evidenceNote,
}: {
  session: ProjectSession;
  field: DetailField;
  value: Exclude<DetailValue, { kind: 'baseSupport' }>;
  loadBlocked: boolean;
  inactive: { minus: string; plus: string };
  pendingOrigin: MeasurementOrigin;
  onInactive: (bounds: { minus: string; plus: string }) => void;
  onPendingOrigin: (origin: MeasurementOrigin) => void;
  evidenceNote: ReturnType<typeof readEvidence>;
}) {
  const measurable = value.kind === 'positiveLength' || value.kind === 'signedOffset';
  const origin = value.origin ?? pendingOrigin;
  const unit: Unit = measurable ? value.unit : 'mm';
  const uncertainty = measurable ? value.uncertainty : null;
  const bounded = uncertainty?.state === 'bounded';
  const minus = bounded ? uncertainty.minusText : inactive.minus;
  const plus = bounded ? uncertainty.plusText : inactive.plus;
  const writeOrigin = (next: MeasurementOrigin) => {
    onPendingOrigin(next);
    if (value.origin) session.editOrigin(field.path, next);
  };
  if (loadBlocked) {
    return <p className="field-help">지지면이 미확인이면 하중을 입력하지 않습니다.</p>;
  }
  return (
    <div className="detail-grid">
      <label className="field-label" htmlFor={`nominal-${field.path}`}>
        값
      </label>
      <div className="dimension-input">
        <input
          id={`nominal-${field.path}`}
          data-testid="detail-nominal"
          value={value.text}
          inputMode={value.kind === 'signedOffset' ? 'text' : 'decimal'}
          autoComplete="off"
          placeholder="미측정"
          onChange={(event) => session.editNominal(field.path, event.target.value, origin)}
        />
        {value.kind === 'positiveLength' ? (
          <select
            aria-label={`${field.label} 단위`}
            data-testid="detail-unit"
            value={value.unit}
            onChange={(event) => session.setGroupUnit(field.path, event.target.value as Unit)}
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
          </select>
        ) : (
          <span aria-hidden="true">{value.kind === 'mass' ? 'g' : value.kind === 'quantity' ? '개' : 'mm'}</span>
        )}
      </div>
      {measurable && uncertainty && (
        <fieldset className="detail-fieldset">
          <legend>오차 범위</legend>
          <label>
            <input
              type="radio"
              name={`uncertainty-${field.path}`}
              data-testid="detail-uncertainty-unknown"
              checked={!bounded}
              onChange={() => {
                if (uncertainty.state === 'bounded') {
                  onInactive({ minus: uncertainty.minusText, plus: uncertainty.plusText });
                }
                session.editUncertainty(field.path, { state: 'unknown' });
              }}
            />
            미확인
          </label>
          <label>
            <input
              type="radio"
              name={`uncertainty-${field.path}`}
              data-testid="detail-uncertainty-bounded"
              checked={bounded}
              onChange={() => {
                session.editUncertainty(field.path, {
                  state: 'bounded',
                  minusText: inactive.minus,
                  plusText: inactive.plus,
                  unit,
                });
              }}
            />
            범위
          </label>
          {bounded && (
            <div className="detail-bounds">
              <label>
                빼기
                <input
                  data-testid="detail-minus"
                  value={minus}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="비어 있음"
                  onChange={(event) =>
                    session.editUncertainty(field.path, {
                      state: 'bounded',
                      minusText: event.target.value,
                      plusText: plus,
                      unit,
                    })
                  }
                />
              </label>
              <label>
                더하기
                <input
                  data-testid="detail-plus"
                  value={plus}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="비어 있음"
                  onChange={(event) =>
                    session.editUncertainty(field.path, {
                      state: 'bounded',
                      minusText: minus,
                      plusText: event.target.value,
                      unit,
                    })
                  }
                />
              </label>
            </div>
          )}
          <p className="field-help">한쪽만 비우면 저장되는 정규화 값 전체를 막습니다. 빈칸을 0으로 바꾸지 않습니다.</p>
        </fieldset>
      )}
      {value.kind === 'clearance' && (
        <p className="field-help">여유 값과 측정 오차는 따로 둡니다. 0은 직접 입력한 값이고, 빈칸은 미확인입니다.</p>
      )}
      {(value.kind === 'mass' || value.kind === 'quantity') && (
        <p className="field-help">
          {value.kind === 'mass' ? '그램' : '개수'} 단위는 바꾸지 않습니다. 0은 직접 입력한 값이고, 빈칸은 미확인입니다.
        </p>
      )}
      <label className="field-label" htmlFor={`origin-${field.path}`}>
        출처
      </label>
      <select
        id={`origin-${field.path}`}
        data-testid="detail-origin"
        value={origin}
        onChange={(event) => writeOrigin(event.target.value as MeasurementOrigin)}
      >
        {HUMAN_ORIGINS_LIST.map((entry) => (
          <option key={entry} value={entry}>
            {ORIGIN_LABEL[entry]}
          </option>
        ))}
        {value.origin && !HUMAN_ORIGINS_LIST.includes(value.origin) && (
          <option value={value.origin}>{ORIGIN_LABEL[value.origin]}</option>
        )}
      </select>
      <p className="field-help">사용자 측정을 골라도 확인됨이 되지 않습니다. 관측 시각은 직접 입력할 때만 기록합니다.</p>
      <EvidenceEditor
        session={session}
        path={field.path}
        sourceKind={origin}
        note={evidenceNote?.note ?? ''}
        locator={evidenceNote?.locator ?? ''}
        observedAt={evidenceNote?.observedAt ?? ''}
      />
    </div>
  );
}

function EvidenceEditor({
  session,
  path,
  sourceKind,
  note,
  locator,
  observedAt,
}: {
  session: ProjectSession;
  path: string;
  sourceKind: MeasurementOrigin;
  note: string;
  locator: string;
  observedAt: string;
}) {
  const write = (next: { note: string; locator: string; observedAt: string }) => {
    session.editEvidence(path, { ...next, sourceKind });
  };
  return (
    <fieldset className="detail-fieldset">
      <legend>근거</legend>
      <label htmlFor={`note-${path}`}>
        메모
        <textarea
          id={`note-${path}`}
          data-testid="detail-note"
          value={note}
          rows={3}
          onChange={(event) => write({ note: event.target.value, locator, observedAt })}
        />
      </label>
      <p className="field-help">
        메모는 사람이 쓴 기록입니다. 문장으로 충돌을 적어도 검사의 충돌, 통과, 실패, 숫자 구간, 확인을 만들지 않습니다.
      </p>
      <label htmlFor={`locator-${path}`}>
        위치
        <input
          id={`locator-${path}`}
          data-testid="detail-locator"
          value={locator}
          autoComplete="off"
          onChange={(event) => write({ note, locator: event.target.value, observedAt })}
        />
      </label>
      <label htmlFor={`observed-${path}`}>
        관측 시각
        <input
          id={`observed-${path}`}
          data-testid="detail-observed"
          value={observedAt}
          autoComplete="off"
          placeholder="2026-10-07T00:00:00Z"
          onChange={(event) => write({ note, locator, observedAt: event.target.value })}
        />
      </label>
    </fieldset>
  );
}

function useCompact(): boolean {
  const query = '(max-width: 47.999rem)';
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setCompact(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return compact;
}
