import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function watchStates(page: Page) {
  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="provenance-panel"]');
    const seen: string[] = [];
    (window as unknown as { __provenanceStates?: string[] }).__provenanceStates = seen;
    if (!target) return;
    const read = () => {
      const state = document
        .querySelector('[data-testid="provenance-status"]')
        ?.getAttribute('data-state');
      if (state) seen.push(state);
    };
    read();
    new MutationObserver(read).observe(target, {
      subtree: true,
      attributes: true,
      childList: true,
    });
  });
}

const CONFLICT_CSV = [
  'productId,model,category,optionId,optionLabel,primitive,outerWidthMm,outerDepthMm,outerHeightMm',
  'prod-1,같은 상자,box,var-1,소형,openBin,200,150,100',
  'prod-1,같은 상자,box,var-1,중형,openBin,400,150,100',
].join('\n');

test('size options stay apart, a blank inner stays unknown, and a bad row does not rewrite the catalogue', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/catalog');
  await expect(page.getByTestId('catalog-list')).toContainText('데모 · 합성 데이터');
  const before = await page.getByTestId('catalog-list').innerText();
  await watchStates(page);

  await page.getByTestId('provenance-mode-csv').click();
  await page.getByTestId('provenance-text').fill(CONFLICT_CSV);
  await page.getByTestId('provenance-review').click();
  await expect(page.getByTestId('provenance-quarantine')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('provenance-commit')).toHaveCount(0);
  await expect(page.getByTestId('provenance-row-0')).toHaveAttribute('data-disposition', 'quarantine');
  await expect(page.getByTestId('provenance-row-1')).toHaveAttribute('data-disposition', 'quarantine');
  expect(await page.getByTestId('catalog-list').innerText()).toBe(before);

  await page.getByTestId('provenance-sample-synthetic').click();
  await expect(page.getByTestId('provenance-ready')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('provenance-variant-syn:box-s')).toHaveAttribute('data-inner', 'unknown');
  await expect(page.getByTestId('provenance-variant-syn:box-m')).toHaveAttribute('data-inner', 'unknown');
  await expect(page.getByTestId('provenance-variant-syn:box-s')).toContainText('200 mm');
  await expect(page.getByTestId('provenance-variant-syn:box-m')).toContainText('400 mm');
  await expect(page.getByTestId('provenance-variant-syn:box-s')).toContainText('내경 미확인');
  await page.getByTestId('provenance-commit').click();
  await expect(page.getByTestId('provenance-saved')).toBeVisible();
  await expect(page.getByTestId('catalog-list')).toContainText('sample-synthetic');
  await expect(page.getByTestId('catalog-list')).toContainText('데모 · 합성 데이터');

  await page.getByTestId('provenance-sample-unverified').click();
  await expect(page.getByTestId('provenance-variant-var-open')).toHaveAttribute('data-inner', 'unknown');
  await expect(page.getByTestId('provenance-variant-var-open')).toContainText('외경 300 mm');
  await expect(page.getByTestId('provenance-variant-var-open')).toContainText('내경 미확인');

  await page.getByTestId('provenance-sample-verified').click();
  await expect(page.getByTestId('provenance-ready')).toBeVisible();
  await expect(page.getByTestId('provenance-row-0')).toContainText('사실 상태는 미확인');
  await expect(page.getByTestId('provenance-variant-var-verified-40')).toContainText('내경 360 mm');
  await expect(page.getByTestId('provenance-variant-var-verified-40')).toContainText('외경 400 mm');
  await page.getByTestId('provenance-commit').click();
  await expect(page.getByTestId('catalog-list')).toContainText('검증 범위 기록 · 사실은 미확인');
  const verifiedLine = page.getByTestId('catalog-list').getByText('sample-verified');
  const verifiedText = await verifiedLine.locator('xpath=..').innerText();

  await page.getByTestId('provenance-mode-csv').click();
  await page.getByTestId('provenance-text').fill(CONFLICT_CSV);
  await page.getByTestId('provenance-review').click();
  await expect(page.getByTestId('provenance-quarantine')).toBeVisible();
  await expect(page.getByTestId('provenance-commit')).toHaveCount(0);
  await expect(verifiedLine.locator('xpath=..')).toHaveText(verifiedText);

  const states = await page.evaluate(
    () => (window as unknown as { __provenanceStates?: string[] }).__provenanceStates ?? [],
  );
  expect(states).toContain('pending');
  expect(states).toContain('quarantine');
  expect(states).toContain('ready');
  expect(errors).toEqual([]);
});

test('keyboard review and a narrow forced-colors layout keep the quarantine visible', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/catalog');
  await expect(page.getByTestId('provenance-panel')).toBeVisible();
  await page.getByTestId('provenance-sample-unverified').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('provenance-ready')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('provenance-variant-var-open')).toContainText('내경 미확인');
  await page.getByTestId('provenance-mode-csv').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('provenance-text').fill('not,a,header\n1,2,3\n');
  await page.getByTestId('provenance-review').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('provenance-local-issue')).toBeVisible();
  await expect(page.getByTestId('provenance-commit')).toHaveCount(0);
  await expect(page.getByTestId('catalog-list')).toContainText('데모 · 합성 데이터');
  expect(errors).toEqual([]);
});
