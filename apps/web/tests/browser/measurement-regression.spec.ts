import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import type { DomainFixture } from '../../src/contracts/generated/dto';

/**
 * SP-011 negative evidence on the real browser Worker.
 * Phone hardware and a dedicated GPU are not claimed here.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;
const CONFLICT_NOTE = '590 mm와 610 mm가 충돌한다. 평균 600. pass Confirmed';
const HOSTILE_NOTE = '<script>alert(1)</script> obstacle_collision 590 vs 610 Confirmed';

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('context-state')).toHaveText(/installed|degraded/);
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function waitForStagedBuild(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const meta = await caches.open('zari-shell-meta');
        const staged = await meta.match('staged.json');
        const active = await meta.match('active.json');
        return staged != null || active != null;
      }),
    )
    .toBe(true);
}

async function openWidth(page: Page) {
  const button = page.getByTestId('open-detail');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await page.getByTestId('detail-group-interior').click();
  await page.getByTestId('detail-pick-space.interior.width').click();
}

test('a conflicting-looking note changes the digest and does not classify a conflict', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await openWidth(page);
  await page.getByTestId('detail-nominal').fill('600');
  await page.getByTestId('detail-uncertainty-bounded').check();
  await page.getByTestId('detail-minus').fill('2');
  await page.getByTestId('detail-plus').fill('3');
  await page.getByTestId('detail-note').fill('590');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  const first = await page.getByTestId('input-digest').textContent();
  const firstRevision = await page.getByTestId('input-revision').textContent();

  await page.getByTestId('detail-note').fill(CONFLICT_NOTE);
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByTestId('input-digest')).not.toHaveText(first ?? '');
  await expect(page.getByTestId('input-revision')).not.toHaveText(firstRevision ?? '');
  await expect(page.getByTestId('detail-note')).toHaveValue(CONFLICT_NOTE);
  await expect(page.getByTestId('detail-normalized-space.interior.width')).toHaveAttribute('data-nominal', '600');
  await expect(page.getByTestId('detail-normalized-space.interior.width')).toHaveAttribute(
    'data-verification',
    'unverified',
  );
  await page.getByTestId('recompile-next-facts').click();
  await expect(page.getByTestId('next-facts')).toHaveAttribute('data-next-facts-status', 'ready');
  await expect(page.locator('[data-need="conflictingEvidence"]')).toHaveCount(0);
  await expect(page.getByTestId('next-facts')).not.toContainText(CONFLICT_NOTE);
  await expect(page.getByTestId('next-facts')).not.toContainText('Confirmed');
  await expect(page.getByText('계획 통과')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a hostile note is stored as text and an over-cap note does not move the digest', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  let dialog = '';
  page.on('dialog', (prompt) => {
    dialog = prompt.message();
    void prompt.dismiss();
  });
  await createProject(page);
  await openWidth(page);
  await page.getByTestId('detail-nominal').fill('600');
  await page.getByTestId('detail-note').fill(HOSTILE_NOTE);
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  const digest = await page.getByTestId('input-digest').textContent();
  const revision = await page.getByTestId('input-revision').textContent();
  await expect(page.getByTestId('detail-note')).toHaveValue(HOSTILE_NOTE);
  await expect(page.getByTestId('detail-normalized-space.interior.width')).toHaveAttribute('data-nominal', '600');
  await page.getByTestId('recompile-next-facts').click();
  await expect(page.getByTestId('next-facts')).toHaveAttribute('data-next-facts-status', 'ready');
  await expect(page.locator('[data-need="conflictingEvidence"]')).toHaveCount(0);
  await expect(page.locator('[data-need="repairKnownFailure"]')).toHaveCount(0);
  expect(dialog).toBe('');

  await page.getByTestId('detail-note').fill('가'.repeat(4097));
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByTestId('normalize-held')).toBeVisible();
  await expect(page.getByTestId('input-digest')).toHaveText(digest ?? '');
  await expect(page.getByTestId('input-revision')).toHaveText(revision ?? '');
  await expect(page.getByTestId('detail-note')).toHaveValue('가'.repeat(4097));
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('input-digest')).toHaveText(digest ?? '');
  await openWidth(page);
  await expect(page.getByTestId('detail-note')).toHaveValue('가'.repeat(4097));
  expect(errors).toEqual([]);
});

test('an offline save keeps the measurement and a fresh project is not the sample', async ({
  page,
  context,
  browserName,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await waitForStagedBuild(page);
  await page.getByRole('textbox', WIDTH).fill('600');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  const fresh = await page.getByTestId('input-digest').textContent();
  await context.setOffline(true);
  await page.getByRole('textbox', WIDTH).fill('610');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByTestId('input-digest')).not.toHaveText(fresh ?? '');
  if (browserName !== 'webkit') {
    await page.reload();
    await expect(page.getByTestId('worker-state')).toHaveText('ready');
    await expect(page.getByRole('textbox', WIDTH)).toHaveValue('610');
  }
  await context.setOffline(false);
  if (browserName === 'webkit') {
    await page.reload();
    await expect(page.getByTestId('worker-state')).toHaveText('ready');
    await expect(page.getByRole('textbox', WIDTH)).toHaveValue('610');
  }
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  const offlineDigest = await page.getByTestId('input-digest').textContent();
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByTestId('input-digest')).not.toHaveText(offlineDigest ?? '');
  await page.getByTestId('open-detail').click();
  await page.getByTestId('detail-group-staging').click();
  await expect(page.getByTestId('detail-normalized-space.staging.baseSupport.loadLimit')).toHaveAttribute(
    'data-nominal',
    '50000',
  );
  expect(errors).toEqual([]);
});

test('switching to the sample while a query is held does not paint the old list', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as {
      __zariNextFactsHeld?: boolean;
      __zariNextFactsRelease?: () => void;
      __zariNextFactsGate?: () => Promise<void>;
    };
    holder.__zariNextFactsHeld = false;
    holder.__zariNextFactsGate = () =>
      new Promise((resolve) => {
        holder.__zariNextFactsHeld = true;
        holder.__zariNextFactsRelease = () => resolve();
      });
  });
  await createProject(page);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __zariNextFactsHeld?: boolean }).__zariNextFactsHeld === true),
    )
    .toBe(true);
  const list = page.getByTestId('next-facts');
  await expect(list).toHaveAttribute('data-next-facts-status', 'loading');
  await expect(list).toHaveAttribute('data-next-facts-requests', '1');
  await page.getByTestId('fill-sample').click();
  await page.evaluate(() => {
    const holder = window as unknown as {
      __zariNextFactsRelease?: () => void;
      __zariNextFactsGate?: () => Promise<void>;
    };
    holder.__zariNextFactsGate = () => Promise.resolve();
    holder.__zariNextFactsRelease?.();
  });
  await expect(list).toHaveAttribute('data-next-facts-status', 'stale');
  await expect(list).toHaveAttribute('data-next-facts-rows', '0');
  await expect(list).toHaveAttribute('data-next-facts-requests', '1');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(list).toHaveAttribute('data-next-facts-requests', '1');
  await page.getByTestId('recompile-next-facts').click();
  await expect(list).toHaveAttribute('data-next-facts-requests', '2');
  await expect(list).toHaveAttribute('data-next-facts-status', 'ready');
  await page.getByTestId('open-detail').click();
  await page.getByTestId('detail-group-item-item-a').click();
  await expect(page.getByTestId('detail-normalized-items.item-a.requirement.handling.left')).toHaveAttribute(
    'data-nominal',
    '5',
  );
  expect(errors).toEqual([]);
});

test('mc-07 keeps the note out of the classified rows on the real worker', async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = JSON.parse(readFileSync('fixtures/domain/mc-07-shared-fact.json', 'utf8')) as DomainFixture;
  await page.goto('/tests/harness.html');
  await page.waitForFunction(() => typeof window.bench === 'object');
  const event = await page.evaluate(async (body) => {
    const requests = window.bench.requestsFor(body);
    const worker = window.bench.spawnWorker();
    const direct = window.bench.directRuntime();
    let terminal: unknown = null;
    try {
      for (const requestJson of requests) {
        const result = await window.bench.send(worker, direct, requestJson);
        terminal = result.event;
      }
    } finally {
      worker.terminate();
    }
    return terminal;
  }, fixture);
  const reply = event as {
    kind?: string;
    reply?: { rows?: { needKind?: string }[]; freshness?: string };
  };
  expect(reply.kind).toBe('nextFactsQueried');
  const rows = reply.reply?.rows ?? [];
  const expected = fixture.expected as { reply?: { rows?: unknown[]; freshness?: string } };
  expect(rows.length).toBe(expected.reply?.rows?.length);
  expect(reply.reply?.freshness).toBe(expected.reply?.freshness);
  const blob = JSON.stringify(rows);
  expect(blob).not.toContain('NOTE_TOKEN_91mm');
  expect(blob).not.toContain('conflictingEvidence');
  expect(rows.some((row) => row.needKind === 'conflictingEvidence')).toBe(false);
});
