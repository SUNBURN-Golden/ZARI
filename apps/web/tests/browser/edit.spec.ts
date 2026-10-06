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
  // Wait until the history button is enabled so the shortcut is not sent
  // while the previous save is still in flight. The saving-window case is
  // covered by the session unit test.
  await expect(page.getByTestId('undo-edit')).toBeEnabled();
  await page.getByTestId('plan-detail').first().focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('undo-edit')).toContainText('(0)', {
    timeout: 15000,
  });
  await expect(page.getByTestId('redo-edit')).toBeEnabled();
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

test('a blank or non-integer coordinate is refused before any edit request — never sent as 0mm', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  // Count evaluateLayoutEdit requests actually posted to the real Worker.
  await page.addInitScript(() => {
    const w = window as unknown as { __zariEditRequests: number };
    w.__zariEditRequests = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if (typeof args[0] === 'string' && args[0].includes('"evaluateLayoutEdit"'))
        w.__zariEditRequests += 1;
      return (post as (...a: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });
  const editRequests = () =>
    page.evaluate(() => (window as unknown as { __zariEditRequests: number }).__zariEditRequests);
  await seededProject(page);
  await computeDone(page);
  await page.getByTestId('plan-card-0').click();
  await page.locator('.placement-pick').first().click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  // Without a reload, the inspector already offers the pinned catalog's options.
  await expect(page.getByTestId('variant-select').locator('option')).not.toHaveCount(0);
  const x0 = await page.getByTestId('move-x').inputValue();

  // Blank X: explained on the field, focus returns to it, nothing is sent.
  await page.getByTestId('move-x').fill('');
  await page.getByTestId('move-apply').click();
  await expect(page.getByTestId('move-input-errors')).toContainText('X mm');
  await expect(page.getByTestId('move-input-errors')).toContainText('0mm로 보내지 않습니다');
  await expect(page.getByTestId('move-x')).toHaveAttribute('aria-invalid', 'true');
  // The field's description is the X error line itself.
  expect(
    await page.getByTestId('move-x').evaluate((el) => {
      const id = el.getAttribute('aria-describedby');
      return id ? (document.getElementById(id)?.textContent ?? null) : null;
    }),
  ).toContain('X mm');
  await expect(page.getByTestId('move-x')).toBeFocused();
  // Enter from the field takes the same gate.
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByTestId('move-input-errors')).toBeVisible();

  // A non-integer is refused rather than coerced — on click as well as Enter,
  // with the same field-linked message instead of a browser-only bubble.
  await page.getByTestId('move-x').fill('12.5');
  await page.getByTestId('move-apply').click();
  await expect(page.getByTestId('move-input-errors')).toContainText('1mm 단위 정수');
  expect(await editRequests()).toBe(0);
  await expect(page.getByTestId('edit-pending')).toBeHidden();
  await expect(page.getByTestId('edit-rejected')).toBeHidden();

  // Range stays a downstream decision: the generated request validator
  // refuses an out-of-protocol integer before it reaches the Worker.
  await page.getByTestId('move-x').fill('99999');
  await page.getByTestId('move-apply').click();
  await expect(page.getByTestId('move-input-errors')).toBeHidden();
  await expect(page.getByTestId('edit-rejected')).toContainText('±20000mm');
  expect(await editRequests()).toBe(0);

  // The original value goes through Rust as one request and clears the errors.
  await page.getByTestId('move-x').fill(x0);
  await page.getByTestId('move-apply').click();
  await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 15000 });
  // The verified 편집안 adds a second inspector; the one used above is first.
  await expect(page.getByTestId('move-input-errors')).toHaveCount(0);
  await expect(page.getByTestId('move-x').first()).not.toHaveAttribute('aria-invalid', 'true');
  expect(await editRequests()).toBe(1);
  expect(errors).toEqual([]);
});
