import { useState } from 'react';
import { Button } from 'react-aria-components';
import type {
  CatalogProvenanceReply,
  CatalogSnapshot,
  FieldSource,
  ProvenanceRow,
  SampleBundleKind,
  SourceScope,
  VerificationScope,
} from '../../contracts/generated/dto';
import type { CatalogRow } from '../../persistence/db';
import { catalogManager } from '../../app/sessionRegistry';
import {
  SOURCE_SCOPES,
  batchFromJson,
  blankRow,
  blankSource,
  csvToBatch,
  type ProvenanceIssue,
} from './provenance';

const CODE_TEXT: Record<string, string> = {
  invalid_id: 'ID 형식이 맞지 않습니다',
  required_text_missing: '필수 항목이 비어 있습니다',
  text_too_long: '글자가 너무 깁니다',
  primitive_missing: '수납 형태를 고르지 않았습니다',
  unsupported_primitive: '지원하지 않는 수납 형태입니다',
  invalid_number: '숫자 형식이 아닙니다',
  numeric_field_too_long: '숫자가 너무 깁니다',
  numeric_overflow: '숫자가 너무 큽니다',
  scalar_out_of_range: '허용 범위를 벗어났습니다',
  submillimeter_precision: '1 mm보다 작은 값은 올리지 않습니다',
  invalid_locator: '링크 형식이 올바르지 않습니다',
  invalid_timestamp: '확인일은 UTC RFC3339여야 합니다',
  photo_bytes_refused: '사진 바이트는 받지 않습니다. 파일 이름만 남깁니다',
  note_too_long: '메모가 너무 깁니다',
  duplicate_source_scope: '같은 출처 범위가 두 번입니다',
  input_limit_exceeded: '한도를 넘었습니다',
  evidence_id_too_long: '옵션 ID가 너무 길어 출처를 붙일 수 없습니다',
  offer_id_too_long: '옵션 ID가 너무 길어 판매처를 붙일 수 없습니다',
  option_not_merged: '같은 옵션 ID의 다른 크기는 합치지 않고 격리했습니다',
  duplicate_row: '같은 행이 중복입니다',
  product_identity_conflict: '같은 상품 ID의 브랜드·모델이 서로 다릅니다',
  inner_left_unknown: '내경이 비어 있어 외경으로 채우지 않았습니다',
  verification_not_promoted: '검증 범위를 기록했지만 사실 상태는 미확인입니다',
  protrusion_recorded: '돌출 길이는 출처에만 남고 상자 치수로 바꾸지 않았습니다',
  empty_import: '검토할 행이 없습니다',
  invalid_digest: '기존 카탈로그 다이제스트 형식이 아닙니다',
  catalog_rejected: '카탈로그 검증을 통과하지 못해 저장하지 않습니다',
  invalid_csv: 'CSV를 해석할 수 없습니다',
  csv_header_invalid: 'CSV 열 이름이 규격과 다릅니다',
  row_length_mismatch: 'CSV 행의 칸 수가 맞지 않아 전체를 격리했습니다',
  invalid_verification: '검증 범위는 unknown, unverified, verified만 씁니다',
  invalid_json: 'JSON을 해석할 수 없습니다',
  catalog_schema_invalid: 'JSON이 출처 검토 묶음이 아닙니다',
  invalid_request_shape: '검토 요청 형식이 맞지 않습니다',
};

const SCOPE_TEXT: Record<SourceScope, string> = {
  brand: '브랜드',
  model: '모델',
  option: '옵션',
  seller: '판매처',
  outer: '외경',
  inner: '내경',
  protrusion: '돌출',
  load: '하중',
};

type Mode = 'manual' | 'csv' | 'json';
type Phase = 'idle' | 'pending' | 'ready' | 'quarantine' | 'unavailable' | 'saved';

function codeText(code: string): string {
  return CODE_TEXT[code] ?? code;
}

function nominal(fact: { state: string; value?: { nominal?: number } | null }): string {
  if (fact.state === 'known' && fact.value && typeof fact.value.nominal === 'number')
    return `${fact.value.nominal} mm`;
  return '미확인';
}

function SnapshotFacts({ snapshot }: { snapshot: CatalogSnapshot }) {
  return (
    <ul className="plan-list" data-testid="provenance-variants">
      {snapshot.variants.map((variant) => (
        <li
          key={variant.id}
          data-testid={`provenance-variant-${variant.id}`}
          data-inner={variant.dimensions.inner.width.state}
          data-outer={variant.dimensions.outer.width.state}
        >
          {variant.optionLabel} · 외경 {nominal(variant.dimensions.outer.width)} · 내경{' '}
          {nominal(variant.dimensions.inner.width)}
        </li>
      ))}
    </ul>
  );
}

export function ProvenancePanel({
  catalogs,
  onCommitted,
}: {
  catalogs: CatalogRow[];
  onCommitted: () => void;
}) {
  const preserved = catalogs[0]?.catalogDigest ?? null;
  const [mode, setMode] = useState<Mode>('manual');
  const [draft, setDraft] = useState<ProvenanceRow>(blankRow());
  const [source, setSource] = useState<FieldSource>(blankSource());
  const [rows, setRows] = useState<ProvenanceRow[]>([]);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [reply, setReply] = useState<CatalogProvenanceReply | null>(null);
  const [issues, setIssues] = useState<ProvenanceIssue[]>([]);
  const [error, setError] = useState('');

  function setField<K extends keyof ProvenanceRow>(key: K, value: ProvenanceRow[K]) {
    setDraft({ ...draft, [key]: value });
  }

  function addSource() {
    const next = draft.sources.filter((item) => item.scope !== source.scope);
    setDraft({ ...draft, sources: [...next, source] });
    setSource(blankSource(source.scope));
  }

  function rowsForReview(): ProvenanceRow[] {
    const started = draft.model.trim() !== '' || draft.optionId.trim() !== '';
    return started ? [...rows, draft] : rows;
  }

  async function run(action: Parameters<typeof catalogManager.review>[0]) {
    setPhase('pending');
    setReply(null);
    setIssues([]);
    setError('');
    const reviewed = await catalogManager.review(action);
    if (reviewed.status === 'unavailable') {
      setPhase('unavailable');
      setError(codeText(reviewed.error));
      return;
    }
    setReply(reviewed.reply);
    setPhase(reviewed.reply.quarantined || reviewed.reply.snapshot === null ? 'quarantine' : 'ready');
  }

  async function reviewCurrent() {
    if (mode === 'csv') {
      const parsed = csvToBatch(text, preserved);
      if ('issues' in parsed) {
        setReply(null);
        setIssues(parsed.issues);
        setPhase('quarantine');
        return;
      }
      await run({ kind: 'review', batch: parsed.batch });
      return;
    }
    if (mode === 'json') {
      const parsed = batchFromJson(text, preserved);
      if ('issues' in parsed) {
        setReply(null);
        setIssues(parsed.issues);
        setPhase('quarantine');
        return;
      }
      await run({ kind: 'review', batch: parsed.batch });
      return;
    }
    await run({
      kind: 'review',
      batch: {
        catalogVersion: 'catalog-manual',
        ingestionVersion: 'provenance-1',
        rows: rowsForReview(),
        existingDigest: preserved,
      },
    });
  }

  async function loadSample(bundle: SampleBundleKind) {
    await run({ kind: 'sample', bundle });
  }

  async function commit() {
    if (!reply) return;
    setPhase('pending');
    const saved = await catalogManager.commitReviewed(reply);
    if (saved === 'blocked') {
      setPhase('quarantine');
      return;
    }
    setPhase('saved');
    setRows([]);
    setDraft(blankRow());
    onCommitted();
  }

  const field = (key: keyof ProvenanceRow, label: string) => (
    <label key={key} className="edit-inspector-field">
      <span>{label}</span>
      <input
        value={String(draft[key])}
        data-testid={`provenance-${key}`}
        onChange={(event) => setField(key, event.target.value)}
      />
    </label>
  );

  return (
    <section className="measurement-panel" aria-labelledby="provenance-title" data-testid="provenance-panel">
      <div className="section-kicker">실상품 출처</div>
      <h2 id="provenance-title">출처·옵션·치수 검토</h2>
      <p className="session-note">
        브랜드·모델·옵션·판매처와 외경·내경·돌출·하중은 출처가 따로입니다. 비어 있는
        내경은 외경이 되지 않습니다. 한 행이라도 격리되면 기존 카탈로그는 그대로입니다.
      </p>
      <p className="session-note" data-testid="provenance-preserved" data-untouched="true">
        {preserved
          ? `지키는 카탈로그 ${preserved.slice(0, 12)}…`
          : '저장된 카탈로그가 없습니다.'}
      </p>
      <div className="form-actions" role="group" aria-label="샘플 묶음">
        {(
          [
            ['synthetic', '합성 샘플'],
            ['verified', '검증 범위 샘플'],
            ['unverified', '미확인 샘플'],
          ] as const
        ).map(([bundle, label]) => (
          <Button
            key={bundle}
            className="button button-secondary"
            data-testid={`provenance-sample-${bundle}`}
            onPress={() => void loadSample(bundle)}
          >
            {label}
          </Button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void reviewCurrent();
        }}
      >
        <div className="form-actions" role="radiogroup" aria-label="검토 입력">
          {(
            [
              ['manual', '직접 입력'],
              ['csv', 'CSV'],
              ['json', 'JSON'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={mode === kind}
              className={`button ${mode === kind ? 'button-primary' : 'button-secondary'}`}
              data-testid={`provenance-mode-${kind}`}
              onClick={() => {
                setMode(kind);
                setReply(null);
                setIssues([]);
                setPhase('idle');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'manual' && (
          <div className="edit-inspector-fields" data-testid="provenance-fields">
            {field('model', '모델')}
            {field('brand', '브랜드 (모르면 비우기)')}
            {field('category', '분류')}
            {field('productId', '상품 ID')}
            {field('optionId', '옵션 ID')}
            {field('optionLabel', '옵션 이름')}
            {field('sellerId', '판매처 ID (없으면 비우기)')}
            <label className="edit-inspector-field">
              <span>수납 형태</span>
              <select
                value={draft.primitive}
                data-testid="provenance-primitive"
                onChange={(event) => setField('primitive', event.target.value)}
              >
                <option value="">선택</option>
                <option value="directPlacement">직접 배치</option>
                <option value="openBin">열린 수납</option>
                <option value="tray">트레이</option>
                <option value="verticalFile">세로 파일</option>
              </select>
            </label>
            {field('outerWidthMm', '외경 폭 mm')}
            {field('outerDepthMm', '외경 깊이 mm')}
            {field('outerHeightMm', '외경 높이 mm')}
            {field('innerWidthMm', '내경 폭 mm (모르면 비우기)')}
            {field('innerDepthMm', '내경 깊이 mm')}
            {field('innerHeightMm', '내경 높이 mm')}
            {field('protrusionMm', '돌출 mm (모르면 비우기)')}
            {field('loadGrams', '하중 g (모르면 비우기)')}
            <fieldset className="edit-inspector-fields" data-testid="provenance-source">
              <legend>이 행의 출처 하나</legend>
              <label className="edit-inspector-field">
                <span>범위</span>
                <select
                  value={source.scope}
                  data-testid="provenance-source-scope"
                  onChange={(event) =>
                    setSource({ ...source, scope: event.target.value as SourceScope })
                  }
                >
                  {SOURCE_SCOPES.map((scope) => (
                    <option key={scope} value={scope}>
                      {SCOPE_TEXT[scope]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="edit-inspector-field">
                <span>출처 URL</span>
                <input
                  value={source.url ?? ''}
                  data-testid="provenance-source-url"
                  onChange={(event) =>
                    setSource({ ...source, url: event.target.value === '' ? null : event.target.value })
                  }
                />
              </label>
              <label className="edit-inspector-field">
                <span>확인일</span>
                <input
                  value={source.confirmedAt ?? ''}
                  data-testid="provenance-source-confirmed"
                  placeholder="2026-01-15T00:00:00Z"
                  onChange={(event) =>
                    setSource({
                      ...source,
                      confirmedAt: event.target.value === '' ? null : event.target.value,
                    })
                  }
                />
              </label>
              <label className="edit-inspector-field">
                <span>사진 파일 이름</span>
                <input
                  value={source.photoRef ?? ''}
                  data-testid="provenance-source-photo"
                  onChange={(event) =>
                    setSource({
                      ...source,
                      photoRef: event.target.value === '' ? null : event.target.value,
                    })
                  }
                />
              </label>
              <label className="edit-inspector-field">
                <span>검증 범위</span>
                <select
                  value={source.verificationScope}
                  data-testid="provenance-source-verification"
                  onChange={(event) =>
                    setSource({
                      ...source,
                      verificationScope: event.target.value as VerificationScope,
                    })
                  }
                >
                  <option value="unknown">unknown</option>
                  <option value="unverified">unverified</option>
                  <option value="verified">verified</option>
                </select>
              </label>
              <Button className="button button-secondary" data-testid="provenance-add-source" onPress={addSource}>
                이 출처 추가 ({draft.sources.length})
              </Button>
            </fieldset>
            <Button
              className="button button-secondary"
              data-testid="provenance-add-row"
              onPress={() => {
                setRows([...rows, draft]);
                setDraft(blankRow());
              }}
            >
              행 추가 ({rows.length})
            </Button>
          </div>
        )}
        {mode !== 'manual' && (
          <label className="edit-inspector-field">
            <span>{mode === 'csv' ? 'CSV' : 'JSON 검토 묶음'}</span>
            <textarea
              rows={8}
              value={text}
              data-testid="provenance-text"
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        )}
        <div className="form-actions">
          <button type="submit" className="button button-primary" data-testid="provenance-review">
            {phase === 'pending' ? '검토 중…' : 'Rust로 검토'}
          </button>
        </div>
      </form>
      <div data-testid="provenance-status" data-state={phase} role="status" aria-live="polite">
        {phase === 'pending' && <p className="session-note">검토 중입니다.</p>}
        {phase === 'unavailable' && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        {issues.length > 0 && (
          <div className="notice notice-error" role="alert" data-testid="provenance-local-issue">
            <ul className="diagnostic-list">
              {issues.map((issue) => (
                <li key={`${issue.fieldPath}-${issue.code}`}>
                  {codeText(issue.code)} — {issue.fieldPath}
                </li>
              ))}
            </ul>
          </div>
        )}
        {reply && (
          <div data-testid="provenance-reply" data-quarantined={String(reply.quarantined)}>
            {reply.quarantined ? (
              <p className="notice notice-error" role="alert" data-testid="provenance-quarantine">
                불완전한 가져오기라 저장하지 않았습니다. 기존 카탈로그는 바꾸지 않습니다.
              </p>
            ) : (
              <p className="notice notice-ready" data-testid="provenance-ready">
                모든 행이 준비되었습니다. 저장하면 새 카탈로그가 추가되고, 기존 다이제스트는
                그대로입니다.
              </p>
            )}
            <ul className="plan-list" data-testid="provenance-rows">
              {reply.diagnoses.map((diagnosis) => (
                <li
                  key={diagnosis.rowIndex}
                  data-testid={`provenance-row-${diagnosis.rowIndex}`}
                  data-disposition={diagnosis.disposition}
                >
                  행 {diagnosis.rowIndex + 1} · {diagnosis.disposition === 'quarantine' ? '격리' : '준비'}
                  {diagnosis.duplicateOf !== null ? ` · 중복 기준 행 ${diagnosis.duplicateOf + 1}` : ''}
                  <ul>
                    {diagnosis.codes.map((code) => (
                      <li key={code}>{codeText(code)}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {reply.batchCodes.length > 0 && (
              <ul className="diagnostic-list" data-testid="provenance-batch-codes">
                {reply.batchCodes.map((code) => (
                  <li key={code}>{codeText(code)}</li>
                ))}
              </ul>
            )}
            {reply.snapshot && <SnapshotFacts snapshot={reply.snapshot} />}
            {reply.snapshot && !reply.quarantined && (
              <Button className="button button-primary" data-testid="provenance-commit" onPress={() => void commit()}>
                이 검토본 저장
              </Button>
            )}
          </div>
        )}
        {phase === 'saved' && (
          <p className="session-note" data-testid="provenance-saved">
            새 카탈로그로 저장했습니다. 이전 카탈로그 바이트는 그대로입니다.
          </p>
        )}
      </div>
    </section>
  );
}
