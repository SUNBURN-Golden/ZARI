import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { useProbe } from '../worker/useProbe';
import { navigate } from './router';
import { CountField, DimensionField } from '../ui/DimensionField';

type ProbeResult = NonNullable<ReturnType<typeof useProbe>['result']>;
type FocusDimension = 'compartmentWidth' | 'unitWidth' | null;

function StatusMark({ status }: { status: 'pass' | 'fail' | 'unknown' | 'not_applicable' }) {
  return (
    <span className={`status-mark status-${status}`} aria-hidden="true">
      {status === 'pass' ? '✓' : status === 'fail' ? '!' : status === 'not_applicable' ? '−' : '?'}
    </span>
  );
}

function factText(fact: { state: string; value?: number | string } | undefined) {
  return fact?.state === 'known' && fact.value !== undefined ? String(fact.value) : '미확인';
}

function WidthSketch({
  result,
  focus,
  stale,
}: {
  result: ProbeResult | null;
  focus: FocusDimension;
  stale: boolean;
}) {
  const space = result?.normalizedCompartmentWidth;
  const width = space?.state === 'known' ? space.value.nominal : null;
  const row = result?.rowObjects.state === 'known' ? result.rowObjects.value : null;
  const required =
    result?.requiredWidthMm.state === 'known' ? Number(result.requiredWidthMm.value) : null;
  // This is only a screen transform of Rust output, never a fit calculation.
  const extent = Math.max(width ?? 0, required ?? 0, 1);
  const scale = 600 / extent;
  const failed = result?.widthCheck.status === 'fail';
  const canDraw = width !== null && row !== null;
  return (
    <div className={`sketch ${stale ? 'sketch-stale' : ''}`}>
      <div className="sketch-topline">
        <span>가로 폭</span>
        <span>정수 mm 기준</span>
      </div>
      <svg
        data-testid="width-sketch"
        viewBox="0 0 740 310"
        role="img"
        aria-labelledby="sketch-title sketch-description"
      >
        <title id="sketch-title">수납장과 수납함의 폭 비교</title>
        <desc id="sketch-description">
          {canDraw
            ? `수납장 폭 ${width} 밀리미터, 필요한 폭 ${required ?? '미확인'} 밀리미터. 높이와 깊이는 검사하지 않습니다.`
            : '치수가 확인되면 폭 배치도가 표시됩니다.'}
          {stale ? ' 입력이 바뀌어 이전 계산을 표시하고 있습니다.' : ''}
        </desc>
        {canDraw ? (
          <>
            <g
              className={`dimension-line ${focus === 'compartmentWidth' ? 'dimension-focused' : ''}`}
              data-testid="width-dimension"
              data-focused={focus === 'compartmentWidth'}
            >
              <path d={`M70 84 V43 M${70 + width * scale} 84 V43 M70 55 H${70 + width * scale}`} />
              <path d={`M65 50 L75 60 M${65 + width * scale} 50 L${75 + width * scale} 60`} />
              <text x={70 + (width * scale) / 2} y="35" textAnchor="middle">
                {width} mm
              </text>
            </g>
            <rect
              className="compartment-envelope"
              x="70"
              y="92"
              width={width * scale}
              height="126"
            />
            <line className="compartment-front" x1="70" y1="218" x2={70 + width * scale} y2="218" />
            {row.map((object) => (
              <g
                key={object.ordinal}
                className={`sketch-object ${focus === 'unitWidth' ? 'object-focused' : ''} ${failed ? 'object-failed' : ''}`}
              >
                <rect
                  x={70 + Number(object.xMm) * scale}
                  y="106"
                  width={object.widthMm * scale}
                  height="98"
                />
                {object.widthMm * scale > 50 && (
                  <>
                    <text
                      className="object-name"
                      x={70 + (Number(object.xMm) + object.widthMm / 2) * scale}
                      y="143"
                      textAnchor="middle"
                    >
                      {String(object.ordinal + 1).padStart(2, '0')}
                    </text>
                    <text
                      className="object-measurement"
                      x={70 + (Number(object.xMm) + object.widthMm / 2) * scale}
                      y="173"
                      textAnchor="middle"
                    >
                      {object.widthMm} mm
                    </text>
                  </>
                )}
              </g>
            ))}
            {row.length === 0 && (
              <text
                className="sketch-empty-text"
                x={70 + (width * scale) / 2}
                y="161"
                textAnchor="middle"
              >
                배치할 수납함이 없습니다
              </text>
            )}
            <g className={`required-dimension ${failed ? 'required-failed' : ''}`}>
              <path d={`M70 234 V255 H${70 + (required ?? 0) * scale} V234`} />
              <text x={70 + ((required ?? 0) * scale) / 2} y="283" textAnchor="middle">
                필요한 폭 {required} mm
              </text>
            </g>
          </>
        ) : (
          <>
            <rect className="empty-envelope" x="70" y="92" width="600" height="126" />
            <text className="sketch-empty-text" x="370" y="146" textAnchor="middle">
              치수가 확인되면
            </text>
            <text className="sketch-empty-text" x="370" y="176" textAnchor="middle">
              여기에 폭 배치도가 나타납니다
            </text>
          </>
        )}
      </svg>
      <div className="sketch-caption">
        <span className="line-key" aria-hidden="true" /> 높이와 깊이를 생략한 폭 도식입니다.
      </div>
      {focus && (
        <p className="focus-context">
          {focus === 'compartmentWidth'
            ? '수납장 안쪽 폭의 치수선을 보고 있습니다.'
            : '각 수납함의 폭을 보고 있습니다.'}
        </p>
      )}
    </div>
  );
}

function CheckInspector({ result, stale }: { result: ProbeResult | null; stale: boolean }) {
  const status = result?.widthCheck.status ?? 'unknown';
  const text =
    status === 'pass'
      ? '입력한 폭 안에 들어갑니다'
      : status === 'fail'
        ? '수납장 폭을 초과합니다'
        : '폭 확인이 필요합니다';
  return (
    <aside className="inspector" aria-labelledby="inspection-title">
      <div className="section-kicker">검사 근거</div>
      <h2 id="inspection-title">무엇을 확인했나요?</h2>
      <div className={`check-summary check-${status}`} data-testid="width-status">
        <StatusMark status={status} />
        <div>
          <strong>{text}</strong>
          <span>{stale ? '이전 입력의 결과입니다' : '명목 치수 · 가로축만 검사'}</span>
        </div>
      </div>
      <dl className="measurement-list">
        <div>
          <dt>수납장 안쪽 폭</dt>
          <dd>
            {result?.normalizedCompartmentWidth.state === 'known'
              ? `${result.normalizedCompartmentWidth.value.nominal} mm`
              : '미확인'}
          </dd>
        </div>
        <div>
          <dt>필요한 전체 폭</dt>
          <dd data-testid="required-width">
            {result?.requiredWidthMm.state === 'known'
              ? `${result.requiredWidthMm.value} mm`
              : '미확인'}
          </dd>
        </div>
      </dl>
      {status === 'fail' && (
        <p className="check-action">
          수납함의 폭이나 한 줄에 놓을 수량을 줄인 뒤 다시 확인해 주세요.
        </p>
      )}
      {status === 'unknown' && (
        <p className="check-action">폭과 개수를 입력해 주세요. 빈 값은 0으로 계산하지 않습니다.</p>
      )}
      <div className="scope-note">
        <h3>아직 검사하지 않은 항목</h3>
        <ul>
          <li>깊이 · 높이 · 방향</li>
          <li>내용물 수납 · 설치 경로</li>
          <li>사용 공간 · 지지 하중</li>
        </ul>
        <p>폭이 맞아도 실제 설치와 사용이 가능한지는 별도 확인이 필요합니다.</p>
      </div>
    </aside>
  );
}

export function ProbeScreen() {
  const probe = useProbe();
  const [focused, setFocused] = useState<FocusDimension>(null);
  const submitted = useRef(false);
  const composing = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const stale =
    probe.phase === 'stale' ||
    (probe.phase === 'loading' && probe.result !== null) ||
    (probe.phase === 'error' && probe.result !== null);
  const fieldError = (field: string) => {
    const diagnostic = probe.diagnostics.find((entry) => entry.fieldPath === field);
    if (!diagnostic) return undefined;
    if (diagnostic.code === 'submillimeter_precision')
      return '1 mm보다 작은 단위는 반올림하지 않습니다. 0.1 cm 단위로 입력해 주세요.';
    if (diagnostic.code === 'numeric_field_too_long' || diagnostic.code === 'numeric_overflow')
      return '입력값이 너무 큽니다. 숫자와 단위를 확인해 주세요.';
    if (field === 'unitCount') return '0~20 사이의 정수를 입력해 주세요.';
    if (field === 'packQuantity') return '묶음 수량은 1~10,000 사이의 정수로 입력해 주세요.';
    if (field === 'neededNewUnits') return '필요한 개수는 0~10,000 사이의 정수로 입력해 주세요.';
    return '단위와 값을 확인해 주세요. 폭은 1~10,000 mm 사이여야 합니다.';
  };
  useEffect(() => {
    if (probe.phase === 'invalid' && submitted.current) {
      formRef.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();
      submitted.current = false;
    }
  }, [probe.phase, probe.diagnostics]);
  function submit() {
    if (composing.current) return;
    submitted.current = true;
    probe.commit();
  }
  return (
    <div className="zari-ui app-shell">
      <a className="skip-link" href="#measurement">
        치수 입력으로 바로가기
      </a>
      <header className="app-header">
        <div className="brand" aria-label="ZARI">
          <svg viewBox="0 0 26 26" aria-hidden="true">
            <path d="M2 2H24V24H2Z M2 10H24 M11 10V24" />
          </svg>
          <span>ZARI</span>
        </div>
        <div className="header-context">
          <span>정리 작업대</span>
          <span className="context-divider" aria-hidden="true">
            /
          </span>
          <strong>공간 측정</strong>
        </div>
        <nav className="header-context" aria-label="화면 이동">
          <a href="#/projects" onClick={(e) => { e.preventDefault(); navigate('#/projects'); }}>
            프로젝트
          </a>
        </nav>
        <div className="local-note">
          <span aria-hidden="true" className="local-dot" />이 기기에서 계산
        </div>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <p className="section-kicker">첫 번째 확인 · 공간의 치수</p>
            <h1>한 칸의 폭부터, 정확하게.</h1>
            <p>수납장과 수납함의 폭을 맞춰 보고, 필요한 묶음 수를 확인하세요.</p>
          </div>
          <p className="sample-note">
            <span aria-hidden="true">◈</span> 합성 예제
            <br />
            <span>실제 상품 추천이 아닙니다</span>
          </p>
        </div>
        <form
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
          }}
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          noValidate
        >
          <div className="workspace">
            <section
              className="measurement-panel"
              id="measurement"
              aria-labelledby="measurement-title"
            >
              <div className="section-kicker">01 · 치수 입력</div>
              <h2 id="measurement-title">어느 정도의 폭인가요?</h2>
              <DimensionField
                id="compartmentWidth"
                label="수납장 안쪽 폭"
                value={probe.raw.compartmentWidth.text}
                unit={probe.raw.compartmentWidth.unit}
                onChange={(text) => probe.edit('compartmentWidth', text)}
                onUnitChange={(unit) => probe.changeUnit('compartmentWidth', unit)}
                onFocus={() => setFocused('compartmentWidth')}
                onBlur={() => setFocused(null)}
                error={fieldError('compartmentWidth')}
                help="바깥쪽이 아닌, 실제 사용할 안쪽을 재 주세요."
              />
              <DimensionField
                id="unitWidth"
                label="물체 하나의 폭"
                value={probe.raw.unitWidth.text}
                unit={probe.raw.unitWidth.unit}
                onChange={(text) => probe.edit('unitWidth', text)}
                onUnitChange={(unit) => probe.changeUnit('unitWidth', unit)}
                onFocus={() => setFocused('unitWidth')}
                onBlur={() => setFocused(null)}
                error={fieldError('unitWidth')}
              />
              <CountField
                id="unitCount"
                label="한 줄에 놓을 수량"
                value={probe.raw.unitCount}
                onChange={(text) => probe.edit('unitCount', text)}
                error={fieldError('unitCount')}
                help="이 예제에서는 최대 20개까지 확인합니다."
              />
              <div className="gap-assumption">
                <span>예제의 간격</span>
                <strong>양쪽 벽 · 수납함 사이 각 5 mm</strong>
                <p>제품의 설치 기준이 아닌 합성 조건입니다.</p>
              </div>
              <div className="form-actions">
                <Button
                  type="submit"
                  className="button button-primary"
                  isDisabled={probe.phase === 'loading'}
                >
                  {probe.phase === 'loading' ? '계산 중…' : '폭과 수량 확인'}
                  <span aria-hidden="true">→</span>
                </Button>
                <Button type="button" className="button button-quiet" onPress={probe.reset}>
                  예제 값으로 되돌리기
                </Button>
              </div>
              {probe.unitSwitchError && (
                <p role="alert" className="field-error">
                  {probe.unitSwitchError}
                </p>
              )}
              <p className="session-note">
                입력은 이 화면에만 유지됩니다.
                <br />
                새로고침하면 예제로 돌아갑니다.
              </p>
            </section>
            <section className="workspace-center" aria-labelledby="sketch-heading">
              <div className="workspace-heading">
                <div>
                  <div className="section-kicker">02 · 폭 비교</div>
                  <h2 id="sketch-heading">한눈에 보는 자리</h2>
                </div>
                <span className="view-label">폭 도식</span>
              </div>
              <div className="calculation-state" role="status" aria-live="polite">
                {probe.phase === 'stale' ? (
                  <p className="notice notice-stale" data-testid="stale-notice">
                    <span aria-hidden="true">↻</span> 입력 변경 · 재계산 필요{' '}
                    <span className="notice-detail">이전 결과를 보고 있습니다.</span>
                  </p>
                ) : probe.phase === 'loading' ? (
                  <p className="notice">
                    {probe.result
                      ? '새 입력을 확인하고 있습니다. 이전 결과입니다.'
                      : '계산기를 준비하고 있습니다.'}
                  </p>
                ) : probe.phase === 'invalid' ? (
                  <p className="notice notice-error">
                    입력 형식을 확인해 주세요. 해당 필드에 이유를 표시했습니다.
                  </p>
                ) : probe.phase === 'ready' ? (
                  <p className="notice notice-ready">폭 조건 검사 · 전체 배치 검증 전</p>
                ) : null}
              </div>
              {probe.phase === 'error' && (
                <div className="recovery-panel" role="alert">
                  <strong>계산기를 연결하지 못했습니다.</strong>
                  <p>입력한 값은 그대로 있습니다. 다시 연결한 뒤 확인해 주세요.</p>
                  <Button className="button button-secondary" onPress={probe.retry}>
                    계산기 다시 연결
                  </Button>
                </div>
              )}
              <WidthSketch result={probe.result} focus={focused} stale={stale} />
              <section className="package-section" aria-labelledby="package-title">
                <div className="package-heading">
                  <div className="section-kicker">03 · 묶음 수량</div>
                  <h2 id="package-title">몇 묶음이 필요한가요?</h2>
                  <p>나란히 놓는 개수와 구매 필요 개수는 별개입니다.</p>
                </div>
                <div className="package-fields">
                  <CountField
                    id="neededNewUnits"
                    label="필요한 개수"
                    value={probe.raw.neededNewUnits}
                    onChange={(text) => probe.edit('neededNewUnits', text)}
                    error={fieldError('neededNewUnits')}
                  />
                  <CountField
                    id="packQuantity"
                    label="한 묶음의 개수"
                    value={probe.raw.packQuantity}
                    onChange={(text) => probe.edit('packQuantity', text)}
                    error={fieldError('packQuantity')}
                  />
                </div>
                <dl className="package-result" aria-label="묶음 수량 계산 결과">
                  <div>
                    <dt>주문할 묶음</dt>
                    <dd data-testid="packages-to-order">
                      {factText(probe.result?.order.packsToOrder)}
                      <span>묶음</span>
                    </dd>
                  </div>
                  <div>
                    <dt>확보되는 수량</dt>
                    <dd data-testid="supplied-units">
                      {factText(probe.result?.order.suppliedUnits)}
                      <span>개</span>
                    </dd>
                  </div>
                  <div>
                    <dt>남는 수량</dt>
                    <dd data-testid="surplus-units">
                      {factText(probe.result?.order.surplusUnits)}
                      <span>개</span>
                    </dd>
                  </div>
                </dl>
                {stale && (
                  <p className="package-note stale-text">
                    입력이 바뀌었습니다. 위 묶음 수량도 이전 결과입니다.
                  </p>
                )}
                <p className="package-note">
                  수량 계산 예제입니다. 가격·재고·배송비는 확인하지 않습니다.
                </p>
                <Button
                  type="submit"
                  className="button button-secondary package-submit"
                  isDisabled={probe.phase === 'loading'}
                >
                  변경한 수량 확인
                </Button>
              </section>
            </section>
            <CheckInspector result={probe.result} stale={stale} />
          </div>
        </form>
        <footer className="app-footer">
          <span>정리의 시작은, 공간을 아는 것.</span>
          <span>폭 조건과 묶음 수량만 확인하는 첫 구현입니다.</span>
        </footer>
      </main>
    </div>
  );
}
