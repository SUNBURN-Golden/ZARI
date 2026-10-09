import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function preparedProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
}

async function replanCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __replanCalls: number }).__replanCalls);
}

test('a pin stays, an invalidated pass is not reused, and a late reply does not adopt', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as {
      __replanCalls?: number;
      __holdReplan?: boolean;
      __queued?: unknown[];
      __worker?: Worker;
      __post?: (this: Worker, ...args: unknown[]) => void;
    };
    holder.__replanCalls = 0;
    holder.__holdReplan = false;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const body = args[0];
      if (typeof body === 'string' && body.includes('"replanIncremental"')) {
        holder.__replanCalls = (holder.__replanCalls ?? 0) + 1;
        if (holder.__holdReplan) {
          holder.__queued = args;
          holder.__worker = this;
          holder.__post = post as (this: Worker, ...inner: unknown[]) => void;
          return;
        }
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await preparedProject(page);
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  const panel = page.getByTestId('incremental-replan');
  await expect(panel).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('incremental-empty')).toBeVisible();
  expect(await replanCalls(page)).toBe(0);

  await page.getByTestId('compute-plan').click();
  await expect(panel).toHaveAttribute('data-state', 'idle', { timeout: 60_000 });
  const cards = page.getByTestId('alternatives-list').getByRole('button');
  const cardCount = await cards.count();
  let pinned = false;
  for (let index = 0; index < cardCount; index += 1) {
    await cards.nth(index).click();
    if ((await page.getByRole('checkbox', { name: /Winter coats \d/ }).count()) > 0) {
      pinned = true;
      break;
    }
  }
  expect(pinned).toBe(true);
  const coat = page.getByRole('checkbox', { name: /Winter coats \d/ }).first();
  await coat.check();
  const selectedBefore = await panel.getAttribute('data-selected-id');
  expect(selectedBefore).toBeTruthy();

  await page.getByTestId('incremental-run').click();
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(panel).toHaveAttribute('data-moved', '0');
  await expect(panel).toHaveAttribute('data-reused-pass', 'false');
  await expect(panel).toHaveAttribute('data-read-model', 'zari-incremental-1');
  await expect(panel).toHaveAttribute('data-selected-id', selectedBefore!);
  await expect(page.getByTestId('incremental-moved')).toHaveText('옮긴 배치 없음');
  await expect(page.getByTestId('incremental-reused')).toHaveText('이전 통과를 다시 쓰지 않습니다');
  expect(await replanCalls(page)).toBe(1);

  const strategy = page.getByRole('checkbox', { name: '전략 고정' });
  await strategy.focus();
  await expect(strategy).toBeFocused();
  await strategy.press('Space');
  await expect(strategy).toBeChecked();
  expect(await replanCalls(page)).toBe(1);

  const nextId = await panel.getAttribute('data-next-snapshot');
  expect(nextId).toBeTruthy();
  expect(nextId).not.toBe(selectedBefore);
  await page.getByTestId('incremental-adopt').click();
  await expect(panel).toHaveAttribute('data-selected-id', nextId!);
  expect(await replanCalls(page)).toBe(1);

  await page.evaluate(() => {
    (window as unknown as { __holdReplan: boolean }).__holdReplan = true;
  });
  await strategy.check();
  await page.getByTestId('incremental-run').click();
  await expect(panel).toHaveAttribute('data-state', 'pending');
  const selectedDuring = await panel.getAttribute('data-selected-id');
  expect(selectedDuring).toBe(nextId);
  expect(await replanCalls(page)).toBe(2);
  await page.getByTestId('incremental-cancel').click();
  await expect(panel).toHaveAttribute('data-state', 'cancelled');
  await expect(panel).toHaveAttribute('data-selected-id', selectedDuring!);
  await page.evaluate(() => {
    const holder = window as unknown as {
      __holdReplan?: boolean;
      __queued?: unknown[];
      __worker?: Worker;
      __post?: (this: Worker, ...args: unknown[]) => void;
    };
    holder.__holdReplan = false;
    if (!holder.__queued || !holder.__worker || !holder.__post) throw new Error('missing_held_replan');
    holder.__post.apply(holder.__worker, holder.__queued);
  });
  await expect(panel).toHaveAttribute('data-ignored', '1');
  await expect(panel).toHaveAttribute('data-state', 'cancelled');
  await expect(panel).toHaveAttribute('data-selected-id', selectedDuring!);
  await expect(page.getByTestId('incremental-ignored')).toHaveText(
    '늦은 응답은 채택한 계획을 바꾸지 않았습니다.',
  );
  expect(await replanCalls(page)).toBe(2);

  await page.getByTestId('accept-plan').click();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  await page.getByRole('link', { name: '← 치수로 돌아가기' }).click();
  const width = page.getByRole('textbox', { name: '물건 A 폭' });
  await expect(width).toBeVisible();
  const digestOnForm = (await page.getByTestId('input-digest').textContent()) ?? '';
  await page.getByLabel('물건 A 폭 단위').selectOption('mm');
  await width.fill('9000');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByTestId('normalized-items.item-a.dimensions.envelope.width')).toHaveText(
    '9000 mm',
  );
  await expect(page.getByTestId('input-digest')).not.toHaveText(digestOnForm);
  await expect(page.getByTestId('context-state')).toHaveText('installed');

  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(panel).not.toHaveAttribute('data-state', 'empty');
  const selectedAfterReturn = await panel.getAttribute('data-selected-id');
  await page.getByRole('checkbox', { name: 'Winter coats 고정' }).check();
  const coatAgain = page.getByRole('checkbox', { name: /Winter coats \d/ });
  if ((await coatAgain.count()) > 0) await coatAgain.first().check();
  await page.getByTestId('incremental-run').click();
  await expect(panel).toHaveAttribute('data-outcome', 'blocked', { timeout: 30_000 });
  await expect(panel).toHaveAttribute('data-state', 'blocked');
  await expect(panel).toHaveAttribute('data-moved', '0');
  await expect(panel).toHaveAttribute('data-reused-pass', 'false');
  await expect(panel).toHaveAttribute('data-selected-id', selectedAfterReturn ?? '');
  await expect(page.getByTestId('incremental-moved')).toHaveText('옮긴 배치 없음');
  const statuses = await page
    .getByTestId('incremental-check')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-status')));
  expect(statuses.some((status) => status === 'fail' || status === 'unknown')).toBe(true);
  await expect(page.getByTestId('incremental-conflicts')).toBeVisible();
  expect(await replanCalls(page)).toBe(3);

  const release = panel.locator('[data-testid^="incremental-release-"]').first();
  await release.focus();
  await expect(release).toBeFocused();
  const releaseId = await release.getAttribute('data-testid');
  expect(releaseId).toBeTruthy();
  await release.press('Enter');
  const pinId = releaseId!.replace('incremental-release-', 'incremental-pin-');
  if (releaseId!.includes('strategy')) {
    await expect(page.getByTestId('incremental-pin-strategy')).not.toBeChecked();
  } else {
    await expect(page.getByTestId(pinId)).not.toBeChecked();
  }
  expect(await replanCalls(page)).toBe(3);
  await expect(panel).toHaveAttribute('data-selected-id', selectedAfterReturn ?? '');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(panel).toHaveAttribute('data-state', 'blocked');
  await expect(panel).toHaveAttribute('data-reused-pass', 'false');
  await expect(page.getByTestId('incremental-conflicts')).toBeVisible();
  expect(errors).toEqual([]);
});
