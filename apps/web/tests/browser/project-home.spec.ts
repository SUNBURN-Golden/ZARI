import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import example from '../../src/features/project/default-form.json' with { type: 'json' };

const WIDTHS = [320, 390, 600, 601, 768, 800, 801, 1024, 1199, 1200, 1280, 1440];

async function openHome(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('project-empty')).toBeVisible();
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

async function inspectHome(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('.example-sheet')!;
    const title = sheet.querySelector('.sheet-title-block')!.getBoundingClientRect();
    // Visible label bounds exclude the adjacent block border/padding.
    const contextText = document.createRange();
    contextText.selectNodeContents(sheet.querySelector('.sheet-context')!);
    const context = contextText.getBoundingClientRect();
    const visibleSvg = [...sheet.querySelectorAll('svg')].filter(el => el.getBoundingClientRect().width > 0);
    const text = visibleSvg.flatMap(svg => [...svg.querySelectorAll('text')]);
    const minimumTextSize = Math.min(...text.map(el => {
      const svg = el.ownerSVGElement!;
      return parseFloat(getComputedStyle(el).fontSize) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    }));
    const overlappingText = text.filter(el => {
      const box = el.getBoundingClientRect();
      return box.left < title.right && box.right > title.left && box.top < title.bottom && box.bottom > title.top;
    }).map(el => el.textContent);
    const overlappingContext = text.filter(el => {
      const box = el.getBoundingClientRect();
      return box.left < context.right && box.right > context.left && box.top < context.bottom && box.bottom > context.top;
    }).map(el => el.textContent);
    const contextOverlapsTitle = context.left < title.right && context.right > title.left && context.top < title.bottom && context.bottom > title.top;
    const shapes = visibleSvg.flatMap(svg => [...svg.querySelectorAll<SVGRectElement>('[data-example-plane]')].map(el => ({
      plane: el.dataset.examplePlane,
      ratio: el.width.baseVal.value / el.height.baseVal.value,
    })));
    const targets = [...document.querySelectorAll('button, a')].map(el => {
      const box = el.getBoundingClientRect();
      return { name: el.textContent, width: box.width, height: box.height };
    });
    const hero = document.querySelector('.drafting-hero')!.getBoundingClientRect();
    const saved = document.querySelector('.home-saved')!.getBoundingClientRect();
    return {
      scroll: document.documentElement.scrollWidth,
      bodyScroll: document.body.scrollWidth,
      minimumTextSize,
      overlappingText,
      overlappingContext,
      contextOverlapsTitle,
      shapes,
      smallTargets: targets.filter(el => el.width < 44 || el.height < 44),
      hiddenNumbers: [...sheet.querySelectorAll('[aria-hidden="true"]')].map(el => el.textContent).filter(text => /\d/.test(text ?? '')),
      headingFont: getComputedStyle(document.querySelector('h1')!).fontFamily,
      labelFont: getComputedStyle(sheet.querySelector('dt')!).fontFamily,
      background: getComputedStyle(document.querySelector('.app-shell')!).backgroundColor,
      pattern: getComputedStyle(document.querySelector('.app-shell')!).backgroundImage,
      wordBreak: getComputedStyle(document.body).wordBreak,
      sectionGap: saved.top - hero.bottom,
      sectionBottom: parseFloat(getComputedStyle(document.querySelector('.home-saved')!).paddingBottom),
    };
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`drafting home: ${colorScheme} layout, dimensions and targets at responsive boundaries`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await openHome(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width > 800 ? 900 : 844 });
      const report = await inspectHome(page);
      const context = JSON.stringify({ colorScheme, width, report });
      expect(report.scroll, context).toBeLessThanOrEqual(width);
      expect(report.bodyScroll, context).toBeLessThanOrEqual(width);
      expect(report.minimumTextSize, context).toBeGreaterThanOrEqual(12);
      expect(report.smallTargets, context).toEqual([]);
      expect(report.overlappingText, context).toEqual([]);
      expect(report.overlappingContext, context).toEqual([]);
      expect(report.contextOverlapsTitle, context).toBe(false);
      expect(report.hiddenNumbers, context).toEqual([]);
      expect(report.headingFont).toContain('IBM Plex Sans KR');
      expect(report.labelFont).toContain('Pretendard');
      expect(report.labelFont).not.toContain('Mono');
      expect(report.pattern).toBe('none');
      expect(report.wordBreak).toBe('keep-all');
      expect(report.background).toBe(colorScheme === 'light' ? 'rgb(231, 238, 246)' : 'rgb(12, 30, 54)');
      expect(report.sectionGap).toBeCloseTo(width >= 1200 ? 136 : width > 600 ? 104 : 72, 0);
      expect(report.sectionBottom).toBe(width > 600 ? 152 : 64);
      const plan = report.shapes.find(shape => shape.plane === (width <= 800 ? 'compact-plan' : 'plan'));
      expect(plan?.ratio).toBeCloseTo(Number(example.space.interior.width.text) / Number(example.space.interior.depth.text), 5);
      const front = report.shapes.find(shape => shape.plane === 'front');
      if (width > 800) expect(front?.ratio).toBeCloseTo(Number(example.space.interior.width.text) / Number(example.space.interior.height.text), 5);
      else expect(front).toBeUndefined();
      for (const value of [example.space.interior.width, example.space.interior.depth, example.space.interior.height, example.space.opening.width, example.space.opening.height]) {
        await expect(page.locator('#example-sheet-facts')).toContainText(`${value.text} ${value.unit}`);
      }
      if (width === 390 || width === 1440) {
        await testInfo.attach(`draft-home-${width}-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
    }
  });
}

test('home keyboard focus, reduced motion, forced colors and axe checks', async ({ page }) => {
  await openHome(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations, JSON.stringify({ width, colorScheme, violations: result.violations })).toEqual([]);
    }
  }
  const start = page.getByTestId('create-project');
  await start.focus();
  expect(await start.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await start.evaluate(el => getComputedStyle(el).transitionDuration)).toMatch(/^0s(?:, 0s)*$/);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('create-example')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('import-project')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await start.evaluate(el => getComputedStyle(el).transitionProperty)).toBe('transform, opacity');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('example-sheet')).toBeVisible();
  await expect(page.getByTestId('example-disclosure')).toBeVisible();
  const forced = await inspectHome(page);
  expect(forced.smallTargets).toEqual([]);
  expect(forced.scroll).toBeLessThanOrEqual(390);
  const forcedAxe = await new AxeBuilder({ page }).analyze();
  expect(forcedAxe.violations).toEqual([]);
});

test('all self-hosted font subsets are available in the offline build', async ({ page, context, browserName, baseURL }) => {
  const external: string[] = [];
  const localOrigin = new URL(baseURL!).origin;
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== localOrigin) external.push(url.href);
  });
  await openHome(page);
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await expect.poll(() => page.evaluate(async () => {
    const meta = await caches.open('zari-shell-meta');
    const response = await meta.match('active.json') ?? await meta.match('staged.json');
    if (!response) return { count: 0, missing: [] as string[] };
    const manifest = await response.json() as { buildId: string; assets: string[] };
    const fonts = manifest.assets.filter(asset => asset.endsWith('.woff2'));
    const cache = await caches.open(`zari-build-${manifest.buildId}`);
    const missing: string[] = [];
    for (const font of fonts) if (!await cache.match(new URL(font, location.href).href)) missing.push(font);
    return { count: fonts.length, missing };
  })).toEqual({ count: 16, missing: [] });
  async function loadedFaces() {
    return page.evaluate(async () => {
      const requests = [
        ['600 34px "IBM Plex Sans KR"', '정리할 공간을 고르세요.'],
        ['400 16px "Pretendard"', '이 기기에만 저장'],
        ['500 17px "Pretendard"', '내 공간으로 시작'],
        ['400 17px "IBM Plex Mono"', '600 × 400 mm'],
      ] as const;
      return Promise.all(requests.map(async ([font, text]) => (await document.fonts.load(font, text)).length));
    });
  }
  expect((await loadedFaces()).every(count => count > 0)).toBe(true);
  if (browserName === 'webkit') {
    // Same known WPE limitation as portable.spec.ts: verify staged bytes;
    // Chromium/Firefox exercise actual offline navigation.
    test.info().annotations.push({ type: 'limitation', description: 'WebKit offline reload is not exercised; all 16 font cache entries verified.' });
  } else {
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByTestId('example-sheet')).toBeVisible();
      expect((await loadedFaces()).every(count => count > 0)).toBe(true);
    } finally {
      await context.setOffline(false);
    }
  }
  expect(external).toEqual([]);
});


test('saved home rows with long Korean project names fit responsive widths in both themes', async ({ page }, testInfo) => {
  await openHome(page);
  for (let index = 0; index < 2; index += 1) {
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('worker-state')).toHaveText('ready');
    const id = page.url().match(/#\/project\/([^/]+)/)?.[1];
    expect(id).toBeTruthy();
    // Keep persisted input/contracts intact; only extend the existing project
    // display name in this isolated test database, including an unbroken name.
    await page.evaluate(async ({ id, index }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zari-local');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('projects', 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
          const store = tx.objectStore('projects');
          const read = store.get(id!);
          read.onsuccess = () => {
            const row = read.result as { name: string };
            row.name = (index ? row.name.replaceAll(' ', '') : row.name).repeat(12);
            store.put(row);
          };
        });
      } finally {
        db.close();
      }
    }, { id, index });
    await page.goto('/#/projects');
    await expect(page.getByTestId('create-project')).toBeEnabled();
  }
  const rows = page.locator('[data-testid^="project-row-"]');
  await expect(rows).toHaveCount(2);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width > 800 ? 900 : 844 });
      const report = await rows.evaluateAll(rows => ({
        scroll: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        names: rows.map(row => {
          const label = row.querySelector('strong')!;
          const box = label.getBoundingClientRect();
          const rowBox = row.getBoundingClientRect();
          return { text: label.textContent, right: box.right, rowRight: rowBox.right, scroll: label.scrollWidth, width: label.clientWidth || box.width };
        }),
      }));
      expect(report.scroll, JSON.stringify({ width, colorScheme, report })).toBeLessThanOrEqual(width);
      expect(report.body).toBeLessThanOrEqual(width);
      for (const name of report.names) {
        expect(name.text!.length).toBeGreaterThan(70);
        expect(name.right).toBeLessThanOrEqual(width);
        expect(name.right).toBeLessThanOrEqual(name.rowRight + 1);
        expect(name.scroll).toBeLessThanOrEqual(name.width + 1);
      }
      if (width === 320) {
        await rows.first().scrollIntoViewIfNeeded();
        await testInfo.attach(`populated-home-${width}-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
    }
  }
});
