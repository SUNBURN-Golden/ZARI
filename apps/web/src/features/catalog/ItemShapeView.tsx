import type { HintKind, ItemShape } from './bundle';

/**
 * Procedural, image-free drawing of one catalog item from its W/D/H (mm) and
 * its category hint: a plan rectangle, a front elevation and an isometric box.
 * An item with any unknown axis is not drawn to scale at all — it shows
 * "치수 미확인" instead, so an unknown size can never look like a measured one.
 */
const BOX = 96;

const HINT_TEXT: Record<HintKind, string> = {
  shelf: '선반',
  cabinet: '수납장',
  bin: '바구니·수납함',
  table: '테이블',
  chair: '의자',
  sofa: '소파',
  bed: '침대',
  other: '기타',
  unknown: '분류 없음',
};

function scaled(shape: ItemShape) {
  const w = shape.widthMm!;
  const d = shape.depthMm!;
  const h = shape.heightMm!;
  const k = (BOX - 12) / Math.max(w, d, h, 1);
  return { w: w * k, d: d * k, h: h * k };
}

function PlanHint({ hint, w, d }: { hint: HintKind; w: number; d: number }) {
  if (hint === 'bin') return <rect className="shape-hint" x={4} y={4} width={Math.max(w - 8, 1)} height={Math.max(d - 8, 1)} strokeDasharray="3 2" fill="none" />;
  if (hint === 'table') {
    const leg = Math.min(4, w / 6, d / 6);
    return (
      <g className="shape-hint" fill="none">
        {[[0, 0], [w - leg, 0], [0, d - leg], [w - leg, d - leg]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={leg} height={leg} />)}
      </g>
    );
  }
  if (hint === 'sofa' || hint === 'chair') return <line className="shape-hint" x1={0} y1={Math.min(6, d / 4)} x2={w} y2={Math.min(6, d / 4)} />;
  if (hint === 'bed') return <rect className="shape-hint" x={3} y={3} width={Math.max(w - 6, 1)} height={Math.min(d / 5, 10)} fill="none" />;
  return null;
}

function FrontHint({ hint, w, h }: { hint: HintKind; w: number; h: number }) {
  if (hint === 'shelf') {
    return (
      <g className="shape-hint">
        {[1, 2, 3, 4].map((n) => <line key={n} x1={0} y1={(h * n) / 5} x2={w} y2={(h * n) / 5} />)}
      </g>
    );
  }
  if (hint === 'cabinet') {
    return (
      <g className="shape-hint">
        <line x1={w / 2} y1={0} x2={w / 2} y2={h} />
        <circle cx={w / 2 - 3} cy={h / 2} r={1.5} />
        <circle cx={w / 2 + 3} cy={h / 2} r={1.5} />
      </g>
    );
  }
  if (hint === 'bin') return <line className="shape-hint" x1={0} y1={Math.min(6, h / 4)} x2={w} y2={Math.min(6, h / 4)} />;
  return null;
}

export function ItemShapeView({ shape }: { shape: ItemShape }) {
  if (!shape.measured) {
    return (
      <div className="item-shape" data-testid={`shape-${shape.id}`} data-measured="false">
        <p className="item-shape-unknown" role="status">치수 미확인 — 크기를 알 수 없어 그리지 않습니다. 배치 계산에서도 맞는 것으로 쓰지 않습니다.</p>
      </div>
    );
  }
  const { w, d, h } = scaled(shape);
  const label = `가로 ${shape.widthMm} mm × 세로 ${shape.depthMm} mm × 높이 ${shape.heightMm} mm, ${HINT_TEXT[shape.hint]}`;
  // Isometric: x runs right-down, y runs left-down, z runs up.
  const cos = Math.cos(Math.PI / 6);
  const sin = 0.5;
  const px = (x: number, y: number) => (x - y) * cos;
  const py = (x: number, y: number, z: number) => (x + y) * sin - z;
  const pts = (list: [number, number, number][]) => list.map(([x, y, z]) => `${px(x, y).toFixed(1)},${py(x, y, z).toFixed(1)}`).join(' ');
  const minX = -d * cos;
  const maxX = w * cos;
  const minY = -h;
  const maxY = (w + d) * sin;
  return (
    <div className="item-shape" data-testid={`shape-${shape.id}`} data-measured="true" data-hint={shape.hint}>
      <svg role="img" aria-label={`평면 ${label}`} viewBox={`-2 -2 ${w + 4} ${d + 4}`} className="shape-svg" data-view="plan" data-testid={`shape-plan-${shape.id}`}>
        <rect className="shape-body" x={0} y={0} width={w} height={d} data-w={w.toFixed(1)} data-d={d.toFixed(1)} />
        <PlanHint hint={shape.hint} w={w} d={d} />
      </svg>
      <svg role="img" aria-label={`정면 ${label}`} viewBox={`-2 -2 ${w + 4} ${h + 4}`} className="shape-svg" data-view="front" data-testid={`shape-front-${shape.id}`}>
        <rect className="shape-body" x={0} y={0} width={w} height={h} />
        <FrontHint hint={shape.hint} w={w} h={h} />
      </svg>
      <svg role="img" aria-label={`입체 상자 ${label}`} viewBox={`${minX - 2} ${minY - 2} ${maxX - minX + 4} ${maxY - minY + 4}`} className="shape-svg" data-view="box" data-testid={`shape-box-${shape.id}`}>
        <polygon className="shape-body" points={pts([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]])} />
        <polygon className="shape-body" points={pts([[0, d, h], [w, d, h], [w, d, 0], [0, d, 0]])} />
        <polygon className="shape-body" points={pts([[w, 0, h], [w, d, h], [w, d, 0], [w, 0, 0]])} />
      </svg>
      <p className="shape-caption">{label}</p>
    </div>
  );
}
