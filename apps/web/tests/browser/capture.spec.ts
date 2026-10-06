import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { platform, release } from 'node:os';
import { captureSpatialDrafts } from './capture-spatial';

// The probe capture creates ZARI_CAPTURE_DIR. The spatial capture writes
// zari007/ inside it and must run second. Chromium only: Firefox and WebKit
// would race the same output paths.
test.describe.configure({ mode: 'serial' });

test('@capture actual workspace draft screens', async ({ page, browser }, testInfo) => {
  test.skip(!process.env.ZARI_CAPTURE_DIR, 'Captures require an explicit fresh output directory.');
  test.skip(testInfo.project.name !== 'chromium', 'Draft captures are recorded on Chromium only.');
  test.setTimeout(120_000);
  const output = resolve(process.env.ZARI_CAPTURE_DIR!);
  await mkdir(output);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceDirty =
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  const entries = [];
  const states = [
    {
      id: 'desktop-pass',
      width: 1440,
      height: 1000,
      item: '190',
      space: '600',
      status: '입력한 폭 안에 들어갑니다',
      focus: false,
    },
    {
      id: 'desktop-fail',
      width: 1440,
      height: 1000,
      item: '195',
      space: '600',
      status: '초과',
      focus: false,
    },
    {
      id: 'desktop-unknown',
      width: 1440,
      height: 1000,
      item: '190',
      space: '',
      status: '폭 확인이 필요',
      focus: false,
    },
    {
      id: 'desktop-focus',
      width: 1440,
      height: 1000,
      item: '190',
      space: '600',
      status: '입력한 폭 안에 들어갑니다',
      focus: true,
    },
    {
      id: 'mobile-pass',
      width: 390,
      height: 844,
      item: '190',
      space: '600',
      status: '입력한 폭 안에 들어갑니다',
      focus: false,
    },
  ];
  for (const state of states) {
    await page.setViewportSize({ width: state.width, height: state.height });
    // A hash-only goto to the current route does not remount the probe.
    await page.goto('about:blank');
    await page.goto('/#/probe');
    await expect(page.getByTestId('width-status')).toContainText('입력한 폭 안에 들어갑니다');
    await page.getByRole('textbox', { name: '물체 하나의 폭', exact: true }).fill(state.item);
    await page.getByRole('textbox', { name: '수납장 안쪽 폭', exact: true }).fill(state.space);
    await page.getByRole('button', { name: '폭과 수량 확인', exact: true }).click();
    await expect(page.getByTestId('width-status')).toContainText(state.status);
    if (state.focus)
      await page.getByRole('textbox', { name: '수납장 안쪽 폭', exact: true }).focus();
    else await page.getByRole('heading', { level: 1 }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${output}/${state.id}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    const bytes = await readFile(`${output}/${state.id}.png`);
    entries.push({
      id: `zari001-${state.id}`,
      status: 'draft',
      file: `${state.id}.png`,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sourceCommit,
      sourceDirty,
      screenOrStory: '/#/probe',
      state: state.id,
      fixtureId: 'ui-bootstrap-synthetic-v1',
      rawOverrides: { unitWidth: state.item, compartmentWidth: state.space },
      viewport: { width: state.width, height: state.height },
      deviceScaleFactor: 1,
      fullPage: true,
      browserAndVersion: `Chromium ${browser.version()}`,
      os: `${platform()} ${release()}`,
      fontEnvironment: {
        cssStack: await page.locator('.zari-ui').evaluate((el) => getComputedStyle(el).fontFamily),
        koreanFallback: execFileSync('fc-match', [':lang=ko', 'family'], {
          encoding: 'utf8',
        }).trim(),
      },
      locale: 'ko-KR',
      theme: 'light',
      reducedMotion: 'reduce',
      captureCommand:
        process.env.ZARI_CAPTURE_COMMAND ??
        'ZARI_CAPTURE_DIR=<fresh-directory> npm run capture:baselines',
      capturedAt: new Date().toISOString(),
    });
  }
  await writeFile(`${output}/capture-metadata.json`, JSON.stringify(entries, null, 2) + '\n');
});

test('@capture spatial workspace draft screens', async ({ page, browser }, testInfo) => {
  test.skip(!process.env.ZARI_CAPTURE_DIR, 'Captures require an explicit fresh output directory.');
  test.skip(testInfo.project.name !== 'chromium', 'Draft captures are recorded on Chromium only.');
  test.setTimeout(720_000);
  await captureSpatialDrafts({
    page,
    browser,
    outputRoot: resolve(process.env.ZARI_CAPTURE_DIR!),
  });
});
