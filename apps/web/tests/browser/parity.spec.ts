import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import type {
  BootstrapFixture,
  DomainFixture,
} from '../../src/contracts/generated/dto';
test('@parity native and real Chromium Worker WASM agree on every fixture', async ({
  page,
}, info) => {
  // Every fixture drives a fresh Worker + WASM Runtime; allow for ~58 sequential
  // wasm instantiations on a cold runner.
  test.setTimeout(240_000);
  test.skip(
    !process.env.ZARI_NATIVE_RESULTS,
    'Run npm run test:parity to generate native references.',
  );
  const native = JSON.parse(await readFile(process.env.ZARI_NATIVE_RESULTS!, 'utf8')) as {
    caseId: string;
    result: unknown;
  }[];
  const bootstrap = await Promise.all(
    (await readdir('fixtures/bootstrap'))
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map(
        async (file) =>
          JSON.parse(
            await readFile(`fixtures/bootstrap/${file}`, 'utf8'),
          ) as BootstrapFixture,
      ),
  );
  const domain = (
    await Promise.all(
      ['fixtures/domain', 'fixtures/bench', 'fixtures/spatial'].map(async (dir) =>
        Promise.all(
          (await readdir(dir))
            .filter((file) => file.endsWith('.json'))
            .sort()
            .map(
              async (file) =>
                JSON.parse(
                  await readFile(`${dir}/${file}`, 'utf8'),
                ) as DomainFixture,
            ),
        ),
      ),
    )
  ).flat();
  const browser: { caseId: string; result: unknown }[] = [];
  const wasm = page.waitForResponse(
    (response) => response.url().endsWith('.wasm') && response.ok(),
  );
  await page.goto('/tests/harness.html');
  await wasm;
  for (const fixture of bootstrap)
    browser.push({
      caseId: fixture.caseId,
      result: await page.evaluate(
        (probe) => window.runProbeFixture(probe),
        fixture.input,
      ),
    });
  for (const fixture of domain)
    browser.push({
      caseId: fixture.caseId,
      result: await page.evaluate((f) => window.runDomainFixture(f), fixture),
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
test('@parity real Worker WASM rejects malformed payloads structurally', async ({
  page,
}) => {
  await page.goto('/tests/harness.html');
  const results = await page.evaluate(async () => {
    const duplicateKey = await window.runRawRequest('{"meta":{},"meta":{}}');
    const notJson = await window.runRawRequest('{');
    const oversized = await window.runRawRequest(' '.repeat(5 * 1024 * 1024 + 1));
    return [duplicateKey, notJson, oversized] as {
      kind?: string;
      code?: string;
    }[];
  });
  expect(results[0]).toMatchObject({ kind: 'fatalProtocolError', code: 'invalid_json' });
  expect(results[1]).toMatchObject({ kind: 'fatalProtocolError', code: 'invalid_json' });
  expect(results[2]).toMatchObject({
    kind: 'fatalProtocolError',
    code: 'message_too_large',
  });
});
