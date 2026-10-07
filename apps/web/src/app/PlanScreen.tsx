import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { Button } from 'react-aria-components';
import type {
  Orientation,
  PlanSnapshot,
  Placement,
  SnapshotContent,
  SpatialTarget,
  Strategy,
} from '../contracts/generated/dto';
import { planSourceKey, readProjection } from '../features/plan/projection';
import { PlanThumb } from '../features/workspace/PlanDiagram';
import {
  isArrowKey,
  isTypingTarget,
  keyboardStepMm,
  movePlacementCommand,
  nudgePosition,
  type MmPoint,
} from '../features/workspace/drag';
import { selectedPlacementId } from '../features/workspace/selection';
import { PlanWorkspace, useWorkspace } from '../features/workspace/Workspace';
import { StepFocus } from '../features/workspace/StepFocus';
import type { GuideSurface } from '../features/workspace/stepFocus';
import {
  CHECK_KIND_TEXT,
  CHECK_STATUS_TEXT,
  EDIT_COMMAND_TEXT,
  EDIT_REJECTION_TEXT,
  MOVE_AXES,
  MOVE_INPUT_TEXT,
  ORIENTATIONS,
  ORIENTATION_TEXT,
  REJECTION_TEXT,
  STRATEGY_TEXT,
  UNASSIGNED_TEXT,
  allowedOrientations,
  catalogSourceText,
  isNoPurchase,
  moneyText,
  qtyText,
  readMovePosition,
  subjectLabel,
  unassignedCount,
  type MoveAxis,
  type MoveInputError,
} from '../features/plan/view';
import { bomCsvRows, toCsv } from '../features/plan/csv';
import type { ProjectSession, SessionSnapshot } from '../features/project/session';
import { Shell } from './ProjectScreen';
import { navigate } from './router';
import { acquireSession, releaseSession, workerController } from './sessionRegistry';

const TERMINATION_TEXT: Record<string, string> = {
  scopeComplete: '범위를 모두 검토했습니다',
  budgetExhausted: '계산 예산이 다 소진되어 일부만 검토했습니다',
  cancelled: '취소되었습니다',
  interrupted: '중단되었습니다',
};

async function downloadPlanExport(session: ProjectSession, projectId: string) {
  const data = await session.exportJson('standard');
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `zari-${projectId}-standard.json`;
  anchor.click();
  URL.revokeObjectURL(url);
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
  // Host-side refusals of unreadable coordinate text, bound to the placement
  // they were raised on so a new selection never inherits them.
  const [moveErrors, setMoveErrors] = useState<{
    placementId: string;
    errors: Partial<Record<MoveAxis, MoveInputError>>;
  } | null>(null);
  // More than one inspector can be on screen (alternative + 편집안), so the
  // error ids that aria-describedby points at must be unique per instance.
  const errorIdBase = useId();
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
    const field = (axis: MoveAxis) =>
      form.elements.namedItem(`pos-${axis}`) as HTMLInputElement | null;
    const read = readMovePosition({
      x: { text: field('x')?.value ?? '', badInput: field('x')?.validity.badInput ?? false },
      y: { text: field('y')?.value ?? '', badInput: field('y')?.validity.badInput ?? false },
      z: { text: field('z')?.value ?? '', badInput: field('z')?.validity.badInput ?? false },
    });
    if (!read.ok) {
      // Nothing is sent: an absent coordinate is not 0mm.
      setMoveErrors({ placementId: placement.id, errors: read.errors });
      const first = MOVE_AXES.find((axis) => read.errors[axis]);
      if (first) field(first)?.focus();
      return;
    }
    setMoveErrors(null);
    session.requestLayoutEdit(movePlacementCommand(placement.id, read.position), snapshot.planSnapshotId);
  };
  const axisErrors =
    moveErrors && moveErrors.placementId === placement.id ? moveErrors.errors : {};
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
      {/* noValidate: the button and Enter share one gate (readMovePosition)
          with field-linked Korean errors, instead of the browser's own
          step/range bubble on click only. */}
      <form
        ref={moveForm}
        className="edit-inspector-fields"
        data-testid="move-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          applyMove();
        }}
        onKeyDown={onKey}
      >
        {MOVE_AXES.map((axis) => (
          <label key={axis} className="edit-inspector-field">
            <span>{axis.toUpperCase()} mm</span>
            <input
              name={`pos-${axis}`}
              type="number"
              step="1"
              min="-20000"
              max="20000"
              defaultValue={placement.position[axis]}
              aria-invalid={axisErrors[axis] ? true : undefined}
              aria-describedby={axisErrors[axis] ? `${errorIdBase}-${axis}` : undefined}
              data-testid={`move-${axis}`}
            />
          </label>
        ))}
        <Button
          className="button button-secondary"
          type="submit"
          isDisabled={pending || edit.persist?.kind === 'saving'}
          data-testid="move-apply"
        >
          이동 적용
        </Button>
      </form>
      {Object.keys(axisErrors).length > 0 && (
        <ul className="diagnostic-list" role="alert" data-testid="move-input-errors">
          {MOVE_AXES.filter((axis) => axisErrors[axis]).map((axis) => (
            <li key={axis} id={`${errorIdBase}-${axis}`} className="field-error">
              {axis.toUpperCase()} mm: {MOVE_INPUT_TEXT[axisErrors[axis] as MoveInputError]}
            </li>
          ))}
        </ul>
      )}
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
                disabled={!allowed.includes(o) || pending || edit.persist?.kind === 'saving'}
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
              disabled={pending || edit.persist?.kind === 'saving'}
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
                disabled={pending || edit.persist?.kind === 'saving'}
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
        단축키 — 화살표: 1mm 이동, Shift+화살표: 10mm, R: 회전, Ctrl+Z / Ctrl+Shift+Z:
        되돌리기/다시 실행
      </p>
    </div>
  );
}

/** Honest commerce display: every offer field is a fact — unknown stays unknown. */
function offerFactsText(content: SnapshotContent, offerId: string | null) {
  if (offerId === null)
    return { price: '판매 항목 없음', inventory: '미확인', shipping: '미확인', url: null };
  const offer = content.referencedCatalog.offers.find((o) => o.id === offerId);
  if (!offer)
    return { price: '미확인', inventory: '미확인', shipping: '미확인', url: null };
  const inventory =
    offer.inventory.state === 'known'
      ? offer.inventory.value === 'inStock'
        ? '재고 있음'
        : '품절'
      : '미확인';
  const shipping =
    offer.shipping.state === 'known'
      ? offer.shipping.value.kind === 'free'
        ? '무료 배송'
        : offer.shipping.value.kind === 'fixedPerSeller'
          ? `배송비 ${moneyText(offer.shipping.value.fee)}`
          : '배송비 조건부'
      : '미확인';
  const url = offer.url.state === 'known' ? offer.url.value : null;
  return { price: moneyText(offer.packPrice), inventory, shipping, url };
}

/** One alternative's detail pane: diagram, placements, checks, BOM, guide. */
function guideSurface(
  where: 'selected' | 'edit' | 'accepted',
  snapshot: PlanSnapshot,
  state: SessionSnapshot,
): GuideSurface {
  if (where === 'edit') return 'working';
  if (where === 'accepted') return 'accepted';
  if (state.plan.accepted?.planSnapshotId === snapshot.planSnapshotId) return 'accepted';
  return 'alternative';
}

function PlanDetail({
  session,
  state,
  snapshot,
  where,
}: {
  session: ProjectSession;
  state: SessionSnapshot;
  snapshot: PlanSnapshot;
  where: 'selected' | 'edit' | 'accepted';
}) {
  const content = snapshot.content;
  const current = session.isCurrentSnapshot(snapshot);
  const edit = state.plan.edit;
  const editable = current && state.context === 'installed';
  const checksUnknown = content.validation.checks.filter(
    (c) => c.status === 'unknown',
  );
  const itemById = new Map(content.inputFacts.items.map((i) => [i.id, i]));
  const projectionEntry = readProjection(state.plan.projections, snapshot);
  const workspace = useWorkspace({
    projectId: session.snapshot.projectId,
    sourceKey: planSourceKey(snapshot.planSnapshotId),
    planSnapshotId: snapshot.planSnapshotId,
    inputDigest: content.versions.inputDigest,
  });
  const selection = workspace.state.selection;
  const syncedSelection = useRef(selection);
  useEffect(() => {
    if (!editable) return;
    if (syncedSelection.current === selection) return;
    syncedSelection.current = selection;
    session.selectPlacement(selectedPlacementId(selection));
  }, [editable, session, selection]);
  const selected = content.placements.find(
    (p) => p.id === edit.selectedPlacementId,
  );
  const choose = (target: SpatialTarget) => workspace.select(target);
  const cancelRef = useRef<(() => void) | null>(null);
  const [stepMm, setStepMm] = useState(1);
  useEffect(() => {
    const onUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Shift') setStepMm(1);
    };
    window.addEventListener('keyup', onUp);
    return () => window.removeEventListener('keyup', onUp);
  }, []);
  const nudgeRef = useRef<{
    placementId: string;
    origin: MmPoint;
    position: MmPoint;
    arrows: Set<string>;
  } | null>(null);
  const [nudge, setNudge] = useState<MmPoint | null>(null);
  const editLocked = edit.pending !== null || edit.persist?.kind === 'saving';
  const nominal = Boolean(
    selected &&
      projectionEntry?.projection?.elements.some(
        (element) =>
          element.target.kind === 'placement' &&
          element.target.placementId === selected.id &&
          (element.role === 'directItem' ||
            element.role === 'ownedContainer' ||
            element.role === 'newContainer') &&
          element.topRect.kind === 'available',
      ),
  );
  const commitNudge = () => {
    const group = nudgeRef.current;
    nudgeRef.current = null;
    setNudge(null);
    if (!group) return;
    if (
      group.position.x === group.origin.x &&
      group.position.y === group.origin.y &&
      group.position.z === group.origin.z
    ) {
      return;
    }
    session.requestLayoutEdit(
      movePlacementCommand(group.placementId, group.position),
      snapshot.planSnapshotId,
    );
  };
  /**
   * Arrow keys share the movePlacement command with the pointer and the
   * numeric form. Default step is 1 mm; Shift is the explicit 10 mm modifier.
   * Repeats accumulate locally and send one command when the keys are released.
   */
  const onSurfaceKey = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'Shift') setStepMm(keyboardStepMm(true));
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
    if (!editable || !selected || editLocked) return;
    if (isArrowKey(e.key)) {
      e.preventDefault();
      cancelRef.current?.();
      const step = keyboardStepMm(e.shiftKey);
      const base =
        nudgeRef.current?.placementId === selected.id
          ? nudgeRef.current.position
          : { x: selected.position.x, y: selected.position.y, z: selected.position.z };
      const next = nudgePosition(base, e.key, step);
      if (!next) return;
      if (!nudgeRef.current || nudgeRef.current.placementId !== selected.id) {
        nudgeRef.current = {
          placementId: selected.id,
          origin: { x: selected.position.x, y: selected.position.y, z: selected.position.z },
          position: next,
          arrows: new Set([e.key]),
        };
      } else {
        nudgeRef.current.arrows.add(e.key);
        nudgeRef.current.position = next;
      }
      setNudge({ ...next });
      return;
    }
    if (e.key.toLowerCase() !== 'r') return;
    const allowed = allowedOrientations(content, selected);
    if (!allowed || allowed.length < 2) return;
    const next = allowed.find((o) => o !== selected.orientation);
    if (!next) return;
    e.preventDefault();
    cancelRef.current?.();
    nudgeRef.current = null;
    setNudge(null);
    session.requestLayoutEdit(
      {
        kind: 'rotatePlacement',
        placementId: selected.id,
        orientation: next,
      },
      snapshot.planSnapshotId,
    );
  };
  const onSurfaceKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') setStepMm(1);
    if (isTypingTarget(e.target) || !isArrowKey(e.key) || !nudgeRef.current) return;
    nudgeRef.current.arrows.delete(e.key);
    if (nudgeRef.current.arrows.size === 0) commitNudge();
  };
  const surface = guideSurface(where, snapshot, state);
  return (
    <div
      className="plan-detail"
      data-testid="plan-detail"
      tabIndex={editable ? 0 : undefined}
      onKeyDown={onSurfaceKey}
      onKeyUp={onSurfaceKeyUp}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) return;
        if (nudgeRef.current) commitNudge();
      }}
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
      <PlanWorkspace
        binding={{
          projectId: session.snapshot.projectId,
          sourceKey: planSourceKey(snapshot.planSnapshotId),
          planSnapshotId: snapshot.planSnapshotId,
          inputDigest: content.versions.inputDigest,
        }}
        workspace={workspace}
        content={content}
        projection={projectionEntry?.projection ?? null}
        projectionStatus={projectionEntry?.status ?? 'absent'}
        projectionFailure={projectionEntry?.failureCode ?? null}
        historical={!current}
        spatialRequests={session.spatialRequestCount}
        projectRevision={state.projectRevision}
        ghostCommand={
          edit.pending && edit.pending.baseSnapshotId === snapshot.planSnapshotId
            ? edit.pending.command
            : null
        }
        nudgeCommand={
          nudge && selected ? movePlacementCommand(selected.id, nudge) : null
        }
        editLocked={editLocked}
        gestureBlocked={
          !editable ||
          state.worker !== 'ready' ||
          state.status !== 'ready' ||
          state.conflict !== null ||
          state.plan.search === 'running' ||
          state.plan.search === 'cancelling'
        }
        fence={`${state.workspaceGeneration}|${state.inputDigest ?? ''}|${state.projectRevision}|${state.context}|${state.worker}|${state.conflict?.remoteRevision ?? ''}|${snapshot.planSnapshotId}`}
        stepMm={stepMm}
        placement={
          selected
            ? {
                id: selected.id,
                position: {
                  x: selected.position.x,
                  y: selected.position.y,
                  z: selected.position.z,
                },
              }
            : null
        }
        nominal={nominal}
        readLease={() => session.readWorkspaceLease(snapshot.planSnapshotId)}
        onCommit={(command) => session.requestLayoutEdit(command, snapshot.planSnapshotId)}
        cancelRef={cancelRef}
        onSelect={choose}
        edit={editable ? <Inspector session={session} state={state} snapshot={snapshot} /> : null}
      />

      <section aria-labelledby="placements-title">
        <div className="section-kicker">배치</div>
        <h3 id="placements-title">물건이 어디에 놓이는지</h3>
        <ul className="plan-list" data-testid="placements-list">
          {content.placements.map((p) => (
            <li key={p.id} data-selected={workspace.state.selection?.kind === 'placement' && workspace.state.selection.placementId === p.id ? 'true' : undefined}>
              {editable ? (
                <button
                  type="button"
                  className="placement-pick"
                  data-testid={`placement-${p.id}`}
                  onClick={() => choose({ kind: 'placement', placementId: p.id })}
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
            <li key={c.id} data-status={c.status} data-focused={workspace.state.focus.kind === 'check' && workspace.state.focus.checkId === c.id ? 'true' : undefined}>
              <span>
                {CHECK_KIND_TEXT[c.kind] ?? c.kind}
                {c.blocking ? ' ·필수' : ''}
              </span>
              <span className="session-note">
                {CHECK_STATUS_TEXT[c.status] ?? c.status}
                {c.status !== 'pass' ? ` (${c.reasonCode})` : ''}
              </span>
              <button
                type="button"
                className="text-pick"
                data-testid={`check-focus-${c.id}`}
                onClick={() => workspace.setFocus({ kind: 'check', checkId: c.id })}
              >
                도면에서 강조
              </button>
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
          <>
          <div className="form-actions">
            <Button
              className="button button-quiet"
              data-testid="bom-csv"
              onPress={() => {
                // A leading BOM keeps spreadsheet apps on the UTF-8 path.
                const blob = new Blob(['\uFEFF', toCsv(bomCsvRows(content))], {
                  type: 'text/csv',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `zari-bom-${snapshot.planSnapshotId.slice(0, 12)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              구매 목록 CSV
            </Button>
          </div>
          <div className="table-scroll">
          <table className="bom-table" data-testid="bom-table">
            <thead>
              <tr>
                <th>품목</th>
                <th>필요</th>
                <th>주문 팩</th>
                <th>상품 소계</th>
                <th>재고</th>
                <th>배송</th>
                <th>링크</th>
              </tr>
            </thead>
            <tbody>
              {content.bom.map((line) => {
                const offer = offerFactsText(content, line.offerId);
                return (
                  <tr
                    key={line.id}
                    id={`bom-row-${line.id}`}
                    data-focus={workspace.state.focus.kind === 'bom' && workspace.state.focus.bomLineId === line.id ? 'true' : undefined}
                  >
                    <td>
                      {line.variantId
                        ? (content.referencedCatalog.variants.find(
                            (v) => v.id === line.variantId,
                          )?.optionLabel ?? line.variantId)
                        : (line.ownedId ?? '—')}
                      <button
                        type="button"
                        className="text-pick"
                        data-testid={`bom-focus-${line.id}`}
                        onClick={() => workspace.setFocus({ kind: 'bom', bomLineId: line.id })}
                      >
                        도면에서 보기
                      </button>
                      {line.placementIds.length > 1 && (
                        <span className="session-note">배치 {line.placementIds.length}곳</span>
                      )}
                    </td>
                    <td>{line.physicalNeeded}</td>
                    <td>{qtyText(line.packsToOrder)}</td>
                    <td data-testid={`bom-price-${line.id}`}>
                      {moneyText(line.productSubtotal)}
                    </td>
                    <td data-testid={`bom-stock-${line.id}`}>{offer.inventory}</td>
                    <td data-testid={`bom-shipping-${line.id}`}>{offer.shipping}</td>
                    <td>
                      {offer.url ? (
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`bom-link-${line.id}`}
                        >
                          상품 페이지
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>상품 소계</td>
                <td colSpan={4} data-testid="cost-subtotal">
                  {moneyText(content.costSummary.productSubtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={3}>배송비 합계</td>
                <td colSpan={4} data-testid="cost-shipping">
                  {moneyText(content.costSummary.shippingTotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={3}>합계</td>
                <td colSpan={4} data-testid="cost-summary">
                  {moneyText(content.costSummary.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
          </>
        )}
      </section>

      <section aria-labelledby="guide-title">
        <div className="section-kicker">실행 순서</div>
        <h3 id="guide-title">정리 단계</h3>
        <StepFocus
          surface={surface}
          actions={content.actions}
          content={content}
          projection={projectionEntry?.projection ?? null}
          focus={workspace.state.focus}
          progress={surface === 'accepted' ? state.plan.actionProgress : null}
          progressLoad={surface === 'accepted' ? state.plan.progressLoad : 'ready'}
          displayedPlanId={snapshot.planSnapshotId}
          displayedDigest={content.versions.inputDigest}
          accepted={state.plan.accepted}
          currentInputRevision={state.inputRevision}
          currentInputDigest={state.inputDigest}
          staleInput={state.staleInput}
          conflict={state.conflict !== null}
          actionError={surface === 'accepted' ? state.plan.actionError : null}
          actionRetry={surface === 'accepted' ? state.plan.actionRetry : null}
          eligibility={
            surface === 'accepted' &&
            state.plan.actionEligibility?.planSnapshotId === snapshot.planSnapshotId
              ? state.plan.actionEligibility
              : null
          }
          onFocusStep={(stepId) => workspace.setFocus({ kind: 'action', stepId })}
          onToggle={(stepId, done) => void session.toggleActionStep(stepId, done)}
          onShowAccepted={
            state.plan.accepted
              ? () => document.getElementById('accepted-guide')?.scrollIntoView({ block: 'nearest' })
              : null
          }
        />
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
            isDisabled={state.plan.acceptState === 'saving' || edit.pending !== null || state.conflict !== null}
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
        {snapshot.content.versions.catalogVersion} (
        {catalogSourceText(state.plan.catalog, snapshot.content.versions.catalogDigest)})
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
  const projectionQueue = [
    state.plan.selectedId ?? '',
    state.plan.edit.head?.planSnapshotId ?? '',
    state.plan.acceptedSnapshot?.planSnapshotId ?? '',
    ...state.plan.alternatives.map((item) => item.planSnapshotId),
  ].join('|');
  useEffect(() => {
    if (state.status !== 'ready' || state.worker !== 'ready') return;
    const plan = session.snapshot.plan;
    const ordered: PlanSnapshot[] = [];
    const push = (snapshot: PlanSnapshot | null | undefined) => {
      if (!snapshot) return;
      if (ordered.some((item) => item.planSnapshotId === snapshot.planSnapshotId)) return;
      ordered.push(snapshot);
    };
    push(plan.alternatives.find((item) => item.planSnapshotId === plan.selectedId));
    push(plan.edit.head);
    push(plan.acceptedSnapshot);
    for (const alternative of plan.alternatives) push(alternative);
    for (const snapshot of ordered.slice(0, 4)) session.ensurePlanProjection(snapshot);
  }, [session, state.status, state.worker, projectionQueue]);

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
      {state.worker === 'failed' && (
        <div className="recovery-panel" role="alert" data-testid="worker-failed">
          <strong>계산기가 중단되었습니다.</strong>
          <p>도면에 이미 받아 둔 계획은 그대로입니다. 다시 연결하면 새 세션이 시작됩니다.</p>
          <Button className="button button-secondary" onPress={() => void workerController.recover()} data-testid="worker-retry">
            계산기 다시 연결
          </Button>
        </div>
      )}
      {state.conflict && (
        <div className="notice notice-stale" role="alert" data-testid="edit-conflict">
          <p>다른 탭에서 먼저 저장되었습니다. 이 편집은 그 기록을 덮어쓰지 않습니다.</p>
          <div className="form-actions">
            <Button className="button button-secondary" onPress={() => void session.reloadLatest()} data-testid="edit-conflict-reload">
              다시 불러오기
            </Button>
            <Button className="button button-quiet" onPress={() => void downloadPlanExport(session, projectId)} data-testid="edit-conflict-export">
              내보내기
            </Button>
          </div>
        </div>
      )}
      <div className="plan-screen">
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
            isDisabled={
              searching ||
              state.context !== 'installed' ||
              plan.edit.pending !== null ||
              plan.edit.persist?.kind === 'saving'
            }
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
                  : plan.search === 'interrupted'
                    ? '중단되었습니다. 이전 계획과 입력은 그대로입니다.'
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
                    <PlanThumb
                      content={alt.content}
                      projection={
                        readProjection(plan.projections, alt)?.projection ?? null
                      }
                      testId={`plan-thumb-${i}`}
                    />
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
            <PlanDetail session={session} state={state} snapshot={selected} where="selected" />
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
          {plan.edit.persist?.kind === 'unsaved' && (
            <div className="notice notice-stale" role="alert" data-testid="edit-save-failed">
              <p>이 기기에 저장하지 못함. 검증된 작업안은 화면에 남아 있고, 채택되지는 않았습니다.</p>
              <div className="form-actions">
                <Button className="button button-secondary" onPress={() => session.retryEditPersist()} data-testid="edit-retry">
                  다시 저장
                </Button>
                <Button className="button button-quiet" onPress={() => void downloadPlanExport(session, projectId)} data-testid="edit-export">
                  내보내기
                </Button>
              </div>
            </div>
          )}
          <div className="form-actions">
            <Button
              className="button button-secondary"
              onPress={() => session.undoEdit()}
              isDisabled={plan.edit.undo.length === 0 || plan.edit.pending !== null || plan.edit.persist?.kind === 'saving'}
              data-testid="undo-edit"
            >
              되돌리기 ({plan.edit.undo.length})
            </Button>
            <Button
              className="button button-secondary"
              onPress={() => session.redoEdit()}
              isDisabled={plan.edit.redo.length === 0 || plan.edit.pending !== null || plan.edit.persist?.kind === 'saving'}
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
                plan.acceptState === 'saving' ||
                plan.edit.pending !== null ||
                plan.edit.persist?.kind === 'saving' ||
                state.conflict !== null
              }
              data-testid="accept-edit-head"
            >
              이 편집안을 채택
            </Button>
          </div>
          <PlanDetail session={session} state={state} snapshot={plan.edit.head} where="edit" />
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
              where="accepted"
            />
          )}
        </section>
      )}
      </div>
    </Shell>
  );
}
