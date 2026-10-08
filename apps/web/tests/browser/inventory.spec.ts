import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('inventory-status')).not.toHaveAttribute('data-state', 'pending');
}

async function watchStates(page: Page) {
  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="inventory-panel"]');
    const seen: string[] = [];
    (window as unknown as { __inventoryStates?: string[] }).__inventoryStates = seen;
    if (!target) return;
    const read = () => {
      const state = document
        .querySelector('[data-testid="inventory-status"]')
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

test('unknown quantity stays distinct from zero and a past plan does not rewrite it', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await watchStates(page);
  await page.getByTestId('inventory-subject-id').fill('towel');
  await page.getByTestId('inventory-label').fill('수건');
  await page.getByTestId('inventory-quantity').fill('');
  await page.getByTestId('inventory-quantity').press('Enter');
  await expect(page.getByTestId('inventory-subject-towel')).toHaveAttribute(
    'data-quantity-code',
    'unknown',
  );
  await expect(page.getByTestId('inventory-subject-towel')).toContainText('수량 미상');
  await expect(page.getByTestId('inventory-subject-towel')).toContainText('개별');
  await expect(page.getByTestId('inventory-subject-towel')).not.toContainText('0개');
  const states = await page.evaluate(
    () => (window as unknown as { __inventoryStates?: string[] }).__inventoryStates ?? [],
  );
  expect(states).toContain('pending');

  await page.getByTestId('inventory-event-kind').selectOption('quantityEdit');
  await page.getByTestId('inventory-quantity').fill('0');
  await page.getByTestId('inventory-record').click();
  await expect(page.getByTestId('inventory-subject-towel')).toHaveAttribute(
    'data-quantity-code',
    'zero',
  );
  await expect(page.getByTestId('inventory-subject-towel')).toContainText('0개');
  await expect(page.getByTestId('inventory-status')).toHaveAttribute('data-state', 'saved');

  await page.getByTestId('inventory-plan-id').fill('0'.repeat(64));
  await page.getByTestId('inventory-open-historical').click();
  await expect(page.getByTestId('inventory-historical')).toHaveAttribute('data-changed', 'false');
  await expect(page.getByTestId('inventory-subject-towel')).toContainText('0개');
  await expect(page.getByTestId('inventory-status')).toHaveAttribute('data-state', 'read');

  const projectId = page.url().match(/project\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  await page.evaluate((id) => {
    location.hash = `#/project/${id}/plan`;
  }, projectId);
  await expect(page.getByRole('heading', { name: '어떻게 정리할지 계산합니다.' })).toBeVisible();
  await page.evaluate((id) => {
    location.hash = `#/project/${id}`;
  }, projectId);
  await expect(page.getByTestId('inventory-subject-towel')).toHaveAttribute(
    'data-quantity-code',
    'zero',
  );

  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('inventory-subject-towel')).toContainText('0개');
  await expect(page.getByTestId('inventory-subject-towel')).not.toContainText('수량 미상');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId('inventory-panel')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('inventory-record')).toBeVisible();
  const colors = await page.getByTestId('inventory-panel').evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).not.toBe('');
  expect(colors.color).not.toBe('');
  expect(errors).toEqual([]);
});

test('one owned container is not consumed twice and an invalid id is not stored', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await page.getByTestId('inventory-subject-kind').selectOption('container');
  await page.getByTestId('inventory-subject-id').fill('bin-a');
  await page.getByTestId('inventory-label').fill('상자');
  await page.getByTestId('inventory-usage').selectOption('empty');
  await page.getByTestId('inventory-quantity').fill('');
  await page.getByTestId('inventory-record').click();
  await expect(page.getByTestId('inventory-subject-bin-a')).toHaveAttribute(
    'data-quantity-code',
    'unknown',
  );
  await expect(page.getByTestId('inventory-subject-bin-a')).toHaveAttribute('data-usage', 'empty');
  await expect(page.getByTestId('inventory-subject-bin-a')).toContainText('빈 용기');
  await expect(page.getByTestId('inventory-subject-bin-a')).toContainText('수량 미상');

  await page.getByTestId('inventory-claim-id').fill('bin-a');
  await page.getByTestId('inventory-ordinal-a').fill('0');
  await page.getByTestId('inventory-conserve').click();
  await expect(page.getByTestId('inventory-conservation')).toHaveAttribute(
    'data-reason',
    'empty_container_consumed',
  );
  await expect(page.getByTestId('inventory-status')).toHaveAttribute('data-state', 'read');

  await page.getByTestId('inventory-event-kind').selectOption('quantityEdit');
  await page.getByTestId('inventory-usage').selectOption('inUse');
  await page.getByTestId('inventory-quantity').fill('2');
  await page.getByTestId('inventory-record').click();
  await expect(page.getByTestId('inventory-subject-bin-a')).toHaveAttribute(
    'data-quantity-code',
    'count',
  );
  await expect(page.getByTestId('inventory-subject-bin-a')).toContainText('2개');
  await expect(page.getByTestId('inventory-subject-bin-a')).toContainText('사용 중');

  await page.getByTestId('inventory-ordinal-b').fill('0');
  await page.getByTestId('inventory-conserve').click();
  await expect(page.getByTestId('inventory-conservation')).toHaveAttribute(
    'data-reason',
    'owned_double_consume',
  );
  await expect(page.getByTestId('inventory-subject-bin-a')).toContainText('2개');
  await expect(page.getByTestId('inventory-events')).not.toContainText('중복');

  await page.getByTestId('inventory-subject-kind').selectOption('item');
  await page.getByTestId('inventory-subject-id').fill('bad id');
  await page.getByTestId('inventory-label').fill('잘못');
  await page.getByTestId('inventory-event-kind').selectOption('purchase');
  await page.getByTestId('inventory-quantity').fill('1');
  await page.getByTestId('inventory-record').click();
  await expect(page.getByTestId('inventory-error')).toBeVisible();
  await expect(page.getByTestId('inventory-status')).toHaveAttribute('data-state', 'error');
  await expect(page.getByTestId('inventory-subjects')).not.toContainText('잘못');
  await expect(page.getByTestId('inventory-subject-bin-a')).toContainText('2개');
  expect(errors).toEqual([]);
});
