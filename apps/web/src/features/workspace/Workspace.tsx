import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode } from 'react';
import type { LayoutEditCommand, SnapshotContent, SpatialProjection, SpatialTarget } from '../../contracts/generated/dto';
import type { RectVm } from '../plan/projection';
import { spaceFrame } from '../plan/projection';
import { subjectLabel } from '../plan/view';
import { isTypingTarget, movePlacementCommand, type MmPoint } from './drag';
import { DiagramTextList, InspectorLayers } from './InspectorLayers';
import type { WorkspaceLease } from './lease';
import { PlanDiagram, type DiagramInteraction } from './PlanDiagram';
import {
  bindWorkspace,
  focusWorkspace,
  hoverWorkspace,
  initialWorkspace,
  layerWorkspace,
  selectWorkspace,
  viewWorkspace,
  type DisplayBinding,
  type WorkspaceLayers,
  type WorkspaceState,
} from './model';
import { focusAnnouncement, selectionAnnouncement, targetKey } from './selection';
import {
  fitViewport,
  viewPad,
  zoomBy,
  ZOOM_STEP,
  type PlaneView,
  type Viewport,
} from './viewport';
import type { SpatialHandle } from '../spatial3d/SpatialView';

let spatialImportMs: number | null = null;

const SpatialView = lazy(() => {
  const started = performance.now();
  return import('../spatial3d/SpatialView').then((mod) => {
    spatialImportMs = performance.now() - started;
    return mod;
  });
});

type SpatialFailure = 'import' | 'webgl_unavailable' | 'context_lost';

export function useWorkspace(binding: DisplayBinding) {
  const [state, setState] = useState(() => initialWorkspace(binding));
  if (
    state.binding.projectId !== binding.projectId ||
    state.binding.sourceKey !== binding.sourceKey ||
    state.binding.planSnapshotId !== binding.planSnapshotId ||
    state.binding.inputDigest !== binding.inputDigest
  ) {
    setState(bindWorkspace(state, binding));
  }
  return {
    state,
    select: (selection: SpatialTarget | null) => setState((current) => selectWorkspace(current, selection)),
    hover: (hover: SpatialTarget | null) => setState((current) => hoverWorkspace(current, hover)),
    setFocus: (focus: WorkspaceState['focus']) => setState((current) => focusWorkspace(current, focus)),
    setView: (view: WorkspaceState['view']) => setState((current) => viewWorkspace(current, view)),
    setLayer: (layer: keyof WorkspaceLayers, on: boolean) =>
      setState((current) => layerWorkspace(current, layer, on)),
  };
}

type PlanWorkspaceProps = {
  binding: DisplayBinding;
  workspace: ReturnType<typeof useWorkspace>;
  content: SnapshotContent;
  projection: SpatialProjection | null;
  projectionStatus: 'loading' | 'ready' | 'failed' | 'absent';
  projectionFailure?: string | null;
  historical: boolean;
  spatialRequests: number;
  projectRevision: string;
  ghostCommand?: LayoutEditCommand | null;
  nudgeCommand?: LayoutEditCommand | null;
  editLocked: boolean;
  gestureBlocked: boolean;
  fence: string;
  stepMm: number;
  placement: { id: string; position: MmPoint } | null;
  nominal: boolean;
  readLease: () => WorkspaceLease | null;
  onCommit: (command: LayoutEditCommand) => void;
  cancelRef: MutableRefObject<(() => void) | null>;
  onSelect: (target: SpatialTarget) => void;
  edit?: ReactNode;
};

export function PlanWorkspace({
  binding,
  workspace,
  content,
  projection,
  projectionStatus,
  projectionFailure = null,
  historical,
  spatialRequests,
  projectRevision,
  ghostCommand,
  nudgeCommand,
  editLocked,
  gestureBlocked,
  fence,
  stepMm,
  placement,
  nominal,
  readLease,
  onCommit,
  cancelRef,
  onSelect,
  edit,
}: PlanWorkspaceProps) {
  const { state } = workspace;
  const [ports, setPorts] = useState<{ sourceKey: string; top: Viewport; front: Viewport }>(() => ({
    sourceKey: binding.sourceKey,
    top: fitViewport(),
    front: fitViewport(),
  }));
  if (ports.sourceKey !== binding.sourceKey) {
    setPorts({ sourceKey: binding.sourceKey, top: fitViewport(), front: fitViewport() });
  }
  const band = useLayoutBand();
  const coarse = useCoarsePointer();
  const explicit = band === 'compact' || coarse;
  const [mode, setMode] = useState<'select' | 'move' | 'pan'>('select');
  const [spatialDown, setSpatialDown] = useState<SpatialFailure | null>(null);
  const [spatialArmed, setSpatialArmed] = useState(false);
  const [spatialRetry, setSpatialRetry] = useState(0);
  const spatialRef = useRef<SpatialHandle>(null);
  const [spacePan, setSpacePan] = useState(false);
  const [preview, setPreview] = useState<MmPoint | null>(null);
  const [phase, setPhase] = useState<'idle' | 'armed' | 'preview'>('idle');
  const [precheck, setPrecheck] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const renderStamp = useRef(0);
  renderStamp.current = performance.now();
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || import.meta.env.MODE !== 'test') return;
    root.dataset.renderMs = String(Math.round((performance.now() - renderStamp.current) * 10) / 10);
    root.dataset.renderSeq = String(Number(root.dataset.renderSeq ?? '0') + 1);
  });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active: PlaneView = state.view === 'front' ? 'front' : 'top';
  const spatialShowing = state.view === 'spatial' && spatialDown === null;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || spatialImportMs === null) return;
    root.dataset.spatialImportMs = String(Math.round(spatialImportMs * 10) / 10);
  }, [spatialShowing, spatialRetry]);
  const moveAllowed = state.view === 'top' || (state.view === 'spatial' && spatialDown !== null);
  const directMove = !explicit && mode !== 'pan';
  const moveOn = Boolean(
    placement && nominal && !gestureBlocked && !editLocked && moveAllowed && (mode === 'move' || directMove),
  );
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (band !== 'compact') {
      if (dialog.open) dialog.close();
      return;
    }
    if (state.selection && mode !== 'move' && !dialog.open) dialog.showModal();
  }, [band, mode, state.selection]);

  function setPort(view: PlaneView, next: Viewport) {
    setPorts((current) => ({ ...current, [view]: next }));
  }

  function showPlane(view: 'top' | 'front') {
    workspace.setView(view);
  }

  function zoomClicked(factor: number) {
    if (spatialShowing) {
      spatialRef.current?.zoom(factor);
      return;
    }
    zoomActive(projection, active, ports[active], factor, setPort);
  }

  function fitClicked() {
    if (spatialShowing) {
      spatialRef.current?.fit();
      return;
    }
    setPort(active, fitViewport());
  }

  function onZoomKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (isTypingTarget(target)) return;
    if (spatialShowing) {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        spatialRef.current?.zoom(ZOOM_STEP);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        spatialRef.current?.zoom(1 / ZOOM_STEP);
      } else if (event.key === '0') {
        event.preventDefault();
        spatialRef.current?.fit();
      }
      return;
    }
    if (event.key === ' ' || event.code === 'Space') {
      if (event.target instanceof Element && event.target.closest('.plan-diagram')) {
        event.preventDefault();
        setSpacePan(true);
      }
      return;
    }
    const frame = projection ? spaceFrame(projection, active) : null;
    if (!frame) return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setPort(active, zoomBy(ports[active], frame, viewPad(active), ZOOM_STEP));
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      setPort(active, zoomBy(ports[active], frame, viewPad(active), 1 / ZOOM_STEP));
    } else if (event.key === '0') {
      event.preventDefault();
      setPort(active, fitViewport());
    }
  }

  function onZoomKeyUp(event: KeyboardEvent) {
    if (event.key === ' ' || event.code === 'Space') setSpacePan(false);
  }

  function enterMode(next: 'move' | 'pan') {
    cancelRef.current?.();
    setPreview(null);
    setPhase('idle');
    const leaving = mode === next;
    setMode(leaving ? 'select' : next);
    if (!leaving && next === 'move') dialogRef.current?.close();
  }

  const inspector = (
    <InspectorLayers
      content={content}
      projection={projection}
      selection={state.selection}
      focus={state.focus}
      onSelect={onSelect}
      onShowInList={(elementId) => document.getElementById(elementId)?.scrollIntoView({ block: 'nearest' })}
    >
      {state.selection?.kind === 'placement' ? edit : null}
      {state.selection && state.selection.kind !== 'placement' && (
        <p className="session-note" data-testid="move-disabled">
          이동은 부모 수납함을 선택한 뒤에만 할 수 있습니다.
        </p>
      )}
    </InspectorLayers>
  );

  const pointerPreview =
    preview && placement ? movePlacementCommand(placement.id, preview) : null;
  const shownPreview = ghostCommand ? null : (pointerPreview ?? nudgeCommand ?? null);

  function interactionFor(view: PlaneView): DiagramInteraction {
    const isActive = active === view;
    return {
      enabledMove: view === 'top' && isActive && moveOn,
      enabledPan: isActive && mode === 'pan',
      placementId: placement?.id ?? null,
      origin: placement?.position ?? null,
      pending: editLocked,
      blocked: gestureBlocked,
      spacePan: isActive && spacePan,
    touchNone: isActive && (mode === 'move' || mode === 'pan' || spacePan),
      readLease,
      fence,
      onCommit,
      onPreview: setPreview,
      onPrecheck: setPrecheck,
      onPhase: setPhase,
      bindCancel: (cancel) => {
        if (isActive) cancelRef.current = cancel;
      },
    };
  }

  return (
    <div
      ref={rootRef}
      className="plan-workspace"
      data-testid="plan-workspace"
      data-historical={historical ? 'true' : 'false'}
      data-spatial-requests={spatialRequests}
      data-project-revision={projectRevision}
      data-projection-status={projectionStatus}
      data-projection-failure={projectionFailure ?? ''}
      data-projection-snapshot={
        projection?.source.kind === 'plan' ? projection.source.planSnapshotId : ''
      }
      data-band={band}
      data-canvas-mode={mode}
      data-pointer={explicit ? 'explicit' : 'direct'}
      data-view={state.view}
      data-move={moveOn ? 'on' : 'off'}
      data-gesture-phase={phase}
      onKeyDown={onZoomKey}
      onKeyUp={onZoomKeyUp}
    >
      <div className="workspace-toolbar" role="toolbar" aria-label="도면">
        <button type="button" className="button button-quiet" aria-pressed={state.view === 'top'} data-testid="view-top" onClick={() => showPlane('top')}>
          평면
        </button>
        <button type="button" className="button button-quiet" aria-pressed={state.view === 'front'} data-testid="view-front" onClick={() => showPlane('front')}>
          정면
        </button>
        <button
          type="button"
          className="button button-quiet"
          aria-pressed={state.view === 'spatial'}
          data-testid="view-spatial"
          onClick={() => {
            setSpatialArmed(true);
            setSpatialDown(null);
            workspace.setView('spatial');
          }}
        >
          입체
        </button>
        <button type="button" className="button button-quiet" data-testid="zoom-out" onClick={() => zoomClicked(1 / ZOOM_STEP)}>
          축소
        </button>
        <button type="button" className="button button-quiet" data-testid="zoom-in" onClick={() => zoomClicked(ZOOM_STEP)}>
          확대
        </button>
        <button type="button" className="button button-quiet" data-testid="zoom-fit" onClick={fitClicked}>
          맞춤
        </button>
        <button
          type="button"
          className="button button-quiet"
          aria-pressed={mode === 'move'}
          data-testid="mode-move"
          disabled={!placement || editLocked || gestureBlocked || !moveAllowed}
          onClick={() => enterMode('move')}
        >
          평면에서 이동
        </button>
        <button
          type="button"
          className="button button-quiet"
          aria-pressed={mode === 'pan'}
          data-testid="mode-pan"
          onClick={() => enterMode('pan')}
        >
          화면 이동
        </button>
        {mode === 'move' && (
          <>
            <button type="button" className="button button-quiet" data-testid="mode-cancel" onClick={() => enterMode('move')}>
              취소
            </button>
            <button
              type="button"
              className="button button-quiet"
              data-testid="mode-coords"
              onClick={() => {
                if (band === 'compact') dialogRef.current?.showModal();
                rootRef.current?.querySelector<HTMLInputElement>('[data-testid="move-x"]')?.focus();
              }}
            >
              좌표 입력
            </button>
          </>
        )}
        <button type="button" className="button button-quiet" aria-pressed={state.layers.dimensions} data-testid="layer-dimensions" onClick={() => workspace.setLayer('dimensions', !state.layers.dimensions)}>
          치수
        </button>
        <button type="button" className="button button-quiet" aria-pressed={state.layers.contents} data-testid="layer-contents" onClick={() => workspace.setLayer('contents', !state.layers.contents)}>
          내용물
        </button>
        <button type="button" className="button button-quiet" aria-pressed={state.layers.checks} data-testid="layer-checks" onClick={() => workspace.setLayer('checks', !state.layers.checks)}>
          검사
        </button>
        <p className="workspace-scope" data-testid="workspace-scope">
          {historical ? '이전 계획 · 입력 변경' : '현재 계획'}
        </p>
      </div>
      <p className="workspace-legend" data-testid="workspace-legend">
        <span className="legend-selection">선택됨</span>
        <span className="legend-focus">목록 강조</span>
        <span className="legend-step">현재 단계 대상</span>
      </p>
      <p className="visually-hidden" aria-live="polite" data-testid="selection-live">
        {selectionAnnouncement(state.selection, selectionLabel(content, state.selection))}
      </p>
      <p className="visually-hidden" aria-live="polite" data-testid="focus-live">
        {focusAnnouncement(state.focus)}
      </p>
      <p className="session-note" data-testid="drag-quantum">
        드래그는 1mm 단위 · 정확한 값은 좌표 입력
      </p>
      <p className="session-note" data-testid="move-step">
        이동 단위 {stepMm} mm
      </p>
      <p
        className="notice notice-preview drag-phase-slot"
        data-testid="drag-phase"
        data-shown={phase === 'preview' && !ghostCommand ? 'true' : 'false'}
        aria-hidden={phase === 'preview' && !ghostCommand ? undefined : true}
      >
        검사 전
      </p>
      {precheck && (
        <p className="notice notice-error" role="alert" data-testid="drag-precheck">
          {precheck}
        </p>
      )}
      <div className="plan-workspace-body">
        <div className="plan-stage">
          {state.view === 'spatial' && spatialDown && (
            <SpatialFallback
              reason={spatialDown}
              onPlane={() => showPlane('top')}
              onRetry={() => {
                setSpatialDown(null);
                setSpatialRetry((value) => value + 1);
              }}
            />
          )}
          {state.view === 'spatial' && !spatialDown && !projection && (
            <p className="session-note" data-testid="spatial-waiting">
              배치 투영을 기다리는 중입니다. 목록은 사용할 수 있습니다.
            </p>
          )}
          {spatialArmed && spatialDown === null && projection && (
            <div hidden={!spatialShowing}>
              <SpatialBoundary resetKey={spatialRetry} onFail={() => setSpatialDown('import')}>
                <Suspense fallback={<p data-testid="spatial-loading">입체 보기를 불러오는 중</p>}>
                  <SpatialView
                    ref={spatialRef}
                    projection={projection}
                    content={content}
                    selection={state.selection}
                    focus={state.focus}
                    layers={state.layers}
                    onSelect={onSelect}
                    onFatal={setSpatialDown}
                  />
                </Suspense>
              </SpatialBoundary>
            </div>
          )}
          <div
            className="plan-diagrams"
            hidden={spatialShowing}
            data-testid="plan-drawings"
            data-revision={binding.planSnapshotId}
          >
            <PlanDiagram
              content={content}
              projection={projection}
              status={projectionStatus}
              view="top"
              testId="plan-diagram-top"
              active={active === 'top'}
              layers={state.layers}
              selection={state.selection}
              focus={state.focus}
              viewport={ports.top}
              onViewport={(next) => setPort('top', next)}
              ghostCommand={ghostCommand}
              previewCommand={shownPreview}
              interaction={interactionFor('top')}
              onSelect={onSelect}
              onHover={workspace.hover}
            />
            <PlanDiagram
              content={content}
              projection={projection}
              status={projectionStatus}
              view="front"
              testId="plan-diagram-front"
              active={active === 'front'}
              layers={state.layers}
              selection={state.selection}
              focus={state.focus}
              viewport={ports.front}
              onViewport={(next) => setPort('front', next)}
              interaction={interactionFor('front')}
              onSelect={onSelect}
              onHover={workspace.hover}
            />
          </div>
          <DiagramTextList
            content={content}
            projection={projection}
            selection={state.selection}
            onSelect={onSelect}
          />
        </div>
        {band === 'compact' ? (
          <div className="inspector-compact">
            <button
              type="button"
              className="button button-secondary"
              data-testid="open-inspector"
              ref={triggerRef}
              onClick={() => dialogRef.current?.showModal()}
            >
              선택 정보
            </button>
            <dialog
              ref={dialogRef}
              className="inspector-sheet"
              aria-label="선택 정보"
              onClose={() => triggerRef.current?.focus()}
            >
              {inspector}
              <div className="form-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  aria-pressed={mode === 'move'}
                  data-testid="mode-move"
                  disabled={!placement || editLocked || gestureBlocked || !moveAllowed}
                  onClick={() => enterMode('move')}
                >
                  평면에서 이동
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  data-testid="close-inspector"
                  onClick={() => dialogRef.current?.close()}
                >
                  닫기
                </button>
              </div>
            </dialog>
          </div>
        ) : (
          inspector
        )}
      </div>
    </div>
  );
}

function selectionLabel(content: SnapshotContent, selection: SpatialTarget | null): string | null {
  if (!selection) return null;
  if (selection.kind === 'placement') {
    const placement = content.placements.find((item) => item.id === selection.placementId);
    return placement ? subjectLabel(content, placement.subject) : selection.placementId;
  }
  if (selection.kind === 'item' || selection.kind === 'itemInstance') {
    return content.inputFacts.items.find((item) => item.id === selection.itemId)?.label ?? selection.itemId;
  }
  return targetKey(selection);
}

function zoomActive(
  projection: SpatialProjection | null,
  view: PlaneView,
  viewport: Viewport,
  factor: number,
  setPort: (view: PlaneView, next: Viewport) => void,
) {
  const frame = projection ? spaceFrame(projection, view) : null;
  if (!frame) return;
  setPort(view, zoomBy(viewport, frame, viewPad(view), factor));
}

function useCoarsePointer(): boolean {
  const read = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const [coarse, setCoarse] = useState(read);
  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return coarse;
}

function useLayoutBand(): 'compact' | 'medium' | 'wide' {
  const read = (): 'compact' | 'medium' | 'wide' => {
    if (typeof window === 'undefined') return 'wide';
    if (window.matchMedia('(max-width: 47.999rem)').matches) return 'compact';
    if (window.matchMedia('(min-width: 75rem)').matches) return 'wide';
    return 'medium';
  };
  const [band, setBand] = useState(read);
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 47.999rem)');
    const wide = window.matchMedia('(min-width: 75rem)');
    const update = () => setBand(read());
    update();
    compact.addEventListener('change', update);
    wide.addEventListener('change', update);
    return () => {
      compact.removeEventListener('change', update);
      wide.removeEventListener('change', update);
    };
  }, []);
  return band;
}

export type { RectVm };

function SpatialFallback({
  reason,
  onPlane,
  onRetry,
}: {
  reason: SpatialFailure;
  onPlane: () => void;
  onRetry: () => void;
}) {
  const text =
    reason === 'context_lost'
      ? '그래픽 연결이 끊겨 입체 보기를 멈췄습니다.'
      : reason === 'import'
        ? '입체 보기 파일을 불러오지 못했습니다.'
        : '이 브라우저에서는 WebGL을 쓸 수 없어 입체 보기를 열지 못했습니다.';
  return (
    <div className="notice notice-error" role="alert" data-testid="spatial-fallback" data-reason={reason}>
      <p>{text}</p>
      <p>평면·정면·목록·구매·숫자 편집·단계 완료는 그대로 사용할 수 있습니다.</p>
      <div className="form-actions">
        <button type="button" className="button button-secondary" data-testid="spatial-use-2d" onClick={onPlane}>
          평면으로 보기
        </button>
        <button type="button" className="button button-quiet" data-testid="spatial-retry" onClick={onRetry}>
          입체 보기 다시 시도
        </button>
      </div>
    </div>
  );
}

class SpatialBoundary extends Component<
  { resetKey: number; onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onFail();
  }

  componentDidUpdate(prev: { resetKey: number }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
