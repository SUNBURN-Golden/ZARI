import { expect, test, type Page } from '@playwright/test';

/**
 * z-guided-onboarding on the real browser Worker and IndexedDB.
 * Phone hardware and a dedicated GPU are not claimed here.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;
const DEPTH = { name: '공간 안쪽 깊이', exact: true } as const;
const HEIGHT = { name: '공간 안쪽 높이', exact: true } as const;

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function ready(page: Page) {
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('context-state')).toHaveText(/installed|degraded/);
}

async function commitSaved(page: Page) {
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
}

/** Worker traffic the guide must not add to: spatial, normalize and next-facts requests. */
async function requestCounts(page: Page) {
  const measure = page.getByTestId('measure-workspace');
  return {
    spatial: await measure.getAttribute('data-spatial-requests'),
    normalize: await measure.getAttribute('data-normalize-requests'),
    nextFacts: await page.getByTestId('next-facts').getAttribute('data-next-facts-requests'),
  };
}

test('empty list: real start and synthetic example are separate choices', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await expect(page.getByTestId('project-empty')).toContainText('아직 프로젝트가 없습니다');
  await expect(page.getByTestId('start-choices')).toBeVisible();
  await expect(page.getByTestId('example-sheet')).toBeVisible();
  await expect(page.getByTestId('example-disclosure')).toContainText('실제가 아니며 구매할 수 없습니다');
  await expect(page.getByTestId('create-project')).toHaveText('내 공간으로 시작');
  await expect(page.getByTestId('create-example')).toHaveText('예제로 둘러보기');
  // Both start buttons are reachable by keyboard in order.
  await page.getByTestId('create-project').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('create-example')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('import-project')).toBeFocused();

  // A real start has no example banner, no values and no badge.
  await page.getByTestId('create-project').click();
  await ready(page);
  await expect(page.getByTestId('example-banner')).toHaveCount(0);
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('');
  await expect(page.getByTestId('onboarding')).toHaveAttribute('data-example', 'false');
  await page.goto('/#/projects');
  await expect(page.locator('[data-testid^="example-badge-"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('first use: guide points at the Rust next fact, help jumps to the real field, closing keeps input', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await ready(page);

  const guide = page.getByTestId('onboarding');
  await expect(guide).toHaveAttribute('data-open', 'true');
  const facts = page.getByTestId('next-facts');
  await expect(facts).toHaveAttribute('data-next-facts-status', 'ready');
  // The guide does not ask for every measurement first: opening and items are optional.
  await expect(page.getByTestId('onboarding-step-opening')).toContainText('(선택)');
  await expect(page.getByTestId('onboarding-step-items')).toContainText('(선택)');
  await expect(page.getByTestId('onboarding-lead')).toContainText('모든 칸을 먼저 채울 필요는 없습니다');
  await expect(page.getByTestId('onboarding-scope')).toContainText('구매·결제를 하지 않습니다');

  // Linked to the Rust query: the suggested field is the first measurable row of the list.
  const next = page.getByTestId('onboarding-next');
  await expect(next).toHaveAttribute('data-source', 'rust');
  const firstField = await facts
    .locator('[data-destination="field"]')
    .first()
    .getAttribute('data-field-path');
  expect(firstField).toBeTruthy();
  const before = await requestCounts(page);

  await page.getByTestId('onboarding-goto-next').click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(firstField);

  // Context help follows the focused field and shows an input example.
  await page.getByRole('textbox', DEPTH).focus();
  await expect(page.getByTestId('onboarding-help')).toContainText('공간 안쪽 깊이');
  await expect(page.getByTestId('onboarding-example-input')).toContainText('450');
  // Help button jumps to a different real field.
  await page.getByTestId('onboarding-field-space.interior.height').click();
  await expect(page.getByRole('textbox', HEIGHT)).toBeFocused();
  await expect(page.getByTestId('focus-context')).toContainText('공간 안쪽 높이');

  // Only the three interior values are entered.
  await page.getByRole('textbox', WIDTH).fill('600');
  await page.getByRole('textbox', DEPTH).fill('450');
  await page.getByRole('textbox', HEIGHT).fill('1800');

  // Closing by keyboard keeps every typed value, saved or not.
  const toggle = page.getByTestId('onboarding-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(guide).toHaveAttribute('data-open', 'false');
  await expect(page.getByTestId('onboarding-closed-note')).toContainText('그대로 남습니다');
  await expect(page.getByTestId('onboarding-steps')).toBeHidden();
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('600');
  await expect(page.getByRole('textbox', DEPTH)).toHaveValue('450');
  await expect(page.getByRole('textbox', HEIGHT)).toHaveValue('1800');

  // Opening the guide did not send anything to the worker or edit the draft.
  expect(await requestCounts(page)).toEqual(before);

  await commitSaved(page);
  await expect(page.getByTestId('normalized-space.interior.height')).toHaveText('1800 mm');
  // Unmeasured optional fields stay unmeasured; nothing was defaulted to a value.
  await expect(page.getByRole('textbox', { name: '개구부 폭', exact: true })).toHaveValue('');
  await expect(page.getByTestId('normalized-space.opening.width')).toHaveText('미측정');

  // Closed state survives a reload; so do the inputs.
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('onboarding')).toHaveAttribute('data-open', 'false');
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('600');
  await page.getByTestId('onboarding-toggle').click();
  await expect(page.getByTestId('onboarding')).toHaveAttribute('data-open', 'true');
  await expect(page.getByRole('textbox', HEIGHT)).toHaveValue('1800');
  expect(errors).toEqual([]);
});

test('error fix: a bad value shows a concrete correction that jumps to the field', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await ready(page);
  await page.getByRole('textbox', WIDTH).fill('육백');
  await page.getByTestId('commit-input').click();
  const list = page.getByTestId('onboarding-errors');
  await expect(list).toBeVisible();
  await expect(list).toContainText('공간 안쪽 폭');
  await expect(list).toContainText('숫자만 입력합니다');
  // Original text is kept, not replaced by a default.
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('육백');
  await page.getByRole('textbox', DEPTH).focus();
  await page.getByTestId('onboarding-fix-space.interior.width').click();
  await expect(page.getByRole('textbox', WIDTH)).toBeFocused();
  // Correcting the value clears the error entry.
  await page.getByRole('textbox', WIDTH).fill('600');
  await commitSaved(page);
  await expect(page.getByTestId('onboarding-errors')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('example: labelled synthetic, never looks purchasable, kept apart from a real project', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await page.getByTestId('create-example').click();
  await ready(page);
  await expect(page.getByTestId('example-banner')).toContainText('합성');
  await expect(page.getByTestId('example-banner')).toContainText('실제 공간·상품이 아닙니다');
  await expect(page.getByTestId('onboarding')).toHaveAttribute('data-example', 'true');
  await expect(page.getByRole('textbox', WIDTH)).not.toHaveValue('');
  await commitSaved(page);

  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await expect(page.getByTestId('synthetic-notice')).toContainText('구매할 수 없습니다');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  const cards = page.locator('[data-testid^="plan-card-"]');
  let opened = false;
  for (let i = 0; i < (await cards.count()); i += 1) {
    if ((await cards.nth(i).innerText()).includes('구매 포함')) {
      await cards.nth(i).click();
      opened = true;
      break;
    }
  }
  expect(opened).toBe(true);
  const handoff = page.getByTestId('plan-detail').first().getByTestId('purchase-handoff');
  await expect(handoff).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(handoff).toHaveAttribute('data-synthetic', 'true');
  await expect(handoff.getByTestId('purchase-synthetic-note')).toContainText('합성 예제');
  const link = handoff.locator('[data-testid^="purchase-line-"]').first().locator('[data-testid^="purchase-link-"]');
  await expect(link).toContainText('실제 판매처 아님');
  await expect(handoff).not.toContainText('판매처에서 보기');
  await expect(handoff).toHaveAttribute('data-paid', 'false');

  // The list marks the example and keeps a separate real start untouched.
  await page.goto('/#/projects');
  await expect(page.locator('[data-testid^="example-badge-"]')).toHaveCount(1);
  await page.getByTestId('create-project').click();
  await ready(page);
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('');
  await expect(page.getByTestId('example-banner')).toHaveCount(0);
  await page.goto('/#/projects');
  await expect(page.locator('[data-testid^="project-row-"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('narrow phone width and forced colors keep the guide usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  await expect(page.getByTestId('start-choices')).toBeVisible();
  await page.getByTestId('create-project').click();
  await ready(page);
  await expect(page.getByTestId('onboarding-toggle')).toBeVisible();
  await expect(page.getByTestId('onboarding-next')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByTestId('onboarding-toggle').click();
  await expect(page.getByTestId('onboarding')).toHaveAttribute('data-open', 'false');
});
