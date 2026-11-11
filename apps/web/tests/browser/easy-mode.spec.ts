import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { EASY_KEY } from '../../src/features/easy/state';

const shots = process.env.ZARI_SHOTS_DIR ?? 'test-results/shots/zari-easy';
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function dimensions(page: Page, kind: string, values: string[]) {
  for (const [i, label] of ['가로', '세로', '높이'].entries()) {
    await page.getByRole('textbox', { name: `${kind} ${label}`, exact: true }).fill(values[i]!);
  }
}
async function start(page: Page) {
  await page.goto('/#/easy');
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
}
async function itemAndRoom(page: Page) {
  await dimensions(page, '물건', ['30', '20', '40']);
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await page.getByRole('button', { name: '거실', exact: true }).click();
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
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
      await page.goto('/#/easy');
      await expect(page.getByTestId('easy-mode')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('물건이 들어갈지 함께 확인해요.');
      await expect(page.getByRole('heading', { level: 1 })).not.toBeFocused();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('outline-style', 'none');
      for (const name of ['예제 보기', '전문가 모드']) {
        const link = page.getByRole('link', { name, exact: true });
        await expect(link).toHaveCSS('display', 'inline-flex');
        await expect(link).toHaveCSS('align-items', 'center');
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(48);
        expect(await link.evaluate((el) => parseFloat(getComputedStyle(el).paddingInlineStart))).toBeGreaterThan(0);
        // Hit the padded edge, not just the text glyphs.
        await expect(link).toBeInViewport();
        expect(await link.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return document.elementFromPoint(rect.x + 1, rect.y + rect.height / 2) === el;
        })).toBe(true);
      }
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
        if (viewport.width === 1440) {
          const main = page.getByRole('main');
          await expect(main).toHaveCSS('text-align', 'center');
          const box = await main.boundingBox();
          expect(box!.x + box!.width / 2).toBeCloseTo(viewport.width / 2, 1);
          const titleBox = await page.getByRole('heading', { level: 1 }).boundingBox();
          expect(titleBox!.x + titleBox!.width / 2).toBeCloseTo(viewport.width / 2, 1);
        }
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
      await expect(page.getByRole('searchbox', { name: '어떤 물건을 놓으시나요? (예: 수납함, 전자레인지, 책장)', exact: true })).toBeVisible();
      await expect(page.getByText('물건의 가장 튀어나온 곳을 기준으로 재 주세요.', { exact: true })).toBeVisible();
      await expect(page.getByLabel('전체 4단계 중 1번째', { exact: true })).toHaveText('1/4');
      await verify('item');
      await dimensions(page, '물건', ['30', '20', '40']);
      await page.getByRole('button', { name: '다음으로', exact: true }).click();
      await verify('room');
      await page.getByRole('button', { name: '거실', exact: true }).click();
      await page.getByRole('button', { name: '다음으로', exact: true }).click();
      await expect(page.getByText('더 확인하기', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('img', { name: '안쪽을 기준으로 가로(왼쪽~오른쪽), 세로(앞~뒤), 높이(아래~위)를 재 주세요.', exact: true })).toBeVisible();
      await expect(page.getByText('놓을 곳의 안쪽을 재 주세요. 세로는 앞뒤 깊이예요.', { exact: true })).toBeVisible();
      await verify('space');
      await dimensions(page, '놓을 곳', ['40', '30', '50']);
      await page.getByRole('button', { name: '결과 보기', exact: true }).click();
      await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
      await expect(page.locator('[data-copy-todo]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '다른 물건 해보기', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '처음으로', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '다른 물건도 해보기', exact: true })).toHaveCount(0);
      await expect(page.locator('.easy-result .easy-note')).toHaveText('문이 잘 열리는지, 넣고 빼기 편한지는 따로 살펴봐 주세요.');
      await expect(page.getByText('문 열릴 자리와 여유 공간도 꼭 따로 살펴봐 주세요.', { exact: true })).toHaveCount(0);
      const detailScope = page.getByText('문 열릴 자리나 손이 닿는지는 빼고, 딱 물건 크기만 맞춰 봤어요.', { exact: true });
      await expect(detailScope).toBeHidden();
      await expect(page.locator('.easy-result')).toContainText('적어 주신 크기대로만 맞춰 본 결과예요.');
      await verify('result-fits');
      await page.getByText('자세히 보기', { exact: true }).click();
      await expect(detailScope).toBeVisible();
      await expect(page.locator('details')).toContainText('적어 주신 방향 그대로 맞춰 봤어요. 돌려서 넣는 건 빼고 봤어요.');
      await expect(page.getByRole('table', { name: '크기 비교(cm)', exact: true })).toBeVisible();
      await verify('result-details');
      await page.getByRole('button', { name: '이전으로', exact: true }).click();
      await dimensions(page, '놓을 곳', ['32', '30', '50']);
      await page.getByRole('button', { name: '결과 보기', exact: true }).click();
      await expect(page.getByTestId('easy-result-title')).toHaveText('아슬아슬해요');
      await verify('result-tight');
      await page.getByRole('button', { name: '이전으로', exact: true }).click();
      await dimensions(page, '놓을 곳', ['27', '30', '50']);
      await page.getByRole('button', { name: '결과 보기', exact: true }).click();
      await expect(page.getByTestId('easy-result-title')).toHaveText('안 들어가요');
      const shortage = page.getByText('가로 3cm 모자라요', { exact: true });
      await expect(shortage).toBeVisible();
      await expect(shortage).toHaveCSS('font-weight', '700');
      const accent = await page.locator('.easy-primary').evaluate((el) => getComputedStyle(el).backgroundColor);
      await expect(shortage).toHaveCSS('color', accent);
      await verify('result-fails');
      if (info.project.name === 'chromium') await writeFile(`${shots}/metrics-${viewport.width}-${theme}.json`, JSON.stringify({ viewport, theme, status: 'draft', records }, null, 2));
    });
  }
}

test('easy draft restore, validation, soft unit confirmation, result refresh and mode memory', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('가로·세로·높이를 모두 적어 주세요.');
  await itemAndRoom(page);
  await dimensions(page, '놓을 곳', ['5', '2000', '50']);
  await expect(page.locator('#easy-unit-hint')).toHaveText('혹시 mm로 재셨나요?');
  await expect(page.getByText('cm로 잰 숫자가 맞는지 확인해 주세요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '네, cm가 맞아요', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByRole('alert')).toHaveText('혹시 mm로 재셨나요?');
  await page.getByRole('button', { name: '네, cm가 맞아요', exact: true }).click();
  await expect(page.getByRole('button', { name: '네, cm가 맞아요', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByTestId('easy-result-title')).toHaveText('치수를 확인해 주세요');
  await page.getByRole('button', { name: '이전으로' }).click();
  await dimensions(page, '놓을 곳', ['40', '30', '50']);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '놓을 곳 가로' })).toHaveValue('40');
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
  await expect(page.getByTestId('create-project')).toBeVisible();
  await page.getByRole('link', { name: '쉬운 모드', exact: true }).click();
  await expect(page.getByTestId('easy-mode')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('빈 공간에 맞는 수납함을 찾아요');
  await expect(page.getByRole('link', { name: '물건 크기 비교' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '전문가 모드' })).toHaveCount(0);
  await page.goto('/#/easy');
  await expect(page.getByTestId('easy-mode')).toBeVisible();
});

test('corrupt or unavailable local storage stays usable; keyboard focus is visible', async ({ page }) => {
  await page.addInitScript(({ key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, '{invalid'); }, { key: EASY_KEY });
  await page.goto('/#/easy');
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
  await activate('다음으로');
  await expectHeadingFocus('어디에 둘까요?');
  await activate('거실');
  await activate('다음으로');
  await expectHeadingFocus('빈 공간을 재 주세요');
  await dimensions(page, '놓을 곳', ['40', '30', '50']);
  await activate('결과 보기');
  await expectHeadingFocus('결과');
  await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
  await expectHeadingFocus('결과');
  for (const name of ['빈 공간을 재 주세요', '어디에 둘까요?', '무엇을 넣을까요?']) {
    await activate('이전으로');
    await expectHeadingFocus(name);
  }
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText('기록을 남기지 못했어요. 화면을 닫기 전에 숫자를 따로 적어 두세요.');
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
  await dimensions(page, '놓을 곳', ['40', '30', '50']);
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByRole('alert')).toHaveText('결과를 불러오지 못했어요. 이전으로 가서 다시 해 주세요.');
  await expect(page.getByTestId('easy-result-title')).toHaveCount(0);
  await page.getByRole('button', { name: '이전으로' }).click();
  await expect(page.getByRole('textbox', { name: '놓을 곳 가로' })).toHaveValue('40');
});

test('example is labelled, room choice is required, and home clears the draft', async ({ page }) => {
  await page.goto('/#/easy');
  await page.getByRole('link', { name: '예제 보기', exact: true }).click();
  await expect(page.getByText('연습 화면이에요. 내 물건은 직접 재서 적어 주세요.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '물건 가로' })).toHaveValue('30');
  await page.getByRole('button', { name: '이전으로' }).click();
  await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible();
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await page.getByRole('button', { name: '주방', exact: true }).click();
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
  await page.getByRole('button', { name: '다른 물건 해보기' }).click();
  await expect(page.getByText('연습 화면이에요. 내 물건은 직접 재서 적어 주세요.')).toBeVisible();
  await dimensions(page, '물건', ['30', '20', '40']);
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByTestId('easy-result-title')).toHaveText('들어가요');
  await page.getByRole('button', { name: '처음으로' }).click();
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.getByRole('textbox', { name: '물건 가로' })).toHaveValue('');
  await dimensions(page, '물건', ['30', '20', '40']);
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await page.getByRole('button', { name: '다음으로', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('놓을 곳을 골라 주세요.');
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
