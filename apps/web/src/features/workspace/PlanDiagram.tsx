import { useEffect, useRef } from 'react';
import type {
  LayoutEditCommand,
  SnapshotContent,
  SpatialProjection,
  SpatialTarget,
} from '../../contracts/generated/dto';
import {
  containedOffsetUnknown,
  diagramRects,
  ghostFromProjection,
  spaceFrame,
} from '../plan/projection';
import type { WorkspaceFocus, WorkspaceLayers } from './model';
import {
  cavityPane,
  checkOverlayRects,
  dimensionLines,
  sceneRects,
} from './projection';
import { focusTargets, targetIn, targetKey, targetsEqual } from './selection';
import { useCanvasGesture } from './useCanvasGesture';
import type { WorkspaceLease } from './lease';
import type { MmPoint } from './drag';
import {
  TOP_PAD,
  viewBoxAttr,
  viewPad,
  zoomAboutDomain,
  zoomedViewBox,
  type PlaneView,
  type Viewport,
  ZOOM_STEP,
} from './viewport';

export type DiagramInteraction = {
  enabledMove: boolean;
  enabledPan: boolean;
  placementId: string | null;
  origin: MmPoint | null;
  pending: boolean;
  blocked: boolean;
  spacePan: boolean;
  /** Canvas-only touch-action:none while an explicit move or pan mode is on. */
  touchNone: boolean;
  readLease: () => WorkspaceLease | null;
  fence: string;
  onCommit: (command: LayoutEditCommand) => void;
  onPreview: (position: MmPoint | null) => void;
  onPrecheck: (message: string | null) => void;
  onPhase: (phase: 'idle' | 'armed' | 'preview') => void;
  bindCancel: (cancel: () => void) => void;
};

type PlanDiagramProps = {
  content: SnapshotContent;
  projection: SpatialProjection | null;
  status: 'loading' | 'ready' | 'failed' | 'absent';
  view: PlaneView;
  testId: string;
  active: boolean;
  layers: WorkspaceLayers;
  selection: SpatialTarget | null;
  focus: WorkspaceFocus;
  viewport: Viewport;
  onViewport: (next: Viewport) => void;
  ghostCommand?: LayoutEditCommand | null;
  previewCommand?: LayoutEditCommand | null;
  interaction?: DiagramInteraction | null;
  onSelect?: (target: SpatialTarget) => void;
  onHover?: (target: SpatialTarget | null) => void;
};

/**
 * One measured view. Rectangles stay in domain millimetres.
 * `scale(1,-1)` is the only axis inversion, applied while painting.
 */
export function PlanDiagram({
  content,
  projection,
  status,
  view,
  testId,
  active,
  layers,
  selection,
  focus,
  viewport,
  onViewport,
  ghostCommand,
  previewCommand,
  interaction,
  onSelect,
  onHover,
}: PlanDiagramProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const frame = projection && status === 'ready' ? spaceFrame(projection, view) : null;
  const pad = viewPad(view);
  const pointer = useCanvasGesture(svgRef, planeRef, {
    enabledMove: interaction?.enabledMove ?? false,
    enabledPan: interaction?.enabledPan ?? false,
    placementId: interaction?.placementId ?? null,
    origin: interaction?.origin ?? null,
    pending: interaction?.pending ?? false,
    blocked: interaction?.blocked ?? false,
    spacePan: interaction?.spacePan ?? false,
    readLease: interaction?.readLease ?? (() => null),
    fence: interaction?.fence ?? '',
    viewport,
    onCommit: interaction?.onCommit ?? (() => undefined),
    onPreview: interaction?.onPreview ?? (() => undefined),
    onPan: onViewport,
    onPrecheck: interaction?.onPrecheck ?? (() => undefined),
    onPhase: interaction?.onPhase ?? (() => undefined),
  });
  if (interaction) interaction.bindCancel(pointer.cancel);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !frame) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !active) return;
      if (!host.contains(document.activeElement)) return;
      const plane = planeRef.current;
      const svg = plane?.ownerSVGElement;
      const ctm = plane?.getScreenCTM();
      if (!plane || !svg || !ctm) return;
      event.preventDefault();
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(ctm.inverse());
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      onViewport(
        zoomAboutDomain(frame, pad, viewport, { x: local.x, y: local.y }, viewport.zoom * factor),
      );
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [active, frame, onViewport, pad, viewport]);

  if (status === 'loading' || status === 'absent') {
    return (
      <p className="notice" data-testid={`${testId}-pending`}>
        배치 그림을 준비하고 있습니다.
      </p>
    );
  }
  if (status === 'failed' || !projection) {
    return (
      <p className="notice" role="alert" data-testid={`${testId}-failed`}>
        배치 그림을 그리지 못했습니다. 목록과 BOM은 그대로 볼 수 있습니다.
      </p>
    );
  }
  if (!frame) {
    return (
      <p className="notice" data-testid={testId}>
        공간 치수를 알 수 없어 그림을 그릴 수 없습니다.
      </p>
    );
  }

  const rects = sceneRects(projection, content, view, layers).slice().sort(
    (a, b) => roleOrder(a.role) - roleOrder(b.role),
  );
  const overlays = checkOverlayRects(projection, view, selection, focus, layers);
  const lines = dimensionLines(projection, view, layers, selection, focus);
  const linked = focusTargets(projection, focus);
  const ghostSource = ghostCommand ?? previewCommand ?? null;
  const ghost = ghostSource ? ghostFromProjection(projection, content, ghostSource, ghostCommand ? '검증 중' : '검사 전') : null;
  const offsetUnknown = containedOffsetUnknown(projection);
  const cavity = cavityPane(projection, selection, view);
  const box = zoomedViewBox(frame, pad, viewport);

  return (
    <div ref={hostRef} data-active={active ? 'true' : undefined}>
      <svg
        ref={svgRef}
        className="plan-diagram"
        data-testid={testId}
        data-view={view}
        data-zoom={viewport.zoom}
        data-gesture={interaction?.touchNone ? 'active' : 'idle'}
        viewBox={viewBoxAttr(box)}
        role="img"
        aria-label={view === 'top' ? '위에서 본 배치' : '앞에서 본 배치'}
        tabIndex={active ? 0 : undefined}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={pointer.onPointerUp}
        onPointerCancel={pointer.onPointerCancel}
        onLostPointerCapture={pointer.onLostPointerCapture}
      >
        <g ref={planeRef} data-testid={`${testId}-plane`} transform="scale(1 -1)">
          <rect className="diagram-space" x={0} y={0} width={frame.width} height={frame.height} />
          {rects.map((rect) => (
            <rect
              key={rect.key}
              className={`diagram-${rectClass(rect.role)}`}
              data-target={targetKey(rect.target)}
              data-selected={targetsEqual(selection, rect.target) ? 'true' : undefined}
              data-focus={targetIn(linked, rect.target) ? 'true' : undefined}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              onClick={onSelect ? () => onSelect(rect.target) : undefined}
              onMouseEnter={onHover ? () => onHover(rect.target) : undefined}
              onMouseLeave={onHover ? () => onHover(null) : undefined}
            >
              <title>{rect.label}</title>
            </rect>
          ))}
          {overlays.map((rect) => (
            <rect
              key={rect.key}
              className="diagram-overlay"
              data-overlay={rect.role}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
            >
              <title>{rect.label}</title>
            </rect>
          ))}
          {ghost && view === 'top' && (
            <rect
              className="diagram-ghost"
              data-testid={ghostCommand ? 'edit-ghost' : 'drag-preview'}
              data-valid="false"
              x={ghost.x}
              y={ghost.y}
              width={ghost.width}
              height={ghost.height}
            >
              <title>{ghost.label}</title>
            </rect>
          )}
          {rects
            .filter((rect) => targetIn(linked, rect.target))
            .map((rect) => (
              <rect
                key={`focus:${rect.key}`}
                className="diagram-focus"
                data-testid="focus-outline"
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
              />
            ))}
          {rects
            .filter((rect) => targetsEqual(selection, rect.target))
            .map((rect) => (
              <rect
                key={`selection:${rect.key}`}
                className="diagram-selection"
                data-testid="selection-outline"
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
              />
            ))}
          {lines.map((line) => (
            <line
              key={line.guideId}
              className={line.emphasized ? 'dimension-line dimension-focused' : 'dimension-line'}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
            >
              <title>{line.label || line.fieldPath}</title>
            </line>
          ))}
        </g>
        {rects.map((rect) =>
          rect.width > 90 && rect.label ? (
            <text
              key={`label:${rect.key}`}
              className="diagram-label"
              x={rect.x + 4}
              y={-rect.y - (rect.role === 'ownedContainer' || rect.role === 'newContainer' ? 14 : 22)}
            >
              {rect.label}
            </text>
          ) : null,
        )}
        {view === 'top' && (
          <text className="diagram-label" x={box.x + 4} y={box.y + box.height - 4}>
            앞쪽 / 입구
          </text>
        )}
      </svg>
      {offsetUnknown && view === 'top' && (
        <p className="notice" data-testid="offset-unknown-note">
          외형 안의 실제 위치 미확인 · 별도 좌표계
        </p>
      )}
      {cavity && view === 'top' && <CavityFigure cavity={cavity} />}
    </div>
  );
}

function CavityFigure({ cavity }: { cavity: NonNullable<ReturnType<typeof cavityPane>> }) {
  let maxX = 1;
  let maxY = 1;
  for (const box of cavity.boxes) {
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return (
    <figure className="cavity-local" data-testid="cavity-local">
      <figcaption>내부 수납 도식 · 실제 외형 내 위치 미확인</figcaption>
      {cavity.boxes.length > 0 ? (
        <svg
          className="plan-diagram"
          viewBox={`${-8} ${-(maxY + 8)} ${maxX + 16} ${maxY + 16}`}
          role="img"
          aria-label="수납함 내부의 별도 좌표"
        >
          <g transform="scale(1 -1)">
            {cavity.boxes.map((box) => (
              <rect
                key={box.key}
                className={box.label === '내경' ? 'diagram-space' : 'diagram-contained'}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
              >
                <title>{box.label}</title>
              </rect>
            ))}
          </g>
        </svg>
      ) : (
        <p className="notice">내부 치수를 알 수 없어 내부 도식은 그리지 않습니다.</p>
      )}
      <p className="session-note">외형 안의 실제 위치 미확인 · 별도 좌표계</p>
    </figure>
  );
}

/** Equal-scale thumbnail. Every card uses the same interior viewBox. */
export function PlanThumb({
  content,
  projection,
  testId,
}: {
  content: SnapshotContent;
  projection: SpatialProjection | null;
  testId: string;
}) {
  if (!projection) return null;
  const frame = spaceFrame(projection, 'top');
  if (!frame) return null;
  const rects = diagramRects(projection, content, 'top');
  return (
    <svg
      className="plan-thumb"
      data-testid={testId}
      viewBox={`${-TOP_PAD} ${-(frame.height + TOP_PAD)} ${frame.width + TOP_PAD * 2} ${frame.height + TOP_PAD * 2}`}
      role="img"
      aria-label="위에서 본 축소 배치"
    >
      <g transform="scale(1 -1)">
        <rect className="diagram-space" x={0} y={0} width={frame.width} height={frame.height} />
        {rects.map((rect) => (
          <rect
            key={`${rect.kind}:${rect.refId}:${rect.x}:${rect.y}`}
            className={`diagram-${rect.kind}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
          />
        ))}
      </g>
    </svg>
  );
}

function roleOrder(role: ReturnType<typeof sceneRects>[number]['role']): number {
  const order = [
    'aperture',
    'physicalObstacle',
    'accessExclusion',
    'ownedContainer',
    'newContainer',
    'directItem',
    'containedItem',
  ];
  const index = order.indexOf(role);
  return index === -1 ? order.length : index;
}

function rectClass(role: ReturnType<typeof sceneRects>[number]['role']): string {
  if (role === 'containedItem') return 'contained';
  if (role === 'directItem') return 'item';
  if (role === 'ownedContainer' || role === 'newContainer') return 'container';
  if (role === 'aperture') return 'aperture';
  if (role === 'physicalObstacle' || role === 'accessExclusion') return 'obstacle';
  return 'item';
}
