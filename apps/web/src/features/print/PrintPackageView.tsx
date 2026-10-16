import type { ReactNode } from 'react';
import { fittedViewBox, viewBoxAttr, viewPad } from '../workspace/viewport';
import {
  UNKNOWN_TEXT,
  type DrawingRect,
  type PrintDrawing,
  type PrintPackage,
} from './package';

/**
 * The printable plan package as plain markup (z-print-share). It has no
 * hooks, no event handlers and no links, so the same function renders the
 * on-screen preview, the print sheet, and the static markup the export
 * fixture compares byte for byte.
 *
 * Page flow is the browser's: one frame table whose header band and footer
 * band repeat on every printed page, so the plan id, the unit and the scope
 * stay on each sheet whatever the page breaks do. Rows and figures do not
 * split; each drawing starts a new sheet.
 */

/** Plain text; the word 미확인 is marked so it reads without colour. */
function Text({ value }: { value: string }): ReactNode {
  if (!value.includes(UNKNOWN_TEXT)) return value;
  const parts = value.split(UNKNOWN_TEXT);
  return parts.map((part, index) => (
    <span key={index}>
      {part}
      {index < parts.length - 1 && <span className="print-unknown">{UNKNOWN_TEXT}</span>}
    </span>
  ));
}

function Drawing({ drawing }: { drawing: PrintDrawing }) {
  const frame = drawing.frame;
  const pad = viewPad(drawing.view);
  const box = frame ? fittedViewBox(frame, pad) : null;
  const font = frame ? Math.max(frame.width, frame.height) / 36 : 0;
  const mark = (rect: DrawingRect) => (
    <text
      key={`n-${rect.n}`}
      className="print-drawing-number"
      x={rect.x + rect.width / 2}
      y={-(rect.y + rect.height / 2)}
      fontSize={font}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {rect.n}
    </text>
  );
  return (
    <section
      className="print-section print-drawing"
      data-section={`drawing-${drawing.view}`}
      data-revision={drawing.revision}
    >
      <h2>{drawing.title}</h2>
      <p className="print-meta">{drawing.axesText}</p>
      {frame && box ? (
        <svg
          className="print-svg"
          viewBox={viewBoxAttr(box)}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${drawing.title}, 단위 mm. 번호는 아래 표와 같습니다.`}
        >
          <g transform="scale(1 -1)">
            <rect
              className="diagram-space"
              x={0}
              y={0}
              width={frame.width}
              height={frame.height}
            />
            {drawing.rects.map((rect) => (
              <rect
                key={`r-${rect.n}`}
                className={`diagram-${rect.kind}`}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
              />
            ))}
          </g>
          {drawing.rects.map(mark)}
          <text
            className="print-drawing-dim"
            x={frame.width / 2}
            y={pad * 0.75}
            fontSize={font}
            textAnchor="middle"
          >
            {frame.width} mm
          </text>
          <text
            className="print-drawing-dim"
            x={-pad * 0.35}
            y={-frame.height / 2}
            fontSize={font}
            textAnchor="middle"
            transform={`rotate(-90 ${-pad * 0.35} ${-frame.height / 2})`}
          >
            {frame.height} mm
          </text>
        </svg>
      ) : (
        <p className="print-note print-unknown-block">
          공간 치수가 {UNKNOWN_TEXT}이라 외곽선을 그리지 못했습니다. 아래 표의 값만 사실입니다.
        </p>
      )}
      <table className="print-table print-legend">
        <caption>
          도면에 그린 것 {drawing.rects.length}개 (치수 mm, 좌하단 기준 x·y)
        </caption>
        <thead>
          <tr>
            <th scope="col">번호</th>
            <th scope="col">이름</th>
            <th scope="col">종류</th>
            <th scope="col">x</th>
            <th scope="col">{drawing.view === 'top' ? 'y' : 'z'}</th>
            <th scope="col">가로</th>
            <th scope="col">{drawing.view === 'top' ? '깊이' : '높이'}</th>
          </tr>
        </thead>
        <tbody>
          {drawing.rects.map((rect) => (
            <tr key={rect.n}>
              <td>{rect.n}</td>
              <td>
                <Text value={rect.label} />
              </td>
              <td>{rect.kindText}</td>
              <td>{rect.x}</td>
              <td>{rect.y}</td>
              <td>{rect.width}</td>
              <td>{rect.height}</td>
            </tr>
          ))}
          {drawing.rects.length === 0 && (
            <tr>
              <td colSpan={7}>그릴 수 있는 것이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
      {drawing.missing.length > 0 && (
        <div className="print-missing" data-testid={`print-missing-${drawing.view}`}>
          <h3>이 도면에 그리지 못한 것 {drawing.missing.length}개</h3>
          <ul>
            {drawing.missing.map((row, index) => (
              <li key={index}>
                <Text value={row.label} /> — <Text value={row.text} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function PrintPackageView({ pkg }: { pkg: PrintPackage }) {
  const unknownChecks = pkg.checks.filter((check) => check.status === 'unknown').length;
  return (
    <article
      className="print-package"
      lang="ko"
      data-testid="print-package"
      data-revision={pkg.revision}
      data-package-version={pkg.version}
    >
      <table className="print-frame">
        <thead>
          <tr>
            <td>
              <div className="print-head" data-testid="print-head">
                <strong>ZARI 계획 패키지</strong>
                <span>
                  계획 ID <code>{pkg.revision}</code>
                </span>
                <span>단위 {pkg.unit}</span>
              </div>
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              <div className="print-foot" data-testid="print-foot">
                <span>
                  입력 {pkg.inputDigest.slice(0, 12)} · 카탈로그 {pkg.catalogVersion} (
                  {pkg.catalogSource}) · 규칙 {pkg.ruleVersion}
                </span>
                <span>포함 범위: {pkg.scopeText}</span>
                <span>
                  {UNKNOWN_TEXT}은 통과가 아닙니다 · 구매 전에 값·재고를 판매처에서 다시 확인
                </span>
              </div>
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td>
              <section className="print-section" data-section="cover" data-revision={pkg.revision}>
                <h1>정리 계획</h1>
                <dl className="print-facts">
                  <dt>프로젝트</dt>
                  <dd>{pkg.projectName}</dd>
                  <dt>계획 상태</dt>
                  <dd>
                    {pkg.stageText} · {pkg.currentText}
                  </dd>
                  <dt>정리 전략</dt>
                  <dd>{pkg.strategyText}</dd>
                  <dt>물리 검토</dt>
                  <dd>
                    <Text value={pkg.assuranceText} />
                  </dd>
                  <dt>구매 조건</dt>
                  <dd>
                    <Text value={pkg.commerceText} />
                  </dd>
                  <dt>배정 현황</dt>
                  <dd>
                    <Text value={pkg.completenessText} />
                  </dd>
                  <dt>카탈로그</dt>
                  <dd>{pkg.catalogSource}</dd>
                </dl>
                <h3>공간 안쪽 치수</h3>
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">방향</th>
                      <th scope="col">치수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.space.map((row) => (
                      <tr key={row.axis}>
                        <td>{row.axis}</td>
                        <td>
                          <Text value={row.text} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="print-notes">
                  {pkg.notes.map((note) => (
                    <li key={note}>
                      <Text value={note} />
                    </li>
                  ))}
                </ul>
              </section>

              {pkg.drawings.map((drawing) => (
                <Drawing key={drawing.view} drawing={drawing} />
              ))}
              {pkg.diagnostics.length > 0 && (
                <section className="print-section" data-section="diagnostics">
                  <h3>도면 진단</h3>
                  <ul>
                    {pkg.diagnostics.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section
                className="print-section"
                data-section="placements"
                data-revision={pkg.revision}
              >
                <h2>물건이 놓이는 곳</h2>
                <table className="print-table" data-testid="print-placements">
                  <caption>배치 {pkg.placements.length}개 (x, y, z mm)</caption>
                  <thead>
                    <tr>
                      <th scope="col">이름</th>
                      <th scope="col">x</th>
                      <th scope="col">y</th>
                      <th scope="col">z</th>
                      <th scope="col">방향</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.placements.map((row, index) => (
                      <tr key={index}>
                        <td>
                          <Text value={row.label} />
                        </td>
                        <td>{row.x}</td>
                        <td>{row.y}</td>
                        <td>{row.z}</td>
                        <td>{row.orientation}</td>
                      </tr>
                    ))}
                    {pkg.placements.length === 0 && (
                      <tr>
                        <td colSpan={5}>배치된 것이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <table className="print-table" data-testid="print-assignments">
                  <caption>물건별 위치 {pkg.assignments.length}건</caption>
                  <thead>
                    <tr>
                      <th scope="col">물건</th>
                      <th scope="col">위치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.assignments.map((row, index) => (
                      <tr key={index}>
                        <td>
                          <Text value={row.label} />
                        </td>
                        <td>
                          <Text value={row.location} />
                        </td>
                      </tr>
                    ))}
                    {pkg.assignments.length === 0 && (
                      <tr>
                        <td colSpan={2}>자리가 정해진 물건이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <table className="print-table" data-testid="print-unassigned">
                  <caption>
                    {pkg.unassigned.length > 0
                      ? `자리를 정하지 못한 물건 ${pkg.unassigned.length}건`
                      : '자리를 정하지 못한 물건'}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">물건</th>
                      <th scope="col">수량</th>
                      <th scope="col">이유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.unassigned.map((row, index) => (
                      <tr key={index}>
                        <td>
                          <Text value={row.label} />
                        </td>
                        <td>
                          <Text value={row.quantity} />
                        </td>
                        <td>{row.reason}</td>
                      </tr>
                    ))}
                    {pkg.unassigned.length === 0 && (
                      <tr>
                        <td colSpan={3}>미배치 물건이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              <section className="print-section" data-section="checks" data-revision={pkg.revision}>
                <h2>검사 결과</h2>
                <p className="print-meta" data-testid="print-unknown-checks">
                  {unknownChecks > 0
                    ? `${UNKNOWN_TEXT} 검사 ${unknownChecks}건 — 통과로 읽지 마세요.`
                    : `${UNKNOWN_TEXT} 검사 없음.`}
                </p>
                <table className="print-table" data-testid="print-checks">
                  <thead>
                    <tr>
                      <th scope="col">검사</th>
                      <th scope="col">필수</th>
                      <th scope="col">상태</th>
                      <th scope="col">사유 코드</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.checks.map((check, index) => (
                      <tr key={index} data-status={check.status}>
                        <td>{check.kind}</td>
                        <td>{check.blocking ? '필수' : ''}</td>
                        <td>
                          <Text value={check.statusText} />
                        </td>
                        <td>{check.reason}</td>
                      </tr>
                    ))}
                    {pkg.checks.length === 0 && (
                      <tr>
                        <td colSpan={4}>검사가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              <section className="print-section" data-section="bom" data-revision={pkg.bomRevision}>
                <h2>구매 목록</h2>
                {pkg.noPurchase && <p className="print-meta">구매 없이 정리됩니다.</p>}
                <table className="print-table print-bom" data-testid="print-bom">
                  <thead>
                    <tr>
                      <th scope="col">품목</th>
                      <th scope="col">필요(개)</th>
                      <th scope="col">재사용(개)</th>
                      <th scope="col">주문 팩</th>
                      <th scope="col">상품 소계</th>
                      <th scope="col">재고</th>
                      <th scope="col">배송</th>
                      <th scope="col">가격 확인</th>
                      <th scope="col">링크</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.bom.map((row, index) => (
                      <tr key={index}>
                        <td>
                          <Text value={row.label} />
                        </td>
                        <td>{row.needed}</td>
                        <td>{row.reused}</td>
                        <td>
                          <Text value={row.packs} />
                        </td>
                        <td>
                          <Text value={row.subtotal} />
                        </td>
                        <td>
                          <Text value={row.inventory} />
                        </td>
                        <td>
                          <Text value={row.shipping} />
                        </td>
                        <td>{row.observed}</td>
                        <td className="print-url">{row.link}</td>
                      </tr>
                    ))}
                    {pkg.bom.length === 0 && (
                      <tr>
                        <td colSpan={9}>구매 목록이 비어 있습니다.</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    {pkg.cost.map((row) => (
                      <tr key={row.label}>
                        <th scope="row" colSpan={4}>
                          {row.label}
                        </th>
                        <td colSpan={5}>
                          <Text value={row.value} />
                        </td>
                      </tr>
                    ))}
                  </tfoot>
                </table>
                <ul className="print-notes" data-testid="print-purchase-notes">
                  {pkg.purchaseNotes.map((note) => (
                    <li key={note}>
                      <Text value={note} />
                    </li>
                  ))}
                </ul>
              </section>

              <section className="print-section" data-section="guide" data-revision={pkg.guideRevision}>
                <h2>실행 순서</h2>
                <table className="print-table" data-testid="print-steps">
                  <thead>
                    <tr>
                      <th scope="col">단계</th>
                      <th scope="col">할 일</th>
                      <th scope="col">대상</th>
                      <th scope="col">먼저</th>
                      <th scope="col">조건</th>
                      <th scope="col">진행</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.steps.map((step) => (
                      <tr key={step.n}>
                        <td>{step.n}</td>
                        <td>
                          {step.title}
                          {step.confirmation && <span> · 확인 절차 필요</span>}
                        </td>
                        <td>
                          <Text value={step.subjects.join(' / ')} />
                        </td>
                        <td>{step.prerequisites.join(', ')}</td>
                        <td>
                          <Text value={step.conditions.join(' / ')} />
                        </td>
                        <td>{step.progress}</td>
                      </tr>
                    ))}
                    {pkg.steps.length === 0 && (
                      <tr>
                        <td colSpan={6}>실행 순서가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
