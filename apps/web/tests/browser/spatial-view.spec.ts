import { mkdir, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type {
  DomainFixture,
  SnapshotContent,
  SpatialProjection,
} from '../../src/contracts/generated/dto';
import {
  containedOffsetUnknown,
  diagramRects,
  spaceFrame,
  type RectVm,
} from '../../src/features/plan/projection';

/**
 * Pictures the hand-checked yaw90 and unknown-offset fixtures through the
 * same rectangle mapping the plan screen paints. Axis inversion is only the
 * SVG `scale(1,-1)` below, matching PlanScreen.
 */
const TOP_PAD = 20;
const FRONT_PAD = 16;

function svg(projection: SpatialProjection, content: SnapshotContent, view: 'top' | 'front'): string {
  const frame = spaceFrame(projection, view);
  const rects = frame ? diagramRects(projection, content, view) : [];
  if (!frame) return `<p class="notice">공간 치수를 알 수 없어 그림을 그릴 수 없습니다.</p>`;
  const pad = view === 'top' ? TOP_PAD : FRONT_PAD;
  const shapes = rects
    .map(
      (r: RectVm) =>
        `<rect class="diagram-${r.kind}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"><title>${r.label}</title></rect>`,
    )
    .join('');
  const labels = rects
    .filter((r) => r.width > 90)
    .map(
      (r) =>
        `<text class="diagram-label" x="${r.x + 4}" y="${-r.y - (r.kind === 'container' ? 14 : 22)}">${r.label}</text>`,
    )
    .join('');
  const caption =
    view === 'top' ? `<text class="diagram-label" x="0" y="12" font-size="14">문/앞면</text>` : '';
  return `<svg class="plan-diagram" viewBox="${-pad} ${-(frame.height + pad)} ${frame.width + pad * 2} ${frame.height + pad * 2}" role="img">
    <g transform="scale(1 -1)"><rect class="diagram-space" x="0" y="0" width="${frame.width}" height="${frame.height}"></rect>${shapes}</g>
    ${labels}${caption}
  </svg>`;
}

test('yaw90 and unknown-offset projections picture the authoritative rectangles', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mkdir('docs/evidence', { recursive: true });
  const cases = [
    {
      file: 'fixtures/spatial/spatial-yaw-offset.json',
      shot: 'docs/evidence/ZARI-SPATIAL-001-yaw-offset.png',
    },
    {
      file: 'fixtures/spatial/spatial-unknown-offset.json',
      shot: 'docs/evidence/ZARI-SPATIAL-001-unknown-offset.png',
    },
  ] as const;
  for (const item of cases) {
    await page.goto('/tests/harness.html');
    const fixture = JSON.parse(await readFile(item.file, 'utf8')) as DomainFixture;
    const event = await page.evaluate(async (payload) => {
      const result = await window.runDomainFixture(payload);
      return result;
    }, fixture);
    expect(event).toMatchObject({ kind: 'spatialViewProjected' });
    const projection = (event as { kind: 'spatialViewProjected'; projection: SpatialProjection })
      .projection;
    const source = fixture.input as { kind?: string; snapshot?: { content: SnapshotContent } };
    if (source.kind !== 'plan' || !source.snapshot) {
      throw new Error('spatial picture fixture is not a plan source');
    }
    const content = source.snapshot.content;
    const contained = projection.elements.find((element) => element.role === 'containedItem');
    expect(contained).toBeTruthy();
    if (item.file.endsWith('spatial-yaw-offset.json')) {
      expect(contained?.worldBox).toMatchObject({
        kind: 'available',
        value: { min: [380, 240, 5], max: [440, 290, 75] },
      });
      expect(contained?.topRect).toMatchObject({
        kind: 'available',
        value: { min: [380, 240], max: [440, 290] },
      });
      expect(diagramRects(projection, content, 'top').some((rect) => rect.kind === 'contained')).toBe(
        true,
      );
    } else {
      expect(contained?.worldBox).toMatchObject({
        kind: 'unavailable',
        reasonCode: 'offset_unknown',
      });
      expect(contained?.topRect).toMatchObject({
        kind: 'unavailable',
        reasonCode: 'offset_unknown',
      });
      expect(contained?.cavityLocalBox).toMatchObject({
        kind: 'available',
        value: { min: [30, 40, 0], max: [80, 100, 70] },
      });
      expect(containedOffsetUnknown(projection)).toBe(true);
      expect(diagramRects(projection, content, 'top').some((rect) => rect.kind === 'contained')).toBe(
        false,
      );
    }
    const note = containedOffsetUnknown(projection)
      ? '<p class="notice" data-testid="offset-unknown-note">외형 안의 실제 위치 미확인 · 별도 좌표계</p>'
      : '';
    await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
      <style>
        body { margin: 1rem; background: #f7f6f3; font-family: sans-serif; }
        .plan-diagrams { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .plan-diagram { width: 100%; background: var(--wash, #f5f5f3); border: 1px solid var(--line, #ddd); }
        .diagram-container { fill: rgba(58, 92, 204, 0.08); stroke: var(--accent, #3a5ccc); stroke-width: 1.5; }
        .diagram-contained { fill: rgba(31, 92, 40, 0.22); stroke: #1f5c28; stroke-width: 1; stroke-dasharray: 3 2; }
        .diagram-space { fill: none; stroke: var(--ink, #222); stroke-width: 2; }
        .diagram-label { font-size: 14px; fill: var(--ink, #222); }
        .notice { margin: 0.75rem 0 0; }
      </style></head><body>
      <div id="frame">
        <div class="plan-diagrams">${svg(projection, content, 'top')}${svg(projection, content, 'front')}</div>
        ${note}
      </div>
      </body></html>`);
    if (note) await expect(page.getByTestId('offset-unknown-note')).toBeVisible();
    await page.locator('#frame').screenshot({ path: item.shot });
  }
});
