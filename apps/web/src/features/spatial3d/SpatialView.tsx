import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import type { SnapshotContent, SpatialProjection, SpatialTarget } from '../../contracts/generated/dto';
import type { WorkspaceFocus, WorkspaceLayers } from '../workspace/model';
import { diagramTextEntries } from '../workspace/projection';
import { targetKey, targetsEqual } from '../workspace/selection';
import type { CameraPreset } from './camera';
import { clearTokenCache } from './colors';
import { SpatialEngine, WebglUnavailable, type SpatialAnchor } from './engine';
import { interiorPlacementId, planScene, reasonText } from './scene';

export type SpatialHandle = {
  zoom: (factor: number) => void;
  fit: () => void;
};

type SpatialViewProps = {
  ref?: Ref<SpatialHandle>;
  projection: SpatialProjection;
  content: SnapshotContent;
  selection: SpatialTarget | null;
  focus: WorkspaceFocus;
  layers: WorkspaceLayers;
  onSelect: (target: SpatialTarget) => void;
  onFatal: (reason: 'webgl_unavailable' | 'context_lost') => void;
};

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'oblique', label: '비스듬히' },
  { id: 'top', label: '위에서' },
  { id: 'front', label: '앞에서' },
];

export function SpatialView({
  ref,
  projection,
  content,
  selection,
  focus,
  layers,
  onSelect,
  onFatal,
}: SpatialViewProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SpatialEngine | null>(null);
  const onSelectRef = useRef(onSelect);
  const onFatalRef = useRef(onFatal);
  onSelectRef.current = onSelect;
  onFatalRef.current = onFatal;
  const [preset, setPreset] = useState<CameraPreset>('oblique');
  const [hideFront, setHideFront] = useState(true);
  const [hideTop, setHideTop] = useState(true);
  const [interior, setInterior] = useState(false);
  const [ambiguous, setAmbiguous] = useState<SpatialTarget[] | null>(null);
  const [anchors, setAnchors] = useState<SpatialAnchor[]>([]);
  const [forced, setForced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(forced-colors: active)').matches,
  );
  const canInterior =
    selection?.kind === 'placement' &&
    projection.elements.some(
      (element) =>
        (element.role === 'ownedContainer' || element.role === 'newContainer') &&
        element.target.kind === 'placement' &&
        element.target.placementId === selection.placementId,
    );
  const sceneMs = useRef(0);
  const plan = useMemo(() => {
    const started = performance.now();
    const next = planScene(projection, content, layers, selection, focus, {
      hideFront,
      hideTop,
      interiorPlacementId: interiorPlacementId(projection, selection, interior && Boolean(canInterior)),
    });
    sceneMs.current = performance.now() - started;
    return next;
  }, [projection, content, layers, selection, focus, hideFront, hideTop, interior, canInterior]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    let engine: SpatialEngine;
    try {
      engine = new SpatialEngine(root, canvas, {
        onFatal: (reason) => onFatalRef.current(reason),
        onSelect: (target) => onSelectRef.current(target),
        onAmbiguous: setAmbiguous,
        onAnchors: setAnchors,
      });
    } catch (error) {
      if (error instanceof WebglUnavailable) onFatalRef.current('webgl_unavailable');
      else onFatalRef.current('webgl_unavailable');
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (root) root.dataset.sceneMs = String(Math.round(sceneMs.current * 10) / 10);
    engineRef.current?.sync(plan, preset);
  }, [plan, preset]);

  useEffect(() => {
    const media = window.matchMedia('(forced-colors: active)');
    const update = () => {
      setForced(media.matches);
      clearTokenCache();
      engineRef.current?.refreshColors();
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!ref) return;
    const handle: SpatialHandle = {
      zoom(factor: number) {
        engineRef.current?.zoom(factor);
      },
      fit() {
        engineRef.current?.fit();
      },
    };
    if (typeof ref === 'function') ref(handle);
    else ref.current = handle;
    return () => {
      if (typeof ref === 'function') ref(null);
      else ref.current = null;
    };
  }, [ref]);

  function onCanvasKey(event: KeyboardEvent<HTMLCanvasElement>) {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight'
    ) {
      return;
    }
    event.preventDefault();
    const order = diagramTextEntries(projection, content)
      .map((entry) => entry.target)
      .filter((target): target is SpatialTarget => target !== null);
    if (order.length === 0) return;
    const index = order.findIndex((target) => targetsEqual(target, selection));
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex =
      index < 0
        ? delta > 0
          ? 0
          : order.length - 1
        : (index + delta + order.length) % order.length;
    const next = order[nextIndex];
    if (next) onSelect(next);
  }

  return (
    <section className="spatial-stage" aria-labelledby={titleId} data-module="zari-spatial3d-module">
      <h3 id={titleId} className="section-kicker">
        입체
      </h3>
      <div className="spatial-toolbar" role="toolbar" aria-label="입체 보기">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="button button-quiet"
            aria-pressed={preset === item.id}
            data-testid={`spatial-preset-${item.id}`}
            onClick={() => setPreset(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="button button-quiet"
          aria-pressed={hideFront}
          data-testid="spatial-hide-front"
          onClick={() => setHideFront((value) => !value)}
        >
          앞면 경계 숨김
        </button>
        <button
          type="button"
          className="button button-quiet"
          aria-pressed={hideTop}
          data-testid="spatial-hide-top"
          onClick={() => setHideTop((value) => !value)}
        >
          윗면 경계 숨김
        </button>
        <button
          type="button"
          className="button button-quiet"
          aria-pressed={Boolean(canInterior && interior)}
          data-testid="spatial-interior"
          disabled={!canInterior}
          onClick={() => setInterior((value) => !value)}
        >
          수납함 내부 보기
        </button>
      </div>
      {!canInterior && (
        <p className="session-note" data-testid="spatial-interior-reason">
          수납함을 선택한 뒤에 내부를 볼 수 있습니다.
        </p>
      )}
      <p className="spatial-caption" data-testid="spatial-caption">
        앞면 · x 오른쪽 · y 뒤쪽 · z 위 · mm · 읽기 전용. 벽면은 경계 표시이며 측정된 판 두께가 아닙니다.
      </p>
      {forced && (
        <p className="session-note" data-testid="spatial-forced">
          강제 색상 모드에서는 입체 색을 구분하기 어렵습니다. 평면 보기와 도면 목록을 사용하세요.
        </p>
      )}
      <div
        ref={rootRef}
        className="spatial-canvas-wrap"
        data-testid="spatial-view"
        data-preset={preset}
        data-hide-front={hideFront ? 'true' : 'false'}
        data-hide-top={hideTop ? 'true' : 'false'}
        data-interior={canInterior && interior ? 'true' : 'false'}
      >
        <canvas
          ref={canvasRef}
          className="spatial-canvas"
          data-testid="spatial-canvas"
          tabIndex={0}
          role="img"
          aria-label="구획 입체 보기. 읽기 전용입니다. 방향키로 도면 목록과 같은 대상을 선택합니다."
          onKeyDown={onCanvasKey}
        />
        <div className="spatial-labels">
          {anchors.map((anchor) =>
            anchor.visible ? (
              <span
                key={anchor.key}
                className="spatial-label"
                data-testid={`spatial-label-${anchor.key}`}
                data-target={anchor.targetKey}
                data-min={anchor.minMm}
                data-max={anchor.maxMm}
                data-selected={anchor.selected ? 'true' : undefined}
                data-focus={anchor.focused ? 'true' : undefined}
                data-pickable={anchor.pickable ? 'true' : 'false'}
                data-x={anchor.x}
                data-y={anchor.y}
                style={{ left: `${anchor.x}px`, top: `${anchor.y}px` }}
              >
                {anchor.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <p className="visually-hidden" aria-live="polite" data-testid="spatial-live">
        {selection ? `선택됨 ${targetKey(selection)}` : '선택된 입체 대상 없음'}
      </p>
      {ambiguous && ambiguous.length > 1 && (
        <ul className="plan-list" data-testid="spatial-ambiguous">
          {ambiguous.map((target) => (
            <li key={targetKey(target)}>
              <button type="button" className="text-pick" onClick={() => onSelect(target)}>
                {targetKey(target)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {plan.unavailable.length > 0 && (
        <ul className="plan-list" data-testid="spatial-unavailable">
          {plan.unavailable.map((item) => (
            <li key={item.key} data-reason={item.reasonCode}>
              {item.label} · {reasonText(item.reasonCode)}
            </li>
          ))}
        </ul>
      )}
      {plan.cuboids.length === 0 && plan.planes.length === 0 && (
        <p className="session-note" data-testid="spatial-empty">
          표시할 입체 도형이 없습니다. 평면·정면과 목록은 사용할 수 있습니다.
        </p>
      )}
    </section>
  );
}

export default SpatialView;
