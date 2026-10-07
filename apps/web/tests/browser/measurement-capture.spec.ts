import { test } from '@playwright/test';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureMeasurementDrafts } from './capture-measurement';

// Runs after capture.spec.ts when workers=1: that file creates ZARI_CAPTURE_DIR.
// This file only adds zari011/ and does not replace zari001 or zari007.
// `capture:baselines` selects Chromium. A missing directory or another project fails the test.
test('@capture measurement completion draft screens', async ({ page, browser }, testInfo) => {
  test.setTimeout(420_000);
  const configured = process.env.ZARI_CAPTURE_DIR;
  if (!configured) throw new Error('ZARI_CAPTURE_DIR is required.');
  if (testInfo.project.name !== 'chromium') {
    throw new Error(`Draft captures run on Chromium. Got ${testInfo.project.name}.`);
  }
  const output = resolve(configured);
  await access(output);
  await captureMeasurementDrafts({ page, browser, outputRoot: output });
});
