import { test, expect } from '@playwright/test';
test('real WASM pass fail unknown invalid units and package arithmetic', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const wasm = page.waitForResponse((r) => r.url().endsWith('.wasm') && r.ok());
  await page.goto('/#/probe');
  await wasm;
  await expect(page.getByTestId('width-status')).toContainText('입력한 폭 안에 들어갑니다');
  await expect(page.getByTestId('required-width')).toContainText('590');
  await expect(page.getByTestId('packages-to-order')).toHaveText(/^3\s*(묶음|개)$/);
  await expect(page.getByTestId('supplied-units')).toHaveText(/^6\s*(묶음|개)$/);
  await expect(page.getByTestId('surplus-units')).toHaveText(/^1\s*(묶음|개)$/);
  const item = page.getByRole('textbox', { name: '물체 하나의 폭', exact: true });
  const space = page.getByRole('textbox', { name: '수납장 안쪽 폭', exact: true });
  const submit = page.getByRole('button', { name: '폭과 수량 확인', exact: true });
  await item.fill('195');
  await expect(page.getByTestId('stale-notice')).toBeVisible();
  await submit.click();
  await expect(page.getByTestId('required-width')).toContainText('605');
  await expect(page.getByTestId('width-status')).toContainText('초과');
  await space.fill('');
  await submit.click();
  await expect(page.getByTestId('width-status')).toContainText('폭 확인이 필요');
  await expect(page.getByTestId('packages-to-order')).toHaveText(/^3\s*(묶음|개)$/);
  await space.fill('0');
  await submit.click();
  await expect(space).toHaveAttribute('aria-invalid', 'true');
  // Enter, not a synthesized click: Playwright's Firefox click does not deliver
  // the pointer events React Aria uses for onPress. Keyboard activation is
  // the same control.
  const resetButton = page.getByRole('button', { name: '예제 값으로 되돌리기' });
  await resetButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('width-status')).toContainText('입력한 폭 안에 들어갑니다');
  await page.getByLabel('수납장 안쪽 폭 단위').selectOption('cm');
  await expect(space).toHaveValue('60');
  await expect(page.getByTestId('width-status')).toContainText('입력한 폭 안에 들어갑니다');
  await space.fill('60.01');
  await submit.click();
  await expect(space).toHaveAttribute('aria-invalid', 'true');
  await space.fill('60');
  await submit.click();
  await expect(page.getByTestId('width-status')).toContainText('입력한 폭 안에 들어갑니다');
  await page.getByLabel('수납장 안쪽 폭 단위').selectOption('mm');
  await expect(space).toHaveValue('600');
  await expect(page.getByTestId('required-width')).toContainText('590');
  expect(errors).toEqual([]);
});
test('keyboard workflow raw stale state mobile fit and explicit fresh reload', async ({ page }) => {
  await page.goto('/#/probe');
  await expect(page.getByTestId('width-status')).toContainText('입력한 폭 안에 들어갑니다');
  const space = page.getByRole('textbox', { name: '수납장 안쪽 폭', exact: true });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '치수 입력으로 바로가기' })).toBeFocused();
  // Follow the actual document focus order without a pointer interaction.
  for (let i = 0; i < 12; i++) {
    if (await space.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(space).toBeFocused();
  await expect(page.getByTestId('width-dimension')).toHaveAttribute('data-focused', 'true');
  await space.fill('500');
  await expect(page.getByTestId('stale-notice')).toBeVisible();
  await space.fill('600');
  await expect(page.getByTestId('stale-notice')).toBeVisible();
  await space.press('Enter');
  await expect(page.getByTestId('width-status')).toContainText('입력한 폭 안에 들어갑니다');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('textbox', { name: '필요한 개수', exact: true }).fill('0');
  await page.getByRole('button', { name: '폭과 수량 확인', exact: true }).click();
  await expect(page.getByTestId('packages-to-order')).toHaveText(/^0\s*(묶음|개)$/);
  await expect(page.getByTestId('supplied-units')).toHaveText(/^0\s*(묶음|개)$/);
  await page.reload();
  await expect(page.getByTestId('packages-to-order')).toHaveText(/^3\s*(묶음|개)$/);
});
test('Worker crash preserves input and retry calculates through fresh WASM', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const captured: Worker[] = [];
    Object.assign(window, { __testWorkers: captured });
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        captured.push(this);
      }
    };
  });
  await page.goto('/#/probe');
  await expect(page.getByTestId('width-status')).toContainText('입력한 폭 안에 들어갑니다');
  await page.getByRole('textbox', { name: '물체 하나의 폭', exact: true }).fill('195');
  await page.evaluate(() => {
    (window as unknown as { __testWorkers: Worker[] }).__testWorkers
      .at(-1)!
      .dispatchEvent(new ErrorEvent('error', { message: 'test transport failure' }));
  });
  await page.getByRole('button', { name: '계산기 다시 연결' }).click();
  await expect(page.getByRole('textbox', { name: '물체 하나의 폭', exact: true })).toHaveValue(
    '195',
  );
  await expect(page.getByTestId('required-width')).toContainText('605');
  await expect(page.getByTestId('width-status')).toContainText('초과');
});
