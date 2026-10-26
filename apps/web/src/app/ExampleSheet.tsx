import example from '../features/project/default-form.json';
import { EXAMPLE_NAME, FIELD_LABELS } from '../features/onboarding/guide';

// This is a read-only rendering of the bundled synthetic example, not a fit
// verdict or a user-input parser. Rust retains all domain/normalization work.
const { interior, opening } = example.space;
const [exampleTitle, exampleDisclosure] = EXAMPLE_NAME.split(' · ');
const facts = [
  ['space.interior.width', interior.width],
  ['space.interior.depth', interior.depth],
  ['space.interior.height', interior.height],
  ['space.opening.width', opening.width],
  ['space.opening.height', opening.height],
] as const;
const drawable = facts.every(([, value]) => value.unit === 'mm' && /^\d+$/.test(value.text) && Number.isFinite(Number(value.text)) && Number(value.text) > 0);
const width = Number(interior.width.text);
const depth = Number(interior.depth.text);
const height = Number(interior.height.text);

function Plan({ compact = false }: { compact?: boolean }) {
  const scale = compact ? 0.44 : 0.6;
  const x = compact ? 40 : 70;
  const y = compact ? 64 : 130;
  const wall = compact ? 8 : 10;
  const w = width * scale;
  const d = depth * scale;
  const dimY = compact ? 24 : 76;
  const dimX = x + w + (compact ? 40 : 54);
  return (
    <>
      <path className="sheet-wall" d={`M${x-wall} ${y+d} V${y-wall} H${x+w+wall} V${y+d} H${x+w} V${y} H${x} V${y+d} Z`} />
      <path className="sheet-ink" d={`M${x-wall} ${y+d} V${y-wall} H${x+w+wall} V${y+d} M${x} ${y+d} V${y} H${x+w} V${y+d}`} />
      <rect data-example-plane={compact ? 'compact-plan' : 'plan'} x={x} y={y} width={w} height={d} fill="none" stroke="none" />
      <path className="sheet-opening" d={`M${x} ${y+d} H${x+w}`} />
      <path className="sheet-extension" d={`M${x} ${y-wall-8} V${dimY-10} M${x+w} ${y-wall-8} V${dimY-10}`} />
      <path className="sheet-dimension" d={`M${x} ${dimY} H${x+w} M${x-6} ${dimY+6} L${x+6} ${dimY-6} M${x+w-6} ${dimY+6} L${x+w+6} ${dimY-6}`} />
      <text className="sheet-number" x={x+w/2} y={dimY-10} textAnchor="middle">{interior.width.text}</text>
      <path className="sheet-extension" d={`M${x+w+18} ${y} H${dimX+10} M${x+w+18} ${y+d} H${dimX+10}`} />
      <path className="sheet-dimension" d={`M${dimX} ${y} V${y+d} M${dimX-6} ${y+6} L${dimX+6} ${y-6} M${dimX-6} ${y+d+6} L${dimX+6} ${y+d-6}`} />
      <text className="sheet-number" x={dimX+12} y={y+d/2+6}>{interior.depth.text}</text>
    </>
  );
}

export function ExampleSheet() {
  const frontWidth = width * 0.45;
  const frontHeight = height * 0.45;
  return (
    <figure className="example-sheet" aria-labelledby="example-sheet-name" data-testid="example-sheet">
      <div className="example-sheet-inner">
        {drawable && <>
          <svg className="sheet-desktop" viewBox="0 0 860 462" role="img" aria-labelledby="example-sheet-name" aria-describedby="example-sheet-facts">
            <Plan />
            <rect className="sheet-wall sheet-ink" x={552} y={122} width={frontWidth+20} height={frontHeight+20} />
            <rect className="sheet-front sheet-ink-thin" data-example-plane="front" x={562} y={132} width={frontWidth} height={frontHeight} />
            <rect className="sheet-opening" x={562+Number(opening.left.text)*0.45} y={132+(height-Number(opening.bottom.text)-Number(opening.height.text))*0.45} width={Number(opening.width.text)*0.45} height={Number(opening.height.text)*0.45} />
            <path className="sheet-extension" d={`M562 114 V76 M${562+frontWidth} 114 V76`} />
            <path className="sheet-dimension" d={`M562 86 H${562+frontWidth} M556 92 L568 80 M${556+frontWidth} 92 L${568+frontWidth} 80`} />
            <text className="sheet-number" x={562+frontWidth/2} y={76} textAnchor="middle">{interior.width.text}</text>
            <text className="sheet-label" x={552} y={300}>{FIELD_LABELS['space.interior.height']} <tspan className="sheet-number">{interior.height.text}</tspan></text>
          </svg>
          <svg className="sheet-compact" viewBox="0 -6 400 282" role="img" aria-labelledby="example-sheet-name" aria-describedby="example-sheet-facts">
            <Plan compact />
          </svg>
        </>}
        <div className="sheet-title-block">
          <div id="example-sheet-name" className="sheet-example-name">
            <strong>{exampleTitle}</strong>
            <p>{exampleDisclosure}</p>
          </div>
          <dl id="example-sheet-facts">
            {facts.map(([field, value]) => <div key={field}>
              <dt>{FIELD_LABELS[field]}</dt>
              <dd><span className="zari-numeral">{value.text} {value.unit}</span></dd>
            </div>)}
          </dl>
          <p className="local-note">이 기기에만 저장</p>
        </div>
        <p className="sheet-context">공간 워크벤치 프로젝트</p>
      </div>
    </figure>
  );
}
