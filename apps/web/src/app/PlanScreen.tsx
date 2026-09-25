import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Button } from 'react-aria-components';
import type {
  LayoutEditCommand,
  Orientation,
  PlanSnapshot,
  Placement,
  SnapshotContent,
  Strategy,
} from '../contracts/generated/dto';
import {
  ACTION_TEXT,
  CHECK_KIND_TEXT,
  CHECK_STATUS_TEXT,
  EDIT_COMMAND_TEXT,
  EDIT_REJECTION_TEXT,
  ORIENTATIONS,
  ORIENTATION_TEXT,
  REJECTION_TEXT,
  STRATEGY_TEXT,
  UNASSIGNED_TEXT,
  allowedOrientations,
  frontViewRects,
  ghostRect,
  interiorBox,
  isNoPurchase,
  moneyText,
  qtyText,
  subjectLabel,
  topViewRects,
  unassignedCount,
  type RectVm,
} from '../features/plan/view';
import type { ProjectSession, SessionSnapshot } from '../features/project/session';
import { Shell } from './ProjectScreen';
import { navigate } from './router';
import { acquireSession, releaseSession } from './sessionRegistry';

const TERMINATION_TEXT: Record<string, string> = {
  scopeComplete: '범위를 모두 검토했습니다',
  budgetExhausted: '계산 예산이 다 소진되어 일부만 검토했습니다',
  cancelled: '취소되었습니다',
  interrupted: '중단되었습니다',
};

/** One measured view of the plan; every rect is copied from the snapshot. */
function PlanDiagram({
  content,
  view,
  testId,
  selectedId,
  ghost,
  onSelect,
}: {
  content: SnapshotContent;
  view: 'top' | 'front';
  testId: string;
  selectedId?: string | null;
  ghost?: RectVm | null;
  onSelect?: (placementId: string) => void;
}) {
  const box = interiorBox(content);
  const rects = view === 'top' ? topViewRects(content) : frontViewRects(content);
  if (!box) {
    return (
      <p className="notice" data-testid={testId}>
        공간 치수를 알 수 없어 그림을 그릴 수 없습니다.
      </p>
    );
  }
  const w = view === 'top' ? box.width : box.width;
  const h = view === 'top' ? box.depth : box.height;
  return (
    <svg
      className="plan-diagram"
      data-testid={testId}
      viewBox={`-4 -4 ${w + 8} ${h + 8}`}
      role="img"
      aria-label={view === 'top' ? '위에서 본 배치' : '앞에서 본 배치'}
    >
      <rect className="diagram-space" x={0} y={0} width={w} height={h} />
      {rects.map((r: RectVm) => (
        <g key={`${r.refId}:${r.label}:${r.x}:${r.y}`}>
          <rect
            className={`diagram-${r.kind}`}
            data-selected={selectedId === r.refId ? 'true' : undefined}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            onClick={onSelect ? () => onSelect(r.refId) : undefined}
          >
            <title>{r.label}</title>
          </rect>
          {r.width > 90 && (
            <text
              className="diagram-label"
              x={r.x + 4}
              y={r.y + (r.kind === 'container' ? 14 : 22)}
            >
              {r.label}
            </text>
          )}
        </g>
      ))}
      {ghost && view === 'top' && (
        <rect
          className="diagram-ghost"
          data-testid="edit-ghost"
          x={ghost.x}
          y={ghost.y}
          width={ghost.width}
          height={ghost.height}
        >
          <title>{ghost.label}</title>
        </rect>
      )}
      {view === 'top' && (
        <text className="diagram-label" x={0} y={h + 10} fontSize={14}>
          ↑ 문/앞면
        </text>
      )}
    </svg>
  );
}

/**
 * Equal-scale thumbnail: every card renders the same space interior box in
 * the same viewBox, so alternatives are comparable at one scale.
 */
function PlanThumb({ content, testId }: { content: SnapshotContent; testId: string }) {
  const box = interiorBox(content);
  if (!box) return null;
  return (
    <svg
      className="plan-thumb"
      data-testid={testId}
      viewBox={`-4 -4 ${box.width + 8} ${box.depth + 8}`}
      role="img"
      aria-label="위에서 본 축소 배치"
    >
      <rect className="diagram-space" x={0} y={0} width={box.width} height={box.depth} />
      {topViewRects(content).map((r) => (
        <rect
          key={`${r.refId}:${r.x}:${r.y}`}
          className={`diagram-${r.kind}`}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
        />
      ))}
    </svg>
  );
}

/**
 * Placement inspector: numeric/keyboard editing parity. Every control issues
 * a typed `LayoutEditCommand`; Rust decides whether the result is a verified
 * snapshot or an explained rejection.
 */
function Inspector({
  session,
  state,
  snapshot,
}: {
  session: ProjectSession;
  state: SessionSnapshot;
  snapshot: PlanSnapshot;
}) {
  const content = snapshot.content;
  const edit = state.plan.edit;
  const placement: Placement | undefined = content.placements.find(
    (p) => p.id === edit.selectedPlacementId,
  );
  const moveForm = useRef<HTMLFormElement | null>(null);
  if (!placement) {
    return (
      <div className="edit-inspector" data-testid="inspector-empty">
        <p className="session-note">
          도면이나 목록에서 배치를 선택하면 위치·방향을 고칠 수 있습니다.
        </p>
      </div>
    );
  }
  const allowed = allowedOrientations(content, placement);
  const subject = placement.subject;
  const variants = state.plan.catalog?.variants ?? [];
  const variant =
    subject.kind === 'newContainer'
      ? (variants.find((v) => v.id === subject.variantId) ?? null)
      : null;
  const offerFor = content.purchaseSelections.find(
    (s) => s.placementId === placement.id,
  );
  const pending = edit.pending !== null;
  const applyMove = () => {
    const form = moveForm.current;
    if (!form) return;
    const read = (name: string) =>
      Number((form.elements.namedItem(name) as HTMLInputElement | null)?.value);
    const command: LayoutEditCommand = {
      kind: 'movePlacement',
      placementId: placement.id,
      position: {
        x: read('pos-x'),
        y: read('pos-y'),
        z: read('pos-z'),
      },
    };
    session.requestLayoutEdit(command, snapshot.planSnapshotId);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyMove();
    }
  };
  return (
    <div className="edit-inspector" data-testid="inspector">
      <div className="section-kicker">편집</div>
      <h4>{subjectLabel(content, subject)}</h4>
      <form
        ref={moveForm}
        className="edit-inspector-fields"
        data-testid="move-form"
        onSubmit={(e) => {
          e.preventDefault();
          applyMove();
        }}
        onKeyDown={onKey}
      >
        {(['x', 'y', 'z'] as const).map((axis) => (
          <label key={axis} className="edit-inspector-field">
            <span>{axis.toUpperCase()} mm</span>
            <input
              name={`pos-${axis}`}
              type="number"
              step="1"
              min="-20000"
              max="20000"
              defaultValue={placement.position[axis]}
              data-testid={`move-${axis}`}
            />
          </label>
        ))}
        <Button
          className="button button-secondary"
          type="submit"
          isDisabled={pending}
          data-testid="move-apply"
        >
          이동 적용
        </Button>
      </form>
      <fieldset className="edit-inspector-fields" data-testid="rotate-field">
        <legend>방향</legend>
        {allowed === null ? (
          <p className="session-note">허용 방향을 알 수 없어 회전을 건너뜁니다.</p>
        ) : (
          ORIENTATIONS.map((o) => (
            <label key={o} className="strategy-option">
              <input
                type="radio"
                name="orientation"
                checked={placement.orientation === o}
                disabled={!allowed.includes(o) || pending}
                data-testid={`rotate-${o}`}
                onChange={() =>
                  session.requestLayoutEdit(
                    {
                      kind: 'rotatePlacement',
                      placementId: placement.id,
                      orientation: o as Orientation,
                    },
                    snapshot.planSnapshotId,
                  )
                }
              />
              {ORIENTATION_TEXT[o] ?? o}
              {!allowed.includes(o) && ' (허용 안 됨)'}
            </label>
          ))
        )}
      </fieldset>
      {subject.kind === 'newContainer' && (
        <div className="edit-inspector-fields" data-testid="variant-field">
          <label className="edit-inspector-field">
            <span>수납함 옵션</span>
            <select
              value={subject.variantId}
              disabled={pending}
              data-testid="variant-select"
              onChange={(e) =>
                session.requestLayoutEdit(
                  {
                    kind: 'replaceVariant',
                    placementId: placement.id,
                    variantId: e.target.value,
                    offerId: null,
                  },
                  snapshot.planSnapshotId,
                )
              }
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.optionLabel}
                </option>
              ))}
            </select>
          </label>
          {variant && (
            <label className="edit-inspector-field">
              <span>판매처</span>
              <select
                value={
                  offerFor?.offer.kind === 'selected' ? offerFor.offer.offerId : ''
                }
                disabled={pending}
                data-testid="offer-select"
                onChange={(e) => {
                  if (!e.target.value) return;
                  session.requestLayoutEdit(
                    {
                      kind: 'selectOffer',
                      variantId: variant.id,
                      offerId: e.target.value,
                    },
                    snapshot.planSnapshotId,
                  );
                }}
              >
                <option value="">
                  {offerFor?.offer.kind === 'unresolved' ? '미정 (보류)' : '선택…'}
                </option>
                {(state.plan.catalog?.offers ?? [])
                  .filter((o) => o.variantId === variant.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}
      <p className="session-note">
        단축키 — 화살표: 10mm 이동, Shift+화살표: 1mm, R: 회전, Ctrl+Z / Ctrl+Shift+Z:
        되돌리기/다시 실행
      </p>
    </div>
  );
}

/** One alternative's detail pane: diagram, placements, checks, BOM, guide. */
function PlanDetail({
  session,
  state,
  snapshot,
}: {
  session: ProjectSession;
  state: SessionSnapshot;
  snapshot: PlanSnapshot;
}) {
  const content = snapshot.content;
  const current = session.isCurrentSnapshot(snapshot);
  const edit = state.plan.edit;
  const editable = current && state.context === 'installed';
  const checksUnknown = content.validation.checks.filter(
    (c) => c.status === 'unknown',
  );
  const itemById = new Map(content.inputFacts.items.map((i) => [i.id, i]));
  const ghost =
    edit.pending && edit.pending.baseSnapshotId === snapshot.planSnapshotId
      ? ghostRect(content, edit.pending.command)
      : null;
  const selected = content.placements.find(
    (p) => p.id === edit.selectedPlacementId,
  );
  /**
   * Keyboard editing parity: arrows nudge the selected placement (10mm,
   * Shift=1mm), R rotates to the next allowed orientation, Ctrl+Z /
   * Ctrl+Shift+Z undo/redo. Keys apply only on the diagram surface — inputs
   * and selects keep their native behavior.
   */
  const onSurfaceKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA'
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) session.redoEdit();
      else session.undoEdit();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      session.redoEdit();
      return;
    }
    if (!editable || !selected) return;
    const step = e.shiftKey ? 1 : 10;
    const delta = { x: 0, y: 0, z: 0 };
    if (e.key === 'ArrowLeft') delta.x = -step;
    else if (e.key === 'ArrowRight') delta.x = step;
    else if (e.key === 'ArrowUp') delta.y = -step;
    else if (e.key === 'ArrowDown') delta.y = step;
    else if (e.key.toLowerCase() === 'r') {
      const allowed = allowedOrientations(content, selected);
      if (allowed && allowed.length > 1) {
        const next = allowed.find((o) => o !== selected.orientation);
        if (next) {
          e.preventDefault();
          session.requestLayoutEdit(
            {
              kind: 'rotatePlacement',
              placementId: selected.id,
              orientation: next,
            },
            snapshot.planSnapshotId,
          );
        }
      }
      return;
    } else {
      return;
    }
    e.preventDefault();
    session.requestLayoutEdit(
      {
        kind: 'movePlacement',
        placementId: selected.id,
        position: {
          x: selected.position.x + delta.x,
          y: selected.position.y + delta.y,
          z: selected.position.z + delta.z,
        },
      },
      snapshot.planSnapshotId,
    );
  };
  return (
    <div
      className="plan-detail"
      data-testid="plan-detail"
      tabIndex={editable ? 0 : undefined}
      onKeyDown={onSurfaceKey}
      data-editable={editable || undefined}
    >
      {!current && (
        <p className="notice notice-stale" role="alert" data-testid="stale-plan-notice">
          입력이 변경된 뒤 계산된 계획이 아닙니다 — 과거 기록으로만 봅니다. 다시 계산해 주세요.
        </p>
      )}
      {edit.pending && edit.pending.baseSnapshotId === snapshot.planSnapshotId && (
        <p className="notice" data-testid="edit-pending" role="status">
          {EDIT_COMMAND_TEXT[edit.pending.command.kind] ?? edit.pending.command.kind}{' '}
          검증 중 — 확정되기 전까지 임시 상태입니다.
        </p>
      )}
      {edit.rejection &&
        edit.rejection.baseSnapshotId === snapshot.planSnapshotId && (
        <div className="notice notice-stale" role="alert" data-testid="edit-rejected">
          <p>
            {EDIT_COMMAND_TEXT[edit.rejection.command.kind] ??
              edit.rejection.command.kind}
            이(가) 거부되었습니다 — 기존 계획은 바뀌지 않았습니다.
          </p>
          <ul className="diagnostic-list">
            {edit.rejection.diagnostics.map((d, i) => (
              <li key={`d-${i}`} className="field-error">
                {EDIT_REJECTION_TEXT[d.code] ?? d.code}
                {d.fieldPath ? ` — ${d.fieldPath}` : ''}
              </li>
            ))}
            {(edit.rejection.report?.checks ?? [])
              .filter((c) => c.status === 'fail')
              .map((c) => (
                <li key={c.id} className="field-error">
                  {CHECK_KIND_TEXT[c.kind] ?? c.kind}:{' '}
                  {EDIT_REJECTION_TEXT[c.reasonCode] ?? c.reasonCode}
                </li>
              ))}
          </ul>
        </div>
      )}
      <div className="plan-diagrams">
        <PlanDiagram
          content={content}
          view="top"
          testId="plan-diagram-top"
          selectedId={edit.selectedPlacementId}
          ghost={ghost}
          onSelect={editable ? (id) => session.selectPlacement(id) : undefined}
        />
        <PlanDiagram
          content={content}
          view="front"
          testId="plan-diagram-front"
          selectedId={edit.selectedPlacementId}
        />
      </div>

      <section aria-labelledby="placements-title">
        <div className="section-kicker">배치</div>
        <h3 id="placements-title">물건이 어디에 놓이는지</h3>
        <ul className="plan-list" data-testid="placements-list">
          {content.placements.map((p) => (
            <li key={p.id} data-selected={edit.selectedPlacementId === p.id || undefined}>
              {editable ? (
                <button
                  type="button"
                  className="placement-pick"
                  data-testid={`placement-${p.id}`}
                  onClick={() => session.selectPlacement(p.id)}
                >
                  {subjectLabel(content, p.subject)}
                </button>
              ) : (
                <span>{subjectLabel(content, p.subject)}</span>
              )}
              <span className="session-note">
                ({p.position.x}, {p.position.y}, {p.position.z}) mm ·{' '}
                {ORIENTATION_TEXT[p.orientation] ?? p.orientation}
              </span>
            </li>
          ))}
          {content.placements.length === 0 && <li>배치된 것이 없습니다.</li>}
        </ul>
        {content.unassigned.length > 0 && (
          <ul className="diagnostic-list" data-testid="unassigned-list">
            {content.unassigned.map((u) => (
              <li key={u.itemId} className="field-error">
                {itemById.get(u.itemId)?.label ?? u.itemId} —{' '}
                {UNASSIGNED_TEXT[u.reasonCode] ?? u.reasonCode}
                {u.instances.kind === 'unknownQuantity' && ' (수량 미확인)'}
              </li>
            ))}
          </ul>
        )}
        {editable && <Inspector session={session} state={state} snapshot={snapshot} />}
      </section>

      <section aria-labelledby="checks-title">
        <div className="section-kicker">검사</div>
        <h3 id="checks-title">독립 검증 결과</h3>
        {checksUnknown.length > 0 && (
          <p className="notice" data-testid="unknown-checks">
            미확인 검사 {checksUnknown.length}건:{' '}
            {[...new Set(checksUnknown.map((c) => c.kind))].map(
              (k) => CHECK_KIND_TEXT[k] ?? k,
            ).join(', ')}
          </p>
        )}
        <ul className="plan-list" data-testid="checks-list">
          {content.validation.checks.map((c) => (
            <li key={c.id} data-status={c.status}>
              <span>
                {CHECK_KIND_TEXT[c.kind] ?? c.kind}
                {c.blocking ? ' ·필수' : ''}
              </span>
              <span className="session-note">
                {CHECK_STATUS_TEXT[c.status] ?? c.status}
                {c.status !== 'pass' ? ` (${c.reasonCode})` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="bom-title">
        <div className="section-kicker">구매 목록</div>
        <h3 id="bom-title">사야 할 것</h3>
        {isNoPurchase(snapshot) ? (
          <p className="session-note" data-testid="no-purchase">
            구매 없이 정리됩니다.
          </p>
        ) : (
          <table className="bom-table" data-testid="bom-table">
            <thead>
              <tr>
                <th>품목</th>
                <th>필요</th>
                <th>주문 팩</th>
                <th>상품 소계</th>
              </tr>
            </thead>
            <tbody>
              {content.bom.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.variantId
                      ? (content.referencedCatalog.variants.find(
                          (v) => v.id === line.variantId,
                        )?.optionLabel ?? line.variantId)
                      : (line.ownedId ?? '—')}
                  </td>
                  <td>{line.physicalNeeded}</td>
                  <td>{qtyText(line.packsToOrder)}</td>
                  <td>{moneyText(line.productSubtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>합계(배송비 미포함 상태 포함)</td>
                <td data-testid="cost-summary">
                  {moneyText(content.costSummary.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section aria-labelledby="guide-title">
        <div className="section-kicker">실행 순서</div>
        <h3 id="guide-title">정리 단계</h3>
        <ol className="plan-list" data-testid="guide-list">
          {content.actions.map((a) => (
            <li key={a.id}>
              {ACTION_TEXT[a.kind] ?? a.kind}
              <span className="session-note">
                {' '}
                ({a.subjectIds
                  .map((s) => {
                    const placement = content.placements.find((p) => p.id === s);
                    if (placement) return subjectLabel(content, placement.subject);
                    return itemById.get(s)?.label ?? s;
                  })
                  .join(', ')})
              </span>
            </li>
          ))}
          {content.actions.length === 0 && <li>실행할 단계가 없습니다.</li>}
        </ol>
      </section>

      <div className="form-actions">
        {state.plan.accepted?.planSnapshotId === snapshot.planSnapshotId ? (
          <p className="notice notice-ready" data-testid="accepted-badge">
            이 계획을 채택했습니다.
          </p>
        ) : (
          <Button
            className="button button-primary"
            onPress={() => void session.acceptPlan(snapshot.planSnapshotId)}
            isDisabled={state.plan.acceptState === 'saving'}
            data-testid="accept-plan"
          >
            {state.plan.acceptState === 'saving' ? '저장 중…' : '이 계획 사용하기'}
          </Button>
        )}
        {state.plan.acceptError && (
          <p className="field-error" data-testid="accept-error" role="alert">
            계획 저장 실패: {state.plan.acceptError}
          </p>
        )}
      </div>
      <p className="session-note" data-testid="snapshot-id">
        스냅샷 {snapshot.planSnapshotId.slice(0, 16)}… · 입력{' '}
        {snapshot.content.versions.inputDigest.slice(0, 12)}… · 카탈로그{' '}
        {snapshot.content.versions.catalogVersion} (합성 데이터 — 실제 상품이 아닙니다)
      </p>
    </div>
  );
}

export function PlanScreen({ projectId }: { projectId: string }) {
  const sessionRef = useRef<ProjectSession | null>(null);
  if (!sessionRef.current || sessionRef.current.snapshot.projectId !== projectId) {
    sessionRef.current = acquireSession(projectId);
  }
  const session = sessionRef.current;
  const state = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.snapshot,
  );
  useEffect(() => () => releaseSession(projectId), [projectId]);

  if (state.status === 'loading') {
    return <Shell name="불러오는 중"><p data-testid="project-loading">프로젝트를 불러오고 있습니다…</p></Shell>;
  }
  if (state.status === 'not-found') {
    return <Shell name="없음"><p data-testid="project-not-found">이 프로젝트는 이 기기에 없습니다.</p></Shell>;
  }
  if (state.status === 'unsupported' || state.status === 'unavailable') {
    return <Shell name="열 수 없음"><p role="alert">이 프로젝트를 지금 열 수 없습니다. {state.saveError ?? ''}</p></Shell>;
  }

  const plan = state.plan;
  const selected =
    plan.alternatives.find((a) => a.planSnapshotId === plan.selectedId) ?? null;
  const strategies = plan.strategies ?? [];
  const searching = plan.search === 'running' || plan.search === 'cancelling';

  return (
    <Shell name={state.name || '프로젝트'}>
      <div className="session-status" data-testid="plan-context" data-context={state.context}>
        작업 컨텍스트: {state.context === 'installed' ? '준비됨' : state.context}
        {state.context === 'degraded' &&
          ` — 카탈로그 없이 계산할 수 없습니다 (${state.degradedReason ?? ''})`}
      </div>
      {state.staleInput && (
        <p className="notice notice-stale" data-testid="stale-notice" role="alert">
          입력 변경이 있습니다 — 지금 계산하면 마지막으로 저장된 입력 기준입니다.
        </p>
      )}
      <section className="measurement-panel" aria-labelledby="plan-title">
        <div className="section-kicker">03 · 계획</div>
        <h2 id="plan-title">어떻게 정리할지 계산합니다.</h2>
        <p className="session-note">
          계산은 워커 안의 Rust가 하고, 결과는 한 장의 스냅샷으로 고정됩니다.{' '}
          <a
            href={`#/project/${projectId}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`#/project/${projectId}`);
            }}
          >
            ← 치수로 돌아가기
          </a>
        </p>

        {strategies.length > 0 && (
          <fieldset className="strategy-field" data-testid="strategy-select">
            <legend>정리 방식</legend>
            {strategies.map((d) => (
              <label key={d.strategy} className="strategy-option">
                <input
                  type="radio"
                  name="strategy"
                  checked={state.form?.strategyChoice === d.strategy}
                  onChange={() => session.setStrategy(d.strategy as Strategy)}
                />
                {STRATEGY_TEXT[d.strategy] ?? d.strategy}
              </label>
            ))}
          </fieldset>
        )}

        <div className="form-actions">
          <Button
            className="button button-primary"
            onPress={() => session.startSearch()}
            isDisabled={searching || state.context !== 'installed'}
            data-testid="compute-plan"
          >
            {plan.search === 'running'
              ? '계산 중…'
              : plan.alternatives.length > 0
                ? '다시 계산'
                : '계산 시작'}
          </Button>
          {searching && (
            <Button
              className="button button-secondary"
              onPress={() => session.cancelSearch()}
              isDisabled={plan.search === 'cancelling'}
              data-testid="cancel-search"
            >
              {plan.search === 'cancelling' ? '취소 중…' : '취소'}
            </Button>
          )}
        </div>

        <p className="session-note" data-testid="search-status" data-search={plan.search}>
          {plan.search === 'running' || plan.search === 'cancelling'
            ? `계산 중 — 작업 ${plan.progress ? BigInt(plan.progress.workUnits).toLocaleString('ko-KR') : '0'} / 노드 ${plan.progress?.nodes ?? 0}`
            : plan.search === 'done'
              ? `완료 — ${TERMINATION_TEXT[plan.termination ?? ''] ?? plan.termination}`
              : plan.search === 'cancelled'
                ? '취소되었습니다. 다시 계산할 수 있습니다.'
                : plan.search === 'failed'
                  ? `계산에 실패했습니다: ${plan.searchError ?? ''}`
                  : '아직 계산하지 않았습니다.'}
          {plan.searchError && plan.search === 'done' ? ` (${plan.searchError})` : ''}
        </p>
      </section>

      {plan.alternatives.length > 0 && (
        <section className="measurement-panel" aria-labelledby="alts-title">
          <div className="section-kicker">후보</div>
          <h3 id="alts-title">검토된 계획 {plan.alternatives.length}개</h3>
          <p className="session-note">
            모든 후보는 같은 공간 치수로 같은 축척에 그립니다 — 크기 비교가 그대로 맞습니다.
          </p>
          <ul className="plan-list" data-testid="alternatives-list">
            {plan.alternatives.map((alt, i) => {
              const un = unassignedCount(alt);
              const id = alt.planSnapshotId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="plan-card"
                    data-testid={`plan-card-${i}`}
                    data-selected={plan.selectedId === id}
                    onClick={() => session.selectAlternative(id)}
                  >
                    <PlanThumb content={alt.content} testId={`plan-thumb-${i}`} />
                    <span className="plan-card-title">
                      #{i + 1} {isNoPurchase(alt) ? '구매 없음' : '구매 포함'}
                    </span>
                    <span className="session-note">
                      배치 {alt.content.placements.length} · 미배치 {un} ·{' '}
                      {moneyText(alt.content.costSummary.grandTotal)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {plan.diagnostics.length > 0 && (
            <details className="session-note" data-testid="rejected-list">
              <summary>제외된 후보 {plan.diagnostics.length}건</summary>
              <ul>
                {plan.diagnostics.map((d, i) => (
                  <li key={i}>{REJECTION_TEXT[d.reasonCode] ?? d.reasonCode}</li>
                ))}
              </ul>
            </details>
          )}
          {selected && (
            <PlanDetail session={session} state={state} snapshot={selected} />
          )}
        </section>
      )}

      {plan.edit.head && (
        <section
          className="measurement-panel"
          aria-labelledby="edit-title"
          data-testid="edit-section"
        >
          <div className="section-kicker">편집안</div>
          <h3 id="edit-title">검증된 작업 계획</h3>
          <p className="session-note">
            편집은 적용될 때마다 Rust가 전체 배치를 다시 검증합니다. 되돌리기는
            이전 배치를 새 스냅샷으로 복원합니다.
          </p>
          <div className="form-actions">
            <Button
              className="button button-secondary"
              onPress={() => session.undoEdit()}
              isDisabled={plan.edit.undo.length === 0 || plan.edit.pending !== null}
              data-testid="undo-edit"
            >
              되돌리기 ({plan.edit.undo.length})
            </Button>
            <Button
              className="button button-secondary"
              onPress={() => session.redoEdit()}
              isDisabled={plan.edit.redo.length === 0 || plan.edit.pending !== null}
              data-testid="redo-edit"
            >
              다시 실행 ({plan.edit.redo.length})
            </Button>
            <span className="session-note" data-testid="edit-chain-info">
              {plan.edit.undo.length === 0 && plan.edit.redo.length === 0
                ? '편집 이력이 없습니다'
                : `${plan.edit.undo.length + plan.edit.redo.length}건의 편집이 기록되어 있습니다`}
            </span>
            <Button
              className="button button-primary"
              onPress={() => session.acceptPlan(plan.edit.head!.planSnapshotId)}
              isDisabled={
                plan.acceptState === 'saving' || plan.edit.pending !== null
              }
              data-testid="accept-edit-head"
            >
              이 편집안을 채택
            </Button>
          </div>
          <PlanDetail session={session} state={state} snapshot={plan.edit.head} />
        </section>
      )}

      {plan.acceptedSnapshot && (
        <section className="measurement-panel" aria-labelledby="accepted-title">
          <div className="section-kicker">채택된 계획</div>
          <h3 id="accepted-title">저장된 결정</h3>
          {!session.isCurrentSnapshot(plan.acceptedSnapshot) && (
            <p className="notice notice-stale" data-testid="accepted-stale" role="alert">
              입력이 바뀐 뒤의 기록입니다 — 지금 입력 기준이 아닙니다.
            </p>
          )}
          {plan.acceptedSnapshot.planSnapshotId !== plan.selectedId && (
            <PlanDetail
              session={session}
              state={state}
              snapshot={plan.acceptedSnapshot}
            />
          )}
        </section>
      )}
    </Shell>
  );
}
