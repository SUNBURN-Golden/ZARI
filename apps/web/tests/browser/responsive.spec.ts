import { test, expect, type Page } from '@playwright/test';

/**
 * ZARI-010 responsive/interaction matrix on the real built app: declared
 * widths 320/390/768/1280/1440, 200% CSS zoom, forced-colors emulation, and
 * reduced-motion on/off. Assertions are behavioural — no horizontal
 * overflow, primary actions reachable, documented token contracts — not
 * screenshots. Baselines remain draft and are not touched here.
 */

const VIEWPORTS = [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 1000 },
];

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.body.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

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

for (const viewport of VIEWPORTS) {
  test(`layout ${viewport.width}px: list, editor, plan stay inside the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByTestId('create-project')).toBeVisible();
    await noHorizontalOverflow(page);

    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('worker-state')).toHaveText('ready');
    await expect(page.getByTestId('commit-input')).toBeVisible();
    await noHorizontalOverflow(page);

    await page.getByTestId('fill-sample').click();
    await page.getByTestId('commit-input').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute(
      'data-save-state',
      'saved',
    );
    await noHorizontalOverflow(page);

    await page.getByTestId('goto-plan').click();
    await expect(page.getByTestId('plan-context')).toHaveAttribute(
      'data-context',
      'installed',
    );
    await expect(page.getByTestId('compute-plan')).toBeVisible();
    await noHorizontalOverflow(page);
  });
}

test('computed plan results stay inside 390px and 1440px', async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await seededProject(page);
    await page.getByTestId('compute-plan').click();
    await expect(page.getByTestId('search-status')).toHaveAttribute(
      'data-search',
      'done',
      { timeout: 60000 },
    );
    await noHorizontalOverflow(page);
    // The plan workspace heading anchors the results region.
    await expect(page.locator('#plan-title')).toBeVisible();
  }
});

test('200% CSS zoom keeps critical flows reachable without horizontal scroll', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await expect(page.getByTestId('create-project')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await noHorizontalOverflow(page);
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'saved',
  );
  await noHorizontalOverflow(page);
});

test.describe('reduced-motion both ways', () => {
  test('reduce zeroes motion tokens; nothing animates business state', async ({
    page,
  }) => {
    await page.goto('/');
    const motion = await page.evaluate(() => ({
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      fast: getComputedStyle(document.documentElement)
        .getPropertyValue('--zari-duration-fast')
        .trim(),
      panel: getComputedStyle(document.documentElement)
        .getPropertyValue('--zari-duration-panel')
        .trim(),
    }));
    expect(motion.matches).toBe(true);
    // Engines serialize zero time as 0ms or 0s; both satisfy the contract.
    expect(motion.fast).toMatch(/^0(ms|s)$/);
    expect(motion.panel).toMatch(/^0(ms|s)$/);
  });

  test('no-preference restores motion tokens', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto('/');
    const motion = await page.evaluate(() => ({
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      fast: getComputedStyle(document.documentElement)
        .getPropertyValue('--zari-duration-fast')
        .trim(),
    }));
    expect(motion.matches).toBe(false);
    expect(motion.fast).not.toMatch(/^0(ms|s)$/);
    await context.close();
  });
});

test('forced-colors active keeps controls legible and focus visible', async ({
  browser,
}) => {
  const context = await browser.newContext({ forcedColors: 'active' });
  const page = await context.newPage();
  await page.goto('/');
  const emulated = await page.evaluate(
    () => matchMedia('(forced-colors: active)').matches,
  );
  expect(emulated).toBe(true);
  await expect(page.getByTestId('create-project')).toBeVisible();
  // Keyboard focus must remain visible in forced-colors (Highlight outline).
  await page.getByTestId('create-project').focus();
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(outline.outlineStyle).not.toBe('none');
  await context.close();
});
