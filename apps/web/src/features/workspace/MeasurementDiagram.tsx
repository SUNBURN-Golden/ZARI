import type { ProjectInput, SpatialProjection } from '../../contracts/generated/dto';
import { measurementDrawing, type MeasureBlock } from './projection';
import { fittedViewBox, viewBoxAttr, viewPad, type PlaneView } from './viewport';

type MeasurementDiagramProps = {
  fieldPath: string | null;
  projection: SpatialProjection | null;
  projectionStatus: 'loading' | 'ready' | 'failed' | 'absent';
  input: ProjectInput | null;
  block: MeasureBlock | null;
  onActivateField: (fieldPath: string) => void;
};

const REASON_TEXT: Record<Exclude<ReturnType<typeof measurementDrawing>['reason'], null>, string> = {
  unknown: '측정 위치 안내 · 축척 없음',
  invalid: '입력을 확인할 수 없습니다 · 축척 없음',
  stale: '입력 변경 · 이전 측정',
  pending: '측정 도식을 준비하고 있습니다',
  failed: '측정 도식을 만들지 못했습니다. 입력값은 그대로입니다.',
};

/**
 * One focused measurement. A scaled silhouette is painted only when the
 * projector already produced the frame. Text stays upright.
 */
export function MeasurementDiagram({
  fieldPath,
  projection,
  projectionStatus,
  input,
  block,
  onActivateField,
}: MeasurementDiagramProps) {
  const drawing = measurementDrawing(fieldPath, projection, projectionStatus, input, block);
  const reasonText = drawing.reason ? REASON_TEXT[drawing.reason] : null;
  return (
    <figure className="measure-diagram" data-testid="measurement-diagram-figure">
      <figcaption className="measure-diagram-caption" data-testid="measurement-caption">
        {drawing.caption}
      </figcaption>
      {drawing.mode === 'scaled' && drawing.frame ? (
        <ScaledMeasure
          fieldPath={fieldPath}
          view={drawing.view}
          frame={drawing.frame}
          segment={drawing.segment}
          separateFrame={drawing.separateFrame}
          onActivateField={onActivateField}
        />
      ) : (
        <SchematicMeasure reason={drawing.reason} reasonText={reasonText} />
      )}
      {drawing.separateFrame && drawing.mode === 'scaled' && (
        <p className="session-note" data-testid="measurement-frame-note">
          물건 측정 도식 · 공간 배치가 아닙니다
        </p>
      )}
      <p className="measure-diagram-facts" data-testid="measurement-facts">
        {drawing.valueText ? (
          <span className="zari-numeral">{drawing.valueText}</span>
        ) : (
          <span>값 없음</span>
        )}
        {drawing.uncertaintyNote && <span> · {drawing.uncertaintyNote}</span>}
        {drawing.provenanceText && <span> · {drawing.provenanceText}</span>}
      </p>
      {reasonText && drawing.mode === 'schematic' && (
        <p className={drawing.reason === 'stale' ? 'notice notice-stale' : 'notice'} data-testid="measurement-reason">
          {reasonText}
        </p>
      )}
    </figure>
  );
}

function ScaledMeasure({
  fieldPath,
  view,
  frame,
  segment,
  separateFrame,
  onActivateField,
}: {
  fieldPath: string | null;
  view: PlaneView;
  frame: { width: number; height: number };
  segment: { x1: number; y1: number; x2: number; y2: number } | null;
  separateFrame: boolean;
  onActivateField: (fieldPath: string) => void;
}) {
  const pad = viewPad(view);
  const box = fittedViewBox(frame, pad);
  return (
    <svg
      className="plan-diagram measure-svg"
      data-testid="measurement-diagram"
      data-scale="mm"
      data-view={view}
      data-separate-frame={separateFrame ? 'true' : undefined}
      viewBox={viewBoxAttr(box)}
      role="img"
      aria-label={view === 'top' ? '평면 측정 도식' : '정면 측정 도식'}
    >
      <g data-testid="measurement-plane" transform="scale(1 -1)">
        <rect className="compartment-envelope" x={0} y={0} width={frame.width} height={frame.height} />
        {segment && fieldPath && (
          <line
            className="dimension-line dimension-focused"
            data-testid="measurement-segment"
            data-field={fieldPath}
            data-x1={segment.x1}
            data-y1={segment.y1}
            data-x2={segment.x2}
            data-y2={segment.y2}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            role="button"
            tabIndex={0}
            onClick={() => onActivateField(fieldPath)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onActivateField(fieldPath);
              }
            }}
          >
            <title>이 치수 입력으로 이동</title>
          </line>
        )}
      </g>
      {view === 'top' && (
        <text className="diagram-label" x={0} y={12}>
          앞쪽 / 입구
        </text>
      )}
    </svg>
  );
}

function SchematicMeasure({
  reason,
  reasonText,
}: {
  reason: string | null;
  reasonText: string | null;
}) {
  return (
    <svg
      className="plan-diagram measure-svg measure-schematic"
      data-testid="measurement-diagram"
      data-scale="none"
      data-freshness={reason ?? 'unknown'}
      viewBox="0 0 160 100"
      role="img"
      aria-label={reasonText ?? '측정 위치 안내 · 축척 없음'}
    >
      <rect className="compartment-envelope diagram-unknown" x={24} y={22} width={112} height={56} />
      <text className="diagram-label" x={80} y={54} textAnchor="middle">
        축척 없음
      </text>
    </svg>
  );
}
