import { useEffect, useMemo, useState } from 'react';
import { Button } from 'react-aria-components';
import type { CatalogSnapshot, Diagnostic } from '../contracts/generated/dto';
import {
  catalogManager,
  ensureBundledCatalog,
  ownedManager,
} from './sessionRegistry';
import type { CatalogRow, OwnedContainerRow } from '../persistence/db';
import {
  blankOwnedRaw,
  EMPTY_OWNED_FIELDS,
  ownedToRaw,
  rawPhysicalFromVariant,
  type OwnedFormFields,
} from '../features/owned/model';
import type { ImportEntry, ImportIssue } from '../features/catalog/import';
import { isIdText, type StageResult } from '../features/catalog/manager';
import { navigate } from './router';
import { Shell } from './ProjectScreen';

const ISSUE_TEXT: Record<string, string> = {
  invalid_id: 'ID 형식이 맞지 않습니다 (영문/숫자/_ : -, 96자 이내)',
  required_text_missing: '필수 항목이 비어 있습니다',
  duplicate_id: '같은 ID가 두 번 나왔습니다',
  invalid_locator: '링크 형식이 올바르지 않습니다',
  invalid_timestamp: '날짜·시각은 UTC RFC3339 형식이어야 합니다',
  row_length_mismatch: 'CSV 행의 칸 수가 맞지 않습니다',
  invalid_json: 'JSON을 해석할 수 없습니다',
  invalid_csv: 'CSV를 해석할 수 없습니다',
  csv_header_invalid: 'CSV 첫 행(열 이름)이 규격과 다릅니다',
  catalog_schema_invalid: 'JSON이 카탈로그 입력 계약과 맞지 않습니다',
  import_too_large: '가져오기 크기가 허용 범위를 넘었습니다',
  empty_import: '가져올 항목이 없습니다',
  unsupported_field_path: '이 필드 경로는 변환할 수 없습니다',
  field_kind_mismatch: '필드 종류가 경로와 맞지 않습니다',
};

const DIAGNOSTIC_TEXT: Record<string, string> = {
  submillimeter_precision: '1 mm보다 작은 단위는 반올림하지 않습니다.',
  numeric_field_too_long: '입력값이 너무 깁니다.',
  numeric_overflow: '입력값이 너무 큽니다.',
  invalid_number: '숫자 형식을 확인해 주세요.',
  out_of_range: '허용 범위를 벗어났습니다.',
  required_text_missing: '필수 항목이 비어 있습니다.',
  duplicate_id: '같은 ID가 두 번 나왔습니다.',
  dangling_variant_ref: '연결된 옵션을 찾을 수 없습니다.',
  invalid_locator: '링크 형식이 올바르지 않습니다.',
  invalid_timestamp: '날짜·시각 형식을 확인해 주세요.',
  not_applicable_not_allowed: '이 필드는 "해당 없음"을 쓸 수 없습니다.',
  input_limit_exceeded: '허용 개수를 넘었습니다.',
};

function issueText(issue: ImportIssue): string {
  return `${ISSUE_TEXT[issue.code] ?? issue.code} — ${issue.fieldPath}`;
}
function diagnosticText(d: Diagnostic): string {
  return `${DIAGNOSTIC_TEXT[d.code] ?? d.code} — ${d.fieldPath}`;
}

/** Demo/imported label: the stored origin decides — never inferred. */
function catalogBadge(row: CatalogRow): { text: string; demo: boolean } {
  if (row.origin === 'synthetic-bundled' || row.catalog.sourceKind === 'synthetic')
    return { text: '데모 · 합성 데이터', demo: true };
  return { text: `가져온 카탈로그 · ${row.origin}`, demo: false };
}

function blankEntry(): ImportEntry {
  return {
    productId: '',
    productName: '',
    category: '',
    brand: '',
    variantId: '',
    optionLabel: '',
    primitive: 'openBin',
    uprightOnly: true,
    outerWidthMm: '',
    outerDepthMm: '',
    outerHeightMm: '',
    innerWidthMm: '',
    innerDepthMm: '',
    innerHeightMm: '',
    massGrams: '',
    offerId: '',
    sellerId: '',
    packQuantity: '',
    packPriceKrw: '',
    inventory: '',
    shipping: '',
    shippingFeeKrw: '',
    url: '',
    observedAt: '',
    note: '',
  };
}

function EntryFields({
  entry,
  onChange,
}: {
  entry: ImportEntry;
  onChange: (entry: ImportEntry) => void;
}) {
  const field = (
    key: keyof ImportEntry,
    label: string,
    placeholder = '',
  ) => (
    <label key={key} className="edit-inspector-field">
      <span>{label}</span>
      <input
        value={String(entry[key])}
        placeholder={placeholder}
        data-testid={`entry-${key}`}
        onChange={(e) => onChange({ ...entry, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="edit-inspector-fields" data-testid="entry-fields">
      {field('productName', '제품명', '리빙박스 56L')}
      {field('category', '분류', '수납함')}
      {field('productId', '제품 ID', 'prod-living-56')}
      {field('brand', '브랜드 (모르면 비우기)')}
      {field('variantId', '옵션 ID', 'var-living-56-clear')}
      {field('optionLabel', '옵션 이름', '56L 투명')}
      {field('outerWidthMm', '외경 폭 mm')}
      {field('outerDepthMm', '외경 깊이 mm')}
      {field('outerHeightMm', '외경 높이 mm')}
      {field('innerWidthMm', '내경 폭 mm (모르면 비우기)')}
      {field('innerDepthMm', '내경 깊이 mm')}
      {field('innerHeightMm', '내경 높이 mm')}
      {field('massGrams', '무게 g')}
      {field('offerId', '판매 항목 ID (없으면 비우기)', 'offer-a-56')}
      {field('sellerId', '판매처 ID', 'seller-a')}
      {field('packQuantity', '묶음 수량')}
      {field('packPriceKrw', '묶음 가격 원')}
      <label className="edit-inspector-field">
        <span>재고 상태 (모르면 비우기)</span>
        <select
          value={entry.inventory}
          data-testid="entry-inventory"
          onChange={(e) =>
            onChange({
              ...entry,
              inventory: e.target.value as ImportEntry['inventory'],
            })
          }
        >
          <option value="">미확인</option>
          <option value="inStock">재고 있음</option>
          <option value="outOfStock">품절</option>
        </select>
      </label>
      <label className="edit-inspector-field">
        <span>배송 규칙 (모르면 비우기)</span>
        <select
          value={entry.shipping}
          data-testid="entry-shipping"
          onChange={(e) =>
            onChange({ ...entry, shipping: e.target.value as ImportEntry['shipping'] })
          }
        >
          <option value="">미확인</option>
          <option value="free">무료 배송</option>
          <option value="fixed">고정 배송비</option>
          <option value="complex">조건부/복합</option>
        </select>
      </label>
      {entry.shipping === 'fixed' && field('shippingFeeKrw', '배송비 원')}
      {field('url', '상품 링크 (없으면 비우기)')}
      {field('observedAt', '관측 시각 (예 2025-01-02T03:04:05Z)')}
      {field('note', '근거 메모')}
    </div>
  );
}

function CatalogImport({ onCommitted }: { onCommitted: () => void }) {
  const [source, setSource] = useState<'manual' | 'json' | 'csv'>('manual');
  const [entry, setEntry] = useState<ImportEntry>(blankEntry());
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [text, setText] = useState('');
  const [metaVersion, setMetaVersion] = useState('catalog-user-1');
  const [result, setResult] = useState<StageResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState<string | null>(null);

  async function stage() {
    setBusy(true);
    setCommitted(null);
    const meta = {
      catalogVersion: metaVersion,
      ingestionVersion: 'manual-1',
      observedAt: null,
      note: '사용자 직접 입력',
    };
    const next =
      source === 'json'
        ? await catalogManager.stageJson(text)
        : source === 'csv'
          ? await catalogManager.stageCsv(text, meta)
          : await catalogManager.stageEntries(entries, meta);
    setResult(next);
    setBusy(false);
  }
  async function commit(snapshot: CatalogSnapshot) {
    setBusy(true);
    await catalogManager.commit(snapshot).catch(() => undefined);
    setBusy(false);
    setCommitted(snapshot.catalogDigest);
    setResult(null);
    onCommitted();
  }
  return (
    <section className="measurement-panel" aria-labelledby="import-title">
      <div className="section-kicker">카탈로그 가져오기</div>
      <h3 id="import-title">직접 확인한 제품 정보를 등록합니다.</h3>
      <p className="session-note">
        입력한 내용은 먼저 Rust 검증을 거친 뒤에만 저장됩니다. 비워 둔 항목은
        0이나 &lsquo;있음&rsquo;이 아니라 &lsquo;미확인&rsquo;으로 남습니다.
        업로드만으로 실측·검증 상태가 되지는 않습니다.
      </p>
      <div className="form-actions" role="tablist" aria-label="가져오기 방식">
        {(
          [
            ['manual', '직접 입력'],
            ['json', 'JSON 붙여넣기'],
            ['csv', 'CSV 붙여넣기'],
          ] as const
        ).map(([kind, label]) => (
          <Button
            key={kind}
            className={`button ${source === kind ? 'button-primary' : 'button-secondary'}`}
            onPress={() => {
              setSource(kind);
              setResult(null);
            }}
            data-testid={`import-source-${kind}`}
          >
            {label}
          </Button>
        ))}
      </div>
      {source !== 'json' && (
        <label className="edit-inspector-field">
          <span>카탈로그 버전 이름</span>
          <input
            value={metaVersion}
            data-testid="import-catalog-version"
            onChange={(e) => setMetaVersion(e.target.value)}
          />
        </label>
      )}
      {source === 'manual' && (
        <>
          <EntryFields
            entry={entry}
            onChange={setEntry}
          />
          <div className="form-actions">
            <Button
              className="button button-secondary"
              data-testid="add-entry"
              onPress={() => {
                setEntries([...entries, entry]);
                setEntry(blankEntry());
              }}
            >
              항목 추가 ({entries.length})
            </Button>
          </div>
          {entries.length > 0 && (
            <ul className="plan-list" data-testid="staged-entries">
              {entries.map((e, i) => (
                <li key={i}>
                  {e.productName || '(이름 없음)'} · {e.variantId || '옵션 ID 없음'}
                  <Button
                    className="button button-quiet"
                    data-testid={`remove-entry-${i}`}
                    onPress={() => setEntries(entries.filter((_, j) => j !== i))}
                  >
                    제거
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {source !== 'manual' && (
        <label className="edit-inspector-field">
          <span>{source === 'json' ? 'JSON 문서' : 'CSV 내용'}</span>
          <textarea
            rows={8}
            value={text}
            data-testid="import-text"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      )}
      <div className="form-actions">
        <Button
          className="button button-primary"
          data-testid="stage-import"
          isDisabled={busy}
          onPress={() => void stage()}
        >
          {busy ? '검증 중…' : 'Rust로 검증'}
        </Button>
      </div>
      {result?.status === 'rejected' && (
        <div className="notice notice-error" role="alert" data-testid="import-rejected">
          <strong>검증을 통과하지 못해 저장하지 않았습니다.</strong>
          <ul className="diagnostic-list">
            {result.issues.map((issue, i) => (
              <li key={`i-${i}`} className="field-error">
                {issueText(issue)}
              </li>
            ))}
            {result.diagnostics.map((d, i) => (
              <li key={`d-${i}`} className="field-error">
                {diagnosticText(d)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result?.status === 'unavailable' && (
        <p className="notice notice-error" role="alert" data-testid="import-unavailable">
          검증기를 연결하지 못했습니다: {result.error}
        </p>
      )}
      {result?.status === 'validated' && (
        <div className="notice notice-ready" data-testid="import-validated">
          <strong>검증 통과 — 저장하면 이 스냅샷이 고정됩니다.</strong>
          <p>
            제품 {result.snapshot.products.length} · 옵션{' '}
            {result.snapshot.variants.length} · 판매 항목{' '}
            {result.snapshot.offers.length} · 다이제스트{' '}
            {result.snapshot.catalogDigest.slice(0, 12)}…
          </p>
          {result.issues.length > 0 && (
            <ul className="diagnostic-list">
              {result.issues.map((issue, i) => (
                <li key={i} className="session-note">
                  {issueText(issue)}
                </li>
              ))}
            </ul>
          )}
          <Button
            className="button button-primary"
            data-testid="commit-import"
            isDisabled={busy}
            onPress={() => void commit(result.snapshot)}
          >
            이 카탈로그 저장
          </Button>
        </div>
      )}
      {committed && (
        <p className="session-note" data-testid="import-committed">
          카탈로그 {committed.slice(0, 12)}… 를 저장했습니다.
        </p>
      )}
    </section>
  );
}

function OwnedLibrary({
  catalogs,
  owned,
  onChanged,
}: {
  catalogs: CatalogRow[];
  owned: OwnedContainerRow[];
  onChanged: () => void;
}) {
  const [fields, setFields] = useState<OwnedFormFields>({ ...EMPTY_OWNED_FIELDS });
  const [variantPick, setVariantPick] = useState('');
  /** Revision + original raw body of the row being edited; null = new entry. */
  const [editing, setEditing] = useState<{
    id: string;
    revision: string;
    raw: import('../contracts/generated/dto').RawOwnedContainerDto;
  } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const variants = useMemo(
    () =>
      catalogs.flatMap((c) =>
        c.catalog.variants.map((v) => ({ catalog: c, variant: v })),
      ),
    [catalogs],
  );
  async function register() {
    setBusy(true);
    setResult(null);
    // Editing preserves the stored physical body — only the editable fields
    // (quantities/condition/allowedUse) are re-entered; a variant pick is a
    // new physical copy and only allowed while registering.
    const raw = editing ? structuredClone(editing.raw) : blankOwnedRaw(fields);
    if (editing) {
      // Editing preserves the stored physical body — only quantities and
      // descriptive fields are re-entered.
      const fresh = blankOwnedRaw(fields);
      raw.quantityOwned = fresh.quantityOwned;
      raw.quantityAvailable = fresh.quantityAvailable;
      raw.condition = fresh.condition;
      raw.allowedUse = fresh.allowedUse;
    }
    if (variantPick && !editing) {
      const [digest, variantId] = variantPick.split(':');
      const found = variants.find(
        (v) => v.catalog.catalogDigest === digest && v.variant.id === variantId,
      );
      if (!found || !digest || !variantId) {
        setResult('옵션을 찾을 수 없습니다.');
        setBusy(false);
        return;
      }
      raw.variantRef = { variantId, catalogDigest: digest };
      raw.physical = rawPhysicalFromVariant(found.variant);
    }
    const next = await ownedManager.register(raw, editing?.revision ?? '0');
    setBusy(false);
    if (next.status === 'saved') {
      setResult(null);
      setEditing(null);
      setFields({ ...EMPTY_OWNED_FIELDS });
      setVariantPick('');
      onChanged();
    } else if (next.status === 'rejected') {
      setResult(
        next.diagnostics.map(diagnosticText).join(' / ') || '등록 값을 확인해 주세요.',
      );
    } else {
      setResult(next.status === 'unavailable' ? next.error : '다른 변경이 먼저 저장되었습니다.');
    }
  }
  /** Load a stored row into the form; saving writes under its CAS revision. */
  function startEdit(row: OwnedContainerRow) {
    const raw = ownedToRaw(row.container);
    const text = (f: { state: string; value?: { text: string } }) =>
      f.state === 'known' && f.value ? f.value.text : '';
    const dims = raw.physical.dimensions;
    setFields({
      id: raw.id,
      quantityOwned: text(raw.quantityOwned),
      quantityAvailable: text(raw.quantityAvailable),
      condition: text(raw.condition),
      allowedUse: text(raw.allowedUse),
      outerWidthMm: dims.outer.width.text,
      outerDepthMm: dims.outer.depth.text,
      outerHeightMm: dims.outer.height.text,
      innerWidthMm: dims.inner.width.text,
      innerDepthMm: dims.inner.depth.text,
      innerHeightMm: dims.inner.height.text,
      massGrams:
        raw.physical.mass.state === 'known' ? raw.physical.mass.value.text : '',
    });
    setEditing({ id: row.ownedContainerId, revision: row.revision, raw });
    setResult(null);
  }
  async function remove(row: OwnedContainerRow) {
    setBusy(true);
    const next = await ownedManager.remove(row.ownedContainerId, row.revision);
    setBusy(false);
    if (next.status !== 'saved') setResult('삭제가 충돌했습니다 — 새로고침 후 다시 시도해 주세요.');
    else onChanged();
  }
  return (
    <section className="measurement-panel" aria-labelledby="owned-title">
      <div className="section-kicker">보유 수납함</div>
      <h3 id="owned-title">가지고 있는 수납함을 등록합니다.</h3>
      <p className="session-note">
        치수를 복사해 온 옵션을 고르거나 비워 두세요 — 비워 둔 치수는
        &lsquo;미확인&rsquo;으로 저장되어 채워진 것처럼 취급되지 않습니다.
      </p>
      <ul className="plan-list" data-testid="owned-list">
        {owned.map((row) => (
          <li key={row.ownedContainerId}>
            <strong>{row.ownedContainerId}</strong>
            <span className="session-note">
              {' '}
              리비전 {row.revision}
              {row.container.variantRef
                ? ` · 옵션 ${row.container.variantRef.variantId} 기반`
                : ' · 직접 입력'}
              {row.container.quantityOwned.state === 'known'
                ? ` · ${row.container.quantityOwned.value}개 보유`
                : ' · 수량 미확인'}
            </span>
            <Button
              className="button button-quiet"
              data-testid={`owned-edit-${row.ownedContainerId}`}
              isDisabled={busy}
              onPress={() => startEdit(row)}
            >
              수정
            </Button>
            <Button
              className="button button-quiet"
              data-testid={`owned-delete-${row.ownedContainerId}`}
              isDisabled={busy}
              onPress={() => void remove(row)}
            >
              삭제
            </Button>
          </li>
        ))}
        {owned.length === 0 && <li>등록된 보유 수납함이 없습니다.</li>}
      </ul>
      <div className="edit-inspector-fields">
        <label className="edit-inspector-field">
          <span>수납함 ID</span>
          <input
            value={fields.id}
            data-testid="owned-id"
            onChange={(e) => setFields({ ...fields, id: e.target.value })}
          />
        </label>
        <label className="edit-inspector-field">
          <span>보유 수량</span>
          <input
            value={fields.quantityOwned}
            data-testid="owned-quantity-owned"
            onChange={(e) => setFields({ ...fields, quantityOwned: e.target.value })}
          />
        </label>
        <label className="edit-inspector-field">
          <span>사용 가능 수량</span>
          <input
            value={fields.quantityAvailable}
            data-testid="owned-quantity-available"
            onChange={(e) => setFields({ ...fields, quantityAvailable: e.target.value })}
          />
        </label>
        <label className="edit-inspector-field">
          <span>상태 (예: 양호)</span>
          <input
            value={fields.condition}
            data-testid="owned-condition"
            onChange={(e) => setFields({ ...fields, condition: e.target.value })}
          />
        </label>
        <label className="edit-inspector-field">
          <span>용도 제한 (없으면 비우기)</span>
          <input
            value={fields.allowedUse}
            data-testid="owned-allowed-use"
            onChange={(e) => setFields({ ...fields, allowedUse: e.target.value })}
          />
        </label>
        {!editing &&
          (
            [
              ['outerWidthMm', '외경 폭 mm'],
              ['outerDepthMm', '외경 깊이 mm'],
              ['outerHeightMm', '외경 높이 mm'],
              ['innerWidthMm', '내경 폭 mm'],
              ['innerDepthMm', '내경 깊이 mm'],
              ['innerHeightMm', '내경 높이 mm'],
              ['massGrams', '무게 g'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="edit-inspector-field">
              <span>{label} (모르면 비우기)</span>
              <input
                value={fields[key]}
                data-testid={`owned-${key}`}
                onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
              />
            </label>
          ))}
        <label className="edit-inspector-field">
          <span>카탈로그 옵션에서 치수 복사 (선택)</span>
          <select
            value={variantPick}
            data-testid="owned-variant-pick"
            onChange={(e) => setVariantPick(e.target.value)}
          >
            <option value="">복사하지 않음 — 직접 입력</option>
            {variants.map(({ catalog, variant }) => (
              <option
                key={`${catalog.catalogDigest}:${variant.id}`}
                value={`${catalog.catalogDigest}:${variant.id}`}
              >
                {variant.optionLabel} ({catalog.catalogVersion}
                {catalog.origin === 'synthetic-bundled' ? ' · 데모' : ''})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <Button
          className="button button-primary"
          data-testid="owned-register"
          isDisabled={busy || !isIdText(fields.id)}
          onPress={() => void register()}
        >
          {busy ? '등록 중…' : editing ? '수정 저장' : '등록'}
        </Button>
        {editing && (
          <Button
            className="button button-quiet"
            data-testid="owned-cancel-edit"
            onPress={() => {
              setEditing(null);
              setFields({ ...EMPTY_OWNED_FIELDS });
            }}
          >
            수정 취소
          </Button>
        )}
      </div>
      {result && (
        <p className="field-error" role="alert" data-testid="owned-error">
          {result}
        </p>
      )}
    </section>
  );
}

export function CatalogScreen() {
  const [catalogs, setCatalogs] = useState<CatalogRow[] | null>(null);
  const [owned, setOwned] = useState<OwnedContainerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    try {
      await ensureBundledCatalog();
      const [catalogRows, ownedRows] = await Promise.all([
        catalogManager.list(),
        ownedManager.list(),
      ]);
      setCatalogs(catalogRows);
      setOwned(ownedRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <Shell name="카탈로그">
      <div className="page-intro">
        <div>
          <p className="section-kicker">자료실</p>
          <h1>카탈로그와 보유 수납함.</h1>
          <p>
            이 기기에 저장된 카탈로그와 보유 수납함입니다. 데모 데이터는 실제
            상품이 아니며, 가져온 카탈로그도 입력된 출처 정보 그대로입니다.
          </p>
          <p className="session-note">
            <a
              href="#/projects"
              onClick={(e) => {
                e.preventDefault();
                navigate('#/projects');
              }}
            >
              ← 프로젝트 목록
            </a>
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="notice notice-error" data-testid="catalog-error">
          {error}
        </p>
      )}
      <section className="measurement-panel" aria-labelledby="catalogs-title">
        <div className="section-kicker">저장된 카탈로그</div>
        <h2 id="catalogs-title">이 기기의 카탈로그</h2>
        <ul className="plan-list" data-testid="catalog-list">
          {(catalogs ?? []).map((row) => {
            const badge = catalogBadge(row);
            return (
              <li key={row.catalogDigest} data-testid={`catalog-${row.catalogDigest.slice(0, 12)}`}>
                <strong>{row.catalogVersion}</strong>
                <span className="session-note">
                  {' '}
                  {badge.text} · 제품 {row.catalog.products.length} · 옵션{' '}
                  {row.catalog.variants.length} · 판매 항목 {row.catalog.offers.length} ·
                  다이제스트 {row.catalogDigest.slice(0, 12)}…
                </span>
                {row.catalog.sourceObservations.length > 0 && (
                  <span className="session-note">
                    {' '}
                    관측: {row.catalog.sourceObservations[0]?.note}
                    {row.catalog.sourceObservations[0]?.observedAt
                      ? ` (${row.catalog.sourceObservations[0]?.observedAt})`
                      : ''}
                  </span>
                )}
              </li>
            );
          })}
          {catalogs !== null && catalogs.length === 0 && (
            <li data-testid="catalog-empty">저장된 카탈로그가 없습니다.</li>
          )}
        </ul>
      </section>
      <CatalogImport onCommitted={() => void refresh()} />
      {owned !== null && catalogs !== null && (
        <OwnedLibrary catalogs={catalogs} owned={owned} onChanged={() => void refresh()} />
      )}
    </Shell>
  );
}
