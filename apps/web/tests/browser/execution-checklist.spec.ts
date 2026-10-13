import { expect, test, type Page } from '@playwright/test';

/**
 * Real Chromium, IndexedDB, and WASM for the z-execution-checklist card.
 * The card follows the focused guide step: preparations come from Rust
 * instanceRefs, conditions from the snapshot checks, and progress from the
 * persisted binding only.
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
  const count = await page.locator('[data-testid^="plan-card-"]').count();
  for (let i = 0; i < count; i++) {
    await page.getByTestId(`plan-card-${i}`).click();
    const items = page.getByTestId('placements-list').locator('li');
    const note = await items.first().locator('.session-note').innerText();
    const y = Number(note.match(/\(-?\d+, (-?\d+), -?\d+\)/)?.[1]);
    if ((await items.count()) === 1 && y >= 15) break;
  }
  const chosen = await page.getByTestId('placements-list').locator('li').first().locator('.session-note').innerText();
  expect(Number(chosen.match(/\(-?\d+, (-?\d+), -?\d+\)/)?.[1])).toBeGreaterThanOrEqual(15);
}

async function acceptSelected(page: Page) {
  await expect(page.getByTestId('progress-inactive')).toBeVisible();
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
  await expect(page.locator('#accepted-guide').locator('[data-testid^="action-"]').first()).toBeVisible();
}

test('execution card follows the focused step and progress persists across reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededPlan(page);
  await acceptSelected(page);
  const card = page.getByTestId('execution-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('execution-preparations')).toBeVisible();
  await expect(card.getByTestId('execution-conditions')).toBeVisible();
  await expect(card.getByTestId('execution-progress')).toBeVisible();
  await expect(card.getByTestId('execution-rollback')).toBeVisible();

  const guide = page.locator('#accepted-guide');
  const focus = guide.locator('[data-testid^="step-focus-"]').first();
  const stepId = (await focus.getAttribute('data-testid'))!.slice('step-focus-'.length);
  await focus.click();
  await expect(card.getByTestId(`execution-mark-${stepId}`)).toBeVisible();

  const mark = card.getByTestId(`execution-mark-${stepId}`);
  if (await mark.isEnabled()) {
    await mark.click();
    await expect(mark).toBeChecked();
    await page.reload();
    await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
      timeout: 30000,
    });
    await expect(page.getByTestId('execution-card')).toBeVisible();
    await page.locator('#accepted-guide').getByTestId(`step-focus-${stepId}`).click();
    await expect(
      page.getByTestId('execution-card').getByTestId(`execution-mark-${stepId}`),
    ).toBeChecked();
  }
  expect(errors).toEqual([]);
});

test('a blocked step shows its conditions on the card and is never completable', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededPlan(page);
  await acceptSelected(page);
  const guide = page.locator('#accepted-guide');
  const card = page.getByTestId('execution-card');

  // Pick a disabled step that also carries Rust-pinned condition reasons.
  const disabled = guide.locator('input[disabled]');
  await expect(disabled.first()).toBeVisible();
  let stepId: string | null = null;
  for (let i = 0; i < (await disabled.count()); i += 1) {
    const testId = await disabled.nth(i).getAttribute('data-testid');
    const candidate = testId!.slice('action-'.length);
    if ((await guide.getByTestId(`step-condition-${candidate}`).count()) > 0) {
      stepId = candidate;
      break;
    }
  }
  expect(stepId).not.toBeNull();
  await guide.getByTestId(`step-focus-${stepId}`).click();

  const cardMark = card.getByTestId(`execution-mark-${stepId}`);
  await expect(cardMark).toBeVisible();
  await expect(cardMark).toBeDisabled();
  await expect(cardMark).not.toBeChecked();
  await expect(card.getByTestId('execution-lock')).toBeVisible();

  // The remaining unknown/failed checks stay on the card after other
  // steps are marked done — a checkbox never changes a check result.
  const conditions = card.getByTestId('execution-check-list');
  await expect(conditions).toBeVisible();
  const unknowns = conditions.locator('li[data-status="unknown"], li[data-status="fail"]');
  const blockerCount = await unknowns.count();
  expect(blockerCount).toBeGreaterThan(0);

  const enabled = guide.locator('[data-testid^="action-"]:not([disabled])').first();
  await enabled.click();
  await expect(enabled).toBeChecked();
  await guide.getByTestId(`step-focus-${stepId}`).click();
  await expect(cardMark).toBeDisabled();
  await expect(conditions.locator('li[data-status="unknown"], li[data-status="fail"]')).toHaveCount(
    blockerCount,
  );
  expect(errors).toEqual([]);
});

test('rollback buttons return to the matching draft control without writing progress', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededPlan(page);
  await acceptSelected(page);
  const card = page.getByTestId('execution-card');

  await card.getByTestId('execution-rollback-measuredDiff').click();
  await expect(page.getByTestId('save-state')).toBeVisible();
  await expect(page.getByRole('textbox', WIDTH)).toBeFocused();

  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('execution-card')).toBeVisible();
  await card.getByTestId('execution-rollback-differentItem').click();
  await expect(page.getByRole('textbox', { name: '물건 A 폭', exact: true })).toBeFocused();

  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('execution-card')).toBeVisible();
  await card.getByTestId('execution-rollback-missingParts').click();
  await expect(page.getByTestId('catalog-pin-select')).toBeFocused();

  // Navigation alone never wrote a progress mark.
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('execution-card')).toBeVisible();
  await expect(page.locator('#accepted-guide').locator('input[type="checkbox"]:checked')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an input change closes the card controls and a recomputed plan inherits nothing', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededPlan(page);
  await acceptSelected(page);
  const guide = page.locator('#accepted-guide');
  const card = page.getByTestId('execution-card');
  const enabled = guide.locator('[data-testid^="action-"]:not([disabled])').first();
  await enabled.click();
  await expect(enabled).toBeChecked();

  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await page.getByRole('textbox', WIDTH).fill('610');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(guide.getByTestId('progress-stale')).toBeVisible();
  await expect(card).toBeVisible();
  await expect(card.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(card.getByTestId('execution-mark-readonly')).toBeVisible();

  // The card still carries the rollback path out of a stale plan.
  await card.getByTestId('execution-rollback-measuredDiff').click();
  await expect(page.getByRole('textbox', WIDTH)).toBeFocused();

  await page.getByTestId('goto-plan').click();
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  await page.getByTestId('plan-card-0').click();
  await acceptSelected(page);
  const freshGuide = page.locator('#accepted-guide');
  await expect(freshGuide).toBeVisible();
  await expect(freshGuide.locator('input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(card.locator('input[type="checkbox"]:checked')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('execution card stays usable on a compact viewport with forced colors', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await seededPlan(page);
  await acceptSelected(page);
  const card = page.getByTestId('execution-card');
  await expect(card).toBeVisible();
  const rollback = card.getByTestId('execution-rollback-measuredDiff');
  const box = await rollback.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Keyboard: focus the mark control for the focused step and toggle it.
  const guide = page.locator('#accepted-guide');
  const enabled = guide.locator('[data-testid^="action-"]:not([disabled])').first();
  const testId = await enabled.getAttribute('data-testid');
  const stepId = testId!.slice('action-'.length);
  await guide.getByTestId(`step-focus-${stepId}`).click();
  const mark = card.getByTestId(`execution-mark-${stepId}`);
  await mark.focus();
  await page.keyboard.press('Space');
  await expect(mark).toBeChecked();

  await page.emulateMedia({ forcedColors: 'active' });
  await expect(card.getByTestId('execution-conditions')).toBeVisible();
  await expect(card.getByTestId('execution-rollback')).toBeVisible();
  expect(errors).toEqual([]);
});
