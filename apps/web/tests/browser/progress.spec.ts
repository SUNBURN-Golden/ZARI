import { expect, test, type Page } from '@playwright/test';

/**
 * Real Chromium, IndexedDB, and WASM for accepted-plan step focus.
 * Progress is stored only on the current accepted binding.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function seededPlan(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  await page.locator('[data-testid^="plan-card-"]').first().click();
}

async function acceptSelected(page: Page) {
  await expect(page.getByTestId('progress-inactive')).toBeVisible();
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
  await expect(page.locator('#accepted-guide').locator('[data-testid^="action-"]').first()).toBeVisible();
}

test('accepted steps highlight targets, block on prerequisites, and survive reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seededPlan(page);
  await acceptSelected(page);
  const guide = page.locator('#accepted-guide');
  const workspace = page.locator('[data-spatial-requests]').first();
  const requests = await workspace.getAttribute('data-spatial-requests');

  await guide.getByTestId('step-next').focus();
  await page.keyboard.press('Enter');
  await expect(guide.getByTestId('current-step')).not.toHaveText('현재 단계: 없음');
  if (await guide.getByTestId('step-next').isEnabled()) {
    await guide.getByTestId('step-next').click();
    await guide.getByTestId('step-prev').click();
    await expect(guide.getByTestId('current-step')).not.toHaveText('현재 단계: 없음');
  }
  expect(await workspace.getAttribute('data-spatial-requests')).toBe(requests);

  const focusButtons = guide.locator('[data-testid^="step-focus-"]');
  const focusCount = await focusButtons.count();
  let highlighted = false;
  for (let i = 0; i < focusCount; i += 1) {
    await focusButtons.nth(i).click();
    const targets = page.locator('[data-testid="plan-diagram-top"] [data-focus="true"]');
    if ((await targets.count()) > 0) {
      highlighted = true;
      const keys = await guide.locator('[data-current="true"] [data-target-keys]').getAttribute('data-target-keys');
      const drawn = await targets.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-target')));
      for (const key of drawn) expect(keys ?? '').toContain(key ?? '');
      const front = page.locator('[data-testid="plan-diagram-front"] [data-focus="true"]');
      if ((await front.count()) > 0) {
        const frontDrawn = await front.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-target')),
        );
        for (const key of frontDrawn) expect(keys ?? '').toContain(key ?? '');
      }
      break;
    }
  }
  if (!highlighted) {
    await expect(guide.locator('[data-testid^="step-note-"]').first()).toBeVisible();
  }

  await page.locator('.placement-pick').first().click();
  await expect(page.locator('[data-testid="plan-diagram-top"] .diagram-selection')).toBeVisible();
  await expect(page.getByTestId('workspace-legend').first()).toContainText('선택됨');
  await expect(page.getByTestId('workspace-legend').first()).toContainText('현재 단계 대상');
  const selectedKey = await page
    .locator('[data-testid="plan-diagram-top"] [data-selected="true"]')
    .first()
    .getAttribute('data-target');
  const focusedKey = await page
    .locator('[data-testid="plan-diagram-top"] [data-focus="true"]')
    .first()
    .getAttribute('data-target');
  if (selectedKey && focusedKey) {
    await expect(page.locator('[data-testid="plan-diagram-top"] .diagram-selection')).not.toHaveCount(0);
    await expect(page.locator('[data-testid="plan-diagram-top"] .diagram-focus')).not.toHaveCount(0);
  }

  const blocked = guide.locator('input[disabled]');
  if ((await blocked.count()) > 0) {
    const testId = await blocked.first().getAttribute('data-testid');
    const stepId = testId!.slice('action-'.length);
    await expect(guide.getByTestId(`step-prereq-${stepId}`)).toContainText('선행 단계');
    await expect(blocked.first()).not.toBeChecked();
  }

  const enabled = guide.locator('[data-testid^="action-"]:not([disabled])').first();
  await expect(enabled).toBeVisible();
  const stepId = (await enabled.getAttribute('data-testid'))!.slice('action-'.length);
  await enabled.click();
  await expect(enabled).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30000,
  });
  await expect(page.getByTestId(`action-${stepId}`)).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  const nextBox = await page.getByTestId('step-next').boundingBox();
  expect(nextBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('workspace-legend').first()).toContainText('현재 단계 대상');
  await expect(page.getByTestId('current-step')).toBeVisible();
  expect(errors).toEqual([]);
});

test('working head, accept switch, late reply, and stale input keep progress on the old binding', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededPlan(page);
  await acceptSelected(page);
  const guide = page.locator('#accepted-guide');
  const first = guide.locator('[data-testid^="action-"]:not([disabled])').first();
  const firstId = (await first.getAttribute('data-testid'))!.slice('action-'.length);
  await first.click();
  await expect(first).toBeChecked();

  await page.locator('.placement-pick').first().click();
  const y0 = Number(await page.getByTestId('move-y').inputValue());
  await page.getByTestId('move-y').fill(String(y0 - 15));
  await page.getByTestId('move-apply').click();
  await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 20000 });
  const working = page.getByTestId('edit-section');
  await expect(working.getByTestId('progress-working')).toBeVisible();
  await expect(working.locator('input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(guide.getByTestId(`action-${firstId}`)).toBeChecked();

  await page.evaluate(() => {
    const holder = window as unknown as {
      __zariProgressGate?: () => Promise<void>;
      __zariProgressHeld?: boolean;
      __zariProgressRelease?: () => void;
    };
    holder.__zariProgressHeld = false;
    holder.__zariProgressGate = () =>
      new Promise((resolve) => {
        holder.__zariProgressHeld = true;
        holder.__zariProgressRelease = () => resolve();
      });
  });
  const other = guide.locator('[data-testid^="action-"]:not([disabled]):not(:checked)');
  const target = (await other.count()) > 0 ? other.first() : guide.locator('[data-testid^="action-"]:checked').first();
  await target.click();
  await page.waitForFunction(
    () => (window as unknown as { __zariProgressHeld?: boolean }).__zariProgressHeld === true,
  );
  await page.getByTestId('accept-edit-head').click();
  await expect(working.getByTestId('accepted-badge')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#accepted-guide')).toHaveAttribute('data-write', 'writable', { timeout: 20000 });
  await page.evaluate(async () => {
    (window as unknown as { __zariProgressRelease?: () => void }).__zariProgressRelease?.();
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  const switched = page.locator('#accepted-guide');
  await expect(switched.locator('[data-testid^="action-"]').first()).toBeVisible();
  await expect(switched.locator('input[type="checkbox"]:checked')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a stale accepted plan and a second tab do not take or merge progress', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededPlan(page);
  await acceptSelected(page);
  const guide = page.locator('#accepted-guide');
  const enabled = guide.locator('[data-testid^="action-"]:not([disabled])').first();
  const stepId = (await enabled.getAttribute('data-testid'))!.slice('action-'.length);

  const pageB = await context.newPage();
  const errorsB: string[] = [];
  collectErrors(pageB, errorsB);
  await pageB.goto(page.url());
  await expect(pageB.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30000,
  });
  await expect(pageB.locator('#accepted-guide')).toBeVisible();

  await enabled.click();
  await expect(enabled).toBeChecked();
  await expect(pageB.getByTestId('edit-conflict')).toBeVisible();
  await expect(pageB.locator('#accepted-guide').getByTestId('progress-conflict')).toBeVisible();
  await expect(pageB.locator('#accepted-guide').locator('input[type="checkbox"]')).toHaveCount(0);
  await pageB.getByTestId('edit-conflict-reload').click();
  await expect(pageB.getByTestId('edit-conflict')).toBeHidden();
  await expect(pageB.getByTestId(`action-${stepId}`)).toBeChecked({ timeout: 15000 });

  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await page.getByRole('textbox', WIDTH).fill('610');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(page.locator('#accepted-guide').getByTestId('progress-stale')).toBeVisible();
  await expect(page.locator('#accepted-guide').locator('input[type="checkbox"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(errorsB).toEqual([]);
});
