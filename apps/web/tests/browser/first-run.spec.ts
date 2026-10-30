import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openViewOptions } from './helpers/viewOptions';

async function forceCoach(page: Page) {
  await page.addInitScript(() => localStorage.setItem('zari-coachmark:force', '1'));
  await page.goto('/');
  await expect(page.getByTestId('coachmark')).toBeVisible();
}
async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(sizes.html).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport);
}
async function unobscured(page: Page, testId: string) {
  const target = page.getByTestId(testId);
  await target.scrollIntoViewIfNeeded();
  await target.focus();
  expect(await target.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top === element || element.contains(top);
  })).toBe(true);
}
test('forced coachmark traps focus, passes axe, remembers done and returns focus at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await forceCoach(page);
  const dialog = page.getByTestId('coachmark');
  await expect(dialog).toHaveAccessibleName('1. 공간 재기');
  expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  const axe = await new AxeBuilder({ page }).include('[data-testid="coachmark"]').analyze();
  expect(axe.violations).toEqual([]);
  await noOverflow(page);
  expect(await dialog.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.getByTestId('coachmark-next').click();
  await page.getByTestId('coachmark-next').click();
  await expect(dialog).toHaveAttribute('data-card', '3');
  await page.getByTestId('coachmark-next').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('create-project')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('zari-coachmark:v1'))).toBe('done');
  await page.reload();
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await expect(dialog).toBeHidden();
});
test('Escape and skip persist, and a failed storage write still dismisses', async ({ page }) => {
  await forceCoach(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('coachmark')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('zari-coachmark:v1'))).toBe('skipped');
  await page.evaluate(() => localStorage.removeItem('zari-coachmark:v1'));
  await page.reload();
  await expect(page.getByTestId('coachmark')).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('storage unavailable'); }; });
  await page.getByTestId('coachmark-skip').click();
  await expect(page.getByTestId('coachmark')).toBeHidden();
  await expect(page.getByTestId('create-project')).toBeFocused();
});
test('unavailable storage skips coaching without interrupting home', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('storage unavailable'); }; });
  await page.goto('/');
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await expect(page.getByTestId('coachmark')).toBeHidden();
});
test('measurement disclosures reveal focused fields, preserve descriptions and pass axe open', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('measure-advanced')).toBeHidden();
  await expect(page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true })).toHaveAccessibleDescription(/오차 미확인/);
  await expect(page.getByTestId('dev-info')).not.toHaveAttribute('open');
  await unobscured(page, 'onboarding-goto-next');
  const widthInput = page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  await widthInput.click();
  await expect(widthInput).toBeFocused();
  expect(await widthInput.evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; })).toBe(true);
  // At 200% CSS zoom the container is compact even when the viewport is desktop sized.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await widthInput.evaluate((el) => { el.scrollIntoView({ block: 'center' }); (el as HTMLElement).focus(); });
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector('.app-header')!.getBoundingClientRect();
    const bar = document.querySelector('.journey-bar')!.getBoundingClientRect();
    return Math.abs(header.bottom - bar.top);
  })).toBeLessThanOrEqual(2);
  await widthInput.evaluate((el) => { el.scrollIntoView({ block: 'center' }); (el as HTMLElement).focus(); });
  expect(await widthInput.evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; })).toBe(true);
  await noOverflow(page);
  await page.evaluate(() => { document.body.style.zoom = ''; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('onboarding-field-items.item-a.dimensions.envelope.width').click();
  await expect(page.getByTestId('measure-advanced')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '물건 A 폭', exact: true })).toBeFocused();
  await page.getByTestId('dev-info').locator('summary').click();
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await page.getByTestId('measure-advanced-toggle').click();
  await page.getByTestId('fill-sample').click();
  await expect(page.getByTestId('measure-advanced')).toBeVisible();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('measure-advanced')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: `/workspace/shots/zari-onboarding/measure-390-${testInfo.project.name}-draft.png`, fullPage: true });
  await page.getByTestId('goto-plan').click();
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', { timeout: 90_000 });
  await expect(page.getByTestId('plan-card-0')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('plan-summary')).toBeVisible();
  const workspace = page.getByTestId('plan-workspace');
  await expect(workspace.getByTestId('view-front')).toBeHidden();
  await openViewOptions(workspace);
  await workspace.getByTestId('zoom-in').focus();
  await page.keyboard.press('Escape');
  await expect(workspace.getByTestId('view-options')).toBeHidden();
  await expect(workspace.getByTestId('view-options-toggle')).toBeFocused();
  await openViewOptions(workspace);
  for (const details of await page.locator('.dev-info').all()) await details.locator('summary').click();
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  const ids = await page.locator('[id]').evaluateAll((els) => els.map((el) => el.id));
  expect(new Set(ids).size).toBe(ids.length);
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
  }
  await page.getByTestId('plan-summary').evaluate((el) => { el.textContent += ' · 수량 미확인 4294967295 · 아주 긴 한국어 물건 이름과 추가 확인이 필요한 내용'; });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `/workspace/shots/zari-onboarding/plan-1440-${testInfo.project.name}-draft.png`, fullPage: true });
});

test('manual three-step entry keeps confirmed space progress and navigates to plan in one press', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bar = page.getByTestId('journey-bar');
  const describedBy = await bar.getAttribute('aria-describedby');
  expect(describedBy).toBe('create-project');
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveCount(1);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  for (const [name, value] of [['공간 안쪽 폭', '600'], ['공간 안쪽 깊이', '450'], ['공간 안쪽 높이', '1800']] as const)
    await page.getByRole('textbox', { name, exact: true }).fill(value);
  await page.getByTestId('onboarding-goto-next').click();
  await expect(page.getByTestId('commit-input')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(bar).toHaveAttribute('data-current', 'items');
  await page.getByTestId('onboarding-goto-next').click();
  const itemWidth = page.getByRole('textbox', { name: '물건 A 폭', exact: true });
  await expect(itemWidth).toBeFocused();
  for (const [name, value] of [['물건 A 폭', '300'], ['물건 A 깊이', '200'], ['물건 A 높이', '250']] as const) {
    await page.getByRole('textbox', { name, exact: true }).fill(value);
    await expect(bar).toHaveAttribute('data-current', 'items');
    await expect(page.getByTestId('journey-step-measure')).toHaveAttribute('data-state', 'done');
  }
  await page.getByTestId('commit-input').click();
  await expect(bar).toHaveAttribute('data-current', 'plan');
  await page.getByTestId('onboarding-goto-next').click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByTestId('compute-plan')).toBeVisible();
  await noOverflow(page);
});

test('an accepted candidate from an older input directs the journey to a real compute control', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByTestId('create-example').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done');
  await page.getByTestId('accept-plan').click();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  await page.getByRole('link', { name: '← 치수로 돌아가기' }).click();
  await page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true }).fill('610');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await page.getByTestId('journey-focus-next').click();
  await expect(page.getByTestId('compute-plan')).toBeFocused();
});
