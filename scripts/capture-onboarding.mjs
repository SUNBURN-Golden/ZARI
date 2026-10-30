import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';

const expect = baseExpect.configure({ timeout: 30000 });

// Run against an already built, local preview. Captures are review drafts.
const origin = process.argv[2];
if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || new URL(origin).port === '4173') {
  throw new Error('Pass a local preview origin using a free port other than 4173.');
}
const output = resolve(process.argv[3] ?? '/workspace/shots/zari-onboarding');
await mkdir(output, { recursive: true });
const files = execFileSync('git', ['ls-files', 'apps/web/src'], { encoding: 'utf8' }).trim().split('\n');
const hash = createHash('sha256');
for (const file of files) hash.update(file).update(await readFile(file));
const metrics = {
  status: 'draft',
  capturedAt: new Date().toISOString(),
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256: hash.digest('hex'),
  origin,
  browser: 'Chromium',
  definitions: {
    firstFoldCtaCount: 'Visible buttons, links, role=button elements and disclosure summaries intersecting the initial viewport; includes disabled controls and diagram controls. Background controls occluded by the coachmark are excluded.',
    firstFoldPrimaryCtaCount: 'Subset of firstFoldCtaCount carrying the button-primary class; total controls remain reported separately.',
    firstFoldInputCount: 'Visible text/number inputs and textareas intersecting the initial viewport; unit selects and strategy radios are counted separately.',
    defaultToolbarButtonCount: 'Visible buttons in the selected plan workspace toolbar with view options closed and no placement selected.',
    overflowPx: 'max(documentElement.scrollWidth, body.scrollWidth) - documentElement.clientWidth, clamped to zero.',
  },
  ctaBudgetException: {
    status: 'implementation draft; pending user visual review',
    primaryBudget: 'One or two visually primary actions per screen.',
    totalControlException: 'The 1–2 target does not cover all interactive controls: preserve the tested project/back navigation, explicit save/sample/plan actions and help disclosure, and independently selectable Rust comparison candidates with their condition disclosures. Export is moved below measurement help; strategy reference and search diagnosis follow candidate review. No controls or unknown facts are removed to meet a count.',
  },
  reviewScreenshots: [],
  captures: [],
};
const browser = await chromium.launch();
metrics.browserVersion = browser.version();
async function capture(page, screen, width, height, theme) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  const screenshot = `${screen}-${width}x${height}-${theme}-draft.png`;
  await page.screenshot({ path: join(output, screenshot), fullPage: false });
  const measured = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const visible = (el) => {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
      if (dialog && !dialog.contains(el)) return false;
      const closed = el.closest('details:not([open])');
      if (closed && el !== closed.querySelector(':scope > summary')) return false;
      const box = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && css.display !== 'none' && css.visibility !== 'hidden' &&
        box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    };
    const describe = (el) => ({ testId: el.getAttribute('data-testid'), text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 100) });
    const ctas = [...document.querySelectorAll('button,a[href],[role="button"],summary')].filter(visible);
    const inputs = [...document.querySelectorAll('input:not([type]),input[type="text"],input[type="number"],textarea')].filter(visible);
    const toolbarButtons = [...document.querySelectorAll('[data-testid="plan-workspace"] [role="toolbar"] button')]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    return {
      firstFoldCtaCount: ctas.length,
      firstFoldPrimaryCtaCount: ctas.filter((el) => el.classList.contains('button-primary')).length,
      firstFoldInputCount: inputs.length,
      firstFoldUnitSelectCount: [...document.querySelectorAll('select')].filter(visible).length,
      firstFoldRadioCount: [...document.querySelectorAll('input[type="radio"]')].filter(visible).length,
      defaultToolbarButtonCount: toolbarButtons.length,
      overflowPx: Math.max(0, Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth),
      ctas: ctas.map(describe),
      inputs: inputs.map((el) => ({ id: el.id, label: el.getAttribute('aria-label') })),
    };
  });
  expect(measured.overflowPx, `${screen}/${width}/${theme}`).toBe(0);
  expect(measured.firstFoldPrimaryCtaCount, `${screen}/${width}/${theme} primary budget`).toBeLessThanOrEqual(2);
  if (screen === 'plan') expect(measured.defaultToolbarButtonCount).toBe(4);
  metrics.captures.push({ screen, width, height, theme, screenshot, ...measured });
}
try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce', locale: 'ko-KR' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin);
      await expect(page.getByTestId('create-project')).toBeEnabled();
      await expect(page.getByTestId('journey-bar')).toBeVisible();
      await capture(page, 'home', width, height, theme);
      await page.getByTestId('create-project').click();
      await expect(page.getByTestId('worker-state')).toHaveText('ready');
      await expect(page.getByTestId('next-facts')).toHaveAttribute('data-next-facts-status', 'ready');
      await expect(page.getByTestId('measure-advanced')).toBeHidden();
      await capture(page, 'measure', width, height, theme);
      await page.getByTestId('fill-sample').click();
      await page.getByTestId('commit-input').click();
      await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
      await page.getByTestId('goto-plan').click();
      await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
      await page.getByTestId('compute-plan').click();
      await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', { timeout: 90000 });
      await expect(page.getByTestId('plan-summary')).toBeVisible();
      await expect(page.getByTestId('pareto-compare')).toHaveAttribute('data-state', 'ready');
      await expect(page.getByTestId('strategy-library')).toHaveAttribute('data-state', 'ready');
      await capture(page, 'plan', width, height, theme);
      await page.getByTestId('alternatives-list').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      const candidateScreenshot = `plan-candidates-${width}x${height}-${theme}-draft.png`;
      await page.screenshot({ path: join(output, candidateScreenshot), fullPage: false });
      metrics.reviewScreenshots.push({ screen: 'plan-candidates', width, height, theme, screenshot: candidateScreenshot, position: 'scrolled to candidate list; excluded from first-fold metrics' });
      expect(errors).toEqual([]);
      await context.close();
      const coaching = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce', locale: 'ko-KR' });
      const coachPage = await coaching.newPage();
      await coachPage.addInitScript(() => localStorage.setItem('zari-coachmark:force', '1'));
      await coachPage.goto(origin);
      await expect(coachPage.getByTestId('coachmark')).toBeVisible();
      await capture(coachPage, 'coachmark', width, height, theme);
      await coaching.close();
    }
  }
  await writeFile(join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(`Saved ${metrics.captures.length + metrics.reviewScreenshots.length} draft screenshots and metrics.json to ${output}`);
} finally {
  await browser.close();
}
