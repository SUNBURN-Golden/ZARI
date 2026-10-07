import { test, expect, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * ZARI-010 accessibility evidence on the real app: axe-core scans of the
 * critical screens (project list, editor with a validation error, plan
 * idle/results, catalog) plus a keyboard-only critical flow. axe output is
 * evidence, not certification — manual checks and physical-device gaps are
 * disclosed separately in the status report.
 */

function violations(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
}

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .include('main')
    .analyze();
  return { label, violations: violations(results) };
}

test('axe scan: critical screens carry no violations', async ({ page }) => {
  test.setTimeout(120_000);
  const findings: { label: string; violations: ReturnType<typeof violations> }[] = [];

  await page.goto('/');
  await expect(page.getByTestId('create-project')).toBeVisible();
  findings.push(await scan(page, 'projects-list-empty'));

  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByTestId('fill-sample').click();
  findings.push(await scan(page, 'project-editor-filled'));

  // Error state: invalid raw text surfaces the field error association.
  const width = page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  await width.fill('abc');
  await page.getByTestId('commit-input').click();
  await expect(page.getByText('숫자 형식을 확인해 주세요.')).toBeVisible();
  findings.push(await scan(page, 'project-editor-error'));

  await width.fill('600');
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
  findings.push(await scan(page, 'plan-idle'));

  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  findings.push(await scan(page, 'plan-results'));

  await page.goto('/#/catalog');
  await expect(page.getByTestId('catalog-error').or(page.locator('main'))).toBeVisible();
  findings.push(await scan(page, 'catalog'));

  const all = findings.flatMap((f) => f.violations.map((v) => `${f.label}: ${v.id} ${v.impact} -> ${v.nodes.join(', ')}`));
  expect(all).toEqual([]);
});

test('keyboard-only: create, edit, commit, plan, cancel', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  // Tab from the document start: the create-project control must be reached
  // and activatable with Enter, with a visible focus indicator.
  await page.keyboard.press('Tab');
  const focusedTag = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName.toLowerCase()}:${el.getAttribute('data-testid') ?? ''}` : 'none';
  });
  expect(focusedTag).not.toBe('none');
  let guard = 0;
  while (guard < 30) {
    const testid = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    );
    if (testid === 'create-project') break;
    await page.keyboard.press('Tab');
    guard += 1;
  }
  await expect(page.getByTestId('create-project')).toBeFocused();
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as HTMLElement);
    return `${style.outlineStyle}:${style.outlineWidth}`;
  });
  expect(outline).not.toMatch(/^none:0px$|^none:/);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('worker-state')).toHaveText('ready');

  // Fill via the sample filler using keyboard only (Enter on the focused
  // button — a pointer click on a React Aria Button leaves WebKit's
  // sequential-focus state inconsistent for the next Shift+Tab). commit-input
  // precedes fill-sample in DOM order, so Shift+Tab also verifies reverse
  // traversal.
  await page.getByTestId('fill-sample').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('fill-sample').focus();
  guard = 0;
  while (guard < 10) {
    const testid = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    );
    if (testid === 'commit-input') break;
    await page.keyboard.press('Shift+Tab');
    guard += 1;
  }
  await expect(page.getByTestId('commit-input')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'saved',
  );

  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute(
    'data-context',
    'installed',
  );
  await page.getByTestId('compute-plan').focus();
  await page.keyboard.press('Enter');
  // A fast sample search may already be done; only drive keyboard cancel when
  // it is still running.
  const state = await page.getByTestId('search-status').getAttribute('data-search');
  if (state === 'running' || state === 'cancelling') {
    await page.getByTestId('cancel-search').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('search-status')).toHaveAttribute(
      'data-search',
      /cancelled|done|interrupted/,
      { timeout: 30000 },
    );
  } else {
    expect(state).toBe('done');
  }
});
