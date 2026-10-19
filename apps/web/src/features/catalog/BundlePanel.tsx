import { useMemo, useState } from 'react';
import { Button } from 'react-aria-components';
import type { CatalogBundleReview } from '../../contracts/generated/dto';
import { catalogManager } from '../../app/sessionRegistry';
import { ItemShapeView } from './ItemShapeView';
import { commitBundle, itemShapes, readBundleFile, reviewBundleText, workerReviewer } from './bundle';
import type { BundleReviewer } from './bundle';

const CODE_TEXT: Record<string, string> = {
  bundle_too_large: '번들이 10 MiB를 넘어 읽지 않았습니다',
  invalid_json: 'JSON을 해석할 수 없습니다',
  image_refused: '이미지 필드나 이미지 주소가 있어 번들 전체를 거부했습니다',
  bundle_schema_invalid: '번들 형식이 맞지 않거나 알 수 없는 필드가 있습니다',
  schema_version_mismatch: '번들 스키마 버전이 맞지 않습니다',
  checksum_mismatch: '체크섬이 맞지 않아 거부했습니다',
  bytes_mismatch: '번들 크기 기록이 맞지 않습니다',
  bundle_id_mismatch: '번들 ID가 내용과 맞지 않습니다',
  item_count_mismatch: '항목 수 기록이 맞지 않습니다',
  item_limit_exceeded: '항목이 5,000개를 넘었습니다',
  sources_mismatch: '출처 목록이 항목과 맞지 않습니다',
  items_not_sorted: '항목이 정렬되어 있지 않습니다',
  images_not_declared_absent: '이미지 없음 표시가 꺼져 있습니다',
  invalid_timestamp: '시각 형식이 맞지 않습니다',
  snapshot_too_large: '카탈로그가 너무 커서 계획에 쓸 수 없습니다',
  product_url_not_allowed: '허용되지 않은 상품 주소입니다',
  confidence_inconsistent: '치수 신뢰도와 값이 맞지 않습니다',
  unit_missing: '단위가 없는 치수입니다',
  invalid_id: 'ID 형식이 맞지 않습니다',
  source_id_mismatch: 'ID와 출처 사이트가 다릅니다',
  option_not_merged: '같은 옵션 ID의 다른 크기는 합치지 않고 격리했습니다',
  duplicate_row: '같은 항목이 중복입니다',
  submillimeter_precision: '1 mm보다 작은 값은 받지 않습니다',
  invalid_number: '숫자 형식이 아닙니다',
  catalog_rejected: '카탈로그 검증을 통과하지 못했습니다',
};
const codeText = (code: string) => CODE_TEXT[code] ?? code;

type Phase = 'idle' | 'pending' | 'ready' | 'quarantine' | 'unavailable' | 'saved';

export function BundlePanel({
  preservedDigest,
  onCommitted,
  reviewer,
}: {
  preservedDigest: string | null;
  onCommitted: () => void;
  reviewer?: BundleReviewer;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [review, setReview] = useState<CatalogBundleReview | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const shapes = useMemo(() => (review?.snapshot ? itemShapes(review.snapshot) : []), [review]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPhase('pending');
    setReview(null);
    setCodes([]);
    setError('');
    const read = await readBundleFile(file);
    if ('code' in read) {
      setCodes([read.code]);
      setPhase('quarantine');
      return;
    }
    const result = await reviewBundleText(read.text, reviewer ?? workerReviewer());
    if (result.status === 'unavailable') {
      setError(result.error);
      setPhase('unavailable');
      return;
    }
    if (result.status === 'rejected') {
      setCodes([result.code]);
      setPhase('quarantine');
      return;
    }
    setReview(result.review);
    setCodes(result.review.codes);
    setPhase(result.review.quarantined || result.review.snapshot === null ? 'quarantine' : 'ready');
  }

  async function save() {
    if (!review) return;
    setPhase('pending');
    const saved = await commitBundle(catalogManager, review);
    if (saved === 'blocked') {
      setPhase('quarantine');
      return;
    }
    setPhase('saved');
    onCommitted();
  }

  return (
    <section className="measurement-panel" aria-labelledby="bundle-title" data-testid="bundle-panel">
      <div className="section-kicker">수집 카탈로그</div>
      <h2 id="bundle-title">치수 번들 가져오기</h2>
      <p className="session-note">
        수집 봇이 만든 치수 전용 번들 파일을 읽습니다. 앱은 어떤 사이트도 수집하지 않고, 이미지는 받지도 그리지도
        않습니다. 가져온 항목은 모두 미확인이며 계산에서 맞는 것으로 올라가지 않습니다.
      </p>
      <p className="session-note" data-testid="bundle-repository-state" data-enabled="false">
        저장소에서 읽기: 이 빌드에서는 꺼져 있습니다. 파일 가져오기는 항상 쓸 수 있고 인터넷이 없어도 됩니다.
      </p>
      <p className="session-note" data-testid="bundle-preserved" data-untouched="true">
        {preservedDigest ? `지키는 카탈로그 ${preservedDigest.slice(0, 12)}…` : '저장된 카탈로그가 없습니다.'}
      </p>
      <div className="form-actions">
        <label className="edit-inspector-field">
          <span>번들 파일 (bundle.json)</span>
          <input
            type="file"
            accept="application/json,.json"
            data-testid="bundle-file"
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      <div role="status" aria-live="polite" data-testid="bundle-status" data-phase={phase}>
        {phase === 'pending' && '읽는 중…'}
        {phase === 'unavailable' && `검토할 수 없습니다: ${error}`}
        {phase === 'saved' && '저장했습니다. 항목은 모두 미확인입니다.'}
        {phase === 'ready' && review && `${review.itemCount}개 항목을 검토했습니다. 저장하면 새 카탈로그가 만들어집니다.`}
        {phase === 'quarantine' && '저장하지 않았습니다. 기존 카탈로그는 그대로입니다.'}
      </div>
      {codes.length > 0 && (
        <ul className="plan-list" data-testid="bundle-codes">
          {codes.map((code) => (
            <li key={code} data-status="fail" data-code={code}>{codeText(code)}</li>
          ))}
        </ul>
      )}
      {review && review.items.length > 0 && (
        <ul className="plan-list" data-testid="bundle-item-diagnoses">
          {review.items.map((item) => (
            <li key={item.id} data-status="fail">
              {item.id}: {item.codes.map(codeText).join(' · ')}
            </li>
          ))}
        </ul>
      )}
      {phase === 'ready' && review && (
        <div className="form-actions">
          <Button className="button button-primary" data-testid="bundle-save" onPress={() => void save()}>
            이 번들을 카탈로그로 저장
          </Button>
        </div>
      )}
      {review?.snapshot && shapes.length > 0 && (
        <ul className="shape-list" data-testid="bundle-items" aria-label="번들 항목">
          {shapes.map((shape) => (
            <li key={shape.id} data-testid={`bundle-item-${shape.id}`} data-measured={shape.measured}>
              <strong>{shape.name}</strong>
              <span className="shape-meta">미확인 · {shape.id}</span>
              <ItemShapeView shape={shape} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
