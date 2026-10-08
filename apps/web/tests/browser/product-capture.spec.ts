import { test } from '@playwright/test';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureProductDrafts } from './capture-product';

// Runs after capture.spec.ts and measurement-capture.spec.ts when workers=1.
// Adds zari016/ only. It does not replace zari001, zari007, or zari011.
test('@capture product completion draft screens', async ({ page, browser }, testInfo) => {
  test.setTimeout(600_000);
  const configured = process.env.ZARI_CAPTURE_DIR;
  if (!configured) throw new Error('ZARI_CAPTURE_DIR is required.');
  if (testInfo.project.name !== 'chromium') {
    throw new Error(`Draft captures run on Chromium. Got ${testInfo.project.name}.`);
  }
  const output = resolve(configured);
  await access(output);
  await captureProductDrafts({ page, browser, outputRoot: output });
});
