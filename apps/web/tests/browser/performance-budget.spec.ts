import { expect, test, type Page } from '@playwright/test';

interface Activation {
  catalogNull: boolean;
  bytes: number;
}
interface Holder {
  __workers: number;
  __activations: Activation[];
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

/** Count Workers and record every project activation the page posts. */
async function observeWorkers(page: Page) {
  await page.addInitScript(() => {
    const holder = window as unknown as Holder;
    holder.__workers = 0;
    holder.__activations = [];
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        holder.__workers += 1;
      }
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const body = args[0];
      if (typeof body === 'string' && body.includes('"activateProject"')) {
        const parsed = JSON.parse(body) as {
          command: { kind: string; context: { kind: string; catalog?: unknown } };
        };
        if (parsed.command.context.kind === 'project')
          holder.__activations.push({
            catalogNull: parsed.command.context.catalog === null,
            bytes: body.length,
          });
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });
}

const workers = (page: Page) => page.evaluate(() => (window as unknown as Holder).__workers);
const activations = (page: Page) =>
  page.evaluate(() => (window as unknown as Holder).__activations);

test('the project Worker starts while idle and the first project reuses it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await observeWorkers(page);
  await page.goto('/');
  await expect(page.getByTestId('create-project')).toHaveAttribute('data-list-settled', 'true');
  // No click yet: the idle warm-up has already started the one project Worker.
  await expect.poll(() => workers(page), { timeout: 15_000 }).toBe(1);
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  expect(await workers(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('a small input change re-activates without re-sending the catalog', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await observeWorkers(page);
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByTestId('context-state')).toHaveText('installed');
  const first = await activations(page);
  expect(first.length).toBeGreaterThanOrEqual(1);
  expect(first[0]).toMatchObject({ catalogNull: false });

  // One small edit. The catalog is unchanged, so the second activation names
  // only the input and the engine reuses the catalog it already verified.
  const width = page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  const current = Number(await width.inputValue());
  await width.fill(String(current + 10));
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect
    .poll(async () => (await activations(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(first.length);
  const all = await activations(page);
  const reused = all.slice(first.length);
  expect(reused.every((a) => a.catalogNull)).toBe(true);
  expect(Math.max(...reused.map((a) => a.bytes))).toBeLessThan(first[0]!.bytes / 2);
  // The reused catalog still yields a working context, not a degraded one.
  await expect(page.getByTestId('context-state')).toHaveText('installed');
  expect(errors).toEqual([]);
});
