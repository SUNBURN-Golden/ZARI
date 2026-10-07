import { test, expect, type Page } from '@playwright/test';

/**
 * SP-009 detail facts on the real browser Worker: known, unknown, and invalid
 * values normalize, save, reload, and stay available for recalculation.
 * Phone hardware and a dedicated GPU are not claimed here.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;
const HANDLING = ['left', 'right', 'top', 'pullExtraDepth', 'liftAboveRim'] as const;

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('context-state')).toHaveText(/installed|degraded/);
}

async function commitAndWaitSaved(page: Page) {
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function openDetail(page: Page) {
  const button = page.getByTestId('open-detail');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

async function showGroup(page: Page, groupId: string) {
  await openDetail(page);
  await page.getByTestId(`detail-group-${groupId}`).click();
}

test('a new project keeps support and handling unknown, and the sample does not', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await expect(page.getByTestId('detail-panel')).toHaveCount(0);
  await expect(page.getByTestId('open-detail')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('uncertainty-space.interior.width')).toHaveText('오차 미확인');
  await expect(page.getByTestId('uncertainty-space.interior.width')).toHaveAttribute(
    'data-uncertainty',
    'unknown',
  );

  await showGroup(page, 'staging');
  await expect(page.getByTestId('detail-normalized-space.staging.baseSupport')).toHaveAttribute(
    'data-state',
    'unknown',
  );
  await expect(page.getByTestId('detail-normalized-space.staging.baseSupport.loadLimit')).toHaveAttribute(
    'data-nominal',
    '',
  );
  await expect(page.getByText('손으로 들어 옮기는 동작은 검사 범위에 포함되지 않습니다.')).toBeVisible();

  for (const itemId of ['item-a', 'item-b']) {
    await showGroup(page, `item-${itemId}`);
    for (const axis of HANDLING) {
      const fact = page.getByTestId(`detail-normalized-items.${itemId}.requirement.handling.${axis}`);
      await expect(fact).toHaveAttribute('data-state', 'unknown');
      await expect(fact).toHaveAttribute('data-nominal', '');
    }
  }

  await commitAndWaitSaved(page);
  await expect(page.getByTestId('input-revision')).toHaveText('1');
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await showGroup(page, 'staging');
  await expect(page.getByTestId('detail-normalized-space.staging.baseSupport')).toHaveAttribute(
    'data-state',
    'unknown',
  );
  await showGroup(page, 'item-item-a');
  await expect(
    page.getByTestId('detail-normalized-items.item-a.requirement.handling.left'),
  ).toHaveAttribute('data-state', 'unknown');
  await expect(
    page.getByTestId('detail-normalized-items.item-a.requirement.handling.pullExtraDepth'),
  ).toHaveAttribute('data-nominal', '');

  await page.getByTestId('fill-sample').click();
  await commitAndWaitSaved(page);
  await showGroup(page, 'staging');
  await expect(page.getByTestId('detail-normalized-space.staging.baseSupport.loadLimit')).toHaveAttribute(
    'data-nominal',
    '50000',
  );
  await showGroup(page, 'item-item-a');
  await expect(page.getByTestId('detail-normalized-items.item-a.requirement.handling.left')).toHaveAttribute(
    'data-nominal',
    '5',
  );
  await expect(
    page.getByTestId('detail-normalized-items.item-a.requirement.handling.pullExtraDepth'),
  ).toHaveAttribute('data-state', 'known');
  await expect(
    page.getByTestId('detail-normalized-items.item-a.requirement.handling.pullExtraDepth'),
  ).toHaveAttribute('data-nominal', '0');
  await showGroup(page, 'item-item-b');
  await expect(page.getByTestId('detail-normalized-items.item-b.requirement.handling.left')).toHaveAttribute(
    'data-nominal',
    '2',
  );
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await showGroup(page, 'staging');
  await expect(page.getByTestId('detail-normalized-space.staging.baseSupport.loadLimit')).toHaveAttribute(
    'data-nominal',
    '50000',
  );
  expect(errors).toEqual([]);
});

test('known bounds, unknown, invalid, and zero survive normalize, save, reload, and plan', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  const width = page.getByRole('textbox', WIDTH);
  await width.fill('600');
  await showGroup(page, 'interior');
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-uncertainty-bounded').check();
  await page.getByTestId('detail-minus').fill('2');
  await page.getByTestId('detail-plus').fill('3');
  await commitAndWaitSaved(page);
  const known = page.getByTestId('detail-normalized-space.interior.width');
  await expect(known).toHaveAttribute('data-nominal', '600');
  await expect(known).toHaveAttribute('data-minus', '2');
  await expect(known).toHaveAttribute('data-plus', '3');
  await expect(known).toHaveAttribute('data-verification', 'unverified');
  await expect(page.getByTestId('uncertainty-space.interior.width')).toHaveText('오차 −2 / +3 mm');
  const digest = await page.getByTestId('input-digest').textContent();
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');

  await showGroup(page, 'interior');
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-plus').fill('');
  await commitAndWaitSaved(page);
  await expect(page.getByTestId('normalize-held')).toBeVisible();
  await expect(page.getByTestId('input-revision')).toHaveText('1');
  await expect(page.getByTestId('input-digest')).toHaveText(digest ?? '');
  await expect(page.getByTestId('uncertainty-space.interior.width')).toHaveText('오차 −2 / +비어 있음 mm');
  await expect(known).toHaveAttribute('data-nominal', '600');
  await expect(known).toHaveAttribute('data-plus', '3');
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(width).toHaveValue('600');
  await showGroup(page, 'interior');
  await page.getByTestId('detail-pick-space.interior.width').click();
  await expect(page.getByTestId('detail-plus')).toHaveValue('');
  await expect(page.getByTestId('detail-minus')).toHaveValue('2');
  await expect(page.getByTestId('detail-normalized-space.interior.width')).toHaveAttribute('data-nominal', '600');

  await page.getByTestId('detail-uncertainty-unknown').check();
  await page.getByTestId('detail-nominal').fill('0');
  await commitAndWaitSaved(page);
  await expect(page.getByTestId('normalize-held')).toBeVisible();
  await expect(page.getByTestId('detail-nominal')).toHaveValue('0');
  expect(errors).toEqual([]);
});

test('group unit conversion keeps invalid and IME text, and exact bounds move together', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  const width = page.getByRole('textbox', WIDTH);
  await width.fill('600');
  await showGroup(page, 'interior');
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-uncertainty-bounded').check();
  await page.getByTestId('detail-minus').fill('10');
  await page.getByTestId('detail-plus').fill('20');
  const before = await page.getByTestId('measure-workspace').getAttribute('data-normalize-requests');
  await page.getByTestId('detail-unit').selectOption('cm');
  await expect(page.getByTestId('detail-nominal')).toHaveValue('60');
  await expect(page.getByTestId('detail-minus')).toHaveValue('1');
  await expect(page.getByTestId('detail-plus')).toHaveValue('2');
  await expect(page.getByTestId('detail-unit')).toHaveValue('cm');
  expect(await page.getByTestId('measure-workspace').getAttribute('data-normalize-requests')).not.toBe(before);

  await page.getByTestId('detail-nominal').fill('60ㄱ');
  const imeBefore = await page.getByTestId('measure-workspace').getAttribute('data-normalize-requests');
  await page.getByTestId('detail-unit').selectOption('mm');
  await expect
    .poll(async () => page.getByTestId('measure-workspace').getAttribute('data-normalize-requests'))
    .not.toBe(imeBefore);
  await expect(page.getByTestId('detail-nominal')).toHaveValue('60ㄱ');
  await expect(page.getByTestId('detail-unit')).toHaveValue('cm');
  await expect(page.getByTestId('detail-minus')).toHaveValue('1');
  await expect(page.getByTestId('detail-unit-hold')).toBeVisible();
  expect(errors).toEqual([]);
});

test('offsets, staging, support load, and handling stay explicit', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await showGroup(page, 'opening');
  const left = page.getByTestId('detail-normalized-space.opening.left');
  await expect(left).toHaveAttribute('data-state', 'unknown');
  await expect(left).toHaveAttribute('data-nominal', '');
  await page.getByTestId('detail-pick-space.opening.left').click();
  await page.getByTestId('detail-nominal').fill('0');
  await page.getByTestId('detail-uncertainty-bounded').check();
  await page.getByTestId('detail-minus').fill('0');
  await page.getByTestId('detail-plus').fill('0');
  await page.getByTestId('detail-pick-space.opening.bottom').click();
  await page.getByTestId('detail-nominal').fill('-2');
  await page.getByTestId('detail-uncertainty-bounded').check();
  await page.getByTestId('detail-minus').fill('3');
  await page.getByTestId('detail-plus').fill('4');

  await showGroup(page, 'staging');
  await page.getByTestId('detail-pick-space.staging.freeVolume.minY').click();
  await page.getByTestId('detail-nominal').fill('-20');
  await page.getByTestId('detail-pick-space.staging.baseSupport').click();
  await page.getByTestId('detail-support-known').check();
  await page.getByTestId('detail-pick-space.staging.baseSupport.loadLimit').click();
  await expect(page.getByText('지지면이 미확인이면 하중을 입력하지 않습니다.')).toHaveCount(0);
  await page.getByTestId('detail-nominal').fill('0');

  await showGroup(page, 'support');
  await page.getByTestId('detail-pick-space.support.footprint.width').click();
  await page.getByTestId('detail-nominal').fill('500');
  await expect(page.getByTestId('detail-normalized-space.support.loadLimit')).toHaveAttribute(
    'data-state',
    'unknown',
  );

  await showGroup(page, 'item-item-a');
  await page.getByTestId('detail-pick-items.item-a.requirement.handling.liftAboveRim').click();
  await expect(page.getByRole('checkbox', { name: '완료' })).toHaveCount(0);
  await page.getByTestId('detail-nominal').fill('0');

  await commitAndWaitSaved(page);
  await showGroup(page, 'opening');
  await expect(page.getByTestId('detail-normalized-space.opening.left')).toHaveAttribute('data-nominal', '0');
  await expect(page.getByTestId('detail-normalized-space.opening.left')).toHaveAttribute('data-minus', '0');
  await expect(page.getByTestId('detail-normalized-space.opening.left')).toHaveAttribute('data-plus', '0');
  await expect(page.getByTestId('detail-normalized-space.opening.bottom')).toHaveAttribute('data-nominal', '-2');
  await expect(page.getByTestId('detail-normalized-space.opening.bottom')).toHaveAttribute('data-minus', '3');
  await expect(page.getByTestId('detail-normalized-space.opening.bottom')).toHaveAttribute('data-plus', '4');
  await showGroup(page, 'staging');
  await expect(page.getByTestId('detail-normalized-space.staging.freeVolume.minY')).toHaveAttribute(
    'data-nominal',
    '-20',
  );
  await expect(page.getByTestId('detail-normalized-space.staging.baseSupport.loadLimit')).toHaveAttribute(
    'data-nominal',
    '0',
  );
  await expect(page.getByTestId('detail-normalized-space.staging.baseSupport.loadLimit')).toHaveAttribute(
    'data-state',
    'known',
  );
  await showGroup(page, 'support');
  await expect(page.getByTestId('detail-normalized-space.support.footprint.width')).toHaveAttribute(
    'data-nominal',
    '500',
  );
  await expect(page.getByTestId('detail-normalized-space.support.loadLimit')).toHaveAttribute(
    'data-state',
    'unknown',
  );
  await showGroup(page, 'item-item-a');
  await expect(
    page.getByTestId('detail-normalized-items.item-a.requirement.handling.liftAboveRim'),
  ).toHaveAttribute('data-nominal', '0');
  await expect(
    page.getByTestId('detail-normalized-items.item-a.requirement.handling.liftAboveRim'),
  ).toHaveAttribute('data-state', 'known');
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await showGroup(page, 'opening');
  await expect(page.getByTestId('detail-normalized-space.opening.bottom')).toHaveAttribute('data-nominal', '-2');
  expect(errors).toEqual([]);
});

test('a conflict note stays a note through save, reload, and export', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await showGroup(page, 'interior');
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-nominal').fill('600');
  await page.getByTestId('detail-origin').selectOption('userMeasured');
  await page.getByTestId('detail-note').fill('다른 줄자와 충돌한다. 평균 590 mm.');
  await page.getByTestId('detail-locator').fill('local:tape');
  await page.getByTestId('detail-observed').fill('2026-10-07T00:00:00Z');
  await commitAndWaitSaved(page);
  const fact = page.getByTestId('detail-normalized-space.interior.width');
  await expect(fact).toHaveAttribute('data-nominal', '600');
  await expect(fact).toHaveAttribute('data-verification', 'unverified');
  await expect(fact).toHaveAttribute('data-origin', 'userMeasured');
  await expect(fact).toHaveAttribute('data-minus', '');
  await expect(page.getByText('conflicting_sources')).toHaveCount(0);
  const digest = await page.getByTestId('input-digest').textContent();
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('input-digest')).toHaveText(digest ?? '');
  await showGroup(page, 'interior');
  await page.getByTestId('detail-pick-space.interior.width').click();
  await expect(page.getByTestId('detail-note')).toHaveValue('다른 줄자와 충돌한다. 평균 590 mm.');
  await expect(page.getByTestId('detail-observed')).toHaveValue('2026-10-07T00:00:00Z');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-project').click(),
  ]);
  const file = await download.path();
  await page.getByRole('link', { name: '프로젝트 목록' }).click();
  await page.getByTestId('import-file').setInputFiles(file!);
  await expect(page.getByTestId('import-review')).toBeVisible();
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await showGroup(page, 'interior');
  await page.getByTestId('detail-pick-space.interior.width').click();
  await expect(page.getByTestId('detail-note')).toHaveValue('다른 줄자와 충돌한다. 평균 590 mm.');
  await expect(page.getByTestId('detail-normalized-space.interior.width')).toHaveAttribute(
    'data-verification',
    'unverified',
  );
  await expect(page.getByTestId('input-digest')).not.toHaveText('없음');
  expect(errors).toEqual([]);
});

test('focus and navigation do not write, and the original field order still tabs', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  const revision = await page.getByTestId('project-revision').textContent();
  const calls = await page.getByTestId('measure-workspace').getAttribute('data-normalize-requests');
  const width = page.getByRole('textbox', WIDTH);
  await width.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('공간 안쪽 폭 단위')).toBeFocused();
  await page.getByTestId('open-detail').click();
  await page.getByTestId('detail-group-opening').click();
  await page.getByTestId('detail-pick-space.opening.left').click();
  await page.getByTestId('detail-nominal').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('project-revision')).toHaveText(revision ?? '');
  await expect(page.getByTestId('measure-workspace')).toHaveAttribute('data-normalize-requests', calls ?? '');
  await expect(page.getByTestId('stale-notice')).toHaveCount(0);

  await page.getByTestId('fill-sample').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('commit-input')).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('detail-sheet')).toBeVisible();
  await page.getByTestId('detail-close').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('open-detail')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await expect(page.getByTestId('open-detail')).toBeVisible();
  await expect(page.getByTestId('commit-input')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('uncertainty-space.interior.width')).toHaveText('오차 미확인');
  await expect(page.getByTestId('open-detail')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a second tab keeps the earlier committed detail', async ({ page, context }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await page.getByRole('textbox', WIDTH).fill('600');
  await commitAndWaitSaved(page);
  const digest = await page.getByTestId('input-digest').textContent();
  const pageB = await context.newPage();
  await pageB.goto(page.url());
  await expect(pageB.getByTestId('worker-state')).toHaveText('ready');
  await page.getByRole('textbox', WIDTH).fill('610');
  await commitAndWaitSaved(page);
  await expect(pageB.getByTestId('conflict-notice')).toBeVisible();
  await pageB.getByRole('textbox', WIDTH).fill('700');
  await pageB.getByTestId('commit-input').click();
  await expect(pageB.getByTestId('save-state')).toHaveAttribute('data-save-state', 'conflict');
  await pageB.getByTestId('conflict-reload').click();
  await expect(pageB.getByRole('textbox', WIDTH)).toHaveValue('610');
  await expect(page.getByTestId('input-digest')).not.toHaveText(digest ?? '');
  await expect(page.getByTestId('input-revision')).toHaveText('2');
  expect(errors).toEqual([]);
});

test('a quota failure keeps the typed detail and retries without dropping it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __failPuts: boolean };
    holder.__failPuts = false;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(...args: unknown[]) {
      if (holder.__failPuts) throw new DOMException('injected failure', 'QuotaExceededError');
      return original.apply(this, args as [unknown]);
    };
  });
  await createProject(page);
  await showGroup(page, 'interior');
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-nominal').fill('600');
  await commitAndWaitSaved(page);
  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = true;
  });
  await page.getByTestId('detail-nominal').fill('620');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'error');
  await expect(page.getByTestId('detail-nominal')).toHaveValue('620');
  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = false;
  });
  await commitAndWaitSaved(page);
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('620');
  expect(errors).toEqual([]);
});

test('catalogue facts stay on the catalogue screen', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await showGroup(page, 'catalog');
  await expect(page.getByTestId('detail-catalog-readonly')).toBeVisible();
  await expect(page.getByTestId('detail-editor')).toHaveCount(0);
  await page.getByTestId('detail-catalog-editor').click();
  await expect(page).toHaveURL(/#\/catalog/);
  await expect(page.getByTestId('detail-nominal')).toHaveCount(0);
  expect(errors).toEqual([]);
});
