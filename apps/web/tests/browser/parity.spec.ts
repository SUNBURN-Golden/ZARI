import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import type { BootstrapFixture, BootstrapProbeResult } from '../../src/contracts/generated/dto';
test('@parity native and real Chromium Worker WASM agree on every fixture', async ({
  page,
}, info) => {
  test.skip(
    !process.env.ZARI_NATIVE_RESULTS,
    'Run npm run test:parity to generate native references.',
  );
  const native = JSON.parse(await readFile(process.env.ZARI_NATIVE_RESULTS!, 'utf8')) as {
    caseId: string;
    result: BootstrapProbeResult;
  }[];
  const files = (await readdir('fixtures/bootstrap'))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const fixtures = await Promise.all(
    files.map(
      async (file) =>
        JSON.parse(await readFile(`fixtures/bootstrap/${file}`, 'utf8')) as BootstrapFixture,
    ),
  );
  const browser: typeof native = [];
  const wasm = page.waitForResponse(
    (response) => response.url().endsWith('.wasm') && response.ok(),
  );
  await page.goto('/tests/harness.html');
  await wasm;
  for (const fixture of fixtures)
    browser.push({
      caseId: fixture.caseId,
      result: await page.evaluate((probe) => window.runProbeFixture(probe), fixture.input),
    });
  browser.sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
  await info.attach('native.json', {
    body: JSON.stringify(native, null, 2),
    contentType: 'application/json',
  });
  await info.attach('browser.json', {
    body: JSON.stringify(browser, null, 2),
    contentType: 'application/json',
  });
  expect(browser.map((row) => row.caseId)).toEqual(native.map((row) => row.caseId));
  expect(browser).toEqual(native);
});
