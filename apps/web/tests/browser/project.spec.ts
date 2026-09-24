import { test, expect, type Page } from '@playwright/test';

/**
 * REAL browser evidence for the ZARI-005 measurement/persistence vertical:
 * real Chromium, real IndexedDB (Dexie), real WASM Worker — no mocks.
 * Covers create/edit/save/reload, unit switch via Rust, invalid raw text
 * preservation, project-switch fencing, second-tab CAS/BroadcastChannel
 * conflict, injected save failure and Worker crash/retry.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('context-state')).toHaveText(/installed|degraded/);
}

async function commitAndWaitSaved(page: Page) {
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'saved',
  );
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
}

test('create, edit, save and real reload restores the committed draft', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  const width = page.getByRole('textbox', WIDTH);
  // Keyboard focus emphasises the dimension being measured.
  await width.focus();
  await expect(page.locator('.measure-field[data-focused="true"]')).toHaveCount(1);
  await expect(page.getByTestId('focus-context')).toBeVisible();
  await width.fill('600');
  await expect(page.getByTestId('stale-notice')).toBeVisible();
  await commitAndWaitSaved(page);
  // Rust normalized the exact value; the durable input revision advanced.
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveText('600 mm');
  await expect(page.getByTestId('input-revision')).toHaveText('1');
  // Real reload: the draft comes back from IndexedDB, not memory.
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('600');
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveText('600 mm');
  await expect(page.getByTestId('input-revision')).toHaveText('1');
  // 390px layout stays inside the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('invalid raw text survives save and reload without silent normalization', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  const width = page.getByRole('textbox', WIDTH);
  await width.fill('abc');
  await commitAndWaitSaved(page);
  // Rust flagged the field; the draft still committed as an invalid draft.
  await expect(page.getByText('숫자 형식을 확인해 주세요.')).toBeVisible();
  await expect(page.getByTestId('input-revision')).toHaveText('0');
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  // 'abc' comes back verbatim — never rewritten, never dropped.
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('abc');
  await expect(page.getByText('숫자 형식을 확인해 주세요.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('unit switch rewrites the exact value through Rust formattedFields', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  const width = page.getByRole('textbox', WIDTH);
  await width.fill('600');
  await page.getByLabel('공간 안쪽 폭 단위').selectOption('cm');
  // '600' mm → '60' cm is produced by the Worker; no JS conversion exists.
  await expect(width).toHaveValue('60');
  await commitAndWaitSaved(page);
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveText('600 mm');
  await page.reload();
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('60');
  expect(errors).toEqual([]);
});

test('project switch installs a fresh context and never leaks prior state', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await page.getByRole('textbox', WIDTH).fill('600');
  await commitAndWaitSaved(page);
  const firstUrl = page.url();
  await page.getByRole('link', { name: '프로젝트 목록' }).click();
  await expect(page.getByTestId('project-list')).toBeVisible();
  await page.getByTestId('create-project').click();
  // A fresh project session: different URL, fresh activation, blank draft.
  expect(page.url()).not.toBe(firstUrl);
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('context-state')).toHaveText(/installed|degraded/);
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('');
  await expect(page.getByTestId('project-revision')).toHaveText('1');
  await expect(page.getByTestId('input-revision')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('a second tab surfaces conflict instead of silently last-write-winning', async ({
  context,
}) => {
  const pageA = await context.newPage();
  await createProject(pageA);
  await pageA.getByRole('textbox', WIDTH).fill('600');
  await commitAndWaitSaved(pageA);
  // Tab B opens the same project from the shared IndexedDB.
  const pageB = await context.newPage();
  await pageB.goto(pageA.url());
  await expect(pageB.getByTestId('worker-state')).toHaveText('ready');
  await expect(pageB.getByRole('textbox', WIDTH)).toHaveValue('600');
  // Tab A commits a newer revision; tab B is notified via BroadcastChannel.
  await pageA.getByRole('textbox', WIDTH).fill('610');
  await commitAndWaitSaved(pageA);
  await expect(pageB.getByTestId('conflict-notice')).toBeVisible();
  // Tab B's own write cannot overwrite tab A's revision either (CAS).
  await pageB.getByRole('textbox', WIDTH).fill('700');
  await pageB.getByTestId('commit-input').click();
  await expect(pageB.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'conflict',
  );
  // Choosing "open latest" restores tab A's committed value.
  await pageB.getByTestId('conflict-reload').click();
  await expect(pageB.getByRole('textbox', WIDTH)).toHaveValue('610');
});

test('injected save failure keeps the input and never claims saved', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const w = window as unknown as { __failPuts: boolean };
    w.__failPuts = false;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: unknown[]) {
      if (w.__failPuts)
        throw new DOMException('injected failure', 'QuotaExceededError');
      return original.apply(this, args as [unknown]);
    };
  });
  await createProject(page);
  const width = page.getByRole('textbox', WIDTH);
  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = true;
  });
  await width.fill('600');
  await page.getByTestId('commit-input').click();
  // The write aborted: error state, and the raw input stays editable on screen.
  await expect(page.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'error',
  );
  await expect(width).toHaveValue('600');
  // After the fault clears the same commit succeeds — success only after the
  // real transaction commits.
  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = false;
  });
  await commitAndWaitSaved(page);
  await page.reload();
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('600');
  expect(errors).toEqual([]);
});

test('Worker crash reports failure and retry restores context with committed state', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const Original = window.Worker;
    const captured: Worker[] = [];
    Object.assign(window, { __testWorkers: captured });
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        captured.push(this);
      }
    };
  });
  await createProject(page);
  await page.getByRole('textbox', WIDTH).fill('600');
  await commitAndWaitSaved(page);
  await page.evaluate(() => {
    (window as unknown as { __testWorkers: Worker[] }).__testWorkers
      .at(-1)!
      .dispatchEvent(new ErrorEvent('error', { message: 'test transport failure' }));
  });
  // The failure is surfaced — the draft and committed input are untouched.
  await expect(page.getByTestId('worker-failed')).toBeVisible();
  await expect(page.getByTestId('worker-state')).toHaveText('failed');
  await page.getByTestId('worker-retry').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('context-state')).toHaveText(/installed|degraded/);
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue('600');
  await expect(page.getByTestId('normalized-space.interior.width')).toHaveText('600 mm');
  expect(errors).toEqual([]);
});
