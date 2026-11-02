import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { EASY_KEY } from '../../src/features/easy/state';

const shots = '/workspace/shots/zari-easy';
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function dimensions(page: Page, kind: string, values: string[]) {
  for (const [i, label] of ['가로', '세로', '높이'].entries()) {
    await page.getByRole('textbox', { name: `${kind} ${label}`, exact: true }).fill(values[i]!);
  }
}
async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
}
async function itemAndRoom(page: Page) {
  await dimensions(page, '물건', ['30', '20', '40']);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '거실', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
}
async function metrics(page: Page) {
  return page.getByTestId('easy-mode').evaluate((root) => {
    const visible = (el: Element) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
    const nodes: { text: string; px: number }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || !visible(el) || el.closest('svg, details:not([open]) > :not(summary)')) continue;
      const range = document.createRange(); range.selectNode(node);
      if (!range.getBoundingClientRect().width) continue;
      nodes.push({ text: node.textContent.trim(), px: parseFloat(getComputedStyle(el).fontSize) });
    }
    const buttons = [...root.querySelectorAll('button')].filter(visible).map((el) => ({ text: el.textContent, height: el.getBoundingClientRect().height }));
    const primary = [...root.querySelectorAll('.easy-primary')].filter(visible);
    const action = root.querySelector('.easy-actions')!;
    return {
      minTextPx: Math.min(...nodes.map((n) => n.px)),
      minButtonPx: Math.min(...buttons.map((n) => n.height)),
      primaryCount: primary.length,
      overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      fixedActions: getComputedStyle(action).position === 'fixed',
      actionBottom: action.getBoundingClientRect().bottom,
      viewportHeight: innerHeight,
      wordBreak: getComputedStyle(root).wordBreak,
      bodyText: (root as HTMLElement).innerText,
      resultTextPx: root.querySelector('h2') ? parseFloat(getComputedStyle(root.querySelector('h2')!).fontSize) : null,
      smallText: nodes.filter((n) => n.px < 18),
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`easy journey accessibility and screenshots ${viewport.width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/');
      await expect(page.getByTestId('easy-mode')).toBeVisible();
      const records: unknown[] = [];
      async function verify(name: string) {
        const m = await metrics(page);
        expect(m.smallText).toEqual([]);
        expect(m.minButtonPx).toBeGreaterThanOrEqual(48);
        expect(m.primaryCount).toBe(1);
        expect(m.overflowPx).toBe(0);
        expect(m.fixedActions).toBe(true);
        expect(m.actionBottom).toBeCloseTo(m.viewportHeight, 2);
        expect(m.wordBreak).toBe('keep-all');
        expect(m.bodyText).not.toMatch(/평면|입체|Pareto|후보|인스펙터|WASM|CAD|스냅샷|PlanSnapshot/i);
        if (m.resultTextPx) expect(m.resultTextPx).toBeGreaterThanOrEqual(32);
        const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(a11y.violations).toEqual([]);
        records.push({ screen: name, ...m, axeViolations: a11y.violations.length });
        if (info.project.name === 'chromium') {
          await mkdir(shots, { recursive: true });
          await page.screenshot({ path: `${shots}/${viewport.width}x${viewport.height}-${theme}-${name}.png`, fullPage: false });
        }
      }
      await verify('welcome');
      await page.getByRole('button', { name: '시작하기', exact: true }).click();
      await verify('item');
      await dimensions(page, '물건', ['30', '20', '40']);
      await page.getByRole('button', { name: '다음', exact: true }).click();
      await verify('room');
      await page.getByRole('button', { name: '거실', exact: true }).click();
      await page.getByRole('button', { name: '다음', exact: true }).click();
      await verify('space');
      await dimensions(page, '빈 공간', ['40', '30', '50']);
      await page.getByRole('button', { name: '결과 보기', exact: true }).click();
      await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
      await verify('result-fits');
      await page.getByText('자세히 보기', { exact: true }).click();
      await verify('result-details');
      await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
      await dimensions(page, '빈 공간', ['32', '30', '50']);
      await page.getByRole('button', { name: '결과 보기', exact: true }).click();
      await expect(page.getByTestId('easy-result-title')).toHaveText('아슬아슬해요');
      await verify('result-tight');
      await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
      await dimensions(page, '빈 공간', ['27', '30', '50']);
      await page.getByRole('button', { name: '결과 보기', exact: true }).click();
      await expect(page.getByTestId('easy-result-title')).toHaveText('안 들어가요');
      await expect(page.getByText('가로 3cm 모자라요', { exact: true })).toBeVisible();
      await verify('result-fails');
      if (info.project.name === 'chromium') await writeFile(`${shots}/metrics-${viewport.width}-${theme}.json`, JSON.stringify({ viewport, theme, status: 'draft', records }, null, 2));
    });
  }
}

test('easy draft restore, validation, soft unit confirmation, result refresh and mode memory', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('가로·세로·높이를 모두 적어 주세요.');
  await itemAndRoom(page);
  await dimensions(page, '빈 공간', ['5', '2000', '50']);
  await expect(page.getByLabel('cm로 잰 값이 맞아요')).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByRole('alert')).toHaveText('혹시 mm로 재셨나요?');
  await page.getByLabel('cm로 잰 값이 맞아요').check();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByTestId('easy-result-title')).toHaveText('치수를 확인해 주세요');
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await dimensions(page, '빈 공간', ['40', '30', '50']);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '빈 공간 가로' })).toHaveValue('40');
  await expect(page.getByText('3/4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
  await page.reload();
  await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
  await page.getByRole('button', { name: '다른 물건 해보기' }).click();
  await expect(page.getByRole('textbox', { name: '물건 가로' })).toHaveValue('');
  await page.getByRole('link', { name: '전문가 모드', exact: true }).click();
  await expect(page.getByTestId('easy-mode')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByTestId('easy-mode')).toHaveCount(0);
  await page.getByRole('link', { name: '쉬운 모드', exact: true }).click();
  await page.goto('/');
  await expect(page.getByTestId('easy-mode')).toBeVisible();
});

test('corrupt or unavailable local storage stays usable; keyboard focus is visible', async ({ page }) => {
  await page.addInitScript(({ key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, '{invalid'); }, { key: EASY_KEY });
  await page.goto('/');
  await page.getByRole('button', { name: '시작하기', exact: true }).focus();
  await page.keyboard.press('Enter');
  async function expectHeadingFocus(name: string) {
    const heading = page.getByRole('heading', { name, exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS('outline-style', 'solid');
    expect(await heading.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    expect(await heading.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThan(0);
    await expect(heading).not.toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
  }
  async function activate(name: string) {
    await page.getByRole('button', { name, exact: true }).focus();
    await page.keyboard.press('Enter');
  }
  await expectHeadingFocus('무엇을 넣을까요?');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(focus).toBe('solid');
  await dimensions(page, '물건', ['30', '20', '40']);
  await activate('다음');
  await expectHeadingFocus('어디에 둘까요?');
  await activate('거실');
  await activate('다음');
  await expectHeadingFocus('빈 공간을 재 주세요');
  await dimensions(page, '빈 공간', ['40', '30', '50']);
  await activate('결과 보기');
  await expectHeadingFocus('결과');
  await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
  await expectHeadingFocus('결과');
  for (const name of ['빈 공간을 재 주세요', '어디에 둘까요?', '무엇을 넣을까요?']) {
    await activate('뒤로가기');
    await expectHeadingFocus(name);
  }
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('저장하지 못했어요');
  await expect(page.getByRole('textbox', { name: '물건 가로' })).toBeVisible();
});

test('worker failure never becomes a fit and preserves the input', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('easyWorker')) queueMicrotask(() => this.dispatchEvent(new ErrorEvent('error')));
      }
    };
  });
  await start(page);
  await itemAndRoom(page);
  await dimensions(page, '빈 공간', ['40', '30', '50']);
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByRole('alert')).toContainText('계산을 마치지 못했어요');
  await expect(page.getByTestId('easy-result-title')).toHaveCount(0);
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page.getByRole('textbox', { name: '빈 공간 가로' })).toHaveValue('40');
});

test('example is labelled, room choice is required, and home clears the draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '예제 보기', exact: true }).click();
  await expect(page.getByText('연습용 예제예요. 실제 물건의 치수는 직접 재 주세요.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '물건 가로' })).toHaveValue('30');
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible();
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '주방', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
  await page.getByRole('button', { name: '다른 물건 해보기' }).click();
  await expect(page.getByText('연습용 예제예요. 실제 물건의 치수는 직접 재 주세요.')).toBeVisible();
  await dimensions(page, '물건', ['30', '20', '40']);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
  await page.getByRole('button', { name: '처음으로' }).click();
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByRole('textbox', { name: '물건 가로' })).toHaveValue('');
  await dimensions(page, '물건', ['30', '20', '40']);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('둘 곳을 골라 주세요.');
});

test('easy fit native and actual Worker WASM parity for all size boundaries', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event) => {
          if (event.data?.json) Object.assign(window, { __easyResult: JSON.parse(event.data.json) });
        });
      }
    };
  });
  const inputs = [
    { item: ['30', '20', '40'], space: ['33', '23', '43'] },
    { item: ['30', '20', '40'], space: ['32', '23', '43'] },
    { item: ['30', '20', '40'], space: ['30', '20', '40'] },
    { item: ['30', '20', '40'], space: ['27', '23', '43'] },
    { item: ['30', '20', '40'], space: ['33', '', '43'] },
    { item: ['30', '20', '40'], space: ['33', '2000', '43'] },
    { item: ['30', '20', '40'], space: ['33', '20.01', '43'] },
    { item: ['30.1', '20', '40'], space: ['32', '23', '43'] },
  ];
  const native = JSON.parse(execFileSync('cargo', ['run', '-q', '-p', 'zari-core', '--locked', '--example', 'easy_fit'], { input: JSON.stringify(inputs), encoding: 'utf8' }));
  for (const [index, input] of inputs.entries()) {
    await page.goto('/#/easy');
    await page.evaluate(({ key, input }) => localStorage.setItem(key, JSON.stringify({ ...input, version: 1, step: 4, name: '', room: '거실', example: false })), { key: EASY_KEY, input });
    await page.reload();
    await expect(page.getByTestId('easy-result-title')).toBeVisible();
    const expected = native[index];
    expect(await page.evaluate(() => (window as unknown as { __easyResult: unknown }).__easyResult)).toEqual(expected);
    for (const axis of expected.axes) await expect(page.getByText(axis.message, { exact: true })).toBeVisible();
    const titles: Record<string, string> = { fits: '들어가요', tight: '아슬아슬해요', doesNotFit: '안 들어가요', unknown: '치수를 확인해 주세요' };
    await expect(page.getByTestId('easy-result-title')).toHaveText(titles[expected.status]!);
  }
});
