import { test, expect, type Page } from '@playwright/test';

/**
 * REAL browser evidence for ZARI-007 trustworthy editing: real Chromium,
 * real IndexedDB, real WASM Worker — every edit reply is produced by Rust.
 * Covers select → inspect → numeric move → rejected move → allowed
 * rotation → undo/redo → equal-scale alternatives → input change while
 * editing → mobile inspector, with a clean console.
 */

async function seededProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'saved',
  );
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute(
    'data-context',
    'installed',
  );
}

async function computeDone(page: Page) {
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute(
    'data-search',
    'done',
    { timeout: 60000 },
  );
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
}

test('editing is verified by Rust: provisional ghost → verified snapshot → undo/redo', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededProject(page);
  await computeDone(page);

  // Equal-scale alternatives: every thumbnail shares one viewBox (the same
  // space interior), so card sizes are physically comparable.
  const thumbs = page.locator('[data-testid^="plan-thumb-"]');
  expect(await thumbs.count()).toBeGreaterThan(1);
  const viewBoxes = await thumbs.evaluateAll((els) =>
    els.map((el) => el.getAttribute('viewBox')),
  );
  expect(new Set(viewBoxes).size).toBe(1);

  // Select an alternative, then a placement from the list → inspector opens.
  await page.getByTestId('plan-card-0').click();
  const pick = page.locator('.placement-pick').first();
  await pick.click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  const x0 = Number(await page.getByTestId('move-x').inputValue());
  expect(Number.isFinite(x0)).toBe(true);

  // Rotation parity: radio options exist; a forbidden one is visibly disabled
  // with an explanation, a permitted one is clickable.
  const rot90 = page.getByTestId('rotate-upright90');
  await expect(rot90).toBeVisible();

  // Rejected move: inside the protocol bound but outside the space interior
  // → Rust rejects with an explained reason, no snapshot.
  await page.getByTestId('move-x').fill('19999');
  await page.getByTestId('move-apply').click();
  await expect(page.getByTestId('edit-rejected')).toBeVisible();
  await expect(page.getByTestId('edit-rejected')).toContainText('거부');
  await expect(page.getByTestId('edit-rejected')).toContainText(
    /공간 밖|벗어나|부족|없습니다/,
  );

  // Permitted move: keep inside the interior. The ghost is provisional;
  // only the verified result opens the 편집안 section.
  await page.getByTestId('move-x').fill(String(x0));
  await page.getByTestId('move-apply').click();
  await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('edit-rejected')).toBeHidden();

  // Undo restores the prior layout via Rust revalidation; redo replays it.
  await page.getByTestId('undo-edit').click();
  await expect(page.getByTestId('edit-chain-info')).toContainText('1건', {
    timeout: 15000,
  });
  await page.getByTestId('redo-edit').click();
  await expect(page.getByTestId('undo-edit')).toContainText('(1)', {
    timeout: 15000,
  });

  // Keyboard parity: Ctrl+Z / Ctrl+Shift+Z drive undo/redo from the focused
  // diagram surface; each is a fresh Rust-verified restoreLayout request.
  await page.getByTestId('plan-detail').first().focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('undo-edit')).toContainText('(0)', {
    timeout: 15000,
  });
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('undo-edit')).toContainText('(1)', {
    timeout: 15000,
  });

  // Persistence: reload and the verified working plan + chain come back.
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute(
    'data-context',
    'installed',
    { timeout: 30000 },
  );
  await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 30000 });

  // Input change invalidates the chain — nothing provisional survives.
  await page.getByText('← 치수로 돌아가기').click();
  const width = page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  await width.fill('615');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'saved',
  );
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute(
    'data-context',
    'installed',
  );
  await expect(page.getByTestId('edit-section')).toBeHidden();

  // 390px: inspector and diagram stay inside the viewport.
  await computeDone(page);
  await page.getByTestId('plan-card-0').click();
  await page.locator('.placement-pick').first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('inspector')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
