import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * ZARI-SPATIAL-002 workspace evidence. Real Chromium, IndexedDB, and WASM.
 * Draft interaction checks only — not an approved visual baseline.
 */

const FIELDS: Array<{ label: string; caption: string }> = [
  { label: '공간 안쪽 폭', caption: '왼쪽 안쪽 면부터 오른쪽 안쪽 면까지' },
  { label: '공간 안쪽 깊이', caption: '입구 쪽 안쪽 면부터 뒤쪽 안쪽 면까지' },
  { label: '공간 안쪽 높이', caption: '사용할 바닥면부터 위쪽 경계까지' },
  { label: '개구부 폭', caption: '내부 치수와 입구 치수는 다를 수 있습니다' },
  { label: '개구부 높이', caption: '내부 치수와 입구 치수는 다를 수 있습니다' },
  { label: '물건 A 폭', caption: '물건의 폭. 수량이나 배치와는 별개의 측정입니다' },
  { label: '물건 A 깊이', caption: '물건의 깊이. 수량이나 배치와는 별개의 측정입니다' },
  { label: '물건 A 높이', caption: '물건의 높이. 수량이나 배치와는 별개의 측정입니다' },
  { label: '물건 B 폭', caption: '물건의 폭. 수량이나 배치와는 별개의 측정입니다' },
  { label: '물건 B 깊이', caption: '물건의 깊이. 수량이나 배치와는 별개의 측정입니다' },
  { label: '물건 B 높이', caption: '물건의 높이. 수량이나 배치와는 별개의 측정입니다' },
];

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.body.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
}

async function commitSaved(page: Page) {
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
}

function field(page: Page, label: string): Locator {
  return page.getByRole('textbox', { name: label, exact: true });
}

async function spatialCount(page: Page, testId: string) {
  return page.getByTestId(testId).getAttribute('data-spatial-requests');
}

async function projectRevision(page: Page, testId: string) {
  return page.getByTestId(testId).getAttribute('data-project-revision');
}

test('measurement fields, unknown and invalid input, unit, reload, and a stable projection count', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await page.getByTestId('fill-sample').click();
  await commitSaved(page);
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveText('600 mm');

  const width = field(page, '공간 안쪽 폭');
  await width.focus();
  await expect(page.locator('.measure-field[data-focused="true"]')).toHaveCount(1);
  await expect(page.getByTestId('focus-context')).toContainText('왼쪽 안쪽 면부터 오른쪽 안쪽 면까지');
  await width.press('Tab');
  await expect(page.getByRole('combobox', { name: '공간 안쪽 폭 단위' })).toBeFocused();
  await expect(page.locator('.measure-field[data-focused="true"]')).toHaveCount(1);

  const diagram = page.getByTestId('measurement-diagram');
  await expect(diagram).toHaveAttribute('data-scale', 'mm', { timeout: 30_000 });
  const segment = page.getByTestId('measurement-segment');
  await expect(segment).toHaveCount(1);
  await expect(segment).toHaveAttribute('data-x1', '0');
  await expect(segment).toHaveAttribute('data-x2', '600');
  const ctm = await segment.evaluate((node) => {
    const line = node as SVGLineElement;
    const svg = line.ownerSVGElement;
    const lineCtm = line.getScreenCTM();
    const svgCtm = svg?.getScreenCTM();
    if (!svg || !lineCtm || !svgCtm) return null;
    const x1 = Number(line.getAttribute('x1'));
    const y1 = Number(line.getAttribute('y1'));
    const local = svg.createSVGPoint();
    local.x = x1;
    local.y = y1;
    const fromLine = local.matrixTransform(lineCtm);
    const flipped = svg.createSVGPoint();
    flipped.x = x1;
    flipped.y = -y1;
    const fromSvg = flipped.matrixTransform(svgCtm);
    return {
      dx: Math.abs(fromLine.x - fromSvg.x),
      dy: Math.abs(fromLine.y - fromSvg.y),
    };
  });
  expect(ctm).not.toBeNull();
  expect(ctm!.dx).toBeLessThan(0.5);
  expect(ctm!.dy).toBeLessThan(0.5);

  const requests = await spatialCount(page, 'measure-workspace');
  const revision = await projectRevision(page, 'measure-workspace');
  for (const entry of FIELDS) {
    await field(page, entry.label).focus();
    await expect(page.getByTestId('measurement-caption')).toHaveText(entry.caption);
    await expect(page.getByTestId('focus-context')).toContainText(entry.caption);
    await expect(diagram).toBeVisible();
  }
  expect(await spatialCount(page, 'measure-workspace')).toBe(requests);
  expect(await projectRevision(page, 'measure-workspace')).toBe(revision);

  await field(page, '개구부 높이').fill('');
  await commitSaved(page);
  await field(page, '개구부 높이').focus();
  await expect(page.getByTestId('normalized-space.opening.height')).toHaveText('미측정');
  await expect(diagram).toHaveAttribute('data-scale', 'none');
  await expect(page.getByTestId('measurement-segment')).toHaveCount(0);
  await expect(page.getByTestId('measurement-caption')).toHaveText('내부 치수와 입구 치수는 다를 수 있습니다');

  await page.getByTestId('fill-sample').click();
  await commitSaved(page);
  await width.focus();
  await expect(diagram).toHaveAttribute('data-scale', 'mm');
  const beforeInvalid = await spatialCount(page, 'measure-workspace');
  const revisionBeforeInvalid = await projectRevision(page, 'measure-workspace');
  await width.fill('abc');
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveText('600 mm');
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveAttribute('data-historical', 'true');
  await expect(diagram).toHaveAttribute('data-scale', 'none');
  await expect(diagram).toContainText('축척 없음');
  await expect(page.getByTestId('measurement-segment')).toHaveCount(0);
  await expect(page.getByTestId('measurement-reason')).toContainText('입력 변경 · 이전 측정');
  expect(await spatialCount(page, 'measure-workspace')).toBe(beforeInvalid);
  expect(await projectRevision(page, 'measure-workspace')).toBe(revisionBeforeInvalid);
  await commitSaved(page);
  await expect(page.getByText('숫자 형식을 확인해 주세요.')).toBeVisible();
  await expect(diagram).toHaveAttribute('data-scale', 'none');
  await expect(page.getByTestId('measurement-segment')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(width).toHaveValue('abc');
  await width.focus();
  await expect(diagram).toHaveAttribute('data-scale', 'none');
  await expect(page.getByTestId('measurement-segment')).toHaveCount(0);

  await width.fill('600');
  await commitSaved(page);
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveText('600 mm');
  await page.getByRole('combobox', { name: '공간 안쪽 폭 단위' }).selectOption('cm');
  await expect(width).toHaveValue('60');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await width.focus();
  const afterUnit = await spatialCount(page, 'measure-workspace');
  await field(page, '공간 안쪽 깊이').focus();
  await field(page, '공간 안쪽 폭').focus();
  expect(await spatialCount(page, 'measure-workspace')).toBe(afterUnit);
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(width).toHaveValue('60');
  await expect(page.getByRole('combobox', { name: '공간 안쪽 폭 단위' })).toHaveValue('cm');

  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId('commit-input')).toBeVisible();
    await noHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('plan selection, checks, BOM focus, and view changes do not request another projection', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await page.getByTestId('fill-sample').click();
  await commitSaved(page);
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60_000,
  });

  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  let purchase = 0;
  for (let i = 0; i < count; i += 1) {
    if ((await cards.nth(i).innerText()).includes('구매 포함')) purchase = i;
  }
  await cards.nth(purchase).click();
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  await expect(page.getByTestId('plan-diagram-front')).toBeVisible();
  await expect(page.getByTestId('workspace-scope')).toHaveText('현재 계획');
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-historical', 'false');
  await expect(page.locator('.diagram-overlay')).toHaveCount(0);

  const fitBox = async (testId: string, pad: number) => {
    const read = await page.getByTestId(testId).evaluate((svg, viewPad) => {
      const space = svg.querySelector('.diagram-space');
      const width = Number(space?.getAttribute('width'));
      const height = Number(space?.getAttribute('height'));
      return {
        viewBox: svg.getAttribute('viewBox'),
        expected: `${-viewPad} ${-(height + viewPad)} ${width + viewPad * 2} ${height + viewPad * 2}`,
      };
    }, pad);
    expect(read.viewBox).toBe(read.expected);
  };
  await page.getByTestId('zoom-fit').click();
  await fitBox('plan-diagram-top', 20);
  await page.getByTestId('view-front').click();
  await page.getByTestId('zoom-fit').click();
  await fitBox('plan-diagram-front', 16);
  await page.getByTestId('plan-diagram-front').focus();
  await page.keyboard.press('+');
  await expect(page.getByTestId('plan-diagram-front')).not.toHaveAttribute('data-zoom', '1');
  await page.keyboard.press('0');
  await expect(page.getByTestId('plan-diagram-front')).toHaveAttribute('data-zoom', '1');

  const offsetNote = page.getByTestId('offset-unknown-note');
  const hadOffsetNote = (await offsetNote.count()) > 0;
  const requests = await spatialCount(page, 'plan-workspace');
  const revision = await projectRevision(page, 'plan-workspace');
  await page.getByTestId('view-top').click();
  await page.getByTestId('zoom-in').click();
  await page.getByTestId('zoom-out').click();
  await page.getByTestId('layer-dimensions').click();
  await page.getByTestId('layer-contents').click();
  await page.getByTestId('layer-checks').click();
  if (hadOffsetNote) await expect(offsetNote).toBeVisible();
  expect(await spatialCount(page, 'plan-workspace')).toBe(requests);
  expect(await projectRevision(page, 'plan-workspace')).toBe(revision);

  const picks = page.locator('.placement-pick');
  let contents = page.locator('[data-testid^="content-"]');
  for (let i = 0; i < (await picks.count()); i += 1) {
    await picks.nth(i).click();
    contents = page.locator('[data-testid^="content-"]');
    if ((await contents.count()) > 0) break;
  }
  expect(await contents.count()).toBeGreaterThan(0);
  await expect(page.getByTestId('selection-outline').first()).toBeVisible();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-name')).toBeVisible();
  await expect(page.getByTestId('inspector-dimensions')).toBeVisible();
  await contents.first().click();
  await expect(page.getByTestId('inspector-child')).toBeVisible();
  await expect(page.getByTestId('move-disabled')).toBeVisible();
  await expect(page.getByTestId('inspector')).toHaveCount(0);
  await page.getByTestId('select-parent').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByTestId('move-disabled')).toHaveCount(0);

  const check = page.locator('[data-testid^="check-focus-"]').first();
  await check.click();
  await expect(check.locator('xpath=ancestor::li[1]')).toHaveAttribute('data-focused', 'true');
  const bom = page.locator('[data-testid^="bom-focus-"]').first();
  await bom.click();
  await expect(page.locator('tr[data-focus="true"]')).toHaveCount(1);
  const multi = page.locator('tr', { hasText: /배치 [2-9]곳/ });
  if ((await multi.count()) > 0) {
    await multi.first().getByRole('button', { name: '도면에서 보기' }).click();
    const places = Number((await multi.first().innerText()).match(/배치 (\d+)곳/)?.[1]);
    expect(await page.getByTestId('focus-outline').count()).toBeGreaterThanOrEqual(places);
  }
  expect(await spatialCount(page, 'plan-workspace')).toBe(requests);
  expect(await projectRevision(page, 'plan-workspace')).toBe(revision);

  const pick = page.locator('[data-testid^="diagram-pick-"]').first();
  await pick.focus();
  await pick.press('Enter');
  await expect(page.getByTestId('selection-outline').first()).toBeVisible();
  expect(await page.locator('.placement-pick').count()).toBeGreaterThan(0);
  await page.locator('.placement-pick').first().click();
  await expect(page.getByTestId('inspector')).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 1000, band: 'wide' },
    { width: 768, height: 1024, band: 'medium' },
    { width: 390, height: 844, band: 'compact' },
    { width: 320, height: 700, band: 'compact' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-band', viewport.band);
    await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
    if (viewport.band === 'compact') {
      await expect(page.getByTestId('inspector')).toBeVisible();
    }
    await noHorizontalOverflow(page);
  }

  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('checks-list')).toContainText(/확인됨|실패|미확인|해당 없음/);
  await expect(page.getByTestId('workspace-legend')).toContainText('선택됨');
  await expect(page.getByTestId('workspace-legend')).toContainText('목록 강조');
  expect(errors).toEqual([]);
});

test('a changed input keeps the previous plan visually historical', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await page.getByTestId('fill-sample').click();
  await commitSaved(page);
  await page.getByTestId('goto-plan').click();
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('workspace-scope')).toHaveText('현재 계획');
  await page.locator('[data-testid^="plan-card-"]').first().click();
  await page.getByText('← 치수로 돌아가기').click();
  await field(page, '공간 안쪽 폭').fill('610');
  await commitSaved(page);
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.locator('[data-testid^="plan-card-"]').first().click();
  await expect(page.getByTestId('stale-plan-notice')).toBeVisible();
  await expect(page.getByTestId('workspace-scope')).toHaveText('이전 계획 · 입력 변경');
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-historical', 'true');
  await expect(page.getByTestId('bom-table').or(page.getByTestId('no-purchase'))).toBeVisible();
  const requests = await spatialCount(page, 'plan-workspace');
  const revision = await projectRevision(page, 'plan-workspace');
  await page.getByTestId('view-front').click();
  await page.getByTestId('layer-checks').click();
  expect(await spatialCount(page, 'plan-workspace')).toBe(requests);
  expect(await projectRevision(page, 'plan-workspace')).toBe(revision);
  expect(errors).toEqual([]);
});
